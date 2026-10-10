import { norm, type CvProfile } from './domain';

/**
 * Rule-based facts read from the CV text. Deliberately no scoring or ranking of candidates:
 * the system shows what the document says and leaves every decision to a person.
 */

const SKILL_TERMS: [string, string[]][] = [
  ['MS Excel', ['excel']],
  ['Power BI', ['power bi']],
  ['Pakiet Office', ['pakiet office', 'ms office']],
  ['Raportowanie środowiskowe', ['raportowanie srodowiskowe', 'raportow']],
  ['Pozwolenia i decyzje', ['pozwolenia i decyzje', 'wnioskow o pozwolenia', 'pozwolen']],
  ['Gospodarka odpadami', ['ewidencji odpadow', 'gospodark', 'odpadow']],
  ['Chromatografia', ['chromatograf']],
  ['Spektrofotometria', ['spektrofotometr']],
  ['Norma PN-EN ISO/IEC 17025', ['17025']],
  ['Pobór próbek', ['pobor probek', 'przygotowanie probek', 'przygotowanie i analiza probek']],
  ['Pomiary emisji', ['pomiary emisji', 'pomiarow emisji', 'emisji zanieczyszczen']],
  ['Sprawozdania z badań', ['sprawozdania z badan', 'sprawozdan z badan']],
  ['Ocena ryzyka zawodowego', ['ocena ryzyka', 'ocen ryzyka']],
  ['Szkolenia BHP', ['szkolenia bhp', 'szkolen wstepnych']],
  ['Audyty', ['audyt']],
  ['Kodeks pracy', ['kodeks pracy']],
  ['Księgowość', ['ksiegi handlowe', 'ksiag rachunkowych', 'ksiegowosc']],
  ['VAT', ['vat']],
  ['Płace i ZUS', ['zus', 'place i zus', 'wynagrodzen']],
  ['Optima / Symfonia', ['optima', 'symfonia']],
  ['Analiza danych', ['analiza danych', 'analizy danych']],
  ['Prawo jazdy kat. B', ['prawo jazdy']],
];

const LANGUAGES: [string, RegExp][] = [
  ['angielski', /(?:j[eę]zyk\s+)?(?:angielski|english)\s*([ABC][12])?/i],
  ['niemiecki', /(?:j[eę]zyk\s+)?(?:niemiecki|german|deutsch)\s*([ABC][12])?/i],
  ['francuski', /(?:j[eę]zyk\s+)?(?:francuski|french)\s*([ABC][12])?/i],
  ['rosyjski', /(?:j[eę]zyk\s+)?(?:rosyjski|russian)\s*([ABC][12])?/i],
];

function experienceYears(text: string): number | null {
  const thisYear = new Date().getFullYear();
  const spans: [number, number][] = [];
  const re = /\b((?:19|20)\d{2})\s*[–—-]\s*((?:19|20)\d{2}|obecnie|teraz|present|do dziś)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const from = Number(m[1]);
    const to = /^\d/.test(m[2]) ? Number(m[2]) : thisYear;
    if (from <= to && to - from <= 50) spans.push([from, to]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curFrom, curTo] = spans[0];
  for (const [f, t] of spans.slice(1)) {
    if (f <= curTo) curTo = Math.max(curTo, t);
    else {
      total += curTo - curFrom;
      [curFrom, curTo] = [f, t];
    }
  }
  total += curTo - curFrom;
  return total;
}

function education(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const at = lines.findIndex((l) => /^wykszta[łl]cenie\b/i.test(l));
  if (at > -1 && lines[at + 1]) return lines[at + 1];
  return '';
}

export function analyzeCv(text: string): CvProfile {
  if (!text.trim()) return { skills: [], languages: [], experienceYears: null, education: '' };
  const n = norm(text);
  const skills = SKILL_TERMS.filter(([, keys]) => keys.some((k) => n.includes(k))).map(([label]) => label);
  const languages: string[] = [];
  for (const [name, re] of LANGUAGES) {
    const m = text.match(re);
    if (m) languages.push(m[1] ? `${name} ${m[1].toUpperCase()}` : name);
  }
  return { skills, languages, experienceYears: experienceYears(text), education: education(text) };
}
