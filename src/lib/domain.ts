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

/** What an application lacks. The candidate is asked for these items by e-mail. */
export type MissingItem = 'cv' | 'cv_unreadable' | 'city' | 'position';
/** Wording used in the request to the candidate. */
export const MISSING_LABEL: Record<MissingItem, string> = {
  cv: 'CV w formacie PDF (do wiadomości nie dołączono żadnego pliku)',
  cv_unreadable: 'ponowne przesłanie CV (dołączonego pliku nie udało się odczytać; prosimy o poprawny plik PDF)',
  city: 'miasto (oddział), którego dotyczy zgłoszenie',
  position: 'stanowisko, na które aplikujesz',
};
/** Short wording for badges and the history. */
export const MISSING_SHORT: Record<MissingItem, string> = {
  cv: 'brak CV',
  cv_unreadable: 'nieczytelne CV',
  city: 'brak miasta',
  position: 'brak stanowiska',
};

export type EmailTemplate = 'ack' | 'missing' | 'rejection' | 'invite';
export const EMAIL_TEMPLATE_IDS: EmailTemplate[] = ['ack', 'missing', 'invite', 'rejection'];

/**
 * Message texts. {{placeholders}} are filled in when a message is written:
 *   {{position}}  the position, {{positionPhrase}} "na stanowisko X" (or "do naszej firmy" when unknown),
 *   {{when}}      date and time of the interview, {{missingList}} the missing items, one per line.
 * The administrator can change subject and text in the settings; these are the defaults.
 */
export const DEFAULT_TEMPLATES: Record<EmailTemplate, { label: string; subject: string; body: string; placeholders: string[] }> = {
  ack: {
    label: 'Potwierdzenie przyjęcia zgłoszenia',
    subject: 'Potwierdzenie otrzymania zgłoszenia',
    body:
      'Dzień dobry,\n\ndziękujemy za przesłanie zgłoszenia {{positionPhrase}}. ' +
      'Potwierdzamy, że dokumenty dotarły do działu HR. Skontaktujemy się z wybranymi kandydatami.\n\nDział HR',
    placeholders: ['{{positionPhrase}}', '{{position}}'],
  },
  missing: {
    label: 'Prośba o uzupełnienie zgłoszenia',
    subject: 'Prośba o uzupełnienie zgłoszenia rekrutacyjnego',
    body:
      'Dzień dobry,\n\ndziękujemy za przesłanie zgłoszenia {{positionPhrase}}. ' +
      'Aby móc je rozpatrzyć, prosimy o uzupełnienie:\n\n{{missingList}}\n\n' +
      'Prosimy o odpowiedź na tę wiadomość z brakującymi informacjami lub dokumentem.\n\nDział HR',
    placeholders: ['{{missingList}}', '{{positionPhrase}}', '{{position}}'],
  },
  invite: {
    label: 'Zaproszenie na rozmowę',
    subject: 'Zaproszenie na rozmowę kwalifikacyjną',
    body:
      'Dzień dobry,\n\nzapraszamy na rozmowę kwalifikacyjną {{positionPhrase}}. Rozmowa odbędzie się {{when}}.\n\n' +
      'Prosimy o potwierdzenie obecności w odpowiedzi na tę wiadomość.\n\nDział HR',
    placeholders: ['{{when}}', '{{positionPhrase}}', '{{position}}'],
  },
  rejection: {
    label: 'Podziękowanie za udział w rekrutacji',
    subject: 'Dziękujemy za udział w rekrutacji',
    body:
      'Dzień dobry,\n\ndziękujemy za udział w procesie rekrutacji {{positionPhrase}}. ' +
      'Informujemy, że na tym etapie skontaktujemy się tylko z wybranymi kandydatami.\n\n' +
      'Dziękujemy za zainteresowanie naszą firmą i życzymy powodzenia.\n\nDział HR',
    placeholders: ['{{positionPhrase}}', '{{position}}'],
  },
};

export const EMAIL_TEMPLATE_LABEL = Object.fromEntries(
  EMAIL_TEMPLATE_IDS.map((id) => [id, DEFAULT_TEMPLATES[id].label]),
) as Record<EmailTemplate, string>;

export type TemplateVars = { position: string; interviewAt?: string | null; missing?: MissingItem[] };
export type TemplateOverride = { subject?: string; body?: string };

