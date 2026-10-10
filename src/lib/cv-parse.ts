import { extractText, getDocumentProxy } from 'unpdf';
import { CITIES, POSITIONS, norm } from './domain';

export type ParsedCv = {
  name: string;
  email: string;
  phone: string;
  city: string;
  cityBasis: string;
  position: string;
  rodo: 0 | 1 | 2;
};

/** Reads the text layer of a PDF. Scanned documents return an empty string. */
export async function extractPdfText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join('\n') : text).replace(/\u0000/g, '').trim();
}

const POSITION_KEYS: string[][] = [
  ['ochrony srodowiska', 'ochrona srodowiska'],
  ['technik laboratoryjny', 'laborator'],
  ['bhp', 'higieny pracy'],
  ['emisj', 'pomiar'],
  ['raportow', 'sprawozdawcz'],
  ['ksiegow', 'rachunkow'],
  ['praktykant', 'staz'],
];

function countOf(hay: string, key: string) {
  let n = 0;
  let at = hay.indexOf(key);
  while (at > -1) {
    n++;
    at = hay.indexOf(key, at + key.length);
  }
  return n;
}

export function detectPosition(lines: string[]): string {
  const top = norm(lines.slice(0, 6).join('\n'));
  const all = norm(lines.join('\n'));
  let best = -1;
  let bestScore = 0;
  POSITION_KEYS.forEach((keys, i) => {
    const score = keys.reduce((s, k) => s + 5 * countOf(top, k) + countOf(all, k), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best > -1 ? POSITIONS[best] : '';
}

export function detectCity(text: string): string {
  const t = norm(text);
  for (const c of CITIES) {
    // stem match so that "Krakowie" or "w Warszawie" are recognised
    const stem = norm(c).slice(0, -1);
    if (t.includes(stem)) return c;
  }
  return '';
}

function guessName(lines: string[]): string {
  const skip = /curriculum|vitae|życiorys|zyciorys|\bcv\b|resume|dane osobowe|kontakt/i;
  for (const raw of lines.slice(0, 12)) {
    const t = raw.trim();
    const label = t.match(/^(?:imi[eę] i nazwisko|name)\s*[:-]\s*(.+)$/i);
    if (label) return label[1].trim();
    if (!t || skip.test(t) || /[\d@]/.test(t) || detectPosition([t])) continue;
    if (/^\p{Lu}[\p{Ll}'’-]+(?:\s+\p{Lu}[\p{Ll}'’-]+){1,2}$/u.test(t)) return t;
  }
  return '';
}

export function parseCv(text: string): ParsedCv {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const email = (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/) || [''])[0];

  let phone = '';
  const pm = text.match(/(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/);
  if (pm) {
    let digits = pm[0].replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('48')) digits = digits.slice(2);
    if (digits.length === 9) phone = `+48 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }

  let city = '';
  let cityBasis = '';
  const postal = text.match(/\b\d{2}-\d{3}\s+([\p{L}][\p{L} -]+)/u);
  if (postal) {
    city = detectCity(postal[1]);
    if (city) cityBasis = 'adresu w CV';
  }
  if (!city) {
    city = detectCity(text);
    if (city) cityBasis = 'treści CV';
  }

  const hasClause = /zgod/i.test(text) && /przetwarzani/i.test(text);
  const rodo: 0 | 1 | 2 = !hasClause ? 0 : /przyszł/i.test(text) ? 2 : 1;

  return { name: guessName(lines), email, phone, city, cityBasis, position: detectPosition(lines), rodo };
}

/** "Jan Kowalski <jan@example.com>" or "jan.kowalski@example.com" -> display name + address */
export function parseSender(from: string): { name: string; address: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  const address = from.trim();
  const local = address.split('@')[0] || '';
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
  return { name, address };
}
