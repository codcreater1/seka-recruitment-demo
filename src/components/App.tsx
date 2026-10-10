'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CITIES,
  STATUSES,
  UNASSIGNED_CITY,
  norm,
  type CandidateDetail,
  type CandidateListItem,
  type Session,
  type StatusId,
} from '@/lib/domain';
import { api, fmtInterview, rel, useMedia } from './ui';
import Detail from './Detail';
import { Chip, STATUS_VAR } from './Chip';
import { AuditModal, IssuesModal, NewModal } from './Modals';

type RoleOption = { id: string; label: string };
type ModalKind = 'new' | 'issues' | 'audit' | null;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [items, setItems] = useState<CandidateListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [city, setCity] = useState('all');
  const [status, setStatus] = useState<'all' | StatusId>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'old' | 'name'>('new');
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrow = useMedia('(max-width: 899px)');

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const loadList = useCallback(async () => {
    const data = await api<{ candidates: CandidateListItem[] }>('/api/candidates');
    setItems(data.candidates);
    setLoaded(true);
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

  // load the open profile
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

  const visible = useMemo(() => {
    const needle = norm(q);
    const list = items.filter((c) => {
      if (city !== 'all' && c.city !== city) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (needle && !norm([c.name, c.position, c.email, c.city].join(' ')).includes(needle)) return false;
      return true;
    });
    const surname = (n: string) => norm(n.split(' ').slice(-1)[0]);
    return list.sort((a, b) => {
      if (sort === 'old') return a.receivedAt.localeCompare(b.receivedAt);
      if (sort === 'name') return surname(a.name).localeCompare(surname(b.name), 'pl');
      return b.receivedAt.localeCompare(a.receivedAt);
    });
  }, [items, city, status, q, sort]);

  // on wide screens always have a profile open
  useEffect(() => {
    if (!loaded || narrow) return;
    if (!selId && visible.length) setSelId(visible[0].id);
  }, [loaded, narrow, selId, visible]);

  const cityTabs = useMemo(() => {
    const present = new Set(items.map((c) => c.city));
    const names: string[] = [...CITIES];
    if (present.has(UNASSIGNED_CITY)) names.push(UNASSIGNED_CITY);
    return names;
  }, [items]);

  const countFor = (opts: { city?: string; status?: string }) => {
    const needle = norm(q);
    return items.filter((c) => {
      const cityV = opts.city ?? city;
      const statusV = opts.status ?? status;
      if (cityV !== 'all' && c.city !== cityV) return false;
      if (statusV !== 'all' && c.status !== statusV) return false;
      if (needle && !norm([c.name, c.position, c.email, c.city].join(' ')).includes(needle)) return false;
      return true;
    }).length;
  };

  const applyDetail = (d: CandidateDetail) => {
    setDetail(d);
    setItems((prev) => prev.map((c) => (c.id === d.id ? { ...c, ...d } : c)));
  };

  const patch = async (body: Record<string, unknown>, message?: string) => {
    if (!selId) return;
    try {
      const data = await api<{ candidate: CandidateDetail }>(`/api/candidates/${selId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      applyDetail(data.candidate);
      if (message) say(message);
    } catch (e) {
      say((e as Error).message);
    }
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
      say(session?.canEdit ? 'Dodano notatkę' : 'Dodano komentarz');
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

  const onCreated = async (id: string, needsReview: boolean) => {
    setModal(null);
    setCity('all');
    setStatus('all');
    setQ('');
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
      setQ('');
      setSelId(null);
      setDetail(null);
      await loadList();
    } catch (e) {
      say((e as Error).message);
    }
  };

  const clearFilters = () => {
    setCity(session?.city ?? 'all');
    setStatus('all');
    setQ('');
  };

  const total = items.length;
  const showDetail = selId !== null;

  return (
    <div className={`app${showDetail ? ' show-detail' : ''}`}>
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
          {session?.canEdit && (
            <button className="btn" type="button" onClick={() => setModal('audit')}>Dziennik zdarzeń</button>
          )}
          <button className="btn" type="button" onClick={() => setModal('issues')}>Do omówienia</button>
          {session?.canEdit && (
            <button className="btn primary" type="button" onClick={() => setModal('new')}>Nowe zgłoszenie</button>
          )}
        </div>
      </header>

      {session && !session.canEdit && (
        <div className="notice">
          Widok kierownika oddziału: widzisz tylko zgłoszenia z miasta {session.city}. Możesz przeglądać profile i
          dodawać komentarze. Zakres uprawnień jest do ustalenia.
        </div>
      )}
      {error && <div className="notice">Nie udało się wczytać danych: {error}</div>}

      <main className="layout">
        <section className="list-pane" aria-label="Lista zgłoszeń">
          {session?.city ? (
            <div className="branch-label">
              Oddział: {session.city}
              <span>{total} zgłoszeń łącznie</span>
            </div>
          ) : (
            <nav className="tabs" role="tablist" aria-label="Miasto">
              {['all', ...cityTabs].map((c) => (
                <button
                  key={c}
                  className="tab"
                  role="tab"
                  type="button"
                  aria-selected={city === c}
                  onClick={() => setCity(c)}
                >
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
              placeholder="Szukaj po nazwisku, stanowisku lub e-mailu"
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

          <div className="count">Wyświetlono {visible.length} z {total}</div>
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
              <li key={c.id}>
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
          {detail && session ? (
            <Detail
              key={detail.id}
              c={detail}
              session={session}
              onBack={() => setSelId(null)}
              onPatch={patch}
              onNote={addNote}
              onDelete={remove}
              onOpen={(id) => setSelId(id)}
            />
          ) : selId ? (
            <div className="loading">Wczytywanie profilu…</div>
          ) : (
            <div className="empty"><p>Wybierz zgłoszenie z listy, aby zobaczyć profil kandydata.</p></div>
          )}
        </section>
      </main>

      <footer className="foot">
        <span>Dane są fikcyjne. Dostęp i uprawnienia są w demo symulowane wyborem widoku.</span>
        <span>Wersja 0.2</span>
      </footer>

      {modal === 'new' && <NewModal onClose={() => setModal(null)} onCreated={onCreated} />}
      {modal === 'issues' && <IssuesModal onClose={() => setModal(null)} />}
      {modal === 'audit' && <AuditModal onClose={() => setModal(null)} />}
      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
