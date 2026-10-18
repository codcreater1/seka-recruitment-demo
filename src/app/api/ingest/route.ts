import { timingSafeEqual } from 'node:crypto';
import { badRequest, json } from '@/lib/auth';
import { MAX_ATTACHMENTS, ingestApplication, sniffMime } from '@/lib/candidates';
import { blockedFor, clientKey, recordFailure } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;
/** Base64 grows the file by a third, plus the rest of the JSON. */
const MAX_BODY_BYTES = Math.ceil(MAX_BYTES * 1.4) + 64 * 1024;

function keyMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * E-mail intake for Power Automate (HTTP action) or any other mail connector.
 * Header: x-api-key: <INGEST_API_KEY>
 * Body:   { from, subject, receivedAt?, attachments: [{ name, contentBase64 }] }
 */
export async function POST(req: Request) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) return json({ error: 'Przyjmowanie wiadomości jest wyłączone (brak INGEST_API_KEY).' }, 503);

  const who = clientKey(req.headers);
  const wait = blockedFor('ingest', who);
  if (wait > 0) {
    const res = json({ error: 'Zbyt wiele nieudanych prób. Spróbuj ponownie za chwilę.' }, 429);
    res.headers.set('Retry-After', String(wait));
    return res;
  }
  if (!keyMatches(req.headers.get('x-api-key'), expected)) {
    recordFailure('ingest', who);
    return json({ error: 'Nieprawidłowy klucz API.' }, 401);
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ error: 'Żądanie jest zbyt duże.' }, 413);

  const body = (await req.json().catch(() => null)) as {
    from?: string;
    subject?: string;
    receivedAt?: string;
    attachments?: { name?: string; contentBase64?: string }[];
  } | null;
  if (!body || typeof body.from !== 'string' || !body.from.trim()) return badRequest('Brak pola "from".');

  let buffer: Uint8Array | undefined;
  let fileName: string | undefined;
  const extras: { name: string; bytes: Uint8Array }[] = [];
  for (const att of Array.isArray(body.attachments) ? body.attachments : []) {
    if (!att || typeof att.contentBase64 !== 'string' || !att.contentBase64) continue;
    const bytes = new Uint8Array(Buffer.from(att.contentBase64, 'base64'));
    if (bytes.byteLength > MAX_BYTES) return badRequest('Załącznik jest większy niż 10 MB.');
    const name = typeof att.name === 'string' && att.name ? att.name : '';
    if (!buffer && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF') {
      // the first PDF is the CV, every other readable file is kept as an attachment
      buffer = bytes;
      fileName = name || 'CV.pdf';
    } else if (sniffMime(bytes) && extras.length < MAX_ATTACHMENTS) {
      extras.push({ name: name || 'załącznik', bytes });
    }
  }
  const result = await ingestApplication({
    buffer,
    fileName,
    extras,
    from: body.from,
    subject: typeof body.subject === 'string' ? body.subject : '',
    receivedAt: typeof body.receivedAt === 'string' ? body.receivedAt : undefined,
    channel: 'E-mail',
    actor: 'webhook',
    autoAck: true,
  });
  return json({ ...result, attachmentAccepted: !!buffer }, 201);
}
