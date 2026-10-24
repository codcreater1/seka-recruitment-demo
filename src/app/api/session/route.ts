import { authMode, roleOptions, json, requireSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { statusList } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who is signed in. The account list is only offered in the demo, where accounts are picked instead of signing in. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const mode = authMode();
  getDb(); // makes sure the status list is loaded
  return json({ session, authMode: mode, accounts: mode === 'demo' ? roleOptions() : [], statuses: statusList() });
}
