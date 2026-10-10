import { statusLabel } from '@/lib/domain';

export const STATUS_VAR: Record<string, string> = {
  new: '--s-new',
  screening: '--s-screening',
  interview: '--s-interview',
  offer: '--s-offer',
  hired: '--s-hired',
  rejected: '--s-rejected',
};

export function Chip({ status }: { status: string }) {
  return (
    <span className="chip" style={{ ['--dot' as string]: `var(${STATUS_VAR[status] || '--muted'})` }}>
      <i />
      {statusLabel(status)}
    </span>
  );
}
