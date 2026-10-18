import { badRequest, json, notFound, requireEditor } from '@/lib/auth';
import { computeMissing, getCandidate, getRow, requestMissingInfo, sendTemplateEmail } from '@/lib/candidates';
import { EMAIL_TEMPLATE_IDS, type EmailTemplate } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends one of the standard messages to the candidate (recorded only, unless SMTP is configured). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireEditor('Wysyłanie wiadomości jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  const row = getRow(session, id);
  if (!row) return notFound('Nie znaleziono zgłoszenia.');
  const body = (await req.json().catch(() => null)) as { template?: string } | null;
  const template = body?.template as EmailTemplate | undefined;
  if (!template || !EMAIL_TEMPLATE_IDS.includes(template)) return badRequest('Nieznany szablon wiadomości.');
  if (template === 'invite' && !row.interview_at) return badRequest('Najpierw ustal termin rozmowy.');
  if (template === 'rejection' && row.status !== 'rejected') return badRequest('Podziękowanie można wysłać tylko dla odrzuconego zgłoszenia.');
  if (template === 'missing') {
    if (!computeMissing(row).length) return badRequest('Nie brakuje żadnych danych.');
    if (!row.email) return badRequest('Brak adresu e-mail kandydata.');
    const res = await requestMissingInfo(row, session.name);
    return json({ candidate: await getCandidate(session, id), delivery: res?.status ?? 'simulated' }, 201);
  }
  const result = await sendTemplateEmail(row, template, session.name);
  return json({ candidate: await getCandidate(session, id), delivery: result.status }, 201);
}
