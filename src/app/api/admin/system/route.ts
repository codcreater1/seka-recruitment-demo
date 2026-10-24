import { badRequest, json, requireSystem } from '@/lib/auth';
import { SECRET_FIELDS, getSystemPublic, saveSystemConfig, type SystemPatch } from '@/lib/system-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Technical settings: only the system administrator reads or changes them, and secrets never leave the server. */
export async function GET() {
  const session = await requireSystem('Ustawienia systemowe są dostępne tylko dla administratora systemu.');
  if (session instanceof Response) return session;
  return json(getSystemPublic());
}

export async function PUT(req: Request) {
  const session = await requireSystem('Ustawienia systemowe może zmieniać tylko administrator systemu.');
  if (session instanceof Response) return session;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('Nieprawidłowe dane.');
  const clear = Array.isArray(body.clear) ? body.clear.filter((x): x is (typeof SECRET_FIELDS)[number] => (SECRET_FIELDS as readonly string[]).includes(String(x))) : [];
  const result = saveSystemConfig({ ...(body as SystemPatch), clear }, session.name);
  if ('error' in result) return badRequest(result.error);
  return json({ ok: true, changed: result.changed, ...getSystemPublic() });
}
