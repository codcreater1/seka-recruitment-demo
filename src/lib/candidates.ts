import fs from 'node:fs';
import { simpleParser } from 'mailparser';
import { addEvent, audit, filePath, getDb, newId, nowIso, FILES_DIR, POOL_RETENTION_MONTHS, RETENTION_MONTHS } from './db';
import {
  EMAIL_TEMPLATES,
  UNASSIGNED_CITY,
  UNKNOWN_POSITION,
  statusLabel,
  type CandidateDetail,
  type CandidateListItem,
  type EmailDto,
  type EmailTemplate,
  type FeedbackDto,
  type Recommendation,
  type Session,
  type StatsDto,
  type StatusId,
  type VacancyDto,
} from './domain';
import { detectCity, detectPosition, extractPdfText, parseCv, parseSender, type ParsedCv } from './cv-parse';
import { analyzeCv } from './analyze';
import { deliver, type MailAttachment } from './mailer';
import { buildIcs } from './ics';
import { indexCandidate, removeFromIndex } from './search';
import { isLocalDateTime, localNow } from './time';

export type Row = {
  id: string; name: string; email: string; phone: string; city: string; position: string; status: StatusId;
  received_at: string; channel: string; from_addr: string; subject: string; city_basis: string; rodo: 0 | 1 | 2;
  file_id: string | null; file_name: string | null; file_size: number | null; raw_text: string;
  rating: number | null; interview_at: string | null; rejection_sent: number; needs_review: number; duplicate_of: string | null;
  vacancy_id: string | null;
};

/** Profiles with consent for future recruitments may be kept longer than ordinary applications. */
function retention(r: Pick<Row, 'received_at' | 'status' | 'rodo'>) {
  const due = new Date(r.received_at);
  due.setMonth(due.getMonth() + (r.rodo === 2 ? POOL_RETENTION_MONTHS : RETENTION_MONTHS));
  return { retentionDate: due.toISOString(), retentionDue: r.status !== 'hired' && due.getTime() < Date.now() };
}

function toItem(r: Row): CandidateListItem {
  return {
    id: r.id, name: r.name, email: r.email, city: r.city, position: r.position, status: r.status,
    receivedAt: r.received_at, rating: r.rating, interviewAt: r.interview_at, needsReview: !!r.needs_review,
    duplicateOf: r.duplicate_of, retentionDue: retention(r).retentionDue,
    rejectionSent: !!r.rejection_sent, consentFuture: r.rodo === 2, vacancyId: r.vacancy_id,
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
      indexCandidate(row.id, row.name, row.position, row.raw_text);
    } catch {
      /* keep empty */
    }
  }
  const notes = db.prepare('SELECT id, author, text, created_at AS createdAt FROM notes WHERE candidate_id = ? ORDER BY id').all(id) as CandidateDetail['notes'];
  const events = db.prepare('SELECT id, at, actor, text FROM events WHERE candidate_id = ? ORDER BY at, id').all(id) as CandidateDetail['events'];
  const emails = db
    .prepare('SELECT id, at, template, to_addr AS "to", subject, body, status, actor, error, attachment FROM emails WHERE candidate_id = ? ORDER BY at, id')
    .all(id) as EmailDto[];
  const feedback = db
    .prepare('SELECT id, author, at, communication, knowledge, fit, recommendation, comment FROM feedback WHERE candidate_id = ? ORDER BY at, id')
    .all(id) as FeedbackDto[];
  const vacancy = row.vacancy_id ? (listVacancies({ ...s, city: null }).find((v) => v.id === row.vacancy_id) ?? null) : null;
  const ret = retention(row);
  return {
    ...toItem(row),
    phone: row.phone, channel: row.channel, from: row.from_addr, subject: row.subject, cityBasis: row.city_basis,
    rodo: row.rodo, file: row.file_id ? { name: row.file_name || 'CV.pdf', size: row.file_size || 0 } : null,
    rawText: row.raw_text, retentionDate: ret.retentionDate, notes, events, emails,
    profile: analyzeCv(row.raw_text), vacancy, feedback,
  };
}

