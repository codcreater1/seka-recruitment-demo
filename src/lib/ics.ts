/** Minimal iCalendar (.ics) writer for one interview. Times are floating local time (Poland). */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 octets must be folded (RFC 5545). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // never cut inside a multi-byte character
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

const compact = (local: string) => local.replace(/[-:]/g, '') + '00'; // 2026-10-21T09:00 -> 20261021T090000

export function buildIcs(opts: { uid: string; summary: string; description: string; startLocal: string; minutes?: number; location?: string }) {
  const [datePart, timePart] = opts.startLocal.split('T');
  const start = new Date(`${datePart}T${timePart}:00Z`);
  const end = new Date(start.getTime() + (opts.minutes ?? 60) * 60000);
  const endLocal = end.toISOString().slice(0, 16);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Panel rekrutacji//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@panel-rekrutacji`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${compact(opts.startLocal)}`,
    `DTEND:${compact(endLocal)}`,
    `SUMMARY:${esc(opts.summary)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    ...(opts.location ? [`LOCATION:${esc(opts.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
