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

export type EmailTemplate = 'ack' | 'rejection' | 'invite';

export const EMAIL_TEMPLATES: Record<
  EmailTemplate,
  { label: string; subject: string; body: (c: { position: string; interviewAt?: string | null }) => string }
> = {
  ack: {
    label: 'Potwierdzenie przyjęcia zgłoszenia',
    subject: 'Potwierdzenie otrzymania zgłoszenia',
    body: (c) =>
      `Dzień dobry,\n\ndziękujemy za przesłanie zgłoszenia na stanowisko ${c.position}. ` +
      `Potwierdzamy, że dokumenty dotarły do działu HR. Skontaktujemy się z wybranymi kandydatami.\n\nDział HR`,
  },
  rejection: {
    label: 'Podziękowanie za udział w rekrutacji',
    subject: 'Dziękujemy za udział w rekrutacji',
    body: (c) =>
      `Dzień dobry,\n\ndziękujemy za udział w procesie rekrutacji na stanowisko ${c.position}. ` +
      `Informujemy, że na tym etapie skontaktujemy się tylko z wybranymi kandydatami.\n\n` +
      `Dziękujemy za zainteresowanie naszą firmą i życzymy powodzenia.\n\nDział HR`,
  },
  invite: {
    label: 'Zaproszenie na rozmowę',
    subject: 'Zaproszenie na rozmowę kwalifikacyjną',
    body: (c) => {
      let when = 'w terminie, który ustalimy z Państwem telefonicznie';
      if (c.interviewAt) {
        const [d, t] = c.interviewAt.split('T');
        const [y, m, day] = d.split('-');
        when = `${day}.${m}.${y} o godzinie ${t}`;
      }
      return (
        `Dzień dobry,\n\nzapraszamy na rozmowę kwalifikacyjną na stanowisko ${c.position}. ` +
        `Rozmowa odbędzie się ${when}.\n\nProsimy o potwierdzenie obecności w odpowiedzi na tę wiadomość.\n\nDział HR`
      );
    },
  },
};

/** Preview of the rejection message in the UI. */
export const REJECTION_TEMPLATE = (position: string) => EMAIL_TEMPLATES.rejection.body({ position });

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
  rejectionSent: boolean;
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
  retentionDate: string;
  notes: NoteDto[];
  events: EventDto[];
  emails: EmailDto[];
  profile: CvProfile;
};

export type EmailDto = {
  id: number;
  at: string;
  template: string;
  to: string;
  subject: string;
  body: string;
  status: 'simulated' | 'sent' | 'failed';
  actor: string;
  error: string;
};

export type CvProfile = {
  skills: string[];
  languages: string[];
  experienceYears: number | null;
  education: string;
};

export type StatsDto = {
  total: number;
  newLast7d: number;
  avgDaysToFirstAction: number | null;
  byStatus: Record<string, number>;
  byCity: { city: string; total: number; byStatus: Record<string, number> }[];
  perWeek: { weekStart: string; count: number }[];
  upcomingInterviews: { id: string; name: string; position: string; city: string; interviewAt: string }[];
  attention: {
    needsReview: number;
    duplicates: number;
    stale: number;
    unsentRejections: number;
    retentionDue: number;
  };
};
