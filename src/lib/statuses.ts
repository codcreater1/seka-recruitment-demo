import { audit, getDb, newId, refreshStatuses } from './db';
import { STATUS_KINDS, isStatusKind, statusList, type StatusDef, type StatusKind } from './domain';

export type StatusInput = { id?: string; label: string; kind: string };

/** How many applications use each status (a status in use cannot be removed). */
export function statusUsage(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of getDb().prepare('SELECT status, COUNT(*) AS n FROM candidates GROUP BY status').all() as { status: string; n: number }[]) out[r.status] = r.n;
  return out;
}

const MAX_STATUSES = 30;

/**
 * Replaces the status list with the one the administrator edited (the order is the order of the array).
 * The built-in statuses stay, keep their kind and "Nowa" stays first; an added one can be renamed, moved and removed
 * as long as no application uses it.
 */
export function saveStatuses(input: StatusInput[], actor: string): { ok: true } | { error: string } {
  const now = statusList();
  if (!Array.isArray(input) || input.length < now.filter((s) => s.builtin).length || input.length > MAX_STATUSES) {
    return { error: `Lista statusów musi zawierać od ${now.filter((s) => s.builtin).length} do ${MAX_STATUSES} pozycji.` };
  }
  const seen = new Set<string>();
  const next: StatusDef[] = [];
  for (const raw of input) {
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    if (!label || label.length > 40) return { error: 'Nazwa statusu musi mieć od 1 do 40 znaków.' };
    if (seen.has(label.toLowerCase())) return { error: `Nazwa statusu „${label}” występuje dwa razy.` };
    seen.add(label.toLowerCase());
    const existing = raw.id ? now.find((s) => s.id === raw.id) : undefined;
    if (raw.id && !existing) return { error: 'Nieznany status na liście.' };
    if (existing) {
      if (existing.builtin && raw.kind !== existing.kind) return { error: `Rodzaju statusu „${existing.label}” nie można zmienić.` };
      if (!existing.builtin && (!isStatusKind(raw.kind) || raw.kind === 'new')) return { error: 'Nieznany rodzaj statusu.' };
      next.push({ id: existing.id, label, kind: existing.builtin ? existing.kind : (raw.kind as StatusKind), builtin: existing.builtin });
    } else {
      if (!STATUS_KINDS.some((k) => k.id === raw.kind)) return { error: 'Wybierz rodzaj dla nowego statusu.' };
      next.push({ id: `s-${newId().slice(0, 8)}`, label, kind: raw.kind as StatusKind, builtin: false });
    }
  }
  if (next[0].id !== 'new') return { error: 'Status „Nowa” musi pozostać pierwszy: tak zaczynają się wszystkie zgłoszenia.' };
  for (const b of now.filter((s) => s.builtin)) {
    if (!next.some((s) => s.id === b.id)) return { error: `Statusu „${b.label}” nie można usunąć.` };
  }
  const usage = statusUsage();
  for (const s of now) {
    if (!next.some((n) => n.id === s.id) && usage[s.id]) return { error: `Status „${s.label}” jest używany przez ${usage[s.id]} zgłoszeń, więc nie można go usunąć.` };
  }

  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM statuses').run();
    const ins = db.prepare('INSERT INTO statuses (id, label, kind, position, builtin) VALUES (?, ?, ?, ?, ?)');
    next.forEach((s, i) => ins.run(s.id, s.label, s.kind, i, s.builtin ? 1 : 0));
  })();
  refreshStatuses(db);
  const changes: string[] = [];
  for (const s of next) {
    const before = now.find((x) => x.id === s.id);
    if (!before) changes.push(`dodano „${s.label}” (${s.kind})`);
    else if (before.label !== s.label) changes.push(`„${before.label}” → „${s.label}”`);
  }
  for (const s of now) if (!next.some((n) => n.id === s.id)) changes.push(`usunięto „${s.label}”`);
  if (changes.length || next.some((s, i) => now[i]?.id !== s.id)) audit(actor, 'statuses-update', changes.join('; ') || 'zmieniono kolejność');
  return { ok: true };
}
