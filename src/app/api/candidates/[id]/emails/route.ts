import { badRequest, forbidden, getSession, json, notFound } from '@/lib/auth';
import { getCandidate, getRow, sendTemplateEmail } from '@/lib/candidates';
import { EMAIL_TEMPLATES, type EmailTemplate } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends one of the standard messages to the candidate (recorded only, unless SMTP is configured). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.canEdit) return forbidden('Wysyłanie wiadomości jest dostępne tylko dla HR.');
  const row = getRow(session, id);
  if (!row) return notFound('Nie znaleziono zgłoszenia.');
  const body = (await req.json().catch(() => null)) as { template?: string } | null;
  const template = body?.template as EmailTemplate | undefined;
  if (!template || !(template in EMAIL_TEMPLATES)) return badRequest('Nieznany szablon wiadomości.');
  if (template === 'invite' && !row.interview_at) return badRequest('Najpierw ustal termin rozmowy.');
  if (template === 'rejection' && row.status !== 'rejected') return badRequest('Podziękowanie można wysłać tylko dla odrzuconego zgłoszenia.');
  const result = await sendTemplateEmail(row, template, session.name);
  return json({ candidate: await getCandidate(session, id), delivery: result.status }, 201);
}
