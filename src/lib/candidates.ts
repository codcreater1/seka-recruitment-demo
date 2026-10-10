import fs from 'node:fs';
import { addEvent, audit, filePath, getDb, newId, nowIso, FILES_DIR, RETENTION_MONTHS } from './db';
import { UNASSIGNED_CITY, UNKNOWN_POSITION, type CandidateDetail, type CandidateListItem, type Session, type StatusId } from './domain';
import { detectCity, detectPosition, extractPdfText, parseCv, parseSender, type ParsedCv } from './cv-parse';

type Row = {
  id: string; name: string; email: string; phone: string; city: string; position: string; status: StatusId;
  received_at: string; channel: string; from_addr: string; subject: string; city_basis: string; rodo: 0 | 1 | 2;
  file_id: string | null; file_name: string | null; file_size: number | null; raw_text: string;
  rating: number | null; interview_at: string | null; rejection_sent: number; needs_review: number; duplicate_of: string | null;
};

function retention(receivedAt: string, status: StatusId) {
  const due = new Date(receivedAt);
  due.setMonth(due.getMonth() + RETENTION_MONTHS);
  return { retentionDate: due.toISOString(), retentionDue: status !== 'hired' && due.getTime() < Date.now() };
}

function toItem(r: Row): CandidateListItem {
  return {
    id: r.id, name: r.name, email: r.email, city: r.city, position: r.position, status: r.status,
    receivedAt: r.received_at, rating: r.rating, interviewAt: r.interview_at, needsReview: !!r.needs_review,
    duplicateOf: r.duplicate_of, retentionDue: retention(r.received_at, r.status).retentionDue,
  };
}

/** Rows the session may see. Managers are limited to their own branch, enforced here and nowhere else. */
function scopeSql(s: Session) {
  return s.city ? { where: 'WHERE city = ?', args: [s.city] } : { where: '', args: [] as string[] };
}

export function listCandidates(s: Session): CandidateListItem[] {
  const { where, args } = scopeSql(s);
  const rows = getDb().prepare(`SELECT * FROM candidates ${where} ORDER BY received_at DESC`).all(...args) as Row[];
  return rows.map(toItem);
}

export function getRow(s: Session, id: string): Row | undefined {
  const row = getDb().prepare('SELECT * FROM candidates WHERE id = ?').get(id) as Row | undefined;
  if (!row) return undefined;
  if (s.city && row.city !== s.city) return undefined;
  return row;
}

export async function getCandidate(s: Session, id: string): Promise<CandidateDetail | undefined> {
  const row = getRow(s, id);
  if (!row) return undefined;
  const db = getDb();
  if (!row.raw_text && row.file_id && fs.existsSync(filePath(row.file_id))) {
    try {
      row.raw_text = await extractPdfText(new Uint8Array(fs.readFileSync(filePath(row.file_id))));
      db.prepare('UPDATE candidates SET raw_text = ? WHERE id = ?').run(row.raw_text, id);
    } catch {
      /* keep empty */
    }
  }
  const notes = db.prepare('SELECT id, author, text, created_at AS createdAt FROM notes WHERE candidate_id = ? ORDER BY id').all(id) as CandidateDetail['notes'];
  const events = db.prepare('SELECT id, at, actor, text FROM events WHERE candidate_id = ? ORDER BY at, id').all(id) as CandidateDetail['events'];
  const ret = retention(row.received_at, row.status);
  return {
    ...toItem(row),
    phone: row.phone, channel: row.channel, from: row.from_addr, subject: row.subject, cityBasis: row.city_basis,
    rodo: row.rodo, file: row.file_id ? { name: row.file_name || 'CV.pdf', size: row.file_size || 0 } : null,
    rawText: row.raw_text, rejectionSent: !!row.rejection_sent, retentionDate: ret.retentionDate, notes, events,
  };
}

export type IngestInput = {
  buffer?: Uint8Array;
  fileName?: string;
  from: string;
  subject: string;
  receivedAt?: string;
  channel: 'E-mail' | 'Wgrano ręcznie';
  actor: string;
};

