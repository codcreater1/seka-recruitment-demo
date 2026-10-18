import { cookies } from 'next/headers';
import { CITIES, ROLE_LABEL, norm, type Role, type Session } from './domain';
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

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'admin', email: 'admin@seka.example', name: 'Administrator systemu', role: 'admin', city: null, entraRole: 'SEKA.Admin' },
  { id: 'hr', email: 'agnieszka.hr@seka.example', name: 'Agnieszka (HR)', role: 'hr', city: null, entraRole: 'SEKA.HR' },
  ...CITIES.map(
    (c): DemoAccount => ({
      id: `mgr:${c}`,
      email: `${ascii(c)}@seka.example`,
      name: `Kierownik oddziału – ${c}`,
      role: 'manager',
      city: c,
      entraRole: `SEKA.Branch.${c}`,
    }),
  ),
];

// the role is added only when the name does not already say it
export const ROLE_OPTIONS = DEMO_ACCOUNTS.map((a) => ({
  id: a.id,
  label: a.name.startsWith(ROLE_LABEL[a.role]) ? a.name : `${a.name} · ${ROLE_LABEL[a.role]}`,
}));

export function makeSession(a: Pick<Session, 'id' | 'role' | 'city' | 'name' | 'email'>): Session {
  return {
    id: a.id,
    role: a.role,
    city: a.role === 'manager' ? a.city : null,
    name: a.name,
    email: a.email,
    canEdit: a.role !== 'manager',
    canConfigure: a.role === 'admin',
  };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const p = openSession(jar.get(SESSION_COOKIE)?.value);
  if (!p) return null;
  // a branch manager without a known branch would see nothing useful and must never see everything
  if (p.role === 'manager' && !(CITIES as readonly string[]).includes(p.city ?? '')) return null;
  return makeSession(p);
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
export async function requireAdmin(message = 'Ta operacja jest dostępna tylko dla administratora.'): Promise<Session | Response> {
  const s = await requireSession();
  if (s instanceof Response) return s;
  return s.canConfigure ? s : forbidden(message);
}
