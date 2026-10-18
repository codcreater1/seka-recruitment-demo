import { DEMO_ACCOUNTS, authMode, badRequest, json, requireAdmin } from '@/lib/auth';
import { audit, POOL_RETENTION_MONTHS, RETENTION_MONTHS } from '@/lib/db';
import { CITIES, DEFAULT_TEMPLATES, EMAIL_TEMPLATE_IDS, POSITIONS, ROLE_LABEL, STATUSES, type EmailTemplate } from '@/lib/domain';
import { smtpConfigured } from '@/lib/mailer';
import { getSettings, updateSettings, type SettingsPatch } from '@/lib/settings';
import { APP_TIMEZONE } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who may do what. Shown to the administrator; the real checks are in the API routes. */
const PERMISSIONS = [
  { what: 'Podgląd zgłoszeń i dokumentów CV', admin: true, hr: true, manager: 'Tak (swoje miasto)' },
  { what: 'Komentarze i opinie po rozmowie', admin: true, hr: true, manager: 'Tak' },
  { what: 'Zmiana statusów, danych, ocen i terminów rozmów', admin: true, hr: true, manager: '—' },
  { what: 'Dodawanie zgłoszeń i dołączanie CV', admin: true, hr: true, manager: '—' },
  { what: 'Wysyłanie wiadomości do kandydatów', admin: true, hr: true, manager: '—' },
  { what: 'Ogłoszenia: dodawanie i zamykanie', admin: true, hr: true, manager: 'Tylko podgląd' },
  { what: 'Eksport (CSV, JSON) i dziennik zdarzeń', admin: true, hr: true, manager: '—' },
  { what: 'Usuwanie profili i operacje zbiorcze (RODO)', admin: true, hr: true, manager: '—' },
  { what: 'Ustawienia systemu: wiadomości, okresy przechowywania, role', admin: true, hr: false, manager: '—' },
  { what: 'Przywracanie danych demonstracyjnych', admin: true, hr: false, manager: '—' },
];

/** Placeholders a message cannot work without. */
const REQUIRED: Partial<Record<EmailTemplate, string>> = { missing: '{{missingList}}', invite: '{{when}}' };

export async function GET() {
  const session = await requireAdmin('Ustawienia są dostępne tylko dla administratora.');
  if (session instanceof Response) return session;
  const settings = getSettings();
  return json({
    settings: {
      autoAck: settings.autoAck,
      autoMissing: settings.autoMissing,
      retentionMonths: settings.retentionMonths,
      poolRetentionMonths: settings.poolRetentionMonths,
    },
    templates: EMAIL_TEMPLATE_IDS.map((id) => {
      const base = DEFAULT_TEMPLATES[id];
      const own = settings.templates[id];
      return {
        id,
        label: base.label,
        placeholders: base.placeholders,
        defaultSubject: base.subject,
        defaultBody: base.body,
        subject: own?.subject?.trim() || base.subject,
        body: own?.body?.trim() || base.body,
        customized: !!own,
      };
    }),
    directory: DEMO_ACCOUNTS.map((a) => ({
      id: a.id, name: a.name, email: a.email, role: a.role, roleLabel: ROLE_LABEL[a.role], city: a.city, entraRole: a.entraRole,
    })),
    roles: [
      { label: ROLE_LABEL.admin, scope: 'Wszystkie miasta' },
      { label: ROLE_LABEL.hr, scope: 'Wszystkie miasta' },
      { label: ROLE_LABEL.manager, scope: 'Tylko własne miasto' },
    ],
    permissions: PERMISSIONS,
    integrations: {
      authMode: authMode(),
      ingestEnabled: !!process.env.INGEST_API_KEY,
      smtpConfigured: smtpConfigured(),
      timezone: APP_TIMEZONE,
      retentionDefaults: { months: RETENTION_MONTHS, poolMonths: POOL_RETENTION_MONTHS },
    },
    dictionaries: { cities: [...CITIES], positions: [...POSITIONS], statuses: STATUSES.map((s) => s.label) },
  });
}

/** Changes settings. Every field is optional; a message set to null gets its default text back. */
export async function PUT(req: Request) {
  const session = await requireAdmin('Ustawienia może zmieniać tylko administrator.');
  if (session instanceof Response) return session;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('Nieprawidłowe dane.');

  const patch: SettingsPatch = {};
  for (const key of ['autoAck', 'autoMissing'] as const) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') return badRequest('Przełącznik musi mieć wartość tak lub nie.');
      patch[key] = body[key] as boolean;
    }
  }
  for (const key of ['retentionMonths', 'poolRetentionMonths'] as const) {
    if (key in body) {
      const v = body[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 240) {
        return badRequest('Okres przechowywania to liczba całkowita miesięcy od 1 do 240.');
      }
      patch[key] = v;
    }
  }
  if ('templates' in body) {
    const t = body.templates;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return badRequest('Nieprawidłowe szablony.');
    patch.templates = {};
    for (const [id, value] of Object.entries(t as Record<string, unknown>)) {
      if (!EMAIL_TEMPLATE_IDS.includes(id as EmailTemplate)) return badRequest('Nieznany szablon wiadomości.');
      if (value === null) {
        patch.templates[id as EmailTemplate] = null;
        continue;
      }
      const v = value as { subject?: unknown; body?: unknown };
      const subject = typeof v?.subject === 'string' ? v.subject.trim() : '';
      const text = typeof v?.body === 'string' ? v.body.trim() : '';
      if (!subject || subject.length > 200) return badRequest('Temat wiadomości musi mieć od 1 do 200 znaków.');
      if (!text || text.length > 5000) return badRequest('Treść wiadomości musi mieć od 1 do 5000 znaków.');
      const need = REQUIRED[id as EmailTemplate];
      if (need && !text.includes(need)) return badRequest(`Treść tej wiadomości musi zawierać znacznik ${need}.`);
      patch.templates[id as EmailTemplate] = { subject, body: text };
    }
  }
  const changed = updateSettings(patch, session.name);
  if (changed.length) audit(session.name, 'settings-update', changed.join('; '));
  return json({ ok: true, changed });
}
