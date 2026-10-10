import { badRequest, forbidden, getSession, json } from '@/lib/auth';
import { ingestApplication, ingestEml, listCandidates } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  const session = await getSession();
  return json({ candidates: listCandidates(session) });
}

/**
 * Manual upload: a CV as PDF or a saved e-mail (.eml) with the CV attached.
 * The profile is created the same way as for an incoming e-mail.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.canEdit) return forbidden('Dodawanie zgłoszeń jest dostępne tylko dla HR.');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return badRequest('Dołącz plik PDF lub wiadomość .eml.');
  if (file.size > MAX_BYTES) return badRequest('Plik jest większy niż 10 MB.');
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (/\.eml$/i.test(file.name) || file.type === 'message/rfc822') {
    const result = await ingestEml(buffer, session.name);
    return json(result, 201);
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
