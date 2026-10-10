import { timingSafeEqual } from 'node:crypto';
import { badRequest, json } from '@/lib/auth';
import { ingestApplication } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

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
  if (!keyMatches(req.headers.get('x-api-key'), expected)) return json({ error: 'Nieprawidłowy klucz API.' }, 401);

  const body = (await req.json().catch(() => null)) as {
    from?: string;
    subject?: string;
    receivedAt?: string;
    attachments?: { name?: string; contentBase64?: string }[];
  } | null;
  if (!body || typeof body.from !== 'string' || !body.from.trim()) return badRequest('Brak pola "from".');

  let buffer: Uint8Array | undefined;
  let fileName: string | undefined;
  for (const att of body.attachments || []) {
    if (!att?.contentBase64) continue;
    const bytes = new Uint8Array(Buffer.from(att.contentBase64, 'base64'));
    if (bytes.byteLength > MAX_BYTES) return badRequest('Załącznik jest większy niż 10 MB.');
    if (String.fromCharCode(...bytes.slice(0, 4)) === '%PDF') {
      buffer = bytes;
      fileName = att.name || 'CV.pdf';
      break;
    }
  }
  const result = await ingestApplication({
    buffer,
    fileName,
    from: body.from,
    subject: String(body.subject || ''),
    receivedAt: body.receivedAt,
    channel: 'E-mail',
    actor: 'webhook',
    autoAck: true,
  });
  return json({ ...result, attachmentAccepted: !!buffer }, 201);
}
