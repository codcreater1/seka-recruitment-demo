'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CITIES,
  STATUSES,
  UNASSIGNED_CITY,
  norm,
  type CandidateDetail,
  type CandidateListItem,
  type EmailTemplate,
  type Session,
  type StatsDto,
  type StatusId,
} from '@/lib/domain';
import { api, fmtInterview, rel, useMedia } from './ui';
import Detail from './Detail';
import Board from './Board';
import Summary, { type QuickFilter } from './Summary';
import { Chip, STATUS_VAR } from './Chip';
import { AuditModal, IssuesModal, NewModal } from './Modals';

type RoleOption = { id: string; label: string };
type ModalKind = 'new' | 'issues' | 'audit' | null;
type View = 'list' | 'board' | 'summary';

const WEEK = 7 * 864e5;
const QUICK_LABEL: Record<Exclude<QuickFilter, null>, string> = {
  review: 'Do sprawdzenia',
  duplicates: 'Możliwe duplikaty',
  stale: 'Czekają ponad 7 dni',
  retention: 'Po terminie przechowywania',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [items, setItems] = useState<CandidateListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [city, setCity] = useState('all');
  const [status, setStatus] = useState<'all' | StatusId>('all');
  const [quick, setQuick] = useState<QuickFilter>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'old' | 'name'>('new');
  const [hits, setHits] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrow = useMedia('(max-width: 899px)');

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

  const loadSession = useCallback(async () => {
    const data = await api<{ session: Session; roles: RoleOption[] }>('/api/session');
    setSession(data.session);
    setRoles(data.roles);
    return data.session;
  }, []);

  useEffect(() => {
    loadSession()
      .then((s) => {
        if (s.city) setCity(s.city);
        return loadList();
      })
      .catch((e: Error) => setError(e.message));
  }, [loadSession, loadList]);

  useEffect(() => {
    if (view === 'summary') loadStats().catch((e: Error) => say(e.message));
  }, [view, loadStats, say]);

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
      api<{ results: { id: string; snippet: string }[] }>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((d) => alive && setHits(Object.fromEntries(d.results.map((r) => [r.id, r.snippet]))))
        .catch(() => alive && setHits({}));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const matches = useCallback(
    (c: CandidateListItem, o: { city?: string; status?: string } = {}) => {
      const cityV = o.city ?? city;
      const statusV = o.status ?? status;
      if (cityV !== 'all' && c.city !== cityV) return false;
      if (statusV !== 'all' && c.status !== statusV) return false;
      if (quick === 'review' && !c.needsReview) return false;
      if (quick === 'duplicates' && !c.duplicateOf) return false;
      if (quick === 'stale' && !(c.status === 'new' && Date.now() - Date.parse(c.receivedAt) > WEEK)) return false;
      if (quick === 'retention' && !c.retentionDue) return false;
      const needle = norm(q.trim());
      if (needle && !norm([c.name, c.position, c.email, c.city].join(' ')).includes(needle) && !hits[c.id]) return false;
      return true;
    },
    [city, status, quick, q, hits],
  );

  const sorter = useCallback(
    (list: CandidateListItem[]) => {
      const surname = (n: string) => norm(n.split(' ').slice(-1)[0]);
      return [...list].sort((a, b) => {
        if (sort === 'old') return a.receivedAt.localeCompare(b.receivedAt);
        if (sort === 'name') return surname(a.name).localeCompare(surname(b.name), 'pl');
        return b.receivedAt.localeCompare(a.receivedAt);
      });
    },
    [sort],
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
    const ok = await patchById(id, { status: next });
    if (!ok) setItems(before);
  };

  const addNote = async (text: string) => {
    if (!selId) return false;
    try {
      const data = await api<{ candidate: CandidateDetail }>(`/api/candidates/${selId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      applyDetail(data.candidate);
      say(canEdit ? 'Dodano notatkę' : 'Dodano komentarz');
      return true;
    } catch (e) {
      say((e as Error).message);
      return false;
    }
  };

  const sendEmail = async (template: EmailTemplate) => {
    if (!selId) return;
    try {
      const data = await api<{ candidate: CandidateDetail; delivery: string }>(`/api/candidates/${selId}/emails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      applyDetail(data.candidate);
      say(
        data.delivery === 'sent'
          ? 'Wiadomość została wysłana'
          : data.delivery === 'simulated'
            ? 'Wiadomość zapisana (symulacja: SMTP nie jest skonfigurowany)'
            : 'Nie udało się wysłać wiadomości',
      );
    } catch (e) {
      say((e as Error).message);
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

  const runBulk = async (action: 'reject-and-thank' | 'thank-rejected' | 'delete-expired', ids?: string[]) => {
    try {
      const res = await api<{ done: number }>('/api/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      setPicked(new Set());
      setBulkConfirm(false);
      await loadList();
      if (view === 'summary') await loadStats();
      if (selId) {
        api<{ candidate: CandidateDetail }>(`/api/candidates/${selId}`).then((d) => setDetail(d.candidate)).catch(() => setSelId(null));
      }
      say(`Gotowe: ${res.done} ${res.done === 1 ? 'zgłoszenie' : 'zgłoszeń'}`);
    } catch (e) {
      say((e as Error).message);
    }
  };

  const onCreated = async (id: string, needsReview: boolean) => {
    setModal(null);
    setCity('all');
    setStatus('all');
    setQuick(null);
    setQ('');
    setView('list');
    await loadList();
    setSelId(id);
    say(needsReview ? 'Utworzono profil. Część danych wymaga sprawdzenia.' : 'Utworzono profil kandydata');
  };

  const changeRole = async (id: string) => {
    try {
      const data = await api<{ session: Session }>('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: id }),
      });
      setSession(data.session);
      setCity(data.session.city ?? 'all');
      setStatus('all');
      setQuick(null);
      setQ('');
      setSelId(null);
      setDetail(null);
      setPicked(new Set());
      await loadList();
      if (view === 'summary') await loadStats();
    } catch (e) {
      say((e as Error).message);
    }
  };

  const clearFilters = () => {
    setCity(session?.city ?? 'all');
    setStatus('all');
    setQuick(null);
    setQ('');
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

  const detailEl =
    detail && session ? (
      <Detail
        key={detail.id}
        c={detail}
        session={session}
        onBack={() => setSelId(null)}
        onClose={view === 'board' ? () => setSelId(null) : undefined}
        onPatch={patch}
        onNote={addNote}
        onSendEmail={sendEmail}
        onDelete={remove}
        onOpen={(id) => setSelId(id)}
      />
    ) : selId ? (
      <div className="loading">Wczytywanie profilu…</div>
    ) : null;

  return (
    <div className={`app${view === 'list' && selId !== null ? ' show-detail' : ''}`}>
      <header className="top">
        <div className="brand">
          <div className="mark" aria-hidden="true">R</div>
          <div>
            <div className="brand-name">Panel rekrutacji</div>
            <div className="brand-sub">Wersja demonstracyjna · dane fikcyjne · bez logowania</div>
          </div>
        </div>
        <div className="top-actions">
          <label className="role" htmlFor="role">
            <span>Widok</span>
            <select id="role" value={session?.id ?? 'hr'} onChange={(e) => changeRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
          {canEdit && <button className="btn" type="button" onClick={() => setModal('audit')}>Dziennik zdarzeń</button>}
          <button className="btn" type="button" onClick={() => setModal('issues')}>Do omówienia</button>
          {canEdit && <button className="btn primary" type="button" onClick={() => setModal('new')}>Nowe zgłoszenie</button>}
        </div>
      </header>

      {session && !canEdit && (
        <div className="notice">
          Widok kierownika oddziału: widzisz tylko zgłoszenia z miasta {session.city}. Możesz przeglądać profile i
          dodawać komentarze. Zakres uprawnień jest do ustalenia.
        </div>
      )}
      {error && <div className="notice">Nie udało się wczytać danych: {error}</div>}

      <div className="viewbar">
        <div className="seg" role="group" aria-label="Widok danych">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Lista</button>
          <button type="button" aria-pressed={view === 'board'} onClick={() => { setView('board'); setSelId(null); }}>Tablica</button>
          <button type="button" aria-pressed={view === 'summary'} onClick={() => { setView('summary'); setSelId(null); }}>Podsumowanie</button>
        </div>
        {canEdit && (
          <div className="viewbar-actions">
            <a className="btn link-btn" href="/api/export">Eksport CSV</a>
          </div>
        )}
      </div>

      {view !== 'summary' && (
        <div className="toolbar">
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
          <div className="filters">
            <input
              id="q"
              type="search"
              placeholder="Szukaj: nazwisko, stanowisko, e-mail lub treść CV"
              aria-label="Szukaj zgłoszeń"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select id="sort" aria-label="Sortowanie" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="new">Najnowsze</option>
              <option value="old">Najstarsze</option>
              <option value="name">Nazwisko A–Z</option>
            </select>
          </div>
          {quick && (
            <div className="quick">
              <span className="hint">Filtr:</span>
              <button className="qchip" type="button" aria-pressed="true" onClick={() => setQuick(null)}>
                {QUICK_LABEL[quick]} ✕
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <main className="layout">
          <section className="list-pane" aria-label="Lista zgłoszeń">
            <div className="pills">
              <button className="pill" type="button" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>
                Wszystkie<span className="n">{countFor({ status: 'all' })}</span>
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  className="pill"
                  type="button"
                  aria-pressed={status === s.id}
                  style={{ ['--dot' as string]: `var(${STATUS_VAR[s.id]})` }}
                  onClick={() => setStatus(s.id)}
                >
                  <i />
                  {s.label}
                  <span className="n">{countFor({ status: s.id })}</span>
                </button>
              ))}
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

            <div className="count">
              Wyświetlono {visible.length} z {total}
              {canEdit && visible.length > 0 && (
                <>
                  {' · '}
                  <button className="link" type="button" onClick={() => setPicked(new Set(visible.map((c) => c.id)))}>
                    zaznacz widoczne
                  </button>
                </>
              )}
            </div>
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
                      aria-label={`Zaznacz: ${c.name}`}
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
                      window.scrollTo(0, 0);
                    }}
                  >
                    <span className="row-name">{c.name}</span>
                    <Chip status={c.status} />
                    <span className="row-meta">{c.position} · {c.city}</span>
                    <span className="row-date">{rel(c.receivedAt)}</span>
                    {hits[c.id] && <span className="row-snippet">{hits[c.id]}</span>}
                    {(c.needsReview || c.duplicateOf || c.retentionDue || (c.status === 'interview' && c.interviewAt)) && (
                      <span className="row-badges">
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

          <section className="detail-pane" aria-label="Profil kandydata">
            {detailEl ?? <div className="empty"><p>Wybierz zgłoszenie z listy, aby zobaczyć profil kandydata.</p></div>}
          </section>
        </main>
      )}

      {view === 'board' && (
        <>
          <Board items={boardItems} canEdit={canEdit} onOpen={setSelId} onMove={moveCandidate} />
          {selId && (
            <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && setSelId(null)}>
              <aside className="drawer" aria-label="Profil kandydata">
                {detailEl}
              </aside>
            </div>
          )}
        </>
      )}

      {view === 'summary' && (
        <Summary
          stats={stats}
          canEdit={canEdit}
          onOpenCandidate={(id) => {
            setView('list');
            setSelId(id);
          }}
          onCity={(c) => {
            setCity(session?.city ? session.city : c);
            setStatus('all');
            setQuick(null);
            setView('list');
          }}
          onQuick={(f) => {
            setQuick(f);
            setStatus('all');
            setCity(session?.city ?? 'all');
            setView('list');
          }}
          onBulk={(action) => runBulk(action)}
        />
      )}

      <footer className="foot">
        <span>Dane są fikcyjne. Dostęp i uprawnienia są w demo symulowane wyborem widoku.</span>
        <span>Wersja 0.3</span>
      </footer>

      {modal === 'new' && <NewModal onClose={() => setModal(null)} onCreated={onCreated} />}
      {modal === 'issues' && <IssuesModal onClose={() => setModal(null)} />}
      {modal === 'audit' && <AuditModal onClose={() => setModal(null)} />}
      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
