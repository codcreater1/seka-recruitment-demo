import fs from 'node:fs';
import path from 'node:path';
import { SEED_DIR } from '@/lib/db';
import { badRequest, forbidden, getSession, json } from '@/lib/auth';
import { ingestApplication, ingestEml } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Sample = { name: string; file: string; downloadName: string; kind: 'text' | 'scan' | 'eml'; from: string; subject: string };

function samples(): Sample[] {
  try {
    const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'seed.json'), 'utf8')) as { incoming?: Sample[] };
    return seed.incoming || [];
  } catch {
    return [];
  }
}

export async function GET() {
  return json({ samples: samples().map(({ name, file, kind, subject }) => ({ name, file, kind, subject })) });
}

/** Runs one of the bundled sample CVs through the same intake as a real e-mail. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.canEdit) return forbidden('Symulacja wiadomości jest dostępna tylko dla HR.');
  const body = (await req.json().catch(() => null)) as { file?: string } | null;
  const sample = samples().find((s) => s.file === body?.file);
  if (!sample) return badRequest('Nieznana próbka.');
  const buffer = new Uint8Array(fs.readFileSync(path.join(SEED_DIR, sample.file)));
  if (sample.kind === 'eml') {
    return json(await ingestEml(buffer, 'symulacja', true), 201);
  }
  const result = await ingestApplication({
    buffer,
    fileName: sample.downloadName,
    from: sample.from,
    subject: sample.subject,
    channel: 'E-mail',
    actor: 'symulacja',
    autoAck: true,
  });
  return json(result, 201);
}
