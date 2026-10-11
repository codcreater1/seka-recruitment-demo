'use client';

import { useState } from 'react';
import {
  CITIES,
  EMAIL_TEMPLATES,
  FEEDBACK_CRITERIA,
  PIPELINE,
  POSITIONS,
  RECOMMENDATIONS,
  REJECTION_TEMPLATE,
  UNASSIGNED_CITY,
  UNKNOWN_POSITION,
  statusLabel,
  type CandidateDetail,
  type EmailTemplate,
  type Recommendation,
  type Session,
  type StatusId,
  type VacancyDto,
} from '@/lib/domain';
import { displayName, fmtDate, fmtDay, fmtSize } from './ui';
import { Avatar, Chip } from './Chip';
import Icon from './Icon';

export type FeedbackInput = {
  communication: number;
  knowledge: number;
  fit: number;
  recommendation: Recommendation;
  comment: string;
};

type Props = {
  c: CandidateDetail;
  session: Session;
  anon: boolean;
  vacancies: VacancyDto[];
  onBack: () => void;
  /** Present in the drawer (board, calendar), where "back to list" makes no sense. */
  onClose?: () => void;
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<void>;
  onNote: (text: string) => Promise<boolean>;
  onFeedback: (f: FeedbackInput) => Promise<boolean>;
  onSendEmail: (template: EmailTemplate) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpen: (id: string) => void;
};

type Tab = 'overview' | 'cv' | 'opinions' | 'mail' | 'history';

const RODO_LABEL = ['Brak klauzuli w CV', 'Klauzula na czas rekrutacji', 'Klauzula także na przyszłe rekrutacje'];
const MAIL_STATUS: Record<string, string> = { sent: 'wysłano', simulated: 'symulacja', failed: 'błąd wysyłki' };
const HIDDEN = '— ukryte (tryb anonimowy)';

