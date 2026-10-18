import { json, requireSession } from '@/lib/auth';
import { getStats } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  return json({ stats: getStats(session) });
}
