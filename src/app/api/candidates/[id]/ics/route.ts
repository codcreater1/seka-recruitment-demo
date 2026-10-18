import { notFound, requireSession } from '@/lib/auth';
import { getRow, interviewIcs } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Calendar file for the planned interview, to open in Outlook or any calendar. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const row = getRow(session, id);
  const ics = row ? interviewIcs(row) : null;
  if (!row || !ics) return notFound('Brak ustalonego terminu rozmowy.');
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="rozmowa.ics"',
      'cache-control': 'private, no-store',
    },
  });
}