export default function Detail({
  c, session, anon, vacancies, onBack, onClose, onPatch, onNote, onFeedback, onSendEmail, onDelete, onOpen,
}: Props) {
  const edit = session.canEdit;
  const [tab, setTab] = useState<Tab>('overview');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fb, setFb] = useState<FeedbackInput>({ communication: 3, knowledge: 3, fit: 3, recommendation: 'warunkowo', comment: '' });
  const idx = PIPELINE.indexOf(c.status);
  const cityOptions = [UNASSIGNED_CITY, ...CITIES];
  const positionOptions = [UNKNOWN_POSITION, ...POSITIONS];
  const p = c.profile;
  const hasProfile = p.skills.length > 0 || p.languages.length > 0 || p.experienceYears !== null || !!p.education;
  const vacancyOptions = vacancies.filter((v) => v.status === 'open' || v.id === c.vacancyId);
  const cityOf = (v: VacancyDto) => `${v.position} (${v.city})${v.status === 'closed' ? ', zamknięte' : ''}`;

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'overview', label: 'Przegląd' },
    { id: 'cv', label: 'CV' },
    { id: 'opinions', label: 'Opinie i notatki', n: c.feedback.length + c.notes.length },
    { id: 'mail', label: 'Korespondencja', n: c.emails.length },
    { id: 'history', label: 'Historia' },
  ];

  return (
    <>
      {onClose ? (
        <div className="close-row"><button className="btn small" type="button" onClick={onClose}>Zamknij</button></div>
      ) : (
        <button className="btn small back" type="button" onClick={onBack}>← Wróć do listy</button>
      )}

      <div className="d-head">
        <div className="d-id">
          <Avatar id={c.id} name={c.name} anon={anon} large />
          <div>
            <h2>{displayName(c, anon)}</h2>
            <div className="d-sub">{c.position} · {c.city}</div>
            {(c.consentFuture || c.vacancy) && (
              <div className="badges">
                {c.consentFuture && <span className="badge ok">Baza kandydatów</span>}
                {c.vacancy && <span className="badge info">Ogłoszenie: {cityOf(c.vacancy)}</span>}
              </div>
            )}
          </div>
        </div>
        <Chip status={c.status} />
      </div>

      {edit && c.needsReview && (
        <div className="banner">
          <span>System nie jest pewny odczytu (brak imienia, miasta lub stanowiska). Sprawdź dane w zakładce Przegląd i zatwierdź.</span>
          <button className="btn small" type="button" onClick={() => onPatch({ confirmReview: true }, 'Dane zatwierdzone')}>
            Zatwierdź dane
          </button>
        </div>
      )}
      {c.duplicateOf && (
        <div className="banner">
          <span>Ten adres e-mail ma już profil w systemie.</span>
          <span className="inline-row">
            <button className="btn small" type="button" onClick={() => onOpen(c.duplicateOf as string)}>Pokaż poprzedni profil</button>
            {edit && (
              <button className="btn small" type="button" onClick={() => onPatch({ dismissDuplicate: true }, 'Oznaczono jako niebędące duplikatem')}>
                To nie duplikat
              </button>
            )}
          </span>
        </div>
      )}
      {c.retentionDue && (
        <div className="banner">
          <span>
            Minął okres przechowywania danych (do {fmtDay(c.retentionDate)}). Usuń profil albo uzyskaj zgodę kandydata
            na dalsze przetwarzanie.
          </span>
        </div>
      )}

      <div className="d-tabs" role="tablist" aria-label="Sekcje profilu">
        {tabs.map((t) => (
          <button
            key={t.id}
            className="d-tab"
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.n !== undefined && t.n > 0 && <span className="n">{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="d-grid">
        {tab === 'overview' && (
          <div className="ov">
            <div className="ov-col">
            <section className="sec">
              <h3>Status zgłoszenia</h3>
              <ol className="steps">
                {PIPELINE.map((id, i) => {
                  const cls = c.status === id ? 'current' : idx > -1 && i < idx ? 'done' : '';
                  return (
                    <li key={id}>
                      <button
                        className={`step ${cls}`}
                        type="button"
                        disabled={!edit}
                        aria-pressed={c.status === id}
                        onClick={() => onPatch({ status: id }, `Status zmieniony na „${statusLabel(id)}”`)}
                      >
                        {statusLabel(id)}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="status-actions">
                {edit ? (
                  c.status === 'rejected' ? (
                    <button className="btn small" type="button" onClick={() => onPatch({ status: 'screening' as StatusId }, 'Przywrócono do weryfikacji')}>
                      Przywróć do weryfikacji
                    </button>
                  ) : (
                    <button className="btn small danger" type="button" onClick={() => onPatch({ status: 'rejected' }, 'Zgłoszenie odrzucone')}>
                      Odrzuć zgłoszenie
                    </button>
                  )
                ) : (
                  <span className="hint">Zmiana statusu jest dostępna tylko dla HR (zakres uprawnień do ustalenia).</span>
                )}
              </div>
              {c.status === 'rejected' && (
                <div className="reply">
                  <p className="hint">Szablon odpowiedzi do kandydata</p>
                  <pre>{REJECTION_TEMPLATE(c.position)}</pre>
                  {c.rejectionSent ? (
                    <p className="hint" style={{ marginTop: '0.5rem' }}>Podziękowanie zostało już wysłane (zobacz Korespondencja).</p>
                  ) : (
                    edit && (
                      <div className="status-actions">
                        <button className="btn small primary" type="button" onClick={() => onSendEmail('rejection')}>
                          Wyślij podziękowanie
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>

            <section className="sec">
              <h3>Ocena i rozmowa</h3>
              <div className="inline-row">
                <span className="rating" role="group" aria-label="Ocena kandydata">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className={`star${c.rating !== null && n <= c.rating ? ' on' : ''}`}
                      type="button"
                      disabled={!edit}
                      aria-label={`Ocena ${n} z 5`}
                      onClick={() => onPatch({ rating: c.rating === n ? null : n })}
                    >
                      ★
                    </button>
                  ))}
                </span>
                <label className="inline-row" htmlFor="interview">
                  <span className="hint">Termin rozmowy</span>
                  <input
                    id="interview"
                    type="datetime-local"
                    disabled={!edit}
                    value={c.interviewAt ?? ''}
                    onChange={(e) => onPatch({ interviewAt: e.target.value || null })}
                  />
                </label>
              </div>
              <div className="inline-row" style={{ marginTop: '0.625rem' }}>
                {c.interviewAt && (
                  <a className="btn small link-btn" href={`/api/candidates/${c.id}/ics`}>Pobierz do kalendarza (.ics)</a>
                )}
                {edit && (
                  <button
                    className="btn small"
                    type="button"
                    disabled={!c.interviewAt}
                    title={c.interviewAt ? undefined : 'Najpierw ustal termin rozmowy'}
                    onClick={() => onSendEmail('invite')}
                  >
                    Wyślij zaproszenie (z plikiem .ics)
                  </button>
                )}
              </div>
              <p className="hint" style={{ marginTop: '0.625rem' }}>
                Ocena jest wpisywana przez osobę. System nie ocenia ani nie szereguje kandydatów automatycznie.
              </p>
            </section>

            </div>
            <div className="ov-col">
            <section className="sec cols">
              <div>
                <h3>Dane kandydata</h3>
                <dl className="kv">
                  <dt>E-mail</dt>
                  <dd className="mono">{anon ? HIDDEN : c.email || '—'}</dd>
                  <dt>Telefon</dt>
                  <dd className="mono">{anon ? HIDDEN : c.phone || '—'}</dd>
                  <dt>Miasto</dt>
                  <dd>
                    <select
                      aria-label="Miasto"
                      disabled={!edit}
                      value={c.city}
                      onChange={(e) => onPatch({ city: e.target.value }, 'Zapisano zmianę')}
                    >
                      {(cityOptions.includes(c.city) ? cityOptions : [c.city, ...cityOptions]).map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <span className="sub">ustalone z: {c.cityBasis || 'wpisano ręcznie'}</span>
                  </dd>
                  <dt>Stanowisko</dt>
                  <dd>
                    <select
                      aria-label="Stanowisko"
                      disabled={!edit}
                      value={c.position}
                      onChange={(e) => onPatch({ position: e.target.value }, 'Zapisano zmianę')}
                    >
                      {(positionOptions.includes(c.position) ? positionOptions : [c.position, ...positionOptions]).map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </dd>
                  <dt>Ogłoszenie</dt>
                  <dd>
                    <select
                      aria-label="Ogłoszenie"
                      disabled={!edit}
                      value={c.vacancyId ?? ''}
                      onChange={(e) => onPatch({ vacancyId: e.target.value || null }, 'Zapisano zmianę')}
                    >
                      <option value="">— brak —</option>
                      {vacancyOptions.map((v) => <option key={v.id} value={v.id}>{cityOf(v)}</option>)}
                    </select>
                  </dd>
                  <dt>Zgoda RODO</dt>
                  <dd>{c.rodo === 0 ? <span className="flag">{RODO_LABEL[0]}</span> : RODO_LABEL[c.rodo]}</dd>
                </dl>
              </div>
              <div>
                <h3>Źródło zgłoszenia</h3>
                <dl className="kv">
                  <dt>Kanał</dt>
                  <dd>{c.channel}</dd>
                  <dt>Nadawca</dt>
                  <dd className="mono">{anon ? HIDDEN : c.from || '—'}</dd>
                  <dt>Temat</dt>
                  <dd>{c.subject || '—'}</dd>
                  <dt>Odebrano</dt>
                  <dd>{fmtDate(c.receivedAt)}</dd>
                  <dt>Załącznik</dt>
                  <dd className="mono">
                    {c.file ? (
                      anon ? (
                        `CV.pdf (${fmtSize(c.file.size)})`
                      ) : (
                        <a className="link" href={`/api/candidates/${c.id}/file?download=1`} download>
                          {c.file.name}
                        </a>
                      )
                    ) : (
                      'brak'
                    )}
                    {c.file && !anon && ` (${fmtSize(c.file.size)})`}
                  </dd>
                </dl>
              </div>
            </section>

            {hasProfile && (
              <section className="sec">
                <h3>Odczytane z CV</h3>
                <dl className="facts">
                  {p.experienceYears !== null && (<><dt>Doświadczenie</dt><dd>około {p.experienceYears} {p.experienceYears === 1 ? 'rok' : p.experienceYears < 5 ? 'lata' : 'lat'}</dd></>)}
                  {p.education && (<><dt>Wykształcenie</dt><dd>{p.education}</dd></>)}
                  {p.languages.length > 0 && (<><dt>Języki</dt><dd>{p.languages.join(', ')}</dd></>)}
                </dl>
                {p.skills.length > 0 && (
                  <div className="chips">{p.skills.map((s) => <span className="skill" key={s}>{s}</span>)}</div>
                )}
                <p className="hint" style={{ marginTop: '0.625rem' }}>Informacje odczytane automatycznie z dokumentu, mogą zawierać błędy.</p>
              </section>
            )}
            </div>
          </div>
        )}

        {tab === 'cv' && (
          <section className="sec">
            <h3>Dokument CV</h3>
            {anon ? (
              <p className="hint">W trybie anonimowym podgląd dokumentu jest ukryty, ponieważ CV zawiera dane osobowe.</p>
            ) : c.file ? (
              <>
                <div className="cv-bar">
                  <a className="btn small primary link-btn" href={`/api/candidates/${c.id}/file?download=1`} download>
                    <Icon name="download" size={16} />
                    Pobierz CV (PDF)
                  </a>
                  <a className="btn small link-btn" href={`/api/candidates/${c.id}/file`} target="_blank" rel="noopener noreferrer">
                    Otwórz w nowej karcie
                  </a>
                  <span className="hint">{c.file.name} · {fmtSize(c.file.size)}</span>
                </div>
                <iframe className="pdf" title={`CV: ${c.name}`} src={`/api/candidates/${c.id}/file#toolbar=0&navpanes=0&view=FitH`} />
                <details className="raw">
                  <summary>Tekst odczytany z PDF</summary>
                  {c.rawText ? <pre>{c.rawText}</pre> : <pre>Dokument nie ma warstwy tekstowej (prawdopodobnie skan). Dane trzeba uzupełnić ręcznie.</pre>}
                </details>
              </>
            ) : (
              <p className="hint">Do tego zgłoszenia nie dołączono pliku PDF.</p>
            )}
          </section>
        )}

        {tab === 'opinions' && (
          <>
            <section className="sec">
              <h3>Opinie z rozmów</h3>
              {c.feedback.length ? (
                <ul className="notes">
                  {c.feedback.map((f) => (
                    <li key={f.id}>
                      <div className="note-by">{f.author} · {fmtDate(f.at)}</div>
                      <p>
                        <span className={`badge ${f.recommendation === 'tak' ? 'ok' : f.recommendation === 'nie' ? 'bad' : ''}`}>
                          {RECOMMENDATIONS.find((r) => r.id === f.recommendation)?.label}
                        </span>{' '}
                        {FEEDBACK_CRITERIA.map((k) => `${k.label} ${f[k.id]}/5`).join(' · ')}
                      </p>
                      {f.comment && <p>{f.comment}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Brak opinii z rozmów.</p>
              )}
              <form
                className="fb-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await onFeedback(fb)) setFb({ communication: 3, knowledge: 3, fit: 3, recommendation: 'warunkowo', comment: '' });
                }}
              >
                <div className="fb-grid">
                  {FEEDBACK_CRITERIA.map((k) => (
                    <label key={k.id} htmlFor={`fb-${k.id}`}>
                      <span className="hint">{k.label}</span>
                      <select
                        id={`fb-${k.id}`}
                        value={fb[k.id]}
                        onChange={(e) => setFb({ ...fb, [k.id]: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
                      </select>
                    </label>
                  ))}
                  <label htmlFor="fb-rec">
                    <span className="hint">Rekomendacja</span>
                    <select id="fb-rec" value={fb.recommendation} onChange={(e) => setFb({ ...fb, recommendation: e.target.value as Recommendation })}>
                      {RECOMMENDATIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </label>
                </div>
                <textarea
                  aria-label="Komentarz do opinii"
                  placeholder="Komentarz po rozmowie…"
                  value={fb.comment}
                  maxLength={2000}
                  onChange={(e) => setFb({ ...fb, comment: e.target.value })}
                />
                <button className="btn small primary" type="submit">Dodaj opinię</button>
              </form>
              <p className="hint" style={{ marginTop: '0.625rem' }}>
                Opinie są wpisywane przez osoby i nie są sumowane ani używane do automatycznego szeregowania kandydatów.
              </p>
            </section>

            <section className="sec">
              <h3>{edit ? 'Notatki HR' : 'Notatki i komentarze'}</h3>
              {c.notes.length ? (
                <ul className="notes">
                  {c.notes.map((n) => (
                    <li key={n.id}>
                      <div className="note-by">{n.author} · {fmtDate(n.createdAt)}</div>
                      <p>{n.text}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Brak notatek.</p>
              )}
              <form
                className="note-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  if (await onNote(note.trim())) setNote('');
                }}
              >
                <textarea
                  id="note"
                  aria-label="Nowa notatka"
                  placeholder={edit ? 'Dodaj notatkę…' : 'Dodaj komentarz do zgłoszenia…'}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button className="btn small primary" type="submit">{edit ? 'Dodaj notatkę' : 'Dodaj komentarz'}</button>
              </form>
            </section>
          </>
        )}

        {tab === 'mail' && (
          <section className="sec">
            <h3>Korespondencja</h3>
            {c.emails.length ? (
              <div>
                {[...c.emails].reverse().map((m) => {
                  const label = EMAIL_TEMPLATES[m.template as EmailTemplate]?.label || m.subject;
                  return (
                    <details className="mail" key={m.id}>
                      <summary>
                        <strong>{label}</strong>
                        <span className={`badge ${m.status === 'failed' ? 'bad' : m.status === 'sent' ? 'ok' : 'info'}`}>{MAIL_STATUS[m.status] || m.status}</span>
                        <span className="m-when">{fmtDate(m.at)}</span>
                      </summary>
                      <div className="hint" style={{ marginTop: '0.375rem' }}>
                        Do: {anon ? HIDDEN : m.to} · Temat: {m.subject} · Wysłał(a): {m.actor}
                        {m.attachment ? ` · Załącznik: ${m.attachment}` : ''}
                      </div>
                      {m.error && <div className="err">{m.error}</div>}
                      <pre>{m.body}</pre>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className="hint">Do tego kandydata nie wysłano jeszcze żadnych wiadomości.</p>
            )}
          </section>
        )}

        {tab === 'history' && (
          <>
            <section className="sec">
              <h3>Historia zgłoszenia</h3>
              <ol className="timeline">
                {[...c.events].reverse().map((ev) => (
                  <li key={ev.id}>
                    <time>{fmtDate(ev.at)}</time>
                    <span>{ev.text}</span>
                  </li>
                ))}
              </ol>
            </section>

            {edit && (
              <section className="sec">
                <h3>Dane osobowe (RODO)</h3>
                <div className="gdpr">
                  <a className="btn small link-btn" href={`/api/candidates/${c.id}/export`}>Eksportuj dane (JSON)</a>
                  {!confirmDelete ? (
                    <button className="btn small danger" type="button" onClick={() => setConfirmDelete(true)}>Usuń profil</button>
                  ) : (
                    <>
                      <span className="hint">Profil i plik CV zostaną usunięte bezpowrotnie.</span>
                      <button className="btn small danger" type="button" onClick={onDelete}>Potwierdź usunięcie</button>
                      <button className="btn small" type="button" onClick={() => setConfirmDelete(false)}>Anuluj</button>
                    </>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
