import { cookies } from 'next/headers';
import { ROLE_COOKIE, ROLE_OPTIONS, badRequest, getSession, json, sessionFromRole } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ session: await getSession(), roles: ROLE_OPTIONS });
}

/** Demo only: switch the active role. Replaced by SSO in a real deployment. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role;
  if (!role || !ROLE_OPTIONS.some((r) => r.id === role)) return badRequest('Nieznana rola.');
  const jar = await cookies();
  // behind a TLS-terminating proxy (Coolify) the request arrives as plain http with x-forwarded-proto set
  const https = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol).replace(':', '').split(',')[0].trim() === 'https';
  jar.set(ROLE_COOKIE, role, { httpOnly: true, sameSite: 'lax', secure: https, path: '/', maxAge: 60 * 60 * 24 * 30 });
  return json({ session: sessionFromRole(role) });
}