/** Sends (or, without SMTP, only records) one of the standard messages and logs it on the profile. */
export async function sendTemplateEmail(row: Row, template: EmailTemplate, actor: string) {
  const t = EMAIL_TEMPLATES[template];
  const body = t.body({ position: row.position, interviewAt: row.interview_at });
  const attachments: MailAttachment[] = [];
  const ics = template === 'invite' ? interviewIcs(row) : null;
  if (ics) attachments.push({ filename: 'rozmowa.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' });
  const res = await deliver({ to: row.email, subject: t.subject, text: body, attachments });
  getDb()
    .prepare('INSERT INTO emails (candidate_id, at, template, to_addr, subject, body, status, actor, error, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.id, nowIso(), template, row.email, t.subject, body, res.status, actor, res.error, attachments.map((a) => a.filename).join(', '));
  const how = res.status === 'sent' ? 'wysłano' : res.status === 'simulated' ? 'symulacja' : `błąd wysyłki: ${res.error}`;
  addEvent(row.id, actor, `${t.label} (${how})`);
  if (template === 'rejection' && res.status !== 'failed') {
    getDb().prepare('UPDATE candidates SET rejection_sent = 1 WHERE id = ?').run(row.id);
  }
  return res;
}

/** Text kept per CV (a normal CV has a few thousand characters). */
const MAX_CV_TEXT = 100_000;

export type IngestInput = {
  buffer?: Uint8Array;
  fileName?: string;
  from: string;
  subject: string;
  receivedAt?: string;
  channel: 'E-mail' | 'Wgrano ręcznie';
  actor: string;
  /** Send the acknowledgement e-mail. Only for live intake, never when importing old messages. */
  autoAck?: boolean;
  /** Extra text for the first history entry, e.g. "import pliku .eml". */
  origin?: string;
};

/**
 * Creates a candidate profile from an incoming application. Used by the e-mail webhook,
 * the manual upload and the demo simulation, so all three behave the same way.
 */
export async function ingestApplication(rawInput: IngestInput): Promise<{ id: string; needsReview: boolean }> {
  // a mail header or a file name from outside is never trusted to be short
  const input: IngestInput = {
    ...rawInput,
    from: rawInput.from.slice(0, 300),
    subject: rawInput.subject.slice(0, 300),
    fileName: rawInput.fileName?.slice(0, 200),
  };
  const db = getDb();
  let rawText = '';
  let parsed: ParsedCv | null = null;
  if (input.buffer) {
    try {
      rawText = (await extractPdfText(input.buffer)).slice(0, MAX_CV_TEXT);
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
    const first = input.channel === 'E-mail' ? 'Otrzymano zgłoszenie e-mailem' : `Wgrano CV ręcznie (${input.actor})`;
    ev('system', input.origin ? `${first}, ${input.origin}` : first);
    ev('system', parsed ? 'Utworzono profil kandydata (automatycznie z załącznika PDF)' : 'Utworzono profil z danych nadawcy (brak odczytanego tekstu PDF)');
    if (dup) ev('system', 'Wykryto możliwy duplikat: ten adres e-mail ma już profil w systemie');
    audit(input.actor, 'ingest', `${input.channel}: ${name} (${city})`);
    indexCandidate(id, name, position, rawText);
    const open = db
      .prepare("SELECT id FROM vacancies WHERE city = ? AND position = ? AND status = 'open'")
      .all(city, position) as { id: string }[];
    if (open.length === 1) {
      db.prepare('UPDATE candidates SET vacancy_id = ? WHERE id = ?').run(open[0].id, id);
      ev('system', `Przypisano do ogłoszenia: ${position} (${city})`);
    }
  });
  run();

  if (input.autoAck && email) {
    const row = db.prepare('SELECT * FROM candidates WHERE id = ?').get(id) as Row;
    await sendTemplateEmail(row, 'ack', 'system');
  }
  return { id, needsReview };
}

/** A saved .eml file: sender, subject and date come from the message, the CV from its PDF attachment. */
export async function ingestEml(buffer: Uint8Array, actor: string, autoAck = false) {
  const mail = await simpleParser(Buffer.from(buffer));
  const pdf = mail.attachments.find((a) => a.contentType === 'application/pdf' || /\.pdf$/i.test(a.filename || ''));
  return ingestApplication({
    buffer: pdf ? new Uint8Array(pdf.content) : undefined,
    fileName: pdf?.filename || undefined,
    from: mail.from?.text || '',
    subject: mail.subject || '',
    receivedAt: mail.date ? mail.date.toISOString() : undefined,
    channel: 'E-mail',
    actor,
    autoAck,
    origin: 'import pliku .eml',
  });
}

export function deleteCandidate(s: Session, id: string): boolean {
  const row = getRow(s, id);
  if (!row) return false;
  const db = getDb();
  db.prepare('DELETE FROM candidates WHERE id = ?').run(id);
  removeFromIndex(id);
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

/** Bulk operations for HR. Returns how many profiles were changed. */
export async function bulkAction(s: Session, action: 'reject-and-thank' | 'thank-rejected' | 'delete-expired', ids: string[]) {
  const db = getDb();
  let done = 0;
  if (action === 'reject-and-thank') {
    for (const id of ids.slice(0, 200)) {
      const row = getRow(s, id);
      if (!row || row.status === 'rejected') continue;
      db.prepare("UPDATE candidates SET status = 'rejected' WHERE id = ?").run(id);
      addEvent(id, s.name, `Zmiana statusu: ${statusLabel(row.status)} → ${statusLabel('rejected')} (operacja zbiorcza)`);
      await sendTemplateEmail({ ...row, status: 'rejected' }, 'rejection', s.name);
      done++;
    }
    audit(s.name, 'bulk-reject', `Odrzucono i wysłano podziękowanie: ${done} zgłoszeń`);
  } else if (action === 'thank-rejected') {
    const pending = db.prepare("SELECT * FROM candidates WHERE status = 'rejected' AND rejection_sent = 0").all() as Row[];
    for (const row of pending) {
      if (s.city && row.city !== s.city) continue;
      const res = await sendTemplateEmail(row, 'rejection', s.name);
      if (res.status !== 'failed') done++;
    }
    audit(s.name, 'bulk-thank', `Wysłano podziękowania: ${done}`);
  } else {
    const all = db.prepare('SELECT * FROM candidates').all() as Row[];
    for (const row of all) {
      if (retention(row).retentionDue && deleteCandidate(s, row.id)) done++;
    }
    audit(s.name, 'bulk-delete-expired', `Usunięto profile po terminie przechowywania: ${done}`);
  }
  return { done };
}

export function getStats(s: Session): StatsDto {
  const { where, args } = scopeSql(s);
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM candidates ${where}`).all(...args) as Row[];
  const now = Date.now();
  const weekMs = 7 * 864e5;

  const byStatus: Record<string, number> = {};
  const cityMap = new Map<string, { city: string; total: number; byStatus: Record<string, number> }>();
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const c = cityMap.get(r.city) || { city: r.city, total: 0, byStatus: {} };
    c.total++;
    c.byStatus[r.status] = (c.byStatus[r.status] || 0) + 1;
    cityMap.set(r.city, c);
  }

  // applications per calendar week (Monday), last 8 weeks
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const perWeek: StatsDto['perWeek'] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * weekMs);
    const end = start.getTime() + weekMs;
    perWeek.push({
      weekStart: start.toISOString().slice(0, 10),
      count: rows.filter((r) => {
        const t = Date.parse(r.received_at);
        return t >= start.getTime() && t < end;
      }).length,
    });
  }

  const emptyVacancies = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM vacancies v WHERE v.status = 'open' ${s.city ? 'AND v.city = ?' : ''}
       AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.vacancy_id = v.id)`,
    )
    .get(...args) as { n: number }).n;
  const openVacancies = (db
    .prepare(`SELECT COUNT(*) AS n FROM vacancies WHERE status = 'open' ${s.city ? 'AND city = ?' : ''}`)
    .get(...args) as { n: number }).n;
  // interview times are local wall-clock strings, so compare them with the local "now", not with UTC
  const nowLocal = localNow();
  const upcomingInterviews = rows
    .filter((r) => r.interview_at && r.interview_at >= nowLocal && r.status !== 'rejected' && r.status !== 'hired')
    .sort((a, b) => (a.interview_at as string).localeCompare(b.interview_at as string))
    .slice(0, 8)
    .map((r) => ({ id: r.id, name: r.name, position: r.position, city: r.city, interviewAt: r.interview_at as string }));

  const firstActions = db
    .prepare(
      `SELECT c.received_at AS received, MIN(e.at) AS first FROM candidates c
       JOIN events e ON e.candidate_id = c.id
       WHERE e.actor != 'system' AND e.text LIKE 'Zmiana statusu%' ${s.city ? 'AND c.city = ?' : ''}
       GROUP BY c.id`,
    )
    .all(...args) as { received: string; first: string }[];
  const deltas = firstActions.map((r) => (Date.parse(r.first) - Date.parse(r.received)) / 864e5).filter((d) => d >= 0);
  const avg = deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10 : null;

  return {
    total: rows.length,
    newLast7d: rows.filter((r) => now - Date.parse(r.received_at) < weekMs).length,
    avgDaysToFirstAction: avg,
    byStatus,
    byCity: [...cityMap.values()].sort((a, b) => b.total - a.total),
    perWeek,
    upcomingInterviews,
    openVacancies,
    pool: rows.filter((r) => r.rodo === 2).length,
    attention: {
      needsReview: rows.filter((r) => r.needs_review).length,
      duplicates: rows.filter((r) => r.duplicate_of).length,
      stale: rows.filter((r) => r.status === 'new' && now - Date.parse(r.received_at) > weekMs).length,
      unsentRejections: rows.filter((r) => r.status === 'rejected' && !r.rejection_sent).length,
      retentionDue: rows.filter((r) => retention(r).retentionDue).length,
      emptyVacancies: emptyVacancies,
    },
  };
}

