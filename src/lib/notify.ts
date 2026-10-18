import { audit } from './db';
import { CITIES } from './domain';
import { deliver, smtpConfigured } from './mailer';
import { getSettings } from './settings';

export type NotifyEvent = 'new' | 'interview';

/** What a notification says about a candidate: enough to recognise the profile, never the contents of the CV. */
export type NotifyCandidate = { id: string; name: string; position: string; city: string; interview_at?: string | null };

/** Teams "Workflows" and the older connectors live on these Microsoft hosts; anything else is refused (no arbitrary outgoing calls). */
const TEAMS_HOSTS = ['webhook.office.com', 'logic.azure.com', 'powerplatform.com'];

export function isTeamsWebhook(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && TEAMS_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export const isEmail = (v: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v);

const link = (id: string) => {
  const base = process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, '') : '';
  return base ? `${base}/#/lista/${id}` : '';
};

function compose(event: NotifyEvent, c: NotifyCandidate) {
  const url = link(c.id);
  const when = c.interview_at ? c.interview_at.replace('T', ' ') : '';
  const subject = event === 'new' ? `Nowe zgłoszenie: ${c.name} (${c.city})` : `Rozmowa kwalifikacyjna: ${c.name}, ${when}`;
  const lines =
    event === 'new'
      ? [`Wpłynęło nowe zgłoszenie.`, `Kandydat: ${c.name}`, `Stanowisko: ${c.position}`, `Oddział: ${c.city}`]
      : [`Ustalono termin rozmowy.`, `Kandydat: ${c.name}`, `Stanowisko: ${c.position}`, `Oddział: ${c.city}`, `Termin: ${when}`];
  if (url) lines.push(`Profil: ${url}`);
  return { subject, text: lines.join('\n') + '\n\nWiadomość automatyczna z panelu rekrutacji.', lines };
}

async function postToTeams(webhook: string, title: string, lines: string[]) {
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
            ...lines.slice(1).map((t) => ({ type: 'TextBlock', text: t, wrap: true, spacing: 'None' })),
          ],
        },
      },
    ],
  };
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(card),
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Teams odpowiedział kodem ${res.status}`);
}

/**
 * Tells HR (all cities) and the branch manager of the candidate's city, by e-mail and/or in Teams. Never throws and is
 * not awaited by the caller: a notification problem must not break an application. The outcome goes to the audit log.
 */
export async function notifyEvent(event: NotifyEvent, c: NotifyCandidate): Promise<void> {
  try {
    const n = getSettings().notify;
    if (!n.enabled || (event === 'new' && !n.onNew) || (event === 'interview' && !n.onInterview)) return;
    const { subject, text, lines } = compose(event, c);
    const to = [...new Set([...n.hrEmails, ...(n.managerEmails[c.city] ? [n.managerEmails[c.city]] : [])])];
    const results: string[] = [];
    for (const addr of to) {
      const r = await deliver({ to: addr, subject, text });
      results.push(r.status === 'failed' ? `${addr}: błąd (${r.error})` : `${addr}: ${r.status === 'sent' ? 'wysłano' : 'symulacja'}`);
    }
    if (n.teamsWebhook && isTeamsWebhook(n.teamsWebhook)) {
      try {
        await postToTeams(n.teamsWebhook, subject, lines);
        results.push('Teams: wysłano');
      } catch (e) {
        results.push(`Teams: błąd (${(e as Error).message.slice(0, 120)})`);
      }
    }
    if (results.length) audit('system', 'notify', `${event === 'new' ? 'nowe zgłoszenie' : 'rozmowa'} ${c.name} (${c.city}): ${results.join('; ')}${smtpConfigured() ? '' : ' [SMTP wyłączony]'}`);
  } catch {
    /* never let a notification break the request */
  }
}

export const NOTIFY_CITIES = [...CITIES];
