// Shared constants and types (used by the server and the browser UI).

export const CITIES = ['Warszawa', 'Kraków', 'Wrocław', 'Gdańsk', 'Poznań', 'Katowice'] as const;
export type City = (typeof CITIES)[number];

/** Bucket for applications whose city could not be determined. Visible to HR only. */
export const UNASSIGNED_CITY = 'Do przypisania';
export const UNKNOWN_POSITION = 'Nie określono';

export const POSITIONS = [
  'Specjalista ds. ochrony środowiska',
  'Technik laboratoryjny',
  'Konsultant ds. BHP',
  'Specjalista ds. pomiarów emisji',
  'Młodszy specjalista ds. raportowania',
  'Księgowy',
  'Praktykant',
] as const;

export const STATUSES = [
  { id: 'new', label: 'Nowa' },
  { id: 'screening', label: 'W weryfikacji' },
  { id: 'interview', label: 'Rozmowa' },
  { id: 'offer', label: 'Oferta' },
  { id: 'hired', label: 'Zatrudniony/a' },
  { id: 'rejected', label: 'Odrzucona' },
] as const;
export type StatusId = (typeof STATUSES)[number]['id'];
export const PIPELINE: StatusId[] = ['new', 'screening', 'interview', 'offer', 'hired'];

export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;
export const isStatus = (v: unknown): v is StatusId => STATUSES.some((s) => s.id === v);
export const isCity = (v: unknown): v is string =>
  typeof v === 'string' && (v === UNASSIGNED_CITY || (CITIES as readonly string[]).includes(v));
export const isPosition = (v: unknown): v is string =>
  typeof v === 'string' && (v === UNKNOWN_POSITION || (POSITIONS as readonly string[]).includes(v));

export const REJECTION_TEMPLATE = (position: string) =>
  `Dzień dobry,\n\ndziękujemy za udział w procesie rekrutacji na stanowisko ${position}. ` +
  `Informujemy, że na tym etapie skontaktujemy się tylko z wybranymi kandydatami.\n\n` +
  `Dziękujemy za zainteresowanie naszą firmą i życzymy powodzenia.\n\nDział HR`;

/** Lower-case, strip diacritics (including ł) so Polish text can be matched loosely. */
export const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export type Session = {
  role: 'hr' | 'manager';
  /** Branch the user is limited to; null means all cities. */
  city: string | null;
  name: string;
  canEdit: boolean;
  id: string;
};

export type NoteDto = { id: number; author: string; text: string; createdAt: string };
export type EventDto = { id: number; at: string; actor: string; text: string };

export type CandidateListItem = {
  id: string;
  name: string;
  email: string;
  city: string;
  position: string;
  status: StatusId;
  receivedAt: string;
  rating: number | null;
  interviewAt: string | null;
  needsReview: boolean;
  duplicateOf: string | null;
  retentionDue: boolean;
};

export type CandidateDetail = CandidateListItem & {
  phone: string;
  channel: string;
  from: string;
  subject: string;
  cityBasis: string;
  /** 0 = no clause found, 1 = recruitment, 2 = recruitment and future recruitments */
  rodo: 0 | 1 | 2;
  file: { name: string; size: number } | null;
  rawText: string;
  rejectionSent: boolean;
  retentionDate: string;
  notes: NoteDto[];
  events: EventDto[];
};
