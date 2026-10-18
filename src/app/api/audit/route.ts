import { getDb } from '@/lib/db';
import { json, requireEditor } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireEditor('Dziennik zdarzeń jest dostępny tylko dla HR.');
  if (session instanceof Response) return session;
  const entries = getDb().prepare('SELECT id, at, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT 100').all();
  return json({ entries });
}
