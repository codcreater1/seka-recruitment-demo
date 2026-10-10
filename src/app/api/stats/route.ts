import { getSession, json } from '@/lib/auth';
import { getStats } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ stats: getStats(await getSession()) });
}
