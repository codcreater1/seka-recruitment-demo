import { authMode, demoAccounts, badRequest, forbidden, json, makeSession, startSession } from '@/lib/auth';
import { audit } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Demo sign-in: pick one of the demo accounts. Disabled when AUTH_MODE=entra, where the sign-in goes through
 * Microsoft (see /api/auth/entra/login).
 */
export async function POST(req: Request) {
  if (authMode() !== 'demo') return forbidden('Logowanie demonstracyjne jest wyłączone. Użyj konta Microsoft.');
  const body = (await req.json().catch(() => null)) as { account?: string } | null;
  const account = demoAccounts().find((a) => a.id === body?.account);
  const session = account ? makeSession(account) : null;
  if (!account || !session) return badRequest('Nieznane konto.');
  await startSession(req, account);
  audit(account.name, 'login', 'Zalogowano (tryb demonstracyjny)');
  return json({ session });
}
