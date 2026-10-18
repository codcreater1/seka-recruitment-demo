import { badRequest, json, requireEditor } from '@/lib/auth';
import { mergeDuplicate } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Merges a flagged duplicate into the profile it duplicates. Returns the id of the profile that remains. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await requireEditor('Łączenie profili jest dostępne tylko dla HR.');
  if (session instanceof Response) return session;
  const result = mergeDuplicate(session, id);
  return result.ok ? json({ ok: true, targetId: result.targetId }) : badRequest(result.error);
}
