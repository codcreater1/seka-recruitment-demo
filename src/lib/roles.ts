import { audit, getDb, newId } from './db';
import { DEFAULT_ROLES, PERMISSIONS, isPermission, type PermissionId, type RoleDef, type RoleScope, type Session } from './domain';

declare global {
  // eslint-disable-next-line no-var
  var __sekaRoles: RoleDef[] | undefined;
}

type Row = { id: string; label: string; scope: RoleScope; permissions: string; entra_role: string; builtin: number };

function load(): RoleDef[] {
  const rows = getDb().prepare('SELECT id, label, scope, permissions, entra_role, builtin FROM roles ORDER BY position, rowid').all() as Row[];
  if (!rows.length) return DEFAULT_ROLES;
  return rows.map((r) => {
    let permissions: PermissionId[] = [];
    try {
      const v = JSON.parse(r.permissions);
      if (Array.isArray(v)) permissions = v.filter(isPermission);
    } catch {
      /* a damaged row gets no permissions */
    }
    return { id: r.id, label: r.label, scope: r.scope, permissions, entraRole: r.entra_role, builtin: !!r.builtin };
  });
}

export function getRoles(): RoleDef[] {
  if (!globalThis.__sekaRoles) globalThis.__sekaRoles = load();
  return globalThis.__sekaRoles;
}
export const getRole = (id: string): RoleDef | undefined => getRoles().find((r) => r.id === id);
export const invalidateRoles = () => {
  globalThis.__sekaRoles = undefined;
};

/** How much a role can do; when a person has several roles the strongest one wins. */
export const roleRank = (r: RoleDef) => r.permissions.reduce((n, p) => n + (p === 'settings.system' ? 8 : p === 'settings.admin' ? 4 : p === 'edit' ? 2 : 1), 0);

export type RoleInput = { id?: string; label: string; scope: string; permissions: string[]; entraRole: string };

/**
 * Replaces the roles with the edited list. The system administrator role is fixed; the other built-in roles can be
 * renamed and given other permissions; roles added by the administrator can be changed or removed. Only someone with
 * the system permission may give or take away the system permission, so an administrator cannot promote themselves.
 */
export function saveRoles(input: RoleInput[], by: Session): { ok: true } | { error: string } {
  const now = getRoles();
  if (!Array.isArray(input) || input.length > 30) return { error: 'Nieprawidłowa lista ról.' };
  const next: RoleDef[] = [];
  const labels = new Set<string>();
  const entra = new Set<string>();
  for (const raw of input) {
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    if (!label || label.length > 40) return { error: 'Nazwa roli musi mieć od 1 do 40 znaków.' };
    if (labels.has(label.toLowerCase())) return { error: `Nazwa roli „${label}” występuje dwa razy.` };
    labels.add(label.toLowerCase());
    const existing = raw.id ? now.find((r) => r.id === raw.id) : undefined;
    if (raw.id && !existing) return { error: 'Nieznana rola na liście.' };
    const permissions = [...new Set((Array.isArray(raw.permissions) ? raw.permissions : []).filter(isPermission))];
    if (Array.isArray(raw.permissions) && permissions.length !== new Set(raw.permissions).size) return { error: 'Nieznane uprawnienie.' };
    const entraRole = typeof raw.entraRole === 'string' ? raw.entraRole.trim() : '';
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(entraRole)) return { error: `Nazwa roli aplikacji Entra ID dla „${label}” może zawierać tylko litery, cyfry, kropki, myślniki i podkreślenia.` };
    if (entra.has(entraRole.toLowerCase())) return { error: `Nazwa roli Entra ID „${entraRole}” jest używana dwa razy.` };
    entra.add(entraRole.toLowerCase());
    if (existing?.id === 'sysadmin') {
      next.push({ ...existing, label, entraRole });
      continue;
    }
    const scope = existing?.builtin ? existing.scope : raw.scope === 'city' || raw.scope === 'all' ? raw.scope : null;
    if (!scope) return { error: 'Zakres roli to cała firma albo jeden oddział.' };
    if (existing?.id === 'admin' && !permissions.includes('settings.admin')) return { error: 'Rola „Administrator” musi zachować uprawnienie do administracji, inaczej nikt nie zmieni ustawień.' };
    next.push({ id: existing?.id ?? `r-${newId().slice(0, 8)}`, label, scope, permissions, entraRole, builtin: !!existing?.builtin });
  }
  for (const b of now.filter((r) => r.builtin)) {
    if (!next.some((r) => r.id === b.id)) return { error: `Roli „${b.label}” nie można usunąć.` };
  }
  // the system permission is only for the system administrator to hand out
  if (!by.canSystem) {
    const had = (r: RoleDef | undefined) => !!r?.permissions.includes('settings.system');
    for (const r of next) {
      if (had(r) !== had(now.find((x) => x.id === r.id))) return { error: 'Uprawnienie do ustawień systemowych może nadawać tylko administrator systemu.' };
    }
  }
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM roles').run();
    const ins = db.prepare('INSERT INTO roles (id, label, scope, permissions, entra_role, builtin, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    next.forEach((r, i) => ins.run(r.id, r.label, r.scope, JSON.stringify(r.permissions), r.entraRole, r.builtin ? 1 : 0, i));
  })();
  invalidateRoles();
  const changes: string[] = [];
  for (const r of next) {
    const before = now.find((x) => x.id === r.id);
    if (!before) changes.push(`dodano rolę „${r.label}”`);
    else if (before.label !== r.label || before.entraRole !== r.entraRole || before.scope !== r.scope || before.permissions.slice().sort().join() !== r.permissions.slice().sort().join()) changes.push(`zmieniono rolę „${r.label}”`);
  }
  for (const r of now) if (!next.some((n) => n.id === r.id)) changes.push(`usunięto rolę „${r.label}”`);
  if (changes.length) audit(by.name, 'roles-update', changes.join('; '));
  return { ok: true };
}

export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);
