import { badRequest, getSession, json, notFound } from '@/lib/auth';
import { addFeedback, getCandidate, getRow } from '@/lib/candidates';
import { isRecommendation } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const grade = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

/** Opinion after an interview. HR and the manager of the branch may add one; nobody can edit it later. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!getRow(session, id)) return notFound('Nie znaleziono zgłoszenia.');
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const communication = grade(b?.communication);
  const knowledge = grade(b?.knowledge);
  const fit = grade(b?.fit);
  if (communication === null || knowledge === null || fit === null) return badRequest('Oceny kryteriów muszą być liczbami od 1 do 5.');
  if (!isRecommendation(b?.recommendation)) return badRequest('Wybierz rekomendację.');
  const comment = typeof b?.comment === 'string' ? b.comment.trim() : '';
  if (comment.length > 2000) return badRequest('Komentarz może mieć najwyżej 2000 znaków.');
  addFeedback(session, id, { communication, knowledge, fit, recommendation: b.recommendation, comment });
  return json({ candidate: await getCandidate(session, id) }, 201);
}
