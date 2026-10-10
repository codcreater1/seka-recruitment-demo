import { getDb } from '@/lib/db';
import { forbidden, getSession, json } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.canEdit) return forbidden('Dziennik zdarzeń jest dostępny tylko dla HR.');
  const entries = getDb().prepare('SELECT id, at, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT 100').all();
  return json({ entries });
}
