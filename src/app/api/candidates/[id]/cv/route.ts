import { badRequest, json, notFound, requireEditor } from '@/lib/auth';
import { attachCv, getCandidate } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * HR attaches the CV that the candidate sent after the request for the missing data. The file is read like any
 * other CV; the city and position are filled in only where they are still unknown.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireEditor('Dołączanie CV jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES + 256 * 1024) return json({ error: 'Plik jest większy niż 10 MB.' }, 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return badRequest('Dołącz plik PDF.');
  if (file.size === 0) return badRequest('Plik jest pusty.');
  if (file.size > MAX_BYTES) return badRequest('Plik jest większy niż 10 MB.');
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...buffer.slice(0, 4)) !== '%PDF') return badRequest('Wybierz plik w formacie PDF.');
  const result = await attachCv(session, id, buffer, file.name);
  if ('error' in result) {
    return result.error === 'has-cv' ? json({ error: 'Profil ma już odczytane CV.' }, 409) : notFound('Nie znaleziono zgłoszenia.');
  }
  return json({ candidate: await getCandidate(session, id), changes: result.changes }, 201);
}
