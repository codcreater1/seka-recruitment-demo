'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CITIES,
  ROLE_LABEL,
  STATUSES,
  UNASSIGNED_CITY,
  norm,
  statusLabel,
  type CandidateDetail,
  type CandidateListItem,
  type EmailTemplate,
  type Session,
  type StatsDto,
  type StatusId,
  type VacancyDto,
} from '@/lib/domain';
import { api, displayName, fmtInterview, rel, useMedia } from './ui';
import Detail, { type FeedbackInput } from './Detail';
import Board from './Board';
import Calendar from './Calendar';
import Vacancies from './Vacancies';
import Admin from './Admin';
import Summary, { type QuickFilter } from './Summary';
import { Avatar, Chip, STATUS_VAR } from './Chip';
import Icon, { type IconName } from './Icon';
import { AuditModal, GuideModal, IssuesModal, NewModal, type GuideStep } from './Modals';

type RoleOption = { id: string; label: string };
type ModalKind = 'new' | 'issues' | 'audit' | 'guide' | null;
type View = 'list' | 'board' | 'calendar' | 'vacancies' | 'summary' | 'admin';

const WEEK = 7 * 864e5;
const ROLE_INITIALS = { admin: 'AD', hr: 'HR', manager: 'KO' } as const;
const QUICK_LABEL: Record<Exclude<QuickFilter, null>, string> = {
  review: 'Do sprawdzenia',
  missing: 'Brakujące dane',
  duplicates: 'Możliwe duplikaty',
  stale: 'Czekają ponad 7 dni',
  retention: 'Po terminie przechowywania',
  pool: 'Baza kandydatów',
};
const VIEW_LABEL: Record<View, string> = {
  list: 'Lista',
  board: 'Tablica',
  calendar: 'Kalendarz',
  vacancies: 'Ogłoszenia',
  summary: 'Pulpit',
  admin: 'Admin',
};
/** Address of every view (#/lista, #/tablica/<id> ...), so a refresh or a pasted link opens the same screen. */
const VIEW_SLUG: Record<View, string> = { list: 'lista', board: 'tablica', calendar: 'kalendarz', vacancies: 'ogloszenia', summary: 'pulpit', admin: 'administracja' };

function readAddress(): { view: View; id: string | null } {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const view = (Object.keys(VIEW_SLUG) as View[]).find((v) => VIEW_SLUG[v] === parts[0]) ?? 'list';
  const id = parts[1] && /^[A-Za-z0-9_-]{1,64}$/.test(parts[1]) ? parts[1] : null;
  return { view, id: view === 'vacancies' || view === 'summary' || view === 'admin' ? null : id };
}

