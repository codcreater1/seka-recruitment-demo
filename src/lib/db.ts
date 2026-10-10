import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EMAIL_TEMPLATES, statusLabel, type StatusId } from './domain';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const FILES_DIR = path.join(DATA_DIR, 'files');
export const SEED_DIR = process.env.SEED_DIR || path.join(process.cwd(), 'seed');
export const RETENTION_MONTHS = Number(process.env.RETENTION_MONTHS || 6);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  position TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  received_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  from_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  city_basis TEXT NOT NULL DEFAULT '',
  rodo INTEGER NOT NULL DEFAULT 0,
  file_id TEXT,
  file_name TEXT,
  file_size INTEGER,
  raw_text TEXT NOT NULL DEFAULT '',
  rating INTEGER,
  interview_at TEXT,
  rejection_sent INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  duplicate_of TEXT
);
CREATE INDEX IF NOT EXISTS idx_candidates_city ON candidates(city);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  template TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  actor TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT ''
);
CREATE VIRTUAL TABLE IF NOT EXISTS cv_fts USING fts5(candidate_id UNINDEXED, name, position, body);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
`;

type SeedCandidate = {
  id: string; name: string; city: string; position: string; status: StatusId; daysAgo: number;
  email: string; phone: string; subject: string; cityBasis: string; rodo: boolean; file: string;
  downloadName: string; rating: number | null; note: string | null;
  interview: { inDays: number; time: string } | null;
  needsReview?: boolean;
  duplicateOf?: string | null;
};

const PATHS: Record<string, StatusId[]> = {
  new: [],
  screening: ['screening'],
  interview: ['screening', 'interview'],
  offer: ['screening', 'interview', 'offer'],
  hired: ['screening', 'interview', 'offer', 'hired'],
  rejected: ['screening', 'rejected'],
};

function seedDemo(db: Database.Database) {
  const seedFile = path.join(SEED_DIR, 'seed.json');
  if (!fs.existsSync(seedFile)) return;
  const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as { candidates: SeedCandidate[] };
  const now = Date.now();
  const insC = db.prepare(`INSERT INTO candidates
    (id, name, email, phone, city, position, status, received_at, channel, from_addr, subject, city_basis, rodo,
     file_id, file_name, file_size, rating, interview_at, rejection_sent, needs_review, duplicate_of)
    VALUES (@id, @name, @email, @phone, @city, @position, @status, @received_at, 'E-mail', @email, @subject, @city_basis,
     @rodo, @file_id, @file_name, @file_size, @rating, @interview_at, @rejection_sent, @needs_review, @duplicate_of)`);
  const insE = db.prepare('INSERT INTO events (candidate_id, at, actor, text) VALUES (?, ?, ?, ?)');
  const insN = db.prepare('INSERT INTO notes (candidate_id, author, text, created_at) VALUES (?, ?, ?, ?)');
  const insM = db.prepare(
    "INSERT INTO emails (candidate_id, at, template, to_addr, subject, body, status, actor) VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)",
  );

  const run = db.transaction(() => {
    seed.candidates.forEach((c, i) => {
      const received = now - c.daysAgo * 864e5 - (2 * 36e5 + i * 37 * 6e4);
      const at = (offsetH: number) => new Date(Math.min(received + offsetH * 36e5, now - 5 * 6e4)).toISOString();
      const src = path.join(SEED_DIR, c.file);
      const size = fs.existsSync(src) ? fs.statSync(src).size : 0;
      if (size) fs.copyFileSync(src, path.join(FILES_DIR, `${c.id}.pdf`));
      let interviewAt: string | null = null;
      if (c.interview) {
        const d = new Date(now + c.interview.inDays * 864e5);
        interviewAt = `${d.toISOString().slice(0, 10)}T${c.interview.time}`;
      }
      insC.run({
        id: c.id, name: c.name, email: c.email, phone: c.phone, city: c.city, position: c.position,
        status: c.status, received_at: new Date(received).toISOString(), subject: c.subject,
        city_basis: c.cityBasis, rodo: c.rodo ? (i % 4 === 0 ? 2 : 1) : 0, file_id: size ? c.id : null,
        file_name: size ? c.downloadName : null, file_size: size || null, rating: c.rating,
        interview_at: interviewAt, rejection_sent: c.status === 'rejected' ? 1 : 0,
        needs_review: c.needsReview ? 1 : 0, duplicate_of: c.duplicateOf ?? null,
      });
      insE.run(c.id, new Date(received).toISOString(), 'system', 'Otrzymano zgłoszenie e-mailem');
      insE.run(c.id, new Date(received + 6e4).toISOString(), 'system', 'Utworzono profil kandydata (automatycznie z załącznika PDF)');
      insE.run(c.id, new Date(received + 2 * 6e4).toISOString(), 'system', 'Wysłano potwierdzenie przyjęcia zgłoszenia (automatyczna odpowiedź, symulacja)');
      if (c.duplicateOf) {
        insE.run(c.id, new Date(received + 3 * 6e4).toISOString(), 'system', 'Wykryto możliwy duplikat: ten adres e-mail ma już profil w systemie');
      }
      let prev: StatusId = 'new';
      (PATHS[c.status] || []).forEach((st, k) => {
        insE.run(c.id, at(20 + k * 30), 'Agnieszka (HR)', `Zmiana statusu: ${statusLabel(prev)} → ${statusLabel(st)}`);
        prev = st;
      });
      if (c.status === 'rejected') {
        insE.run(c.id, at(20 + (PATHS.rejected.length) * 30 + 1), 'Agnieszka (HR)', 'Wysłano podziękowanie za udział w rekrutacji (symulacja)');
      }
      if (c.note) insN.run(c.id, 'Agnieszka (HR)', c.note, at(24));
      const mail = (template: 'ack' | 'rejection' | 'invite', when: string, actor: string) => {
        const t = EMAIL_TEMPLATES[template];
        insM.run(c.id, when, template, c.email, t.subject, t.body({ position: c.position, interviewAt }), actor);
      };
      mail('ack', new Date(received + 2 * 6e4).toISOString(), 'system');
      if (c.status === 'rejected') mail('rejection', at(20 + PATHS.rejected.length * 30 + 1), 'Agnieszka (HR)');
      if (c.status === 'interview' && interviewAt) mail('invite', at(20 + 2 * 30 + 2), 'Agnieszka (HR)');
    });
    db.prepare('INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)')
      .run(new Date().toISOString(), 'system', 'seed', `Załadowano ${seed.candidates.length} przykładowych zgłoszeń`);
  });
  run();
}

declare global {
  // eslint-disable-next-line no-var
  var __sekaDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__sekaDb) return globalThis.__sekaDb;
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, 'recruitment.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const count = (db.prepare('SELECT COUNT(*) AS n FROM candidates').get() as { n: number }).n;
  if (count === 0 && process.env.SEED_DEMO_DATA !== 'false') seedDemo(db);
  globalThis.__sekaDb = db;
  // fill in CV text for seeded profiles and build the search index (does not block start-up)
  void import('./search').then((m) => m.backfillIndex()).catch(() => undefined);
  return db;
}

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export function filePath(fileId: string) {
  return path.join(FILES_DIR, `${path.basename(fileId)}.pdf`);
}

export function audit(actor: string, action: string, detail = '') {
  getDb().prepare('INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)').run(nowIso(), actor, action, detail);
}

export function addEvent(candidateId: string, actor: string, text: string) {
  getDb().prepare('INSERT INTO events (candidate_id, at, actor, text) VALUES (?, ?, ?, ?)').run(candidateId, nowIso(), actor, text);
}

