'use client';

import { useState } from 'react';
import {
  CITIES,
  EMAIL_TEMPLATES,
  PIPELINE,
  POSITIONS,
  REJECTION_TEMPLATE,
  UNASSIGNED_CITY,
  UNKNOWN_POSITION,
  statusLabel,
  type CandidateDetail,
  type EmailTemplate,
  type Session,
  type StatusId,
} from '@/lib/domain';
import { fmtDate, fmtDay, fmtSize } from './ui';
import { Chip } from './Chip';

type Props = {
  c: CandidateDetail;
  session: Session;
  onBack: () => void;
  /** Present in the board drawer, where "back to list" makes no sense. */
  onClose?: () => void;
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<void>;
  onNote: (text: string) => Promise<boolean>;
  onSendEmail: (template: EmailTemplate) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpen: (id: string) => void;
};

const RODO_LABEL = ['Brak klauzuli w CV', 'Klauzula na czas rekrutacji', 'Klauzula także na przyszłe rekrutacje'];
const MAIL_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'wysłano', cls: 'ok' },
  simulated: { label: 'symulacja', cls: 'info' },
  failed: { label: 'błąd wysyłki', cls: 'bad' },
};

export default function Detail({ c, session, onBack, onClose, onPatch, onNote, onSendEmail, onDelete, onOpen }: Props) {
  const edit = session.canEdit;
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const idx = PIPELINE.indexOf(c.status);
  const cityOptions = [UNASSIGNED_CITY, ...CITIES];
  const positionOptions = [UNKNOWN_POSITION, ...POSITIONS];
  const p = c.profile;
  const hasProfile = p.skills.length > 0 || p.languages.length > 0 || p.experienceYears !== null || !!p.education;

  return (
    <>
      {onClose ? (
        <div className="close-row"><button className="btn small" type="button" onClick={onClose}>Zamknij</button></div>
      ) : (
        <button className="btn small back" type="button" onClick={onBack}>← Wróć do listy</button>
      )}

      <div className="d-head">
        <div>
          <h2>{c.name}</h2>
          <div className="d-sub">{c.position} · {c.city}</div>
        </div>
        <Chip status={c.status} />
      </div>

      {edit && c.needsReview && (
        <div className="banner">
          <span>System nie jest pewny odczytu (brak imienia, miasta lub stanowiska). Sprawdź dane poniżej i zatwierdź.</span>
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
              <p className="hint" style={{ marginTop: 8 }}>Podziękowanie zostało już wysłane (zobacz Korespondencja).</p>
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
          {edit && (
            <button
              className="btn small"
              type="button"
              disabled={!c.interviewAt}
              title={c.interviewAt ? undefined : 'Najpierw ustal termin rozmowy'}
              onClick={() => onSendEmail('invite')}
            >
              Wyślij zaproszenie
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Ocena jest wpisywana przez osobę. System nie ocenia ani nie szereguje kandydatów automatycznie.
        </p>
      </section>

      <section className="sec cols">
        <div>
          <h3>Dane kandydata</h3>
          <dl className="kv">
            <dt>E-mail</dt>
            <dd className="mono">{c.email || '—'}</dd>
            <dt>Telefon</dt>
            <dd className="mono">{c.phone || '—'}</dd>
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
            <dd className="mono">{c.from || '—'}</dd>
            <dt>Temat</dt>
            <dd>{c.subject || '—'}</dd>
            <dt>Odebrano</dt>
            <dd>{fmtDate(c.receivedAt)}</dd>
            <dt>Załącznik</dt>
            <dd className="mono">{c.file ? `${c.file.name} (${fmtSize(c.file.size)})` : 'brak'}</dd>
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
          <p className="hint" style={{ marginTop: 8 }}>Informacje odczytane automatycznie z dokumentu, mogą zawierać błędy.</p>
        </section>
      )}

      <section className="sec">
        <h3>Dokument CV</h3>
        {c.file ? (
          <>
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

      <section className="sec">
        <h3>Korespondencja</h3>
        {c.emails.length ? (
          <div>
            {[...c.emails].reverse().map((m) => {
              const st = MAIL_STATUS[m.status] || MAIL_STATUS.simulated;
              const label = EMAIL_TEMPLATES[m.template as EmailTemplate]?.label || m.subject;
              return (
                <details className="mail" key={m.id}>
                  <summary>
                    <strong>{label}</strong>
                    <span className="badge ok">{st.label}</span>
                    <span className="m-when">{fmtDate(m.at)}</span>
                  </summary>
                  <div className="hint" style={{ marginTop: 6 }}>Do: {m.to} · Temat: {m.subject} · Wysłał(a): {m.actor}</div>
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
  );
}