const ANON_KEY = 'panel-rekrutacji-anon';
const THEME_KEY = 'panel-rekrutacji-theme';
const SIZE_KEY = 'panel-rekrutacji-size';
type Theme = 'auto' | 'light' | 'dark';
type Size = 's' | 'm' | 'l';
const SIZE_LABEL: Record<Size, string> = { s: 'Mały', m: 'Średni', l: 'Duży' };
const THEME_LABEL: Record<Theme, string> = { auto: 'Auto', light: 'Jasny', dark: 'Ciemny' };
const VIEW_ICON: Record<View, IconName> = { list: 'list', board: 'board', calendar: 'calendar', vacancies: 'briefcase', summary: 'chart', admin: 'settings' };
const VIEW_TITLE: Record<View, string> = {
  list: 'Zgłoszenia',
  board: 'Tablica statusów',
  calendar: 'Kalendarz rozmów',
  vacancies: 'Ogłoszenia',
  summary: 'Pulpit rekrutacji',
  admin: 'Administracja',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [authMode, setAuthMode] = useState<'demo' | 'entra'>('demo');
  const [items, setItems] = useState<CandidateListItem[]>([]);
  const [vacancies, setVacancies] = useState<VacancyDto[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [city, setCity] = useState('all');
  const [status, setStatus] = useState<'all' | StatusId>('all');
  const [quick, setQuick] = useState<QuickFilter>(null);
  const [vacancyFilter, setVacancyFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'old' | 'name'>('new');
  const [anon, setAnon] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [size, setSize] = useState<Size>('m');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [routed, setRouted] = useState(false);
  const lastView = useRef<View>('list');
  const detailRef = useRef<HTMLElement>(null);
  const [hits, setHits] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // up to this width the list and the profile are shown one at a time
  const narrow = useMedia('(max-width: 1100px)');

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3400);
  }, []);

  const loadList = useCallback(async () => {
    const data = await api<{ candidates: CandidateListItem[] }>('/api/candidates');
    setItems(data.candidates);
    setLoaded(true);
  }, []);

  const loadStats = useCallback(async () => {
    const data = await api<{ stats: StatsDto }>('/api/stats');
    setStats(data.stats);
  }, []);

  const loadVacancies = useCallback(async () => {
    const data = await api<{ vacancies: VacancyDto[] }>('/api/vacancies');
    setVacancies(data.vacancies);
  }, []);

  const loadSession = useCallback(async () => {
    const data = await api<{ session: Session; accounts: RoleOption[]; authMode: 'demo' | 'entra' }>('/api/session');
    setSession(data.session);
    setRoles(data.accounts);
    setAuthMode(data.authMode);
    return data.session;
  }, []);

  useEffect(() => {
    try {
      setAnon(localStorage.getItem(ANON_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
    loadSession()
      .then((s) => {
        if (s.city) setCity(s.city);
        return Promise.all([loadList(), loadVacancies()]);
      })
      .catch((e: Error) => setError(e.message));
  }, [loadSession, loadList, loadVacancies]);

  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    // the size was already applied before the first paint; read it back for the control
    const a = document.documentElement.getAttribute('data-size');
    if (a === 's' || a === 'm' || a === 'l') setSize(a);
  }, []);

  const chooseSize = (z: Size) => {
    setSize(z);
    document.documentElement.setAttribute('data-size', z);
    try {
      localStorage.setItem(SIZE_KEY, z);
    } catch {
      /* ignore */
    }
  };

  const chooseTheme = (t: Theme) => {
    setTheme(t);
    const el = document.documentElement;
    if (t === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', t);
    try {
      if (t === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.usermenu')) setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSettingsOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  // a newly opened profile starts at its top
  useEffect(() => {
    detailRef.current?.scrollTo?.({ top: 0 });
  }, [selId]);

  // address -> screen: on start and when the browser goes back or forward
  useEffect(() => {
    const apply = () => {
      const a = readAddress();
      lastView.current = a.view;
      setView(a.view);
      setSelId(a.id);
    };
    apply();
    setRouted(true);
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
  }, []);

  // screen -> address: a new view is a history entry, picking another profile only updates the address
  useEffect(() => {
    if (!routed) return;
    const want = `#/${VIEW_SLUG[view]}${selId ? `/${selId}` : ''}`;
    if (window.location.hash !== want) {
      const url = window.location.pathname + window.location.search + want;
      if (lastView.current !== view) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    }
    lastView.current = view;
    document.title = `${VIEW_TITLE[view]} · Panel rekrutacji`;
  }, [routed, view, selId]);

  const toggleAnon = (on: boolean) => {
    setAnon(on);
    try {
      localStorage.setItem(ANON_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (view === 'summary') loadStats().catch((e: Error) => say(e.message));
    if (view === 'vacancies') loadVacancies().catch((e: Error) => say(e.message));
  }, [view, loadStats, loadVacancies, say]);

  // open profile
  useEffect(() => {
    if (!selId) {
      setDetail(null);
      return;
    }
    let alive = true;
    api<{ candidate: CandidateDetail }>(`/api/candidates/${selId}`)
      .then((d) => alive && setDetail(d.candidate))
      .catch((e: Error) => {
        if (!alive) return;
        setDetail(null);
        setSelId(null);
        say(e.message);
      });
    return () => {
      alive = false;
    };
  }, [selId, say]);

  // search in the text of the CVs (debounced)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setHits({});
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api<{ results: { id: string; snippet: string }[] }>(`/api/search?q=${encodeURIComponent(term)}${anon ? '&anon=1' : ''}`)
        .then((d) => alive && setHits(Object.fromEntries(d.results.map((r) => [r.id, r.snippet]))))
        .catch(() => alive && setHits({}));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, anon]);

  const matches = useCallback(
    (c: CandidateListItem, o: { city?: string; status?: string } = {}) => {
      const cityV = o.city ?? city;
      const statusV = o.status ?? status;
      if (cityV !== 'all' && c.city !== cityV) return false;
      if (statusV !== 'all' && c.status !== statusV) return false;
      if (vacancyFilter && c.vacancyId !== vacancyFilter) return false;
      if (quick === 'review' && !c.needsReview) return false;
      if (quick === 'missing' && !c.missing.length) return false;
      if (quick === 'duplicates' && !c.duplicateOf) return false;
      if (quick === 'stale' && !(c.status === 'new' && Date.now() - Date.parse(c.receivedAt) > WEEK)) return false;
      if (quick === 'retention' && !c.retentionDue) return false;
      if (quick === 'pool' && !c.consentFuture) return false;
      const needle = norm(q.trim());
      if (needle) {
        const fields = anon ? [c.position, c.city] : [c.name, c.position, c.email, c.city];
        if (!norm(fields.join(' ')).includes(needle) && !hits[c.id]) return false;
      }
      return true;
    },
    [city, status, quick, vacancyFilter, q, hits, anon],
  );

  const sorter = useCallback(
    (list: CandidateListItem[]) => {
      const surname = (n: string) => norm(n.split(' ').slice(-1)[0]);
      return [...list].sort((a, b) => {
        if (sort === 'old') return a.receivedAt.localeCompare(b.receivedAt);
        if (sort === 'name' && !anon) return surname(a.name).localeCompare(surname(b.name), 'pl');
        return b.receivedAt.localeCompare(a.receivedAt);
      });
    },
    [sort, anon],
  );

  const visible = useMemo(() => sorter(items.filter((c) => matches(c))), [items, matches, sorter]);
  const boardItems = useMemo(() => sorter(items.filter((c) => matches(c, { status: 'all' }))), [items, matches, sorter]);

  // on wide screens the list view always shows a profile
  useEffect(() => {
    if (!loaded || narrow || view !== 'list') return;
    if (!selId && visible.length) setSelId(visible[0].id);
  }, [loaded, narrow, view, selId, visible]);

  const cityTabs = useMemo(() => {
    const names: string[] = [...CITIES];
    if (items.some((c) => c.city === UNASSIGNED_CITY)) names.push(UNASSIGNED_CITY);
    return names;
  }, [items]);

  const canEdit = !!session?.canEdit;
  const canConfigure = !!session?.canConfigure;

  // the settings screen belongs to the administrator
  useEffect(() => {
    if (session && view === 'admin' && !session.canConfigure) setView('list');
  }, [session, view]);

  const applyDetail = (d: CandidateDetail) => {
    setDetail(d);
    setItems((prev) => prev.map((c) => (c.id === d.id ? { ...c, ...d } : c)));
  };

  const patchById = async (id: string, body: Record<string, unknown>, message?: string) => {
    try {
      const data = await api<{ candidate: CandidateDetail }>(`/api/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.candidate } : c)));
      if (id === selId) setDetail(data.candidate);
      if (message) say(message);
      return true;
    } catch (e) {
      say((e as Error).message);
      return false;
    }
  };

  const patch = async (body: Record<string, unknown>, message?: string) => {
    if (selId) await patchById(selId, body, message);
  };

  const moveCandidate = async (id: string, next: StatusId) => {
    const before = items;
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, status: next } : c)));
    const ok = await patchById(id, { status: next }, `Status zmieniony na „${statusLabel(next)}”`);
    if (!ok) setItems(before);
  };

  const postDetail = async (path: string, body: unknown) => {
    if (!selId) return null;
    try {
      const data = await api<{ candidate: CandidateDetail; delivery?: string }>(`/api/candidates/${selId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      applyDetail(data.candidate);
      return data;
    } catch (e) {
      say((e as Error).message);
      return null;
    }
  };

  const addNote = async (text: string) => {
    const ok = await postDetail('notes', { text });
    if (ok) say(canEdit ? 'Dodano notatkę' : 'Dodano komentarz');
    return !!ok;
  };

  const addFeedback = async (f: FeedbackInput) => {
    const ok = await postDetail('feedback', f);
    if (ok) say('Dodano opinię z rozmowy');
    return !!ok;
  };

  const sendEmail = async (template: EmailTemplate) => {
    const data = await postDetail('emails', { template });
    if (!data) return;
    say(
      data.delivery === 'sent'
        ? 'Wiadomość została wysłana'
        : data.delivery === 'simulated'
          ? 'Wiadomość zapisana (symulacja: SMTP nie jest skonfigurowany)'
          : 'Nie udało się wysłać wiadomości',
    );
  };

  const attachCv = async (file: File) => {
    if (!selId) return false;
    const form = new FormData();
    form.append('file', file);
    try {
      const data = await api<{ candidate: CandidateDetail; changes: string[] }>(`/api/candidates/${selId}/cv`, { method: 'POST', body: form });
      applyDetail(data.candidate);
      say(data.changes.length ? `CV dołączone: ${data.changes.join(', ')}` : 'CV dołączone');
      return true;
    } catch (e) {
      say((e as Error).message);
      return false;
    }
  };

  const remove = async () => {
    if (!selId) return;
    try {
      await api(`/api/candidates/${selId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((c) => c.id !== selId));
      setDetail(null);
      setSelId(null);
      say('Profil kandydata został usunięty (wpis pozostaje w dzienniku zdarzeń)');
    } catch (e) {
      say((e as Error).message);
    }
  };

  const merge = async () => {
    if (!selId) return;
    try {
      const res = await api<{ targetId: string }>(`/api/candidates/${selId}/merge`, { method: 'POST' });
      setItems((prev) => prev.filter((c) => c.id !== selId));
      setDetail(null);
      setSelId(res.targetId);
      say('Zgłoszenia połączono: notatki i korespondencja trafiły do wcześniejszego profilu');
      await loadList();
    } catch (e) {
      say((e as Error).message);
    }
  };

  const reloadAll = async () => {
    await Promise.all([loadList(), loadVacancies()]);
    if (view === 'summary') await loadStats();
  };

  const runBulk = async (action: 'reject-and-thank' | 'thank-rejected' | 'delete-expired', ids?: string[]) => {
    try {
      const res = await api<{ done: number }>('/api/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      setPicked(new Set());
      setBulkConfirm(false);
      await reloadAll();
      if (selId) {
        api<{ candidate: CandidateDetail }>(`/api/candidates/${selId}`).then((d) => setDetail(d.candidate)).catch(() => setSelId(null));
      }
      say(`Gotowe: ${res.done} ${res.done === 1 ? 'zgłoszenie' : 'zgłoszeń'}`);
    } catch (e) {
      say((e as Error).message);
    }
  };

  const createVacancy = async (position: string, cityName: string) => {
    try {
      await api('/api/vacancies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position, city: cityName }),
      });
      await loadVacancies();
      say('Dodano ogłoszenie');
      return true;
    } catch (e) {
      say((e as Error).message);
      return false;
    }
  };

  const toggleVacancy = async (id: string, next: 'open' | 'closed') => {
    try {
      await api(`/api/vacancies/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      await loadVacancies();
      say(next === 'closed' ? 'Ogłoszenie zamknięte' : 'Ogłoszenie otwarte ponownie');
    } catch (e) {
      say((e as Error).message);
    }
  };

  const resetDemo = async () => {
    try {
      await api('/api/demo/reset', { method: 'POST' });
      setSelId(null);
      setDetail(null);
      setPicked(new Set());
      setCity(session?.city ?? 'all');
      setStatus('all');
      setQuick(null);
      setVacancyFilter(null);
      setQ('');
      await reloadAll();
      say('Przywrócono dane demonstracyjne');
    } catch (e) {
      say((e as Error).message);
    }
  };

  const onCreated = async (id: string, needsReview: boolean) => {
    setModal(null);
    setCity('all');
    setStatus('all');
    setQuick(null);
    setVacancyFilter(null);
    setQ('');
    setView('list');
    await reloadAll();
    setSelId(id);
    say(needsReview ? 'Utworzono profil. Część danych wymaga sprawdzenia.' : 'Utworzono profil kandydata');
  };

  const changeRole = async (id: string) => {
    try {
      const data = await api<{ session: Session }>('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account: id }),
      });
      setSession(data.session);
      setCity(data.session.city ?? 'all');
      setStatus('all');
      setQuick(null);
      setVacancyFilter(null);
      setQ('');
      setSelId(null);
      setDetail(null);
      setPicked(new Set());
      await reloadAll();
    } catch (e) {
      say((e as Error).message);
    }
  };

  const signOut = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* the sign-in page opens either way */
    }
    window.location.href = '/login';
  };

  const clearFilters = () => {
    setCity(session?.city ?? 'all');
    setStatus('all');
    setQuick(null);
    setVacancyFilter(null);
    setQ('');
  };

  const go = (v: View) => {
    setView(v);
    if (v !== 'list') setSelId(null);
  };

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setBulkConfirm(false);
      return next;
    });

  const total = items.length;
  const countFor = (o: { city?: string; status?: string }) => items.filter((c) => matches(c, o)).length;
  const pickedRejectable = [...picked].filter((id) => items.find((c) => c.id === id && c.status !== 'rejected'));
  const vacancyLabel = vacancyFilter ? vacancies?.find((v) => v.id === vacancyFilter) : null;

  const guideSteps: GuideStep[] = [
    { title: 'Pulpit', text: 'Liczby, rozkład według miast, najbliższe rozmowy i lista spraw wymagających uwagi.', cta: 'Pokaż', run: () => go('summary') },
    { title: 'Tablica', text: 'Przeciągnij kartę kandydata do innej kolumny, aby zmienić status.', cta: 'Pokaż', run: () => go('board') },
    { title: 'Kalendarz rozmów', text: 'Tygodniowy widok rozmów kwalifikacyjnych. Zaproszenie ma załączony plik .ics.', cta: 'Pokaż', run: () => go('calendar') },
    { title: 'Ogłoszenia i baza kandydatów', text: 'Zgłoszenia przypisane do ogłoszeń. Kandydaci ze zgodą na przyszłe rekrutacje trafiają do bazy.', cta: 'Pokaż', run: () => go('vacancies') },
    { title: 'Szukanie w treści CV', text: 'Wpisz „chromatografia”: znajdziesz kandydatów po umiejętności zapisanej w CV.', cta: 'Wypróbuj', run: () => { go('list'); setQ('chromatografia'); } },
    { title: 'Zgłoszenie z e-maila (.eml)', text: 'Wczytaj przykładową wiadomość: system tworzy profil i zapisuje potwierdzenie.', cta: 'Otwórz', run: () => setModal('new') },
    { title: 'Brakujące dane', text: 'Wiadomość bez CV albo bez miasta: system sam prosi kandydata o uzupełnienie. Odpowiedź dopełnia ten sam profil.', cta: 'Otwórz', run: () => setModal('new') },
    { title: 'Widok kierownika oddziału', text: 'Kierownik widzi tylko swoje miasto i może dodać opinię po rozmowie.', cta: 'Przełącz', run: () => { void changeRole('mgr:Kraków'); } },
    { title: 'Administracja (konto administratora)', text: 'Role i uprawnienia, treść wiadomości do kandydatów, okresy przechowywania danych i integracje.', cta: 'Przełącz', run: () => { void changeRole('admin').then(() => go('admin')); } },
    { title: 'Tryb anonimowy', text: 'Ukrywa imiona, e-maile i podgląd CV, żeby oceniać bez uprzedzeń.', cta: 'Włącz', run: () => { toggleAnon(true); go('list'); } },
  ];

  const detailEl =
    detail && session ? (
      <Detail
        key={detail.id}
        c={detail}
        session={session}
        anon={anon}
        vacancies={vacancies ?? []}
        onBack={() => setSelId(null)}
        onClose={view !== 'list' ? () => setSelId(null) : undefined}
        onPatch={patch}
        onNote={addNote}
        onFeedback={addFeedback}
        onSendEmail={sendEmail}
        onAttachCv={attachCv}
        onDelete={remove}
        onMerge={merge}
        onOpen={(id) => setSelId(id)}
      />
    ) : selId ? (
      <div className="loading">Wczytywanie profilu…</div>
    ) : null;

  const drawerOpen = (view === 'board' || view === 'calendar') && selId !== null;
  const overlayOpen = modal !== null || settingsOpen;
  useEffect(() => {
    if (!drawerOpen || overlayOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelId(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, overlayOpen]);
  const showFilters = view === 'list' || view === 'board' || view === 'calendar';

  const countLabel = `${visible.length} z ${total}`;
  const subtitle =
    view === 'admin'
      ? 'Role, wiadomości do kandydatów, okresy przechowywania i integracje'
      : view === 'summary'
      ? 'Przegląd rekrutacji i spraw wymagających uwagi'
      : view === 'vacancies'
        ? 'Ogłoszenia i liczba zgłoszeń w każdym z nich'
        : view === 'calendar'
          ? 'Rozmowy kwalifikacyjne w ujęciu tygodniowym'
          : '';
  const openFromMenu = (m: ModalKind) => {
    setSettingsOpen(false);
    setModal(m);
  };

  return (
    <div className={`shell${view === 'list' && selId !== null ? ' show-detail' : ''}`}>
      <aside className="side">
        <div className="brand">
          {/* logo from seka.pl, 107x70 px */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/seka-logo.png" alt="SEKA" width={52} height={34} />
        </div>
        <nav className="nav" aria-label="Widoki">
          {(Object.keys(VIEW_LABEL) as View[]).filter((v) => v !== 'admin' || canConfigure).map((v) => (
            <button
              key={v}
              className="nav-item"
              type="button"
              title={VIEW_TITLE[v]}
              aria-current={view === v ? 'page' : undefined}
              onClick={() => go(v)}
            >
              <Icon name={VIEW_ICON[v]} size={21} />
              <span>{VIEW_LABEL[v]}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="titles">
            <p className="eyebrow">Panel rekrutacji · wersja demonstracyjna</p>
            <h1>
              {VIEW_TITLE[view]}
              {showFilters ? <small>{countLabel}</small> : <small>{subtitle}</small>}
            </h1>
          </div>
          <div className="top-tools">
            {showFilters && (
              <>
                <div className="search">
                  <Icon name="search" size={16} />
                  <input
                    id="q"
                    type="search"
                    placeholder={anon ? 'Szukaj: stanowisko, miasto, treść CV' : 'Szukaj: nazwisko, stanowisko, e-mail, treść CV'}
                    aria-label="Szukaj zgłoszeń"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <select id="sort" aria-label="Sortowanie" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="new">Najnowsze</option>
                  <option value="old">Najstarsze</option>
                  <option value="name" disabled={anon}>Nazwisko A–Z</option>
                </select>
              </>
            )}
            {canEdit && (
              <button className="btn primary" type="button" onClick={() => setModal('new')}>
                <Icon name="plus" size={16} />
                <span className="long">Nowe zgłoszenie</span>
                <span className="short">Nowe</span>
              </button>
            )}
            <div className="usermenu">
              <button
                className="user-chip"
                type="button"
                aria-expanded={settingsOpen}
                aria-controls="user-menu"
                aria-label={`${session?.name ?? 'Użytkownik'}: widok i ustawienia`}
                onClick={() => setSettingsOpen((o) => !o)}
              >
                <span className="avatar sm" aria-hidden="true">{session ? ROLE_INITIALS[session.role] : '…'}</span>
                <span className="user-text">
                  <strong>{session?.name ?? 'Wczytywanie…'}</strong>
                  <small>Widok i ustawienia</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
              {settingsOpen && (
                <div className="menu-pop" id="user-menu" role="group" aria-label="Widok i ustawienia">
                  <div className="side-block">
                    <span className="side-label">Zalogowano jako</span>
                    <div className="whoami">
                      <strong>{session?.name}</strong>
                      <small>{session?.email} · {session ? ROLE_LABEL[session.role] : ''}</small>
                    </div>
                    {authMode === 'demo' && roles.length > 0 && (
                      <>
                        <label className="side-label" htmlFor="role">Przełącz konto (demo)</label>
                        <select id="role" value={session?.id ?? ''} onChange={(e) => changeRole(e.target.value)}>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                  <label className="switch" htmlFor="anon">
                    <input id="anon" type="checkbox" checked={anon} onChange={(e) => toggleAnon(e.target.checked)} />
                    <span>Tryb anonimowy</span>
                  </label>
                  <div className="side-block">
                    <span className="side-label">Motyw</span>
                    <div className="theme-seg" role="group" aria-label="Motyw">
                      {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
                        <button key={t} type="button" aria-pressed={theme === t} onClick={() => chooseTheme(t)}>
                          {THEME_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="side-block">
                    <span className="side-label">Rozmiar tekstu</span>
                    <div className="theme-seg" role="group" aria-label="Rozmiar tekstu">
                      {(['s', 'm', 'l'] as Size[]).map((z) => (
                        <button key={z} type="button" aria-pressed={size === z} onClick={() => chooseSize(z)}>
                          {SIZE_LABEL[z]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="side-links">
                    <button className="side-link" type="button" onClick={() => openFromMenu('guide')}>
                      <Icon name="book" size={16} />Przewodnik po demo
                    </button>
                    {canEdit && (
                      <button className="side-link" type="button" onClick={() => openFromMenu('audit')}>
                        <Icon name="history" size={16} />Dziennik zdarzeń
                      </button>
                    )}
                    <button className="side-link" type="button" onClick={() => openFromMenu('issues')}>
                      <Icon name="help" size={16} />Do omówienia
                    </button>
                    {canEdit && !anon && (
                      <a className="side-link" href="/api/export">
                        <Icon name="download" size={16} />Eksport CSV
                      </a>
                    )}
                    <button className="side-link" type="button" onClick={signOut}>
                      <Icon name="logout" size={16} />Wyloguj
                    </button>
                  </div>
                  <div className="side-foot">Dane fikcyjne · wersja {process.env.NEXT_PUBLIC_APP_VERSION}</div>
                </div>
              )}
            </div>
          </div>
        </header>

        {((session && !canEdit) || anon || error) && (
          <section className="notices" aria-label="Komunikaty">
            {session && !canEdit && (
              <div className="notice">
                Widok kierownika oddziału: widzisz tylko zgłoszenia z miasta {session.city}. Możesz przeglądać profile,
                dodawać komentarze i opinie po rozmowach. Zakres uprawnień jest do ustalenia.
              </div>
            )}
            {anon && (
              <div className="notice">
                Tryb anonimowy jest włączony: imiona, e-maile i podgląd CV są ukryte. To widok pomocniczy, dokument CV
                nadal zawiera dane osobowe.
              </div>
            )}
            {error && <div className="notice">Nie udało się wczytać danych: {error}</div>}
          </section>
        )}

        {showFilters && (
          <section className="subbar" aria-label="Filtry zgłoszeń">
            {session?.city ? (
              <div className="branch-label">
                Oddział: {session.city}
                <span>{total} zgłoszeń łącznie</span>
              </div>
            ) : (
              <nav className="tabs" role="tablist" aria-label="Miasto">
                {['all', ...cityTabs].map((c) => (
                  <button key={c} className="tab" role="tab" type="button" aria-selected={city === c} onClick={() => setCity(c)}>
                    {c === 'all' ? 'Wszystkie miasta' : c}
                    <span className="n">{countFor({ city: c })}</span>
                  </button>
                ))}
              </nav>
            )}
            <div className="quick">
              <button
                className="qchip"
                type="button"
                aria-pressed={quick === 'pool'}
                title="Kandydaci, którzy wyrazili zgodę na udział w przyszłych rekrutacjach"
                onClick={() => setQuick(quick === 'pool' ? null : 'pool')}
              >
                Baza kandydatów
              </button>
              {quick && quick !== 'pool' && (
                <button className="qchip" type="button" aria-pressed="true" onClick={() => setQuick(null)}>
                  {QUICK_LABEL[quick]} ✕
                </button>
              )}
              {vacancyFilter && (
                <button className="qchip" type="button" aria-pressed="true" onClick={() => setVacancyFilter(null)}>
                  Ogłoszenie: {vacancyLabel ? `${vacancyLabel.position} (${vacancyLabel.city})` : '…'} ✕
                </button>
              )}
            </div>
          </section>
        )}

        <main className={`content${view === 'list' ? ' fill' : ''}`}>
          {view === 'list' && (
            <div className="layout">
              <section className="list-pane" aria-label="Lista zgłoszeń">
                <div className="list-head">
                  <select id="status" aria-label="Status zgłoszenia" value={status} onChange={(e) => setStatus(e.target.value as 'all' | StatusId)}>
                    <option value="all">Wszystkie statusy ({countFor({ status: 'all' })})</option>
                    {STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label} ({countFor({ status: s.id })})</option>
                    ))}
                  </select>
                  <span className="count">{countLabel}</span>
                  {canEdit && visible.length > 0 && (
                    <button className="link count" type="button" onClick={() => setPicked(new Set(visible.map((c) => c.id)))}>
                      zaznacz widoczne
                    </button>
                  )}
                </div>

                {canEdit && picked.size > 0 && (
                  <div className="bulkbar" role="region" aria-label="Operacje zbiorcze">
                    <span>Zaznaczono: <strong>{picked.size}</strong></span>
                    {!bulkConfirm ? (
                      <>
                        <button className="btn small danger" type="button" disabled={!pickedRejectable.length} onClick={() => setBulkConfirm(true)}>
                          Odrzuć i wyślij podziękowanie
                        </button>
                        <button className="btn small" type="button" onClick={() => setPicked(new Set())}>Wyczyść zaznaczenie</button>
                      </>
                    ) : (
                      <>
                        <span>Odrzucić {pickedRejectable.length} zgłoszeń i wysłać każdemu podziękowanie?</span>
                        <button className="btn small danger" type="button" onClick={() => runBulk('reject-and-thank', pickedRejectable)}>Tak, wykonaj</button>
                        <button className="btn small" type="button" onClick={() => setBulkConfirm(false)}>Anuluj</button>
                      </>
                    )}
                  </div>
                )}

                <ul className="list">
                  {!loaded && <li><div className="loading">Wczytywanie zgłoszeń…</div></li>}
                  {loaded && visible.length === 0 && (
                    <li>
                      <div className="empty">
                        <p>Brak zgłoszeń dla wybranych filtrów.</p>
                        <button className="btn small" type="button" onClick={clearFilters}>Wyczyść filtry</button>
                      </div>
                    </li>
                  )}
                  {visible.map((c) => (
                    <li key={c.id} className="row-wrap">
                      {canEdit && (
                        <input
                          className="pick"
                          type="checkbox"
                          aria-label={`Zaznacz: ${displayName(c, anon)}`}
                          checked={picked.has(c.id)}
                          onChange={() => togglePick(c.id)}
                        />
                      )}
                      <button
                        className="row"
                        type="button"
                        aria-current={c.id === selId ? 'true' : undefined}
                        onClick={() => {
                          setSelId(c.id);
                          if (narrow) window.scrollTo(0, 0);
                        }}
                      >
                        <Avatar id={c.id} name={c.name} anon={anon} />
                        <span className="row-name">{displayName(c, anon)}</span>
                        <Chip status={c.status} />
                        <span className="row-meta" title={`${c.position} · ${c.city}`}>{c.position} · {c.city}</span>
                        <span className="row-date">{rel(c.receivedAt)}</span>
                        {hits[c.id] && !anon && <span className="row-snippet">{hits[c.id]}</span>}
                        {(c.needsReview || c.missing.length > 0 || c.duplicateOf || c.retentionDue || (c.status === 'interview' && c.interviewAt)) && (
                          <span className="row-badges">
                            {c.missing.length > 0 && <span className="badge">{c.infoRequestedAt ? 'Czeka na uzupełnienie' : 'Brakuje danych'}</span>}
                            {c.needsReview && <span className="badge">Do sprawdzenia</span>}
                            {c.duplicateOf && <span className="badge">Możliwy duplikat</span>}
                            {c.retentionDue && <span className="badge">Minął okres przechowywania</span>}
                            {c.status === 'interview' && c.interviewAt && (
                              <span className="badge info">Rozmowa: {fmtInterview(c.interviewAt)}</span>
                            )}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="detail-pane" aria-label="Profil kandydata" ref={detailRef}>
                {detailEl ?? <div className="empty"><p>Wybierz zgłoszenie z listy, aby zobaczyć profil kandydata.</p></div>}
              </section>
            </div>
          )}

          {view === 'board' && <Board items={boardItems} canEdit={canEdit} anon={anon} onOpen={setSelId} onMove={moveCandidate} />}
          {view === 'calendar' && <Calendar items={boardItems} anon={anon} onOpen={setSelId} />}

          {view === 'vacancies' && (
            <Vacancies
              vacancies={vacancies}
              canEdit={canEdit}
              onCreate={createVacancy}
              onToggle={toggleVacancy}
              onShow={(id) => {
                setVacancyFilter(id);
                setStatus('all');
                setQuick(null);
                setCity(session?.city ?? 'all');
                setView('list');
                setSelId(null);
              }}
            />
          )}

          {view === 'summary' && (
            <Summary
              stats={stats}
              canEdit={canEdit}
              anon={anon}
              onVacancies={() => go('vacancies')}
              onOpenCandidate={(id) => {
                setView('list');
                setSelId(id);
              }}
              onCity={(c) => {
                setCity(session?.city ? session.city : c);
                setStatus('all');
                setQuick(null);
                setVacancyFilter(null);
                setView('list');
              }}
              onQuick={(f) => {
                setQuick(f);
                setStatus('all');
                setVacancyFilter(null);
                setCity(session?.city ?? 'all');
                setView('list');
              }}
              onBulk={(action) => runBulk(action)}
            />
          )}

          {view === 'admin' && canConfigure && (
            <Admin
              onSaved={say}
              onRetentionChanged={() => {
                void reloadAll();
              }}
            />
          )}
        </main>
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && setSelId(null)}>
          <aside className="drawer" aria-label="Profil kandydata">
            {detailEl}
          </aside>
        </div>
      )}

      {modal === 'new' && <NewModal onClose={() => setModal(null)} onCreated={onCreated} />}
      {modal === 'issues' && <IssuesModal onClose={() => setModal(null)} />}
      {modal === 'audit' && <AuditModal onClose={() => setModal(null)} />}
      {modal === 'guide' && <GuideModal steps={guideSteps} canReset={session?.role === 'admin'} onClose={() => setModal(null)} onReset={resetDemo} />}
      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
