import { getDb, nowIso, POOL_RETENTION_MONTHS, RETENTION_MONTHS } from './db';
import { EMAIL_TEMPLATE_IDS, renderTemplate, type EmailTemplate, type TemplateOverride, type TemplateVars } from './domain';

/**
 * Settings the administrator can change in the application. Stored as key/value rows (JSON), so a new
 * setting needs no migration. The defaults come from the environment (RETENTION_MONTHS ...) or the code.
 */
export type Settings = {
  /** Send "we received your application" automatically on intake. */
  autoAck: boolean;
  /** Ask the candidate by e-mail for what is missing (no CV, unreadable CV, no city, no position). */
  autoMissing: boolean;
  retentionMonths: number;
  poolRetentionMonths: number;
  /** The administrator's own wording; a template that is not listed uses the default text. */
  templates: Partial<Record<EmailTemplate, TemplateOverride>>;
  /** Notifications to HR and branch managers (e-mail and/or a Teams webhook). Off until the administrator switches it on. */
  notify: NotifySettings;
};

export type NotifySettings = {
  enabled: boolean;
  onNew: boolean;
  onInterview: boolean;
  /** Receive every city. */
  hrEmails: string[];
  /** One address per city for its branch manager. */
  managerEmails: Record<string, string>;
  teamsWebhook: string;
};

const NOTIFY_DEFAULTS = (): NotifySettings => ({ enabled: false, onNew: true, onInterview: true, hrEmails: [], managerEmails: {}, teamsWebhook: '' });

const DEFAULTS = (): Settings => ({
  autoAck: true,
  autoMissing: true,
  retentionMonths: RETENTION_MONTHS,
  poolRetentionMonths: POOL_RETENTION_MONTHS,
  templates: {},
  notify: NOTIFY_DEFAULTS(),
});

let cache: Settings | null = null;

function load(): Settings {
  const out = DEFAULTS();
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      if (r.key === 'autoAck' && typeof v === 'boolean') out.autoAck = v;
      else if (r.key === 'autoMissing' && typeof v === 'boolean') out.autoMissing = v;
      else if (r.key === 'retentionMonths' && Number.isInteger(v) && v >= 1 && v <= 240) out.retentionMonths = v;
      else if (r.key === 'poolRetentionMonths' && Number.isInteger(v) && v >= 1 && v <= 240) out.poolRetentionMonths = v;
      else if (r.key === 'notify' && v && typeof v === 'object') {
        out.notify = { ...NOTIFY_DEFAULTS(), ...v };
      } else if (r.key.startsWith('template.')) {
        const id = r.key.slice('template.'.length) as EmailTemplate;
        if (EMAIL_TEMPLATE_IDS.includes(id) && v && typeof v === 'object') {
          out.templates[id] = {
            subject: typeof v.subject === 'string' ? v.subject : undefined,
            body: typeof v.body === 'string' ? v.body : undefined,
          };
        }
      }
    } catch {
      /* a damaged row is ignored: the default applies */
    }
  }
  return out;
}

export function getSettings(): Settings {
  if (!cache) cache = load();
  return cache;
}

function put(key: string, value: unknown, actor: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(key, JSON.stringify(value), nowIso(), actor);
}

export type SettingsPatch = Partial<Pick<Settings, 'autoAck' | 'autoMissing' | 'retentionMonths' | 'poolRetentionMonths'>> & {
  /** null restores the default text of that message. */
  templates?: Partial<Record<EmailTemplate, TemplateOverride | null>>;
  notify?: NotifySettings;
};

/** Writes validated changes; returns what changed, as short phrases for the audit log. */
export function updateSettings(patch: SettingsPatch, actor: string): string[] {
  const changed: string[] = [];
  const now = getSettings();
  for (const key of ['autoAck', 'autoMissing'] as const) {
    if (patch[key] !== undefined && patch[key] !== now[key]) {
      put(key, patch[key], actor);
      changed.push(`${key}=${patch[key]}`);
    }
  }
  for (const key of ['retentionMonths', 'poolRetentionMonths'] as const) {
    if (patch[key] !== undefined && patch[key] !== now[key]) {
      put(key, patch[key], actor);
      changed.push(`${key}=${patch[key]}`);
    }
  }
  if (patch.notify && JSON.stringify(patch.notify) !== JSON.stringify(now.notify)) {
    put('notify', patch.notify, actor);
    changed.push(`powiadomienia: ${patch.notify.enabled ? 'włączone' : 'wyłączone'}`);
  }
  for (const id of EMAIL_TEMPLATE_IDS) {
    const t = patch.templates?.[id];
    if (t === undefined) continue;
    if (t === null) {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(`template.${id}`);
      changed.push(`szablon ${id}: tekst domyślny`);
    } else {
      put(`template.${id}`, { subject: t.subject ?? '', body: t.body ?? '' }, actor);
      changed.push(`szablon ${id}: zmieniono`);
    }
  }
  cache = null;
  return changed;
}

/** A message with the administrator's wording (if any) filled in. */
export function writeTemplate(id: EmailTemplate, vars: TemplateVars) {
  return renderTemplate(id, vars, getSettings().templates[id]);
}
