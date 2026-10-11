'use client';

import { useState } from 'react';
import { CITIES, POSITIONS, STATUSES, type VacancyDto } from '@/lib/domain';
import { STATUS_VAR } from './Chip';
import { fmtDay } from './ui';

type Props = {
  vacancies: VacancyDto[] | null;
  canEdit: boolean;
  onCreate: (position: string, city: string) => Promise<boolean>;
  onToggle: (id: string, status: 'open' | 'closed') => Promise<void>;
  onShow: (id: string) => void;
};

export default function Vacancies({ vacancies, canEdit, onCreate, onToggle, onShow }: Props) {
  const [position, setPosition] = useState<string>(POSITIONS[0]);
  const [city, setCity] = useState<string>(CITIES[0]);
  const [busy, setBusy] = useState(false);

  if (!vacancies) return <div className="loading">Wczytywanie ogłoszeń…</div>;
  const open = vacancies.filter((v) => v.status === 'open');
  const closed = vacancies.filter((v) => v.status === 'closed');

  const card = (v: VacancyDto) => (
    <article key={v.id} className={`vcard${v.status === 'closed' ? ' closed' : ''}`}>
      <div className="v-head">
        <div>
          <h3>{v.position}</h3>
          <div className="c-meta">{v.city}</div>
        </div>
        <span className={`badge ${v.status === 'open' ? 'ok' : ''}`}>{v.status === 'open' ? 'Otwarte' : 'Zamknięte'}</span>
      </div>
      <div className="v-total">
        <strong>{v.total}</strong> {v.total === 1 ? 'zgłoszenie' : 'zgłoszeń'}
        <span className="hint"> · {v.status === 'open' ? `otwarte od ${fmtDay(v.openedAt)} (${v.daysOpen} dni)` : `zamknięte ${fmtDay(v.closedAt as string)}`}</span>
      </div>
      <div className="v-counts">
        {STATUSES.filter((s) => v.counts[s.id]).map((s) => (
          <span key={s.id} className="chip" style={{ ['--dot' as string]: `var(${STATUS_VAR[s.id]})` }}>
            <i />{s.label} {v.counts[s.id]}
          </span>
        ))}
        {v.total === 0 && <span className="hint">Brak zgłoszeń</span>}
      </div>
      <div className="v-actions">
        <button className="btn small" type="button" disabled={v.total === 0} onClick={() => onShow(v.id)}>Pokaż kandydatów</button>
        {canEdit && (
          <button className="btn small" type="button" onClick={() => onToggle(v.id, v.status === 'open' ? 'closed' : 'open')}>
            {v.status === 'open' ? 'Zamknij ogłoszenie' : 'Otwórz ponownie'}
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div className="vacancies">
      {canEdit && (
        <form
          className="vform"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await onCreate(position, city);
            setBusy(false);
          }}
        >
          <strong>Nowe ogłoszenie</strong>
          <label className="inline-row" htmlFor="v-position">
            <span className="hint">Stanowisko</span>
            <select id="v-position" value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="inline-row" htmlFor="v-city">
            <span className="hint">Miasto</span>
            <select id="v-city" value={city} onChange={(e) => setCity(e.target.value)}>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <button className="btn primary small" type="submit" disabled={busy}>Dodaj ogłoszenie</button>
        </form>
      )}

      <h3 className="vh">Otwarte ({open.length})</h3>
      {open.length ? <div className="vgrid">{open.map(card)}</div> : <p className="hint">Brak otwartych ogłoszeń.</p>}
      {closed.length > 0 && (
        <>
          <h3 className="vh">Zamknięte ({closed.length})</h3>
          <div className="vgrid">{closed.map(card)}</div>
        </>
      )}
      <p className="hint" style={{ marginTop: 14 }}>
        Nowe zgłoszenie jest przypisywane automatycznie, gdy w danym mieście jest dokładnie jedno otwarte ogłoszenie na to stanowisko.
      </p>
    </div>
  );
}
