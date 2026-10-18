import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { authMode, startSession } from '@/lib/auth';
import { audit } from '@/lib/db';
import { OIDC_COOKIE, entraConfig, exchangeCode, redirectUri, sessionFromClaims, verifyIdToken } from '@/lib/entra';
import { openValue } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const back = (to: string) => new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Step 2: Microsoft sends the user back with a code. Exchange it, check the ID token, start the session. */
export async function GET(req: Request) {
  const cfg = authMode() === 'entra' ? entraConfig() : null;
  const jar = await cookies();
  const saved = openValue(jar.get(OIDC_COOKIE)?.value);
  jar.delete({ name: OIDC_COOKIE, path: '/api/auth/entra' }); // one attempt, one use
  if (!cfg) return back('/login?error=failed');

  const params = new URL(req.url).searchParams;
  const code = params.get('code');
  const state = params.get('state');
  if (params.get('error') || !code || !state || !saved || !same(state, saved.state ?? '')) return back('/login?error=failed');

  try {
    const idToken = await exchangeCode(cfg, redirectUri(cfg, req), code, saved.verifier ?? '');
    const claims = await verifyIdToken(cfg, idToken, saved.nonce ?? '');
    const session = sessionFromClaims(cfg, claims);
    if (!session) {
      audit(claims.preferred_username || claims.email || 'nieznany', 'login-denied', 'Konto Microsoft bez roli w systemie rekrutacji');
      return back('/login?error=denied');
    }
    await startSession(req, session);
    audit(session.name, 'login', 'Zalogowano (Microsoft Entra ID)');
    return back('/');
  } catch {
    return back('/login?error=failed');
  }
}