const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  // keep spreadsheets from running a cell as a formula (plain phone numbers like "+48 500 100 200" are left alone)
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d[\d ]*$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Semicolon-separated with a BOM so Polish Excel opens it with the right characters. */
export function exportCsv(s: Session): string {
  const head = ['Imię i nazwisko', 'E-mail', 'Telefon', 'Miasto', 'Stanowisko', 'Status', 'Data zgłoszenia', 'Ocena', 'Termin rozmowy', 'Kanał'];
  const { where, args } = scopeSql(s);
  const rows = getDb().prepare(`SELECT * FROM candidates ${where} ORDER BY received_at DESC`).all(...args) as Row[];
  const lines = rows.map((r) =>
    [r.name, r.email, r.phone, r.city, r.position, statusLabel(r.status), r.received_at.slice(0, 10), r.rating ?? '', r.interview_at ?? '', r.channel]
      .map(csvCell)
      .join(';'),
  );
  return '﻿' + [head.map(csvCell).join(';'), ...lines].join('\r\n') + '\r\n';
}


/* ---------- interviews (calendar file) ---------- */

export function interviewIcs(row: Row): string | null {
  if (!isLocalDateTime(row.interview_at)) return null;
  return buildIcs({
    uid: row.id,
    summary: `Rozmowa kwalifikacyjna: ${row.name}`,
    description: `Stanowisko: ${row.position}\nMiasto: ${row.city}`,
    startLocal: row.interview_at,
    minutes: 60,
  });
}

