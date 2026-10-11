import fs from 'node:fs';
import { audit, filePath } from '@/lib/db';
import { getSession, notFound } from '@/lib/auth';
import { getRow } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** File name that is safe in a plain header: no diacritics, no special characters. */
function asciiName(name: string) {
  const plain = name
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_');
  return plain || 'CV.pdf';
}

/**
 * The candidate's CV. By default it is shown in the page; with ?download=1 it is sent as an attachment
 * (and the download is written to the audit log, because the file contains personal data).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const row = getRow(session, id);
  if (!row || !row.file_id || !fs.existsSync(filePath(row.file_id))) return notFound('Brak pliku CV.');
  const download = new URL(req.url).searchParams.get('download') === '1';
  if (download) audit(session.name, 'download-cv', `${row.name} (${row.city})`);

  const original = row.file_name || 'CV.pdf';
  const disposition = `${download ? 'attachment' : 'inline'}; filename="${asciiName(original)}"; filename*=UTF-8''${encodeURIComponent(original)}`;
  return new Response(fs.readFileSync(filePath(row.file_id)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': disposition,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
