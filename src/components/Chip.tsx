import { statusLabel, statusList } from '@/lib/domain';

const KIND_VAR: Record<string, string> = {
  new: '--s-new',
  active: '--s-screening',
  interview: '--s-interview',
  offer: '--s-offer',
  hired: '--s-hired',
  rejected: '--s-rejected',
};
/** Colour variable of a status: built-in ones keep their own, added ones take the colour of their kind. */
export const STATUS_VAR: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, id: string) => {
    const s = statusList().find((x) => x.id === id);
    if (!s) return '--muted';
    return s.builtin ? `--s-${id}` : KIND_VAR[s.kind];
  },
});

export function Chip({ status }: { status: string }) {
  return (
    <span className="chip" style={{ ['--dot' as string]: `var(${STATUS_VAR[status] || '--muted'})` }}>
      <i />
      {statusLabel(status)}
    </span>
  );
}

const HUES = ['--s-new', '--s-interview', '--s-offer', '--s-hired', '--s-screening', '--s-rejected'];

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return letters.toUpperCase() || '?';
};

function hueOf(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(${HUES[h % HUES.length]})`;
}

/** Round initials badge; in anonymous mode it shows a neutral "K" and never the name. */
export function Avatar({ id, name, anon, large }: { id: string; name: string; anon: boolean; large?: boolean }) {
  return (
    <span
      className={`avatar${large ? ' lg' : ''}`}
      style={{ ['--hue' as string]: anon ? 'var(--muted)' : hueOf(id) }}
      aria-hidden="true"
    >
      {anon ? 'K' : initials(name)}
    </span>
  );
}
