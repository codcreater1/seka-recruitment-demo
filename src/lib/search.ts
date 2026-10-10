import fs from 'node:fs';
import { filePath, getDb } from './db';
import { extractPdfText } from './cv-parse';
import { norm, type Session } from './domain';

/**
 * Full-text search over the text of the CVs (SQLite FTS5). Text is stored without diacritics
 * so "srodowiska" finds "środowiska" and "wroclaw" finds "Wrocław".
 */

export function indexCandidate(id: string, name: string, position: string, rawText: string) {
  const db = getDb();
  db.prepare('DELETE FROM cv_fts WHERE candidate_id = ?').run(id);
  db.prepare('INSERT INTO cv_fts (candidate_id, name, position, body) VALUES (?, ?, ?, ?)').run(id, norm(name), norm(position), norm(rawText));
}

export function removeFromIndex(id: string) {
  getDb().prepare('DELETE FROM cv_fts WHERE candidate_id = ?').run(id);
}

type Row = { id: string; name: string; position: string; raw_text: string; file_id: string | null };

/** Fills in missing CV text for seeded profiles and rebuilds the index. Runs once after start. */
export async function backfillIndex() {
  const db = getDb();
  const missing = db.prepare("SELECT id, name, position, raw_text, file_id FROM candidates WHERE raw_text = '' AND file_id IS NOT NULL").all() as Row[];
  for (const r of missing) {
    try {
      const p = filePath(r.file_id as string);
      if (!fs.existsSync(p)) continue;
      const text = await extractPdfText(new Uint8Array(fs.readFileSync(p)));
      if (text) db.prepare('UPDATE candidates SET raw_text = ? WHERE id = ?').run(text, r.id);
    } catch {
      /* scanned or unreadable: stays without text */
    }
  }
  const all = db.prepare('SELECT id, name, position, raw_text FROM candidates').all() as Row[];
  const rebuild = db.transaction(() => {
    db.prepare('DELETE FROM cv_fts').run();
    for (const r of all) indexCandidate(r.id, r.name, r.position, r.raw_text);
  });
  rebuild();
}

function snippet(raw: string, tokens: string[]): string {
  const n = norm(raw);
  const aligned = n.length === raw.length;
  const base = aligned ? raw : n;
  let at = -1;
  for (const t of tokens) {
    at = n.indexOf(t);
    if (at > -1) break;
  }
  if (at < 0) return '';
  const from = Math.max(0, at - 50);
  const to = Math.min(base.length, at + 90);
  return (from > 0 ? '… ' : '') + base.slice(from, to).replace(/\s+/g, ' ').trim() + (to < base.length ? ' …' : '');
}

export function searchCandidates(s: Session, q: string): { id: string; snippet: string }[] {
  const tokens = norm(q).split(/[^a-z0-9]+/).filter((t) => t.length >= 2).slice(0, 6);
  if (!tokens.length) return [];
  const db = getDb();
  const match = tokens.map((t) => `"${t}"*`).join(' ');
  let ids: string[];
  try {
    ids = (db.prepare('SELECT candidate_id FROM cv_fts WHERE cv_fts MATCH ? LIMIT 100').all(match) as { candidate_id: string }[]).map((r) => r.candidate_id);
  } catch {
    return [];
  }
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, city, raw_text FROM candidates WHERE id IN (${marks})`)
    .all(...ids) as { id: string; city: string; raw_text: string }[];
  return rows
    .filter((r) => !s.city || r.city === s.city)
    .map((r) => ({ id: r.id, snippet: snippet(r.raw_text, tokens) }));
}
