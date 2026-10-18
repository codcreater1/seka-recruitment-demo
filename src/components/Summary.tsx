'use client';

import { useState } from 'react';
import { STATUSES, type StatsDto } from '@/lib/domain';
import { STATUS_VAR } from './Chip';
import { displayName, fmtInterview } from './ui';

export type QuickFilter = 'review' | 'missing' | 'duplicates' | 'stale' | 'retention' | 'pool' | null;

type Props = {
  stats: StatsDto | null;
  canEdit: boolean;
  anon: boolean;
  onVacancies: () => void;
  onOpenCandidate: (id: string) => void;
  onCity: (city: string) => void;
  onQuick: (q: Exclude<QuickFilter, null>) => void;
  onBulk: (action: 'thank-rejected' | 'delete-expired') => Promise<void>;
};

const weekLabel = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
};

export default function Summary({ stats, canEdit, anon, onVacancies, onOpenCandidate, onCity, onQuick, onBulk }: Props) {
  const [confirm, setConfirm] = useState<'delete-expired' | null>(null);
  if (!stats) return <div className="loading">Wczytywanie podsumowania…</div>;

  const maxWeek = Math.max(1, ...stats.perWeek.map((w) => w.count));
  const a = stats.attention;
  const inProgress = (stats.byStatus.screening || 0) + (stats.byStatus.interview || 0) + (stats.byStatus.offer || 0);

  return (
    <div className="summary">
      <div className="kpis">
        <div className="kpi"><div className="v">{stats.total}</div><div className="l">Wszystkie zgłoszenia</div></div>
        <div className="kpi"><div className="v">{stats.newLast7d}</div><div className="l">Nowe w ostatnich 7 dniach</div></div>
        <div className="kpi"><div className="v">{inProgress}</div><div className="l">W trakcie rekrutacji</div></div>
        <button type="button" className="kpi kpi-btn" onClick={onVacancies}>
          <div className="v">{stats.openVacancies}</div><div className="l">Otwarte ogłoszenia</div>
        </button>
        <button type="button" className="kpi kpi-btn" onClick={() => onQuick('pool')}>
          <div className="v">{stats.pool}</div><div className="l">W bazie kandydatów</div>
        </button>
        <div className="kpi">
          <div className="v">{stats.avgDaysToFirstAction === null ? '—' : `${String(stats.avgDaysToFirstAction).replace('.', ',')} dnia`}</div>
          <div className="l">Średni czas do pierwszej decyzji</div>
        </div>
      </div>

      <div className="panels">
        <section className="panel">
          <h2>Zgłoszenia według miast</h2>
          {stats.byCity.map((c) => (
            <button key={c.city} type="button" className="cityrow" onClick={() => onCity(c.city)} title="Pokaż zgłoszenia z tego miasta">
              <span className="nm">{c.city}</span>
              <span className="stack" aria-label={`${c.city}: ${c.total}`}>
                {STATUSES.map((s) => {
                  const n = c.byStatus[s.id] || 0;
                  return n ? (
                    <span key={s.id} title={`${s.label}: ${n}`} style={{ width: `${(n / c.total) * 100}%`, ['--dot' as string]: `var(${STATUS_VAR[s.id]})` }} />
                  ) : null;
                })}
              </span>
              <span className="num">{c.total}</span>
            </button>
          ))}
          <div className="legend">
            {STATUSES.map((s) => (
              <span key={s.id}><i style={{ ['--dot' as string]: `var(${STATUS_VAR[s.id]})` }} />{s.label} ({stats.byStatus[s.id] || 0})</span>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Zgłoszenia w tygodniach (od poniedziałku)</h2>
          <div className="weeks">
            {stats.perWeek.map((w) => (
              <div className="wk" key={w.weekStart}>
                <div className="bar" style={{ height: `${(w.count / maxWeek) * 100}%` }} title={`${w.count} zgłoszeń`} />
                <div className="cnt">{w.count}</div>
                <div className="day">{weekLabel(w.weekStart)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Najbliższe rozmowy</h2>
          {stats.upcomingInterviews.length ? (
            <div className="ilist">
              {stats.upcomingInterviews.map((i) => (
                <button key={i.id} type="button" onClick={() => onOpenCandidate(i.id)}>
                  <span className="when">{fmtInterview(i.interviewAt)}</span>
                  <span className="who">{displayName(i, anon)}</span>
                  <span className="what">{i.position} · {i.city}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">Brak zaplanowanych rozmów.</p>
          )}
        </section>

        <section className="panel">
          <h2>Wymaga uwagi</h2>
          <div className="attn">
            <div className={`attn-row${a.missingInfo ? '' : ' zero'}`}>
              <span><span className="num">{a.missingInfo}</span>Brakujące dane lub CV</span>
              {a.missingInfo > 0 && <button className="btn small" type="button" onClick={() => onQuick('missing')}>Pokaż</button>}
            </div>
            <div className={`attn-row${a.needsReview ? '' : ' zero'}`}>
              <span><span className="num">{a.needsReview}</span>Dane do sprawdzenia</span>
              {a.needsReview > 0 && <button className="btn small" type="button" onClick={() => onQuick('review')}>Pokaż</button>}
            </div>
            <div className={`attn-row${a.duplicates ? '' : ' zero'}`}>
              <span><span className="num">{a.duplicates}</span>Możliwe duplikaty</span>
              {a.duplicates > 0 && <button className="btn small" type="button" onClick={() => onQuick('duplicates')}>Pokaż</button>}
            </div>
            <div className={`attn-row${a.stale ? '' : ' zero'}`}>
              <span><span className="num">{a.stale}</span>Czekają bez decyzji ponad 7 dni</span>
              {a.stale > 0 && <button className="btn small" type="button" onClick={() => onQuick('stale')}>Pokaż</button>}
            </div>
            <div className={`attn-row${a.emptyVacancies ? '' : ' zero'}`}>
              <span><span className="num">{a.emptyVacancies}</span>Otwarte ogłoszenia bez kandydatów</span>
              {a.emptyVacancies > 0 && <button className="btn small" type="button" onClick={onVacancies}>Pokaż</button>}
            </div>
            <div className={`attn-row${a.unsentRejections ? '' : ' zero'}`}>
              <span><span className="num">{a.unsentRejections}</span>Odrzucone bez podziękowania</span>
              {canEdit && a.unsentRejections > 0 && (
                <button className="btn small primary" type="button" onClick={() => onBulk('thank-rejected')}>Wyślij podziękowania</button>
              )}
            </div>
            <div className={`attn-row${a.retentionDue ? '' : ' zero'}`}>
              <span><span className="num">{a.retentionDue}</span>Po terminie przechowywania danych</span>
              <span className="attn-actions">
                {a.retentionDue > 0 && <button className="btn small" type="button" onClick={() => onQuick('retention')}>Pokaż</button>}
                {canEdit && a.retentionDue > 0 && confirm !== 'delete-expired' && (
                  <button className="btn small danger" type="button" onClick={() => setConfirm('delete-expired')}>Usuń…</button>
                )}
                {canEdit && confirm === 'delete-expired' && (
                  <>
                    <span className="hint">Usunąć {a.retentionDue} profili bezpowrotnie?</span>
                    <button
                      className="btn small danger"
                      type="button"
                      onClick={async () => {
                        await onBulk('delete-expired');
                        setConfirm(null);
                      }}
                    >
                      Tak, usuń
                    </button>
                    <button className="btn small" type="button" onClick={() => setConfirm(null)}>Anuluj</button>
                  </>
                )}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
