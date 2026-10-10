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

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Błąd serwera (${res.status})`);
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
