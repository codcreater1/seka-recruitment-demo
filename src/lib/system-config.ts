import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { audit, getDb, nowIso } from './db';
import { deriveKey } from './session';

/**
 * Technical settings only the system administrator may change: the company mailbox, the mail server, the Azure / Entra ID
 * app registration and the AI key. Stored in the database; secrets are encrypted with a key derived from the session
 * secret and are never sent back to the browser. A value set here wins over the environment variable of the same purpose.
 */
export type SystemConfig = {
  mailbox: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  entraTenant: string;
  entraClient: string;
  entraSecret: string;
  appUrl: string;
  aiProvider: string;
  aiKey: string;
};

export const SECRET_FIELDS = ['smtpPass', 'entraSecret', 'aiKey'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];
const TEXT_FIELDS = ['mailbox', 'smtpHost', 'smtpUser', 'entraTenant', 'entraClient', 'appUrl', 'aiProvider'] as const;

/** Address every message to and from candidates uses, whoever in the company triggers it. */
export const DEFAULT_MAILBOX = 'kariera@seka.pl';

const KEY_NAME = 'system';
let cache: Partial<SystemConfig> | null = null;

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', deriveKey('system-config'), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

function decrypt(value: string): string {
  if (!value.startsWith('enc:')) return '';
  try {
    const buf = Buffer.from(value.slice(4), 'base64');
    const d = createDecipheriv('aes-256-gcm', deriveKey('system-config'), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return ''; // a changed session secret makes stored secrets unreadable: they have to be entered again
  }
}

function stored(): Record<string, unknown> {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(KEY_NAME) as { value: string } | undefined;
  try {
    const v = row ? JSON.parse(row.value) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** What is set in the database (secrets decrypted), without the environment fallbacks. */
function fromDb(): Partial<SystemConfig> {
  if (cache) return cache;
  const raw = stored();
  const out: Partial<SystemConfig> = {};
  for (const f of TEXT_FIELDS) if (typeof raw[f] === 'string' && raw[f]) out[f] = raw[f] as string;
  for (const f of SECRET_FIELDS) if (typeof raw[f] === 'string' && raw[f]) out[f] = decrypt(raw[f] as string) || undefined;
  if (typeof raw.smtpPort === 'number') out.smtpPort = raw.smtpPort;
  if (typeof raw.smtpSecure === 'boolean') out.smtpSecure = raw.smtpSecure;
  cache = out;
  return out;
}

const env = process.env;

/** The effective configuration: the database first, then the environment, then the defaults. */
export function getSystemConfig(): SystemConfig {
  const d = fromDb();
  return {
    mailbox: d.mailbox || env.SMTP_FROM || DEFAULT_MAILBOX,
    smtpHost: d.smtpHost || env.SMTP_HOST || '',
    smtpPort: d.smtpPort ?? (Number(env.SMTP_PORT) || 587),
    smtpSecure: d.smtpSecure ?? env.SMTP_SECURE === 'true',
    smtpUser: d.smtpUser || env.SMTP_USER || '',
    smtpPass: d.smtpPass || env.SMTP_PASS || '',
    entraTenant: d.entraTenant || env.ENTRA_TENANT_ID || '',
    entraClient: d.entraClient || env.ENTRA_CLIENT_ID || '',
    entraSecret: d.entraSecret || env.ENTRA_CLIENT_SECRET || '',
    appUrl: d.appUrl || env.APP_URL || '',
    aiProvider: d.aiProvider || '',
    aiKey: d.aiKey || '',
  };
}

/** The form's view: plain values as they are, secrets only as "set" with their last characters. */
export function getSystemPublic() {
  const c = getSystemConfig();
  const d = fromDb();
  const secret = (f: SecretField) => ({ set: !!c[f], fromEnvironment: !d[f] && !!c[f], hint: c[f] ? '••••' + c[f].slice(-3) : '' });
  return {
    values: {
      mailbox: c.mailbox, smtpHost: c.smtpHost, smtpPort: c.smtpPort, smtpSecure: c.smtpSecure, smtpUser: c.smtpUser,
      entraTenant: c.entraTenant, entraClient: c.entraClient, appUrl: c.appUrl, aiProvider: c.aiProvider,
    },
    secrets: { smtpPass: secret('smtpPass'), entraSecret: secret('entraSecret'), aiKey: secret('aiKey') },
  };
}

export type SystemPatch = Partial<Omit<SystemConfig, SecretField>> & Partial<Record<SecretField, string>> & { clear?: SecretField[] };

const MAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Validates and stores the changes. A secret left empty is kept; one named in `clear` is removed. */
export function saveSystemConfig(patch: SystemPatch, actor: string): { ok: true; changed: string[] } | { error: string } {
  const raw = stored();
  const changed: string[] = [];
  for (const f of TEXT_FIELDS) {
    if (!(f in patch)) continue;
    const v = String(patch[f] ?? '').trim();
    if (v.length > 300) return { error: 'Wartość jest zbyt długa.' };
    if (f === 'mailbox' && v && !MAIL.test(v)) return { error: 'Adres skrzynki firmowej jest nieprawidłowy.' };
    if (f === 'appUrl' && v && !/^https?:\/\/[^\s/]+/.test(v)) return { error: 'Adres aplikacji musi zaczynać się od https://.' };
    if (v) raw[f] = v;
    else delete raw[f];
    changed.push(f);
  }
  if ('smtpPort' in patch) {
    const p = Number(patch.smtpPort);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return { error: 'Port musi być liczbą od 1 do 65535.' };
    raw.smtpPort = p;
    changed.push('smtpPort');
  }
  if ('smtpSecure' in patch) {
    raw.smtpSecure = !!patch.smtpSecure;
    changed.push('smtpSecure');
  }
  for (const f of SECRET_FIELDS) {
    const v = typeof patch[f] === 'string' ? (patch[f] as string).trim() : '';
    if (v) {
      if (v.length > 500) return { error: 'Wartość jest zbyt długa.' };
      raw[f] = encrypt(v);
      changed.push(f);
    } else if (patch.clear?.includes(f)) {
      delete raw[f];
      changed.push(f);
    }
  }
  if (!changed.length) return { ok: true, changed };
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(KEY_NAME, JSON.stringify(raw), nowIso(), actor);
  cache = null;
  // the values themselves (and above all the secrets) never go to the log, only which fields changed
  audit(actor, 'system-config-update', changed.join(', '));
  return { ok: true, changed };
}
