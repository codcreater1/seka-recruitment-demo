/**
 * Interview times are stored as local wall-clock strings ("2026-10-14T10:00", no offset), the way
 * people enter them. The server often runs in UTC, so "now" has to be converted to the company's time
 * zone before it is compared with them.
 */
export const APP_TIMEZONE = (() => {
  const wanted = process.env.APP_TIMEZONE || 'Europe/Warsaw';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: wanted });
    return wanted;
  } catch {
    return 'Europe/Warsaw';
  }
})();

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(date: Date) {
  const out: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** "YYYY-MM-DDTHH:MM" in the company's time zone. */
export function localNow(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DDTHH:MM" that is a real moment: no 31 February, no 25:00. */
export function isLocalDateTime(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return false;
  const d = new Date(`${v}:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === v;
}

/** "YYYY-MM-DD" in the company's time zone. */
export function localDate(date: Date = new Date()): string {
  return localNow(date).slice(0, 10);
}
