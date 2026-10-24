import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Role, Session } from './domain';

/**
 * Signed session cookie (HMAC-SHA256). The same cookie is issued after the demo sign-in and after a real
 * Microsoft Entra ID sign-in, so the rest of the application never knows which one was used.
 */
export const SESSION_COOKIE = 'seka-session';
export const SESSION_MAX_AGE_S = 60 * 60 * 12;

let secret: Buffer | null = null;

/** SESSION_SECRET when set, otherwise a random secret kept next to the database (survives restarts). */
function getSecret(): Buffer {
  if (secret) return secret;
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    secret = Buffer.from(fromEnv);
    return secret;
  }
  const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const file = path.join(dir, '.session-secret');
  try {
    const stored = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    if (stored.length >= 16) {
      secret = stored;
      return secret;
    }
  } catch {
    /* not created yet */
  }
  fs.mkdirSync(dir, { recursive: true });
  const fresh = randomBytes(32);
  fs.writeFileSync(file, fresh.toString('hex'), { mode: 0o600 });
  secret = fresh;
  return secret;
}

/** A key for one purpose, derived from the session secret, so stored secrets are encrypted with something that is not kept in the database. */
export function deriveKey(purpose: string): Buffer {
  return createHmac('sha256', getSecret()).update('seka:' + purpose).digest();
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(data: string) {
  return createHmac('sha256', getSecret()).update(data).digest('base64url');
}

type Payload = { id: string; role: Role; city: string | null; name: string; email: string; exp: number };

export function sealSession(s: Pick<Session, 'id' | 'role' | 'city' | 'name' | 'email'>, now = Date.now()): string {
  const payload: Payload = { id: s.id, role: s.role, city: s.city, name: s.name, email: s.email, exp: Math.floor(now / 1000) + SESSION_MAX_AGE_S };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function openSession(value: string | undefined, now = Date.now()): Payload | null {
  if (!value) return null;
  const [body, mac, extra] = value.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (typeof p.exp !== 'number' || p.exp * 1000 < now) return null;
    if (typeof p.role !== 'string' || !p.role) return null;
    if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}

/** A short-lived signed value (used for the OpenID Connect state, nonce and PKCE verifier). */
export function sealValue(data: Record<string, string>, maxAgeS = 600, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...data, exp: Math.floor(now / 1000) + maxAgeS }));
  return `${body}.${sign(body)}`;
}

export function openValue(value: string | undefined, now = Date.now()): Record<string, string> | null {
  if (!value) return null;
  const [body, mac, extra] = value.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, string | number>;
    if (typeof p.exp !== 'number' || p.exp * 1000 < now) return null;
    return Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Whether the request came in over HTTPS (also behind a TLS-terminating proxy such as Coolify). */
export function isHttps(req: Request) {
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol).replace(':', '').split(',')[0].trim();
  return proto === 'https';
}
