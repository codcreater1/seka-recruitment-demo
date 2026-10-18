import { badRequest, json, requireEditor, requireSession } from '@/lib/auth';
import { ingestApplication, ingestEml, listCandidates } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  return json({ candidates: listCandidates(session) });
}

/**
 * Manual upload: a CV as PDF or a saved e-mail (.eml) with the CV attached.
 * The profile is created the same way as for an incoming e-mail.
 */
export async function POST(req: Request) {
  const session = await requireEditor('Dodawanie zgłoszeń jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  // refuse an oversized body before it is read into memory
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES + 256 * 1024) return json({ error: 'Plik jest większy niż 10 MB.' }, 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return badRequest('Dołącz plik PDF lub wiadomość .eml.');
  if (file.size === 0) return badRequest('Plik jest pusty.');
  if (file.size > MAX_BYTES) return badRequest('Plik jest większy niż 10 MB.');
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (/\.eml$/i.test(file.name) || file.type === 'message/rfc822') {
    try {
      return json(await ingestEml(buffer, session.name), 201);
    } catch {
      return badRequest('Nie udało się odczytać wiadomości. Sprawdź, czy to poprawny plik .eml.');
    }
  }
  if (String.fromCharCode(...buffer.slice(0, 4)) !== '%PDF') return badRequest('Wybierz plik PDF albo wiadomość w formacie .eml.');
  const result = await ingestApplication({
    buffer,
    fileName: file.name,
    from: String(form?.get('from') || ''),
    subject: String(form?.get('subject') || ''),
    channel: 'Wgrano ręcznie',
    actor: session.name,
  });
  return json(result, 201);
}
