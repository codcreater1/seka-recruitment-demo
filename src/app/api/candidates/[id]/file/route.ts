import fs from 'node:fs';
import { filePath } from '@/lib/db';
import { getSession, notFound } from '@/lib/auth';
import { getRow } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getRow(await getSession(), id);
  if (!row || !row.file_id || !fs.existsSync(filePath(row.file_id))) return notFound('Brak pliku CV.');
  const data = fs.readFileSync(filePath(row.file_id));
  const name = (row.file_name || 'CV.pdf').replace(/[^\w.\- ]+/g, '_');
  return new Response(data, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
