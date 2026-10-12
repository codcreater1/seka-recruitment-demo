import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness probe for the container health check. Says only whether the database answers, nothing about its content. */
export async function GET() {
  try {
    getDb().prepare('SELECT 1').get();
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
