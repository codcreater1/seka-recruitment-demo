import { cookies } from 'next/headers';
import { authMode } from '@/lib/auth';
import { OIDC_COOKIE, authorizeUrl, entraConfig, newSecret, redirectUri } from '@/lib/entra';
import { isHttps, sealValue } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const back = (to: string) => new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });

/** Step 1 of the Microsoft Entra ID sign-in: remember state, nonce and PKCE verifier, send the user to Microsoft. */
export async function GET(req: Request) {
  const cfg = authMode() === 'entra' ? entraConfig() : null;
  if (!cfg) return back('/login?error=failed');
  const state = newSecret();
  const nonce = newSecret();
  const verifier = newSecret();
  const jar = await cookies();
  jar.set(OIDC_COOKIE, sealValue({ state, nonce, verifier }, 600), {
    httpOnly: true,
    sameSite: 'lax', // the redirect back from Microsoft is a top-level navigation, so the cookie is sent
    secure: isHttps(req),
    path: '/api/auth/entra',
    maxAge: 600,
  });
  return back(authorizeUrl(cfg, redirectUri(cfg, req), state, nonce, verifier));
}
