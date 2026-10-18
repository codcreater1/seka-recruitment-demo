'use client';

import { useState } from 'react';
import { STATUSES, type CandidateListItem, type StatusId } from '@/lib/domain';
import { STATUS_VAR } from './Chip';
import { displayName, fmtInterview, rel } from './ui';

type Props = {
  items: CandidateListItem[];
  canEdit: boolean;
  anon: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: StatusId) => void;
};

export default function Board({ items, canEdit, anon, onOpen, onMove }: Props) {
  const [over, setOver] = useState<StatusId | null>(null);

  return (
    <div className="board" role="region" aria-label="Tablica statusów" tabIndex={0}>
      {STATUSES.map((s) => {
        const cards = items.filter((c) => c.status === s.id);
        return (
          <section
            key={s.id}
            className={`col${over === s.id ? ' over' : ''}`}
            style={{ ['--dot' as string]: `var(${STATUS_VAR[s.id]})` }}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver((cur) => (cur === s.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              const moved = items.find((c) => c.id === id);
              if (canEdit && moved && moved.status !== s.id) onMove(id, s.id);
            }}
          >
            <h2>
              <span><i />{s.label}</span>
              <span className="n">{cards.length}</span>
            </h2>
            <div className="cards">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="card"
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', c.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onOpen(c.id)}
                >
                  <span className="c-name">{displayName(c, anon)}</span>
                  <span className="c-meta">{c.position}</span>
                  <span className="c-meta">{c.city} · {rel(c.receivedAt)}</span>
                  <span className="c-foot">
                    {c.rating !== null && (
                      <span className="stars-s" aria-label={`Ocena ${c.rating} z 5`}>
                        {'★'.repeat(c.rating)}
                      </span>
                    )}
                    {c.status === 'interview' && c.interviewAt && <span>Rozmowa: {fmtInterview(c.interviewAt)}</span>}
                    {c.needsReview && <span className="badge">Do sprawdzenia</span>}
                    {c.duplicateOf && <span className="badge">Duplikat?</span>}
                  </span>
                </button>
              ))}
              {!cards.length && <div className="col-empty">Brak zgłoszeń</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
