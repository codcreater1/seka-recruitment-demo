import { endSession, getSession, json } from '@/lib/auth';
import { audit } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  if (session) audit(session.name, 'logout', 'Wylogowano');
  await endSession();
  return json({ ok: true });
}
