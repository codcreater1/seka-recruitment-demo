import { badRequest, forbidden, getSession, json } from '@/lib/auth';
import { ingestApplication, listCandidates } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  const session = await getSession();
  return json({ candidates: listCandidates(session) });
}

/** Manual upload of a CV (PDF). The profile is created the same way as for an incoming e-mail. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.canEdit) return forbidden('Dodawanie zgłoszeń jest dostępne tylko dla HR.');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return badRequest('Dołącz plik PDF.');
  if (file.size > MAX_BYTES) return badRequest('Plik jest większy niż 10 MB.');
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...buffer.slice(0, 4)) !== '%PDF') return badRequest('Wybierz plik w formacie PDF.');
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