/**
 * Creates a candidate profile from an incoming application. Used by the e-mail webhook,
 * the manual upload and the demo simulation, so all three behave the same way.
 */
export async function ingestApplication(input: IngestInput): Promise<{ id: string; needsReview: boolean }> {
  const db = getDb();
  let rawText = '';
  let parsed: ParsedCv | null = null;
  if (input.buffer) {
    try {
      rawText = await extractPdfText(input.buffer);
    } catch {
      rawText = '';
    }
    if (rawText) parsed = parseCv(rawText);
  }
  const sender = parseSender(input.from);
  const name = parsed?.name || sender.name || 'Nieznany kandydat';
  const email = parsed?.email || sender.address;

  let city = detectCity(input.subject);
  let cityBasis = city ? 'tytułu wiadomości' : '';
  if (!city && parsed?.city) {
    city = parsed.city;
    cityBasis = parsed.cityBasis;
  }
  if (!city) {
    city = UNASSIGNED_CITY;
    cityBasis = 'nie ustalono';
  }
  const position = detectPosition([input.subject]) || parsed?.position || UNKNOWN_POSITION;

  const needsReview = !parsed || !parsed.name || city === UNASSIGNED_CITY || position === UNKNOWN_POSITION || !email;

  const dup = email
    ? (db.prepare('SELECT id FROM candidates WHERE lower(email) = lower(?) ORDER BY received_at DESC LIMIT 1').get(email) as { id: string } | undefined)
    : undefined;

  const id = newId();
  const receivedAt = input.receivedAt && !Number.isNaN(Date.parse(input.receivedAt)) ? new Date(input.receivedAt).toISOString() : nowIso();
  let fileId: string | null = null;
  if (input.buffer) {
    fileId = id;
    fs.mkdirSync(FILES_DIR, { recursive: true });
    fs.writeFileSync(filePath(fileId), input.buffer);
  }

  const run = db.transaction(() => {
    db.prepare(`INSERT INTO candidates
      (id, name, email, phone, city, position, status, received_at, channel, from_addr, subject, city_basis, rodo,
       file_id, file_name, file_size, raw_text, needs_review, duplicate_of)
      VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, name, email, parsed?.phone || '', city, position, receivedAt, input.channel, sender.address || email,
      input.subject, cityBasis, parsed?.rodo ?? 0, fileId, input.fileName || (fileId ? 'CV.pdf' : null),
      input.buffer ? input.buffer.byteLength : null, rawText, needsReview ? 1 : 0, dup?.id ?? null,
    );
    const ev = (actor: string, text: string) => addEvent(id, actor, text);
    ev('system', input.channel === 'E-mail' ? 'Otrzymano zgłoszenie e-mailem' : `Wgrano CV ręcznie (${input.actor})`);
    ev('system', parsed ? 'Utworzono profil kandydata (automatycznie z załącznika PDF)' : 'Utworzono profil z danych nadawcy (brak odczytanego tekstu PDF)');
    if (input.channel === 'E-mail') ev('system', 'Wysłano potwierdzenie przyjęcia zgłoszenia (automatyczna odpowiedź, symulacja)');
    if (dup) ev('system', 'Wykryto możliwy duplikat: ten adres e-mail ma już profil w systemie');
    audit(input.actor, 'ingest', `${input.channel}: ${name} (${city})`);
  });
  run();
  return { id, needsReview };
}

export function deleteCandidate(s: Session, id: string): boolean {
  const row = getRow(s, id);
  if (!row) return false;
  const db = getDb();
  db.prepare('DELETE FROM candidates WHERE id = ?').run(id);
  if (row.file_id) {
    try {
      fs.unlinkSync(filePath(row.file_id));
    } catch {
      /* already gone */
    }
  }
  audit(s.name, 'delete', `Usunięto profil: ${row.name} (${row.city}), zgłoszenie z ${row.received_at.slice(0, 10)}`);
  return true;
}
