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
  jar.set(ROLE_COOKIE, role, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return json({ session: sessionFromRole(role) });
}
