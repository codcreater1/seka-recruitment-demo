import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { blockedFor, clientKey, recordFailure } from '@/lib/rate-limit';

/**
 * Optional password gate for a publicly reachable demo (HTTP Basic auth, any user name).
 * Enabled by setting DEMO_PASSWORD. Not a replacement for real sign-in (Microsoft Entra ID).
 * Left open: /api/ingest (has its own API key) and /api/health (container health check).
 */
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/ingest|api/health|_next/static|_next/image|favicon.ico).*)'],
};

function samePassword(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function middleware(req: NextRequest) {
  const expected = process.env.DEMO_PASSWORD;
  if (!expected) return NextResponse.next();

  const who = clientKey(req.headers);
  const wait = blockedFor('gate', who);
  if (wait > 0) {
    return new NextResponse('Zbyt wiele nieudanych prób. Spróbuj ponownie za chwilę.', {
      status: 429,
      headers: { 'Retry-After': String(wait) },
    });
  }

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (samePassword(password, expected)) return NextResponse.next();
    // only a wrong password counts: the first request of a browser has no credentials at all
    recordFailure('gate', who);
  }
  return new NextResponse('Wymagane hasło dostępu do wersji demonstracyjnej.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Panel rekrutacji (demo)", charset="UTF-8"' },
  });
}
