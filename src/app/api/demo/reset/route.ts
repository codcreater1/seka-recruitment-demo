import { audit, resetDemoData } from '@/lib/db';
import { json, requireSystem } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Demo only: wipe all data and load the sample candidates again. Disabled when SEED_DEMO_DATA=false. */
export async function POST() {
  const session = await requireSystem('Przywracanie danych demonstracyjnych jest dostępne tylko dla administratora systemu.');
  if (session instanceof Response) return session;
  if (process.env.SEED_DEMO_DATA === 'false') return json({ error: 'Przywracanie danych demonstracyjnych jest wyłączone.' }, 403);
  resetDemoData();
  audit(session.name, 'demo-reset', 'Przywrócono dane demonstracyjne');
  return json({ ok: true });
}