/** Fills a message in. `override` is the administrator's own wording for this message, if any. */
export function renderTemplate(id: EmailTemplate, vars: TemplateVars, override?: TemplateOverride): { subject: string; body: string } {
  const base = DEFAULT_TEMPLATES[id];
  const known = !!vars.position && vars.position !== UNKNOWN_POSITION;
  let when = 'w terminie, który ustalimy z Państwem telefonicznie';
  if (vars.interviewAt) {
    const [d, t] = vars.interviewAt.split('T');
    const [y, m, day] = d.split('-');
    when = `${day}.${m}.${y} o godzinie ${t}`;
  }
  const values: Record<string, string> = {
    position: known ? vars.position : 'nieokreślone',
    positionPhrase: known ? `na stanowisko ${vars.position}` : 'do naszej firmy',
    when,
    missingList: (vars.missing ?? []).map((m) => `- ${MISSING_LABEL[m]}`).join('\n'),
  };
  const fill = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? values[key] : whole));
  return { subject: fill(override?.subject?.trim() || base.subject), body: fill(override?.body?.trim() || base.body) };
}

/** Lower-case, strip diacritics (including ł) so Polish text can be matched loosely. */
export const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** admin: everything and the settings; hr: the whole company; manager: one branch (read, comment, opinions). */
export type Role = 'admin' | 'hr' | 'manager';
export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrator', hr: 'HR manager', manager: 'Kierownik oddziału' };

export type Session = {
  /** Account id: "admin", "hr", "mgr:Kraków" in the demo; "entra:<object id>" with Microsoft Entra ID. */
  id: string;
  role: Role;
  /** Branch the user is limited to; null means all cities. */
  city: string | null;
  name: string;
  email: string;
  /** May change candidate data and run bulk actions (admin, hr). */
  canEdit: boolean;
  /** May change the system settings (admin only). */
  canConfigure: boolean;
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
  /** The CV contains consent for future recruitments: the candidate is part of the talent pool. */
  consentFuture: boolean;
  vacancyId: string | null;
  /** What the application lacks (CV, readable CV, city, position). */
  missing: MissingItem[];
  /** When the candidate was asked to complete the application, if they were. */
  infoRequestedAt: string | null;
};

export const ATTACHMENT_KINDS = [
  { id: 'cover', label: 'List motywacyjny' },
  { id: 'certificate', label: 'Certyfikat / świadectwo' },
  { id: 'other', label: 'Inny dokument' },
] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]['id'];
export const isAttachmentKind = (v: unknown): v is AttachmentKind => ATTACHMENT_KINDS.some((k) => k.id === v);

export type AttachmentDto = { id: string; kind: AttachmentKind; name: string; mime: string; size: number; addedAt: string; addedBy: string };

export type CandidateDetail = CandidateListItem & {
  phone: string;
  channel: string;
  from: string;
  subject: string;
  cityBasis: string;
  /** 0 = no clause found, 1 = recruitment, 2 = recruitment and future recruitments */
  rodo: 0 | 1 | 2;
  file: { name: string; size: number } | null;
  /** Cover letter, certificates and other documents besides the CV. */
  attachments: AttachmentDto[];
  rawText: string;
  retentionDate: string;
  notes: NoteDto[];
  events: EventDto[];
  emails: EmailDto[];
  profile: CvProfile;
  vacancy: VacancyDto | null;
  feedback: FeedbackDto[];
  /** The rejection message as it would be sent (with the administrator's wording), for the preview. */
  rejectionPreview: string;
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
  attachment: string;
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
  openVacancies: number;
  pool: number;
  attention: {
    needsReview: number;
    duplicates: number;
    stale: number;
    unsentRejections: number;
    retentionDue: number;
    emptyVacancies: number;
    missingInfo: number;
  };
};

export type VacancyDto = {
  id: string;
  position: string;
  city: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  daysOpen: number;
  total: number;
  counts: Record<string, number>;
};

export const RECOMMENDATIONS = [
  { id: 'tak', label: 'Polecam' },
  { id: 'warunkowo', label: 'Warunkowo' },
  { id: 'nie', label: 'Nie polecam' },
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number]['id'];
export const isRecommendation = (v: unknown): v is Recommendation => RECOMMENDATIONS.some((r) => r.id === v);

export const FEEDBACK_CRITERIA = [
  { id: 'communication', label: 'Komunikacja' },
  { id: 'knowledge', label: 'Wiedza zawodowa' },
  { id: 'fit', label: 'Dopasowanie do zespołu' },
] as const;

export type FeedbackDto = {
  id: number;
  author: string;
  at: string;
  communication: number;
  knowledge: number;
  fit: number;
  recommendation: Recommendation;
  comment: string;
};
