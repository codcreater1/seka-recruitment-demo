import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { CITIES, type Role, type RoleDef } from './domain';
import { getRoles, roleRank } from './roles';
import { getSystemConfig } from './system-config';

/**
 * Sign-in with Microsoft Entra ID (OpenID Connect, authorization code flow with PKCE), no extra libraries.
 * Enabled with AUTH_MODE=entra. See docs/entra-id.md for the setup in the Azure portal.
 *
 *   ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET   the app registration
 *   APP_URL                                                  public address of this app (for the redirect URI)
 *   ENTRA_ROLE_MAP                                           optional JSON: {"<group id or role name>": "admin" | "hr" | "manager:Kraków"}
 *   ENTRA_AUTHORITY                                          optional, defaults to https://login.microsoftonline.com/<tenant>
 */
/** Cookie that carries state, nonce and the PKCE verifier between the two steps of the sign-in. */
export const OIDC_COOKIE = 'seka-oidc';

export type EntraConfig = {
  tenant: string;
  clientId: string;
  clientSecret: string;
  authority: string;
  appUrl: string | null;
  roleMap: Record<string, string>;
};

export function entraConfig(): EntraConfig | null {
  const sys = getSystemConfig();
  const tenant = sys.entraTenant;
  const clientId = sys.entraClient;
  const clientSecret = sys.entraSecret;
  if (!tenant || !clientId || !clientSecret) return null;
  let roleMap: Record<string, string> = {};
  try {
    const parsed = JSON.parse(process.env.ENTRA_ROLE_MAP || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) roleMap = parsed;
  } catch {
    /* an unreadable map is ignored; the default role names still work */
  }
  return {
    tenant,
    clientId,
    clientSecret,
    authority: (process.env.ENTRA_AUTHORITY || `https://login.microsoftonline.com/${tenant}`).replace(/\/+$/, ''),
    appUrl: sys.appUrl ? sys.appUrl.replace(/\/+$/, '') : null,
    roleMap,
  };
}

/** Address Microsoft sends the user back to: APP_URL when set, otherwise the address of the request. */
export function redirectUri(cfg: EntraConfig, req: Request) {
  if (cfg.appUrl) return `${cfg.appUrl}/api/auth/entra/callback`;
  const url = new URL(req.url);
  const proto = (req.headers.get('x-forwarded-proto') || url.protocol).replace(':', '').split(',')[0].trim();
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host).split(',')[0].trim();
  return `${proto}://${host}/api/auth/entra/callback`;
}

export const newSecret = () => randomBytes(32).toString('base64url');
export const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export function authorizeUrl(cfg: EntraConfig, redirect: string, state: string, nonce: string, verifier: string) {
  const u = new URL(`${cfg.authority}/oauth2/v2.0/authorize`);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('response_mode', 'query');
  u.searchParams.set('scope', 'openid profile email');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', challengeOf(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

async function fetchJson(url: string, init?: RequestInit) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

/** Exchanges the code from the redirect for the tokens (the secret never reaches the browser). */
export async function exchangeCode(cfg: EntraConfig, redirect: string, code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  const res = await fetchJson(`${cfg.authority}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (typeof res.id_token !== 'string') throw new Error('no id_token');
  return res.id_token;
}

type Jwk = { kid?: string; kty: string; n?: string; e?: string };
let keyCache: { at: number; keys: Jwk[] } | null = null;

async function signingKeys(cfg: EntraConfig, refresh = false): Promise<Jwk[]> {
  if (!refresh && keyCache && Date.now() - keyCache.at < 60 * 60 * 1000) return keyCache.keys;
  const res = await fetchJson(`${cfg.authority}/discovery/v2.0/keys`);
  const keys = Array.isArray(res.keys) ? (res.keys as Jwk[]) : [];
  keyCache = { at: Date.now(), keys };
  return keys;
}

export type Claims = {
  iss?: string; aud?: string | string[]; exp?: number; nbf?: number; nonce?: string; tid?: string;
  oid?: string; sub?: string; name?: string; preferred_username?: string; email?: string; upn?: string;
  roles?: string[]; groups?: string[];
};

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Checks signature, issuer, audience, expiry and nonce of the ID token. Throws when anything is off. */
export async function verifyIdToken(cfg: EntraConfig, token: string, nonce: string, now = Date.now()): Promise<Claims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = decode(parts[0]) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error('unexpected algorithm');
  let jwk = (await signingKeys(cfg)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(cfg, true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) throw new Error('unknown signing key');
  const key = createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' });
  const valid = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw new Error('bad signature');
  const claims = decode(parts[1]) as Claims;
  const t = Math.floor(now / 1000);
  if (claims.iss !== `${cfg.authority}/v2.0`) throw new Error('wrong issuer');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(cfg.clientId)) throw new Error('wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp < t - 60) throw new Error('token expired');
  if (typeof claims.nbf === 'number' && claims.nbf > t + 60) throw new Error('token not yet valid');
  if (!claims.nonce || claims.nonce !== nonce) throw new Error('wrong nonce');
  if (/^[0-9a-f-]{36}$/i.test(cfg.tenant) && claims.tid && claims.tid.toLowerCase() !== cfg.tenant.toLowerCase()) throw new Error('wrong tenant');
  return claims;
}

/**
 * The role names of the app registration are understood without any configuration: each role has an Entra name
 * ("SEKA.HR", "SEKA.Admin", ...), and a branch role has that name followed by the city ("SEKA.Branch.Kraków").
 */
function defaultRole(value: string): string | null {
  for (const r of getRoles()) {
    if (r.scope === 'all' && value === r.entraRole) return r.id;
    if (r.scope === 'city' && value.startsWith(r.entraRole + '.')) return `${r.id}:${value.slice(r.entraRole.length + 1)}`;
  }
  return null;
}

/** "hr", "admin", "manager:Kraków": a role id, followed by the city for a branch role. */
function parseRole(text: string): { role: Role; city: string | null; def: RoleDef } | null {
  const m = text.trim().match(/^([^:]+?)(?::(.+))?$/);
  if (!m) return null;
  const def = getRoles().find((r) => r.id.toLowerCase() === m[1].trim().toLowerCase());
  if (!def) return null;
  if (def.scope === 'all') return { role: def.id, city: null, def };
  const city = m[2] ? CITIES.find((c) => c.toLowerCase() === m[2].trim().toLowerCase()) : undefined;
  return city ? { role: def.id, city, def } : null;
}

/** The session for a signed-in user, or null when their roles / groups give no access to this system. */
export function sessionFromClaims(cfg: EntraConfig, claims: Claims) {
  const values = [...(Array.isArray(claims.roles) ? claims.roles : []), ...(Array.isArray(claims.groups) ? claims.groups : [])].map(String);
  let best: { role: Role; city: string | null; def: RoleDef } | null = null;
  for (const v of values) {
    const mapped = Object.prototype.hasOwnProperty.call(cfg.roleMap, v) ? String(cfg.roleMap[v]) : defaultRole(v);
    const r = mapped ? parseRole(mapped) : null;
    if (r && (!best || roleRank(r.def) > roleRank(best.def))) best = r;
  }
  if (!best) return null;
  const email = claims.email || claims.preferred_username || claims.upn || '';
  return {
    id: `entra:${claims.oid || claims.sub || email}`,
    name: claims.name || email || 'Użytkownik',
    email,
    role: best.role,
    city: best.city,
  };
}
