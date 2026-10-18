import { badRequest, json, notFound, requireEditor } from '@/lib/auth';
import { MAX_ATTACHMENT_BYTES, addAttachment, getCandidate, getRow } from '@/lib/candidates';
import { isAttachmentKind } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** HR adds a cover letter, a certificate or another document (PDF, JPG, PNG) to the profile. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireEditor('Dodawanie załączników jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  if (!getRow(session, id)) return notFound('Nie znaleziono zgłoszenia.');
  if (Number(req.headers.get('content-length') || 0) > MAX_ATTACHMENT_BYTES + 256 * 1024) return json({ error: 'Plik jest większy niż 10 MB.' }, 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = form?.get('kind') ?? 'other';
  if (!(file instanceof File)) return badRequest('Dołącz plik.');
  if (!isAttachmentKind(kind)) return badRequest('Nieznany rodzaj dokumentu.');
  const result = addAttachment(id, new Uint8Array(await file.arrayBuffer()), file.name, kind, session.name);
  if ('error' in result) return badRequest(result.error);
  return json({ candidate: await getCandidate(session, id), attachment: result.attachment }, 201);
}
