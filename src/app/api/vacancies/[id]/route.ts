import { badRequest, json, notFound, requireEditor } from '@/lib/auth';
import { setVacancyStatus } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireEditor('Zmiana ogłoszeń jest dostępna tylko dla HR.');
  if (session instanceof Response) return session;
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  if (body?.status !== 'open' && body?.status !== 'closed') return badRequest('Nieprawidłowy status ogłoszenia.');
  const vacancy = setVacancyStatus(session, id, body.status);
  return vacancy ? json({ vacancy }) : notFound('Nie znaleziono ogłoszenia.');
}
