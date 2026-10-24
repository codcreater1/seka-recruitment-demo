import { cookies } from 'next/headers';
import { CITIES, norm, type Role, type RoleDef, type Session } from './domain';
import { getRole, getRoles } from './roles';
import { SESSION_COOKIE, SESSION_MAX_AGE_S, isHttps, openSession, sealSession } from './session';

/**
 * Sign-in:
 *  - AUTH_MODE=demo (default): the demo accounts below, picked on the login page. Stands in for single sign-on.
 *  - AUTH_MODE=entra: Microsoft Entra ID (OpenID Connect), see src/lib/entra.ts and docs/entra-id.md.
 * Both end in the same signed session cookie, and every API route goes through requireSession() and friends,
 * so permissions are enforced on the server whichever way the user signed in.
 */
export const authMode = (): 'demo' | 'entra' => (process.env.AUTH_MODE === 'entra' ? 'entra' : 'demo');

export type DemoAccount = {
  id: string;
  email: string;
  name: string;
  role: Role;
  city: string | null;
  /** Name of the Entra ID app role / group that would give the same access. */
  entraRole: string;
};

const ascii = (s: string) => norm(s).replace(/[^a-z]/g, '');

/**
 * Accounts of the demo, one for each built-in role and one for each role the administrator adds (with a branch
 * manager for every city). They stand in for people signing in with Microsoft.
 */
export function demoAccounts(): DemoAccount[] {
  const out: DemoAccount[] = [];
  for (const r of getRoles()) {
    if (r.id === 'sysadmin') out.push({ id: 'sysadmin', email: 'sysadmin@seka.example', name: r.label, role: r.id, city: null, entraRole: r.entraRole });
    else if (r.id === 'admin') out.push({ id: 'admin', email: 'admin@seka.example', name: r.label, role: r.id, city: null, entraRole: r.entraRole });
    else if (r.id === 'hr') out.push({ id: 'hr', email: 'agnieszka.hr@seka.example', name: 'Agnieszka (HR)', role: r.id, city: null, entraRole: r.entraRole });
    else if (r.id === 'manager') {
      for (const c of CITIES) out.push({ id: `mgr:${c}`, email: `${ascii(c)}@seka.example`, name: `${r.label} – ${c}`, role: r.id, city: c, entraRole: `${r.entraRole}.${c}` });
    } else {
      const city = r.scope === 'city' ? CITIES[0] : null;
      out.push({ id: `role:${r.id}`, email: `${ascii(r.label) || 'rola'}@seka.example`, name: `${r.label} (demo${city ? `, ${city}` : ''})`, role: r.id, city, entraRole: city ? `${r.entraRole}.${city}` : r.entraRole });
    }
  }
  return out;
}

// the role is added only when the name does not already say it
export const roleOptions = () =>
  demoAccounts().map((a) => {
    const label = getRole(a.role)?.label ?? a.role;
    return { id: a.id, label: a.name.startsWith(label) || a.name.includes(label) ? a.name : `${a.name} · ${label}` };
  });

/** The session for an account, with what its role allows. Null when the role no longer exists or a branch role has no valid branch. */
export function makeSession(a: Pick<Session, 'id' | 'role' | 'city' | 'name' | 'email'>): Session | null {
  const def: RoleDef | undefined = getRole(a.role);
  if (!def) return null;
  // a branch role without a known branch would see nothing useful and must never see everything
  if (def.scope === 'city' && !(CITIES as readonly string[]).includes(a.city ?? '')) return null;
  const has = (p: string) => (def.permissions as string[]).includes(p);
  return {
    id: a.id,
    role: def.id,
    roleLabel: def.label,
    city: def.scope === 'city' ? a.city : null,
    name: a.name,
    email: a.email,
    permissions: def.permissions,
    canEdit: has('edit'),
    canComment: has('comment') || has('edit'),
    canConfigure: has('settings.admin'),
    canSystem: has('settings.system'),
  };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const p = openSession(jar.get(SESSION_COOKIE)?.value);
  return p ? makeSession(p) : null;
}

/** Starts a session: writes the signed cookie. */
export async function startSession(req: Request, s: Pick<Session, 'id' | 'role' | 'city' | 'name' | 'email'>) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sealSession(s), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const unauthorized = (msg = 'Zaloguj się, aby kontynuować.') => json({ error: msg }, 401);
export const forbidden = (msg = 'Brak uprawnień do tej operacji.') => json({ error: msg }, 403);
export const notFound = (msg = 'Nie znaleziono.') => json({ error: msg }, 404);
export const badRequest = (msg: string) => json({ error: msg }, 400);

/** The signed-in user, or the 401 response to return. */
export async function requireSession(): Promise<Session | Response> {
  return (await getSession()) ?? unauthorized();
}

/** The signed-in user if they may change candidate data (admin, HR manager), else 401 / 403. */
export async function requireEditor(message = 'Ta operacja jest dostępna tylko dla HR.'): Promise<Session | Response> {
  const s = await requireSession();
  if (s instanceof Response) return s;
  return s.canEdit ? s : forbidden(message);
}

/** The signed-in user if they may change the settings (admin), else 401 / 403. */
export async function requireSystem(message = 'Ta operacja jest dostępna tylko dla administratora systemu.'): Promise<Session | Response> {
  const s = await requireSession();
  if (s instanceof Response) return s;
  return s.canSystem ? s : forbidden(message);
}

/** The signed-in user if they may add comments and opinions, else 401 / 403. */
export async function requireCommenter(message = 'Nie masz uprawnień do dodawania komentarzy.'): Promise<Session | Response> {
  const s = await requireSession();
  if (s instanceof Response) return s;
  return s.canComment ? s : forbidden(message);
}

export async function requireAdmin(message = 'Ta operacja jest dostępna tylko dla administratora.'): Promise<Session | Response> {
  const s = await requireSession();
  if (s instanceof Response) return s;
  return s.canConfigure ? s : forbidden(message);
}
