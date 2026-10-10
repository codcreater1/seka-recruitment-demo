import { badRequest, forbidden, getSession, json } from '@/lib/auth';
import { bulkAction } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.canEdit) return forbidden('Operacje zbiorcze są dostępne tylko dla HR.');
  const body = (await req.json().catch(() => null)) as { action?: string; ids?: unknown } | null;
  if (body?.action === 'reject-and-thank') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
    if (!ids.length) return badRequest('Zaznacz co najmniej jedno zgłoszenie.');
    return json(await bulkAction(session, 'reject-and-thank', ids));
  }
  if (body?.action === 'thank-rejected') {
    return json(await bulkAction(session, 'thank-rejected', []));
  }
  if (body?.action === 'delete-expired') {
    return json(await bulkAction(session, 'delete-expired', []));
  }
  return badRequest('Nieznana operacja.');
}
