import { badRequest, forbidden, getSession, json } from '@/lib/auth';
import { createVacancy, listVacancies } from '@/lib/candidates';
import { isCity, isPosition, UNASSIGNED_CITY, UNKNOWN_POSITION } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ vacancies: listVacancies(await getSession()) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.canEdit) return forbidden('Dodawanie ogłoszeń jest dostępne tylko dla HR.');
  const body = (await req.json().catch(() => null)) as { position?: unknown; city?: unknown } | null;
  const { position, city } = body || {};
  if (!isPosition(position) || position === UNKNOWN_POSITION) return badRequest('Wybierz stanowisko.');
  if (!isCity(city) || city === UNASSIGNED_CITY) return badRequest('Wybierz miasto.');
  const res = createVacancy(session, position, city);
  if (res.error) return json({ error: res.error }, 409);
  return json({ vacancy: res.vacancy }, 201);
}
