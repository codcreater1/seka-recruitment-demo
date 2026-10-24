import { addEvent, getDb, nowIso } from '@/lib/db';
import { badRequest, json, notFound, requireCommenter } from '@/lib/auth';
import { getCandidate, getRow } from '@/lib/candidates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireCommenter();
  if (session instanceof Response) return session;
  if (!getRow(session, id)) return notFound('Nie znaleziono zgłoszenia.');
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2000) return badRequest('Notatka musi mieć od 1 do 2000 znaków.');
  getDb().prepare('INSERT INTO notes (candidate_id, author, text, created_at) VALUES (?, ?, ?, ?)').run(id, session.name, text, nowIso());
  addEvent(id, session.name, session.canEdit ? 'Dodano notatkę' : 'Dodano komentarz kierownika');
  return json({ candidate: await getCandidate(session, id) }, 201);
}
