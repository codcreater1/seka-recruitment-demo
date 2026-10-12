'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, fmtDate } from './ui';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Overlay({ onClose, wide, label, children }: { onClose: () => void; wide?: boolean; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () => [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
    (focusable()[0] ?? box.current)?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!box.current?.contains(at)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', on);
    return () => {
      document.removeEventListener('keydown', on);
      // give the focus back to the control that opened the dialog (if it is still on the page)
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

type Sample = { name: string; file: string; kind: 'text' | 'scan' | 'eml'; subject: string };

export function NewModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, needsReview: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [subject, setSubject] = useState('');
  const [samples, setSamples] = useState<Sample[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ samples: Sample[] }>('/api/demo/samples').then((d) => setSamples(d.samples)).catch(() => undefined);
  }, []);

  const send = async (run: () => Promise<{ id: string; needsReview: boolean }>) => {
    setBusy(true);
    setError('');
    try {
      const res = await run();
      onCreated(res.id, res.needsReview);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const upload = (file: File) =>
    send(() => {
      const form = new FormData();
      form.append('file', file);
      if (subject.trim()) form.append('subject', subject.trim());
      return api('/api/candidates', { method: 'POST', body: form });
    });

  const simulate = (file: string) =>
    send(() =>
      api('/api/demo/samples', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file }),
      }),
    );

  return (
    <Overlay onClose={onClose} label="Nowe zgłoszenie">
      <h2>Nowe zgłoszenie</h2>
      <p className="lead">
        Wgraj CV w formacie PDF albo zapisaną wiadomość e-mail (.eml) z załączonym CV. System odczyta dane i utworzy
        profil kandydata.
      </p>

      <div className="form field-note">
        <div className="field">
          <label htmlFor="subject">Temat wiadomości (opcjonalnie)</label>
          <input
            id="subject"
            value={subject}
            placeholder="np. Aplikacja na stanowisko: Technik laboratoryjny (Kraków)"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      </div>

      <label
        className={`drop${over ? ' over' : ''}`}
        htmlFor="file"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
      >
        <strong>{busy ? 'Odczytuję plik…' : 'Przeciągnij plik PDF lub .eml tutaj'}</strong>
        <span className="hint">lub kliknij, aby wybrać z dysku (do 10 MB)</span>
      </label>
      <input
        ref={input}
        id="file"
        type="file"
        accept="application/pdf,.pdf,.eml,message/rfc822"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      {error && <p className="err" style={{ marginTop: '0.5rem' }}>{error}</p>}

      {samples.length > 0 && (
        <>
          <div className="or">albo symuluj przychodzącą wiadomość z gotowym CV</div>
          <div className="samples">
            {samples.map((s) => (
              <button key={s.file} className="btn sample" type="button" disabled={busy} onClick={() => simulate(s.file)}>
                <span>{s.name}</span>
                <small>{s.kind === 'scan' ? 'skan bez warstwy tekstowej' : s.kind === 'eml' ? 'wiadomość .eml z załącznikiem PDF' : s.subject}</small>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose}>Anuluj</button>
      </div>
    </Overlay>
  );
}

export function IssuesModal({ onClose }: { onClose: () => void }) {
  const items: [string, string][] = [
    ['Skąd bierzemy miasto zgłoszenia?', 'Z ogłoszenia, tytułu wiadomości czy adresu kandydata? Przy każdym profilu widać, z czego miasto zostało ustalone. Gdy go nie da się ustalić, zgłoszenie trafia do „Do przypisania”.'],
    ['Jak wiadomości trafiają do systemu?', 'Przekierowanie z Power Automate (gotowy punkt /api/ingest), Microsoft Graph ograniczony do jednej skrzynki albo ręczne wgrywanie.'],
    ['Czy statusy odpowiadają procesowi HR?', 'Nowa, W weryfikacji, Rozmowa, Oferta, Zatrudniony/a, Odrzucona. Czy brakuje któregoś etapu?'],
    ['Co mogą kierownicy oddziałów?', 'W demo: tylko własne miasto, podgląd i komentarze. Czy mają też zmieniać statusy i oceniać kandydatów?'],
    ['RODO', 'Zgoda na przyszłe rekrutacje, okres przechowywania (w demo 6 miesięcy), usuwanie danych na żądanie, miejsce hostingu, umowa powierzenia.'],
    ['Automatyczne odpowiedzi', 'Potwierdzenie przyjęcia wychodzi po otrzymaniu wiadomości, podziękowanie po odrzuceniu. W demo wiadomości są tylko zapisywane (bez SMTP). Czy mają wychodzić z systemu, czy zostają w Power Automate?'],
    ['Ocena kandydatów', 'System nie ocenia ani nie szereguje kandydatów automatycznie (RODO, art. 22). Ocenę wpisuje osoba. Czy tak ma zostać?'],
    ['Duplikaty', 'Jak traktować kandydata, który aplikuje wielokrotnie lub na kilka miast? Demo oznacza powtórzony adres e-mail.'],
    ['Logowanie', 'Docelowo Microsoft Entra ID (SSO). W demo widok wybiera się z listy.'],
  ];
  return (
    <Overlay onClose={onClose} label="Kwestie do omówienia">
      <h2>Kwestie do omówienia</h2>
      <p className="lead">Założenia przyjęte w tej wersji demonstracyjnej. Każde warto potwierdzić.</p>
      <ol className="issues">
        {items.map(([t, d]) => (
          <li key={t}>
            <strong>{t}</strong>
            <span>{d}</span>
          </li>
        ))}
      </ol>
      <div className="modal-actions">
        <button className="btn primary" type="button" onClick={onClose}>Zamknij</button>
      </div>
    </Overlay>
  );
}

type AuditEntry = { id: number; at: string; actor: string; action: string; detail: string };

export function AuditModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ entries: AuditEntry[] }>('/api/audit')
      .then((d) => setEntries(d.entries))
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <Overlay onClose={onClose} label="Dziennik zdarzeń" wide>
      <h2>Dziennik zdarzeń</h2>
      <p className="lead">Ostatnie operacje na danych osobowych: przyjęcie zgłoszeń, eksporty i usunięcia.</p>
      {error && <p className="err">{error}</p>}
      {!entries && !error && <div className="loading">Wczytywanie…</div>}
      {entries && (
        // focusable so that the scrolling table can be reached and scrolled with the keyboard
        <div className="table-wrap" role="region" aria-label="Wpisy dziennika zdarzeń" tabIndex={0}>
          <table className="audit">
            <thead>
              <tr><th>Czas</th><th>Kto</th><th>Akcja</th><th>Szczegóły</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{fmtDate(e.at)}</td>
                  <td>{e.actor}</td>
                  <td>{e.action}</td>
                  <td>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn primary" type="button" onClick={onClose}>Zamknij</button>
      </div>
    </Overlay>
  );
}

export type GuideStep = { title: string; text: string; cta: string; run: () => void };

export function GuideModal({
  steps, canEdit, onClose, onReset,
}: {
  steps: GuideStep[];
  canEdit: boolean;
  onClose: () => void;
  onReset: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={onClose} label="Przewodnik po demo" wide>
      <h2>Przewodnik po demo</h2>
      <p className="lead">Kolejne kroki pokazują najważniejsze funkcje. Każdy przycisk przenosi do odpowiedniego miejsca.</p>
      <ol className="guide">
        {steps.map((st, i) => (
          <li key={st.title}>
            <div>
              <strong>{i + 1}. {st.title}</strong>
              <span>{st.text}</span>
            </div>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                onClose();
                st.run();
              }}
            >
              {st.cta}
            </button>
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="guide-reset">
          {!confirm ? (
            <button className="btn small" type="button" onClick={() => setConfirm(true)}>Przywróć dane demonstracyjne…</button>
          ) : (
            <>
              <span className="hint">Wszystkie zmiany i dodane zgłoszenia zostaną usunięte. Kontynuować?</span>
              <button
                className="btn small danger"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onReset();
                  setBusy(false);
                  onClose();
                }}
              >
                Tak, przywróć
              </button>
              <button className="btn small" type="button" onClick={() => setConfirm(false)}>Anuluj</button>
            </>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button className="btn primary" type="button" onClick={onClose}>Zamknij</button>
      </div>
    </Overlay>
  );
}
