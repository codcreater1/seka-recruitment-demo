import { addEvent, audit, getDb } from '@/lib/db';
import { badRequest, forbidden, getSession, json, notFound } from '@/lib/auth';
import { deleteCandidate, getCandidate, getRow, listVacancies, vacancyExists } from '@/lib/candidates';
import { isCity, isPosition, isStatus, statusLabel } from '@/lib/domain';
import { indexCandidate } from '@/lib/search';
import { isLocalDateTime } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const candidate = await getCandidate(await getSession(), id);
  return candidate ? json({ candidate }) : notFound('Nie znaleziono zgłoszenia.');
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session.canEdit) return forbidden('Zmiany danych są dostępne tylko dla HR.');
  const row = getRow(session, id);
  if (!row) return notFound('Nie znaleziono zgłoszenia.');
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest('Nieprawidłowe dane.');

  const set: string[] = [];
  const args: unknown[] = [];
  const events: string[] = [];

  if ('status' in body) {
    if (!isStatus(body.status)) return badRequest('Nieznany status.');
    if (body.status !== row.status) {
      set.push('status = ?');
      args.push(body.status);
      events.push(`Zmiana statusu: ${statusLabel(row.status)} → ${statusLabel(body.status)}`);
      if (body.status !== 'rejected') set.push('rejection_sent = 0');
    }
  }
  if ('city' in body) {
    if (!isCity(body.city)) return badRequest('Nieznane miasto.');
    if (body.city !== row.city) {
      set.push('city = ?', "city_basis = 'ręcznej korekty HR'", 'needs_review = 0');
      args.push(body.city);
      events.push(`Zmieniono miasto: ${row.city} → ${body.city} (ręczna korekta)`);
    }
  }
  if ('position' in body) {
    if (!isPosition(body.position)) return badRequest('Nieznane stanowisko.');
    if (body.position !== row.position) {
      set.push('position = ?');
      args.push(body.position);
      events.push(`Zmieniono stanowisko: ${row.position} → ${body.position} (ręczna korekta)`);
    }
  }
  if ('rating' in body) {
    const r = body.rating;
    const valid = r === null || (typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5);
    if (!valid) return badRequest('Ocena musi być liczbą od 1 do 5.');
    set.push('rating = ?');
    args.push(r);
    events.push(r === null ? 'Usunięto ocenę kandydata' : `Ustawiono ocenę: ${r}/5`);
  }
  if ('interviewAt' in body) {
    const v = body.interviewAt;
    if (v !== null && !isLocalDateTime(v)) return badRequest('Nieprawidłowy termin rozmowy.');
    set.push('interview_at = ?');
    args.push(v);
    events.push(v === null ? 'Usunięto termin rozmowy' : `Ustalono termin rozmowy: ${String(v).replace('T', ' ')}`);
  }
  if ('vacancyId' in body) {
    const v = body.vacancyId;
    if (v !== null && (typeof v !== 'string' || !vacancyExists(v))) return badRequest('Nie znaleziono ogłoszenia.');
    if (v !== row.vacancy_id) {
      set.push('vacancy_id = ?');
      args.push(v);
      const label = v ? listVacancies({ ...session, city: null }).find((x) => x.id === v) : null;
      events.push(label ? `Przypisano do ogłoszenia: ${label.position} (${label.city})` : 'Odpięto od ogłoszenia');
    }
  }
  if (body.confirmReview === true && row.needs_review) {
    set.push('needs_review = 0');
    events.push('Dane kandydata sprawdzone i zatwierdzone');
  }
  if (body.dismissDuplicate === true && row.duplicate_of) {
    set.push('duplicate_of = NULL');
    events.push('Oznaczono jako niebędące duplikatem');
  }
  if (set.length) {
    getDb().prepare(`UPDATE candidates SET ${set.join(', ')} WHERE id = ?`).run(...args, id);
    events.forEach((e) => addEvent(id, session.name, e));
    if (set.some((x) => x.startsWith('position'))) {
      const fresh = getRow(session, id);
      if (fresh) indexCandidate(id, fresh.name, fresh.position, fresh.raw_text);
    }
  }
  return json({ candidate: await getCandidate(session, id) });
}

/** GDPR: erase the profile together with its file. The deletion itself stays in the audit log. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();
  if (!session.canEdit) return forbidden('Usuwanie profili jest dostępne tylko dla HR.');
  if (!deleteCandidate(session, id)) return notFound('Nie znaleziono zgłoszenia.');
  audit(session.name, 'delete-confirmed', id);
  return json({ ok: true });
}
