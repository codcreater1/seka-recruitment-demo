import { getSession, json } from '@/lib/auth';
import { searchCandidates } from '@/lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Search in the text of the CVs. Results are limited to what the current role may see. */
export async function GET(req: Request) {
  const session = await getSession();
  const params = new URL(req.url).searchParams;
  const q = params.get('q') || '';
  const anon = params.get('anon') === '1';
  return json({ results: q.length >= 2 ? searchCandidates(session, q.slice(0, 80), anon) : [] });
}
