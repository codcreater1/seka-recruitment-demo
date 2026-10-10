import { cookies } from 'next/headers';
import { CITIES, type Session } from './domain';

/**
 * Demo authentication: the role is chosen in the UI and kept in a cookie.
 * Real deployments replace this with Microsoft Entra ID (SSO); every API route
 * already goes through getSession(), so permissions stay enforced on the server.
 */
export const ROLE_COOKIE = 'demo-role';

export const ROLE_OPTIONS = [
  { id: 'hr', label: 'HR – Agnieszka (wszystkie miasta)' },
  ...CITIES.map((c) => ({ id: `mgr:${c}`, label: `Kierownik oddziału – ${c}` })),
];

export function sessionFromRole(value: string | undefined): Session {
  if (value && value.startsWith('mgr:')) {
    const city = value.slice(4);
    if ((CITIES as readonly string[]).includes(city)) {
      return { id: value, role: 'manager', city, name: `Kierownik oddziału – ${city}`, canEdit: false };
    }
  }
  return { id: 'hr', role: 'hr', city: null, name: 'Agnieszka (HR)', canEdit: true };
}

export async function getSession(): Promise<Session> {
  const jar = await cookies();
  return sessionFromRole(jar.get(ROLE_COOKIE)?.value);
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const forbidden = (msg = 'Brak uprawnień do tej operacji.') => json({ error: msg }, 403);
export const notFound = (msg = 'Nie znaleziono.') => json({ error: msg }, 404);
export const badRequest = (msg: string) => json({ error: msg }, 400);
