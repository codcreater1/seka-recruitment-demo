import { badRequest, json, notFound, requireEditor } from '@/lib/auth';
import { computeMissing, getCandidate, getRow, requestMissingInfo, sendCustomEmail, sendTemplateEmail } from '@/lib/candidates';
import { EMAIL_TEMPLATE_IDS, statusKind, type EmailTemplate } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends one of the standard messages to the candidate (recorded only, unless SMTP is configured). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireEditor('Wysyłanie wiadomości jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  const row = getRow(session, id);
  if (!row) return notFound('Nie znaleziono zgłoszenia.');
  const body = (await req.json().catch(() => null)) as { template?: string; subject?: unknown; body?: unknown } | null;
  if (body?.template === 'custom') {
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!row.email) return badRequest('Brak adresu e-mail kandydata.');
    if (!subject || subject.length > 200) return badRequest('Temat musi mieć od 1 do 200 znaków.');
    if (!text || text.length > 10000) return badRequest('Treść musi mieć od 1 do 10000 znaków.');
    const res = await sendCustomEmail(row, subject, text, session.name);
    return json({ candidate: await getCandidate(session, id), delivery: res.status }, 201);
  }
  const template = body?.template as EmailTemplate | undefined;
  if (!template || !EMAIL_TEMPLATE_IDS.includes(template)) return badRequest('Nieznany szablon wiadomości.');
  if (template === 'invite' && !row.interview_at) return badRequest('Najpierw ustal termin rozmowy.');
  if (template === 'rejection' && statusKind(row.status) !== 'rejected') return badRequest('Podziękowanie można wysłać tylko dla odrzuconego zgłoszenia.');
  if (template === 'missing') {
    if (!computeMissing(row).length) return badRequest('Nie brakuje żadnych danych.');
    if (!row.email) return badRequest('Brak adresu e-mail kandydata.');
    const res = await requestMissingInfo(row, session.name);
    return json({ candidate: await getCandidate(session, id), delivery: res?.status ?? 'simulated' }, 201);
  }
  const result = await sendTemplateEmail(row, template, session.name);
  return json({ candidate: await getCandidate(session, id), delivery: result.status }, 201);
}
