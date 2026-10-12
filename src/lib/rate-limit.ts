/**
 * Tiny in-memory limiter for failed sign-in attempts (password gate, ingest API key).
 * One process, one map: enough for a single container, and a restart simply forgets the counters.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const LIMIT = 10;
const WINDOW_MS = 60_000;

/**
 * Who is asking: the last address of x-forwarded-for, which is the one the nearest reverse proxy added
 * (the entries before it can be written by the client), else a shared bucket.
 */
export function clientKey(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for');
  const last = forwarded ? forwarded.split(',').map((a) => a.trim()).filter(Boolean).pop() : '';
  return (last || headers.get('x-real-ip') || 'local').slice(0, 64);
}

function bucketFor(scope: string, key: string, now: number) {
  const id = `${scope}:${key}`;
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(id, b);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
  }
  return b;
}

/** Seconds the caller still has to wait, or 0 when it may try. */
export function blockedFor(scope: string, key: string, now = Date.now()) {
  const b = buckets.get(`${scope}:${key}`);
  if (!b || b.resetAt <= now || b.count < LIMIT) return 0;
  return Math.max(1, Math.ceil((b.resetAt - now) / 1000));
}

export function recordFailure(scope: string, key: string, now = Date.now()) {
  bucketFor(scope, key, now).count++;
}
