import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const n = (getDb().prepare('SELECT COUNT(*) AS n FROM candidates').get() as { n: number }).n;
    return Response.json({ ok: true, candidates: n });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
