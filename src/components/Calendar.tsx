'use client';

import { useMemo, useState } from 'react';
import { statusKind, type CandidateListItem } from '@/lib/domain';
import { Chip } from './Chip';
import { dayKey, displayName, weekStart } from './ui';

type Props = {
  items: CandidateListItem[];
  anon: boolean;
  onOpen: (id: string) => void;
};

const DAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const fmtShort = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function Calendar({ items, anon, onOpen }: Props) {
  const [chosen, setChosen] = useState<number | null>(null);
  // open on the week of the nearest upcoming interview, otherwise on the current week
  const auto = useMemo(() => {
    const today = dayKey(new Date());
    const next = items
      .filter((c) => c.interviewAt && statusKind(c.status) !== 'rejected' && (c.interviewAt as string).slice(0, 10) >= today)
      .map((c) => c.interviewAt as string)
      .sort()[0];
    if (!next) return 0;
    const [y, m, d] = next.slice(0, 10).split('-').map(Number);
    const diff = weekStart(new Date(y, m - 1, d)).getTime() - weekStart(new Date()).getTime();
    return Math.round(diff / (7 * 864e5));
  }, [items]);
  const offset = chosen ?? auto;
  const setOffset = (f: (o: number) => number) => setChosen(f(offset));
  const start = useMemo(() => {
    const s = weekStart(new Date());
    s.setDate(s.getDate() + offset * 7);
    return s;
  }, [offset]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [start],
  );
  const planned = items.filter((c) => c.interviewAt && statusKind(c.status) !== 'rejected');
  const unscheduled = items.filter((c) => statusKind(c.status) === 'interview' && !c.interviewAt);
  const todayKey = dayKey(new Date());
  const last = days[6];
  const inWeek = planned.filter((c) => {
    const k = (c.interviewAt as string).slice(0, 10);
    return k >= dayKey(days[0]) && k <= dayKey(last);
  }).length;

  return (
    <div className="calendar">
      <div className="cal-head">
        <div className="inline-row">
          <button className="btn small" type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Poprzedni tydzień">←</button>
          <button className="btn small" type="button" onClick={() => setChosen(0)} disabled={offset === 0}>Ten tydzień</button>
          <button className="btn small" type="button" onClick={() => setOffset((o) => o + 1)} aria-label="Następny tydzień">→</button>
        </div>
        <div>
          <strong>{fmtShort(days[0])} – {fmtShort(last)}.{last.getFullYear()}</strong>
          <span className="hint"> · {inWeek} {inWeek === 1 ? 'rozmowa' : 'rozmów'} {offset === 0 ? 'w tym tygodniu' : 'w tym tygodniu kalendarza'}</span>
        </div>
      </div>

      <div className="cal-grid" role="region" aria-label="Tydzień rozmów" tabIndex={0}>
        {days.map((d, i) => {
          const k = dayKey(d);
          const todays = planned
            .filter((c) => (c.interviewAt as string).slice(0, 10) === k)
            .sort((a, b) => (a.interviewAt as string).localeCompare(b.interviewAt as string));
          return (
            <section key={k} className={`cal-day${k === todayKey ? ' today' : ''}${i > 4 ? ' weekend' : ''}`}>
              <h2>
                <span>{DAYS[i]}</span>
                <span className="n">{fmtShort(d)}</span>
              </h2>
              {todays.length === 0 && <div className="col-empty">—</div>}
              {todays.map((c) => (
                <button key={c.id} type="button" className="cal-card" onClick={() => onOpen(c.id)}>
                  <span className="cal-time">{(c.interviewAt as string).slice(11, 16)}</span>
                  <span className="c-name">{displayName(c, anon)}</span>
                  <span className="c-meta">{c.position} · {c.city}</span>
                  <Chip status={c.status} />
                </button>
              ))}
            </section>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <p className="hint" style={{ marginTop: '0.75rem' }}>
          Bez ustalonego terminu (status „Rozmowa”): {unscheduled.map((c) => displayName(c, anon)).join(', ')}.
        </p>
      )}
    </div>
  );
}