/* ---------- vacancies ---------- */

type VacancyRow = { id: string; position: string; city: string; status: 'open' | 'closed'; opened_at: string; closed_at: string | null };

function toVacancy(v: VacancyRow, counts: Record<string, number>): VacancyDto {
  const end = v.closed_at ? Date.parse(v.closed_at) : Date.now();
  return {
    id: v.id, position: v.position, city: v.city, status: v.status, openedAt: v.opened_at, closedAt: v.closed_at,
    daysOpen: Math.max(0, Math.floor((end - Date.parse(v.opened_at)) / 864e5)),
    total: Object.values(counts).reduce((a, b) => a + b, 0), counts,
  };
}

export function listVacancies(s: Session): VacancyDto[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM vacancies ${s.city ? 'WHERE city = ?' : ''} ORDER BY (status = 'open') DESC, opened_at DESC`)
    .all(...(s.city ? [s.city] : [])) as VacancyRow[];
  const grouped = db
    .prepare('SELECT vacancy_id AS id, status, COUNT(*) AS n FROM candidates WHERE vacancy_id IS NOT NULL GROUP BY vacancy_id, status')
    .all() as { id: string; status: string; n: number }[];
  const byVacancy = new Map<string, Record<string, number>>();
  for (const g of grouped) byVacancy.set(g.id, { ...(byVacancy.get(g.id) || {}), [g.status]: g.n });
  return rows.map((v) => toVacancy(v, byVacancy.get(v.id) || {}));
}

export function createVacancy(s: Session, position: string, city: string): { vacancy?: VacancyDto; error?: string } {
  const db = getDb();
  const dup = db.prepare("SELECT id FROM vacancies WHERE city = ? AND position = ? AND status = 'open'").get(city, position);
  if (dup) return { error: 'Takie ogłoszenie jest już otwarte w tym mieście.' };
  const id = newId();
  db.prepare('INSERT INTO vacancies (id, position, city, status, opened_at, owner) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, position, city, 'open', nowIso(), s.name);
  audit(s.name, 'vacancy-open', `${position} (${city})`);
  return { vacancy: listVacancies({ ...s, city: null }).find((v) => v.id === id) };
}

export function setVacancyStatus(s: Session, id: string, status: 'open' | 'closed'): VacancyDto | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(id) as VacancyRow | undefined;
  if (!row) return undefined;
  db.prepare('UPDATE vacancies SET status = ?, closed_at = ? WHERE id = ?').run(status, status === 'closed' ? nowIso() : null, id);
  audit(s.name, status === 'closed' ? 'vacancy-close' : 'vacancy-reopen', `${row.position} (${row.city})`);
  return listVacancies({ ...s, city: null }).find((v) => v.id === id);
}

export function vacancyExists(id: string) {
  return !!getDb().prepare('SELECT 1 FROM vacancies WHERE id = ?').get(id);
}

/* ---------- opinions after an interview ---------- */

export function addFeedback(
  s: Session,
  candidateId: string,
  f: { communication: number; knowledge: number; fit: number; recommendation: Recommendation; comment: string },
) {
  getDb()
    .prepare('INSERT INTO feedback (candidate_id, author, at, communication, knowledge, fit, recommendation, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(candidateId, s.name, nowIso(), f.communication, f.knowledge, f.fit, f.recommendation, f.comment);
  addEvent(candidateId, s.name, 'Dodano opinię z rozmowy');
}
