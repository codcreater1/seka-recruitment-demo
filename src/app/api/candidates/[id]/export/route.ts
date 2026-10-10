import { audit } from '@/lib/db';
import { forbidden, getSession, notFound } from '@/lib/auth';
import { getCandidate } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GDPR: data subject access, all stored data about one candidate as JSON. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.canEdit) return forbidden('Eksport danych jest dostępny tylko dla HR.');
  const candidate = await getCandidate(session, id);
  if (!candidate) return notFound('Nie znaleziono zgłoszenia.');
  audit(session.name, 'export', `Wyeksportowano dane: ${candidate.name}`);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), candidate }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="kandydat-${id.slice(0, 8)}.json"`,
      'cache-control': 'no-store',
    },
  });
}
