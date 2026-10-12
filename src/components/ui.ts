import { useEffect, useState } from 'react';

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtInterview = (local: string) => {
  const [d, t] = local.split('T');
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y} ${t}`;
};

export function rel(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1) {
    const h = Math.floor(d * 24);
    return h < 1 ? 'przed chwilą' : `${h} godz. temu`;
  }
  const n = Math.floor(d);
  return n === 1 ? 'wczoraj' : `${n} dni temu`;
}

export const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const STATUS_TEXT: Record<number, string> = {
  401: 'Brak dostępu. Odśwież stronę i podaj hasło.',
  413: 'Plik jest zbyt duży.',
  429: 'Zbyt wiele prób. Poczekaj chwilę i spróbuj ponownie.',
  502: 'Serwer jest chwilowo niedostępny. Spróbuj ponownie za moment.',
  503: 'Serwer jest chwilowo niedostępny. Spróbuj ponownie za moment.',
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Brak połączenia z serwerem. Sprawdź połączenie i spróbuj ponownie.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || STATUS_TEXT[res.status] || `Błąd serwera (${res.status})`);
  return data as T;
}

export function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Anonymous mode: a short code instead of the candidate's name. */
export const alias = (id: string) => `Kandydat ${id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`;
export const displayName = (c: { id: string; name: string }, anon: boolean) => (anon ? alias(c.id) : c.name);

/** Monday of the week containing the given date (local time), at 00:00. */
export function weekStart(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
