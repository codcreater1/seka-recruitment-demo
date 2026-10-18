import fs from 'node:fs';
import { audit } from '@/lib/db';
import { json, notFound, requireEditor, requireSession } from '@/lib/auth';
import { getAttachment, getCandidate, getRow, removeAttachment } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; aid: string }> };

const asciiName = (name: string) =>
  name.replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_') || 'dokument';

/** Shows the document in the page, or with ?download=1 sends it as a file (and writes the download to the audit log). */
export async function GET(req: Request, { params }: Ctx) {
  const { id, aid } = await params;
  const session = await requireSession();
  if (session instanceof Response) return session;
  const a = getAttachment(session, id, aid);
  if (!a || !fs.existsSync(a.path)) return notFound('Nie znaleziono załącznika.');
  const download = new URL(req.url).searchParams.get('download') === '1';
  if (download) audit(session.name, 'download-attachment', `${a.name} (${getRow(session, id)?.name ?? id})`);
  return new Response(fs.readFileSync(a.path), {
    headers: {
      'content-type': a.mime,
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${asciiName(a.name)}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, aid } = await params;
  const session = await requireEditor('Usuwanie załączników jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  if (!removeAttachment(session, id, aid)) return notFound('Nie znaleziono załącznika.');
  return json({ candidate: await getCandidate(session, id) });
}
