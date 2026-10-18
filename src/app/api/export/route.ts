import { audit } from '@/lib/db';
import { requireEditor } from '@/lib/auth';
import { exportCsv } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CSV of the candidate list (HR only: it contains personal data). */
export async function GET() {
  const session = await requireEditor('Eksport listy jest dostępny tylko dla HR.');
  if (session instanceof Response) return session;
  audit(session.name, 'export-list', 'Wyeksportowano listę zgłoszeń (CSV)');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(exportCsv(session), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="zgloszenia-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
