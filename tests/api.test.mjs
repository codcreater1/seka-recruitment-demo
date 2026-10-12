// API tests. Run after `npm run build`:  npm test
// Starts the production server on a free port with a throw-away data folder and the bundled demo data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'test-ingest-key';
const MANAGER = 'demo-role=' + encodeURIComponent('mgr:Kraków');
let base = '';
let server;
let dataDir;

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function call(url, init = {}, cookie) {
  const res = await fetch(base + url, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } });
  const raw = await res.text();
  let body = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, raw, headers: res.headers };
}
const send = (method) => (url, data, cookie, headers = {}) =>
  call(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) }, cookie);
const post = send('POST');
const patch = send('PATCH');
const seedFile = (rel) => fs.readFileSync(path.join(root, 'seed', rel));
const candidates = async (cookie) => (await call('/api/candidates', {}, cookie)).body.candidates;
const byName = async (name) => (await candidates()).find((c) => c.name === name);
const detail = async (id, cookie) => (await call('/api/candidates/' + id, {}, cookie)).body.candidate;

before(async () => {
  assert.ok(fs.existsSync(path.join(root, '.next', 'standalone', 'server.js')), 'run "npm run build" first');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruitment-test-'));
  server = spawn(process.execPath, [path.join(root, 'scripts', 'start.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      INGEST_API_KEY: KEY,
      SMTP_HOST: '',
      DEMO_PASSWORD: '',
      SEED_DEMO_DATA: 'true',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
});

after(() => {
  server?.kill();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test('demo data is loaded and PDFs are served', async () => {
  const health = await call('/api/health');
  assert.deepEqual(health.body, { ok: true }, 'the health check says nothing about the data');
  assert.equal((await candidates()).length, 22);
  const pdf = await call('/api/candidates/seed-03/file');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok(pdf.raw.startsWith('%PDF'));
});

test('the CV can be downloaded and the download is logged', async () => {
  const anna = await byName('Anna Kowalczyk');
  const inline = await call(`/api/candidates/${anna.id}/file`);
  assert.match(inline.headers.get('content-disposition'), /^inline/);
  const dl = await call(`/api/candidates/${anna.id}/file?download=1`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/pdf');
  assert.match(dl.headers.get('content-disposition'), /^attachment; filename="CV_anna_kowalczyk\.pdf"; filename\*=UTF-8''/);
  assert.ok(dl.raw.startsWith('%PDF'));
  const audit = (await call('/api/audit')).body.entries;
  assert.ok(audit.some((e) => e.action === 'download-cv' && e.detail.includes('Anna Kowalczyk')));
  // a manager may download only CVs of their own city
  const foreign = (await candidates()).find((c) => c.city === 'Warszawa');
  assert.equal((await call(`/api/candidates/${foreign.id}/file?download=1`, {}, MANAGER)).status, 404);
});

test('a branch manager only sees their own city', async () => {
  const mine = await candidates(MANAGER);
  assert.ok(mine.length > 0);
  assert.deepEqual([...new Set(mine.map((c) => c.city))], ['Kraków']);
  const other = (await candidates()).find((c) => c.city === 'Warszawa');
  assert.equal((await call('/api/candidates/' + other.id, {}, MANAGER)).status, 404);
  assert.equal((await call('/api/candidates/' + other.id + '/file', {}, MANAGER)).status, 404);
  assert.equal((await call('/api/candidates/' + other.id + '/ics', {}, MANAGER)).status, 404);
});

test('a branch manager cannot change or export data', async () => {
  const own = (await candidates(MANAGER))[0];
  assert.equal((await patch('/api/candidates/' + own.id, { status: 'offer' }, MANAGER)).status, 403);
  assert.equal((await call('/api/candidates/' + own.id, { method: 'DELETE' }, MANAGER)).status, 403);
  assert.equal((await call('/api/audit', {}, MANAGER)).status, 403);
  assert.equal((await call('/api/export', {}, MANAGER)).status, 403);
  assert.equal((await post('/api/bulk', { action: 'thank-rejected' }, MANAGER)).status, 403);
  assert.equal((await post('/api/vacancies', { position: 'Księgowy', city: 'Kraków' }, MANAGER)).status, 403);
  assert.equal((await post(`/api/candidates/${own.id}/emails`, { template: 'ack' }, MANAGER)).status, 403);
  assert.equal((await post('/api/demo/reset', {}, MANAGER)).status, 403);
});

test('search finds CV content and keeps names out of anonymous mode', async () => {
  const skill = await call('/api/search?q=chromatografia');
  assert.ok(skill.body.results.length >= 3);
  assert.ok(skill.body.results.every((r) => r.snippet));
  assert.ok((await call('/api/search?q=' + encodeURIComponent('środowiska raport'))).body.results.length > 0);
  assert.equal((await call('/api/search?q=a')).body.results.length, 0);
  const asHr = await call('/api/search?q=Kowalczyk');
  assert.ok(asHr.body.results.length >= 1);
  assert.equal((await call('/api/search?q=Kowalczyk&anon=1')).body.results.length, 0);
  const mgr = (await call('/api/search?q=chromatografia', {}, MANAGER)).body.results.map((r) => r.id);
  const allowed = (await candidates(MANAGER)).map((c) => c.id);
  assert.ok(mgr.every((id) => allowed.includes(id)));
});

test('summary numbers and attention list', async () => {
  const { stats } = (await call('/api/stats')).body;
  assert.equal(stats.total, 22);
  assert.equal(stats.byCity.length, 7);
  assert.equal(stats.perWeek.length, 8);
  assert.equal(stats.attention.needsReview, 1);
  assert.equal(stats.attention.duplicates, 1);
  assert.equal(stats.attention.stale, 2);
  assert.equal(stats.attention.retentionDue, 2);
  assert.equal(stats.attention.emptyVacancies, 2);
  assert.equal(stats.pool, 6);
  assert.ok(stats.upcomingInterviews.length >= 3);
  const mgr = (await call('/api/stats', {}, MANAGER)).body.stats;
  assert.deepEqual(mgr.byCity.map((c) => c.city), ['Kraków']);
});

test('profile shows facts read from the CV, vacancy and talent pool', async () => {
  const anna = await byName('Anna Kowalczyk');
  const d = await detail(anna.id);
  assert.equal(d.profile.experienceYears, 4);
  assert.ok(d.profile.skills.includes('MS Excel'));
  assert.ok(d.profile.languages.includes('angielski B2'));
  assert.ok(d.vacancy, 'linked to the open vacancy');
  assert.equal(d.vacancy.city, 'Warszawa');
  assert.equal(anna.consentFuture, true);
  assert.ok(d.emails.some((m) => m.template === 'ack'));
});

test('vacancies: list, create, close, assign', async () => {
  const list = (await call('/api/vacancies')).body.vacancies;
  assert.ok(list.some((v) => v.status === 'open') && list.some((v) => v.status === 'closed'));
  const mine = (await call('/api/vacancies', {}, MANAGER)).body.vacancies;
  assert.ok(mine.length > 0 && mine.every((v) => v.city === 'Kraków'));
  assert.equal((await post('/api/vacancies', { position: 'Księgowy', city: 'Kraków' })).status, 409);
  const created = await post('/api/vacancies', { position: 'Praktykant', city: 'Gdańsk' });
  assert.equal(created.status, 201);
  assert.equal((await post('/api/vacancies', { position: 'Nieznane', city: 'Gdańsk' })).status, 400);
  const id = created.body.vacancy.id;
  const closed = await patch('/api/vacancies/' + id, { status: 'closed' });
  assert.equal(closed.body.vacancy.status, 'closed');
  assert.equal((await patch('/api/vacancies/' + id, { status: 'open' })).body.vacancy.status, 'open');
  const natalia = await byName('Natalia Krawczyk');
  const res = await patch('/api/candidates/' + natalia.id, { vacancyId: id });
  assert.equal(res.body.candidate.vacancyId, id);
  assert.equal((await patch('/api/candidates/' + natalia.id, { vacancyId: 'nope' })).status, 400);
});

test('interview: calendar file and invitation', async () => {
  const withDate = (await candidates()).find((c) => c.status === 'interview' && c.interviewAt);
  const ics = await call(`/api/candidates/${withDate.id}/ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.raw, /BEGIN:VEVENT/);
  assert.match(ics.raw, /DTSTART:\d{8}T\d{6}/);
  assert.match(ics.raw, /SUMMARY:Rozmowa kwalifikacyjna/);
  const marcin = await byName('Marcin Lewandowski');
  assert.equal((await call(`/api/candidates/${marcin.id}/ics`)).status, 404);
  assert.equal((await post(`/api/candidates/${marcin.id}/emails`, { template: 'invite' })).status, 400);
  await patch('/api/candidates/' + marcin.id, { interviewAt: '2026-10-21T09:00' });
  const sent = await post(`/api/candidates/${marcin.id}/emails`, { template: 'invite' });
  const mail = sent.body.candidate.emails.at(-1);
  assert.equal(sent.status, 201);
  assert.equal(mail.attachment, 'rozmowa.ics');
  assert.ok(mail.body.includes('21.10.2026 o godzinie 09:00'));
  assert.equal(sent.body.delivery, 'simulated');
  assert.equal((await post(`/api/candidates/${marcin.id}/emails`, { template: 'rejection' })).status, 400);
});

test('opinions after an interview', async () => {
  const joanna = await byName('Joanna Kamińska'); // Kraków
  const ok = await post(`/api/candidates/${joanna.id}/feedback`,
    { communication: 4, knowledge: 5, fit: 3, recommendation: 'tak', comment: 'Dobra rozmowa.' }, MANAGER);
  assert.equal(ok.status, 201);
  const last = ok.body.candidate.feedback.at(-1);
  assert.equal(last.recommendation, 'tak');
  assert.ok(last.author.startsWith('Kierownik'));
  assert.equal((await post(`/api/candidates/${joanna.id}/feedback`, { communication: 9, knowledge: 5, fit: 3, recommendation: 'tak' })).status, 400);
  assert.equal((await post(`/api/candidates/${joanna.id}/feedback`, { communication: 3, knowledge: 3, fit: 3, recommendation: 'x' })).status, 400);
  const other = (await candidates()).find((c) => c.city === 'Warszawa');
  assert.equal((await post(`/api/candidates/${other.id}/feedback`, { communication: 3, knowledge: 3, fit: 3, recommendation: 'tak' }, MANAGER)).status, 404);
});

test('e-mail intake: key, PDF, vacancy link, duplicates, missing attachment', async () => {
  assert.equal((await post('/api/ingest', { from: 'a@example.com' })).status, 401);
  const noKey = await post('/api/ingest', { from: 'a@example.com' }, null, { 'x-api-key': 'wrong' });
  assert.equal(noKey.status, 401);
  const headers = { 'x-api-key': KEY };
  const pdf = seedFile('incoming/CV_weronika_adamska.pdf').toString('base64');
  const res = await post('/api/ingest', {
    from: 'Weronika Adamska <weronika.adamska@example.com>',
    subject: 'Aplikacja na stanowisko: Technik laboratoryjny (Kraków)',
    attachments: [{ name: 'CV.pdf', contentBase64: pdf }],
  }, null, headers);
  assert.equal(res.status, 201);
  const d = await detail(res.body.id);
  assert.equal(d.name, 'Weronika Adamska');
  assert.equal(d.city, 'Kraków');
  assert.equal(d.position, 'Technik laboratoryjny');
  assert.ok(d.vacancyId, 'linked to the single open vacancy');
  assert.ok(d.emails.some((m) => m.template === 'ack'));

  const none = await post('/api/ingest', { from: 'Jan Testowy <jan.testowy@example.com>', subject: 'Pytanie' }, null, headers);
  const nd = await detail(none.body.id);
  assert.equal(nd.city, 'Do przypisania');
  assert.equal(nd.needsReview, true);
  const dup = await post('/api/ingest', { from: 'jan.testowy@example.com', subject: 'Jeszcze raz (Gdańsk)' }, null, headers);
  const dd = await detail(dup.body.id);
  assert.equal(dd.duplicateOf, none.body.id);
  assert.equal(dd.city, 'Gdańsk');
});

test('every seeded CV is read back correctly', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed', 'seed.json'), 'utf8'));
  const failures = [];
  for (const c of seed.candidates) {
    const res = await post('/api/ingest', {
      from: 'someone@example.net',
      subject: 'Aplikacja',
      attachments: [{ name: c.downloadName, contentBase64: seedFile(c.file).toString('base64') }],
    }, null, { 'x-api-key': KEY });
    const d = await detail(res.body.id);
    for (const f of ['name', 'email', 'phone', 'city', 'position']) {
      if (d[f] !== c[f]) failures.push(`${c.name}: ${f} ${d[f]} != ${c[f]}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('.eml: sample through the demo intake and manual upload', async () => {
  const samples = (await call('/api/demo/samples')).body.samples;
  const emls = samples.filter((s) => s.kind === 'eml');
  assert.equal(emls.length, 2);
  const live = await post('/api/demo/samples', { file: emls[0].file });
  const d = await detail(live.body.id);
  assert.equal(d.name, 'Patryk Zawadzki');
  assert.ok(d.file);
  assert.ok(d.emails.some((m) => m.template === 'ack'));

  const fd = new FormData();
  fd.append('file', new Blob([seedFile(emls[1].file)], { type: 'message/rfc822' }), 'x.eml');
  const up = await call('/api/candidates', { method: 'POST', body: fd });
  assert.equal(up.status, 201);
  const u = await detail(up.body.id);
  assert.equal(u.name, 'Oliwia Bielecka');
  assert.ok(!u.emails.some((m) => m.template === 'ack'), 'an imported old message gets no acknowledgement');
  const bad = new FormData();
  bad.append('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'x.pdf');
  assert.equal((await call('/api/candidates', { method: 'POST', body: bad })).status, 400);
});

test('bulk actions, retention and CSV export', async () => {
  const fresh = (await candidates()).filter((c) => c.status === 'new' && !c.retentionDue).slice(0, 2).map((c) => c.id);
  const done = await post('/api/bulk', { action: 'reject-and-thank', ids: fresh });
  assert.equal(done.body.done, 2);
  const d = await detail(fresh[0]);
  assert.equal(d.status, 'rejected');
  assert.ok(d.emails.some((m) => m.template === 'rejection'));
  const before = (await call('/api/stats')).body.stats.attention.retentionDue;
  assert.equal(before, 2);
  const del = await post('/api/bulk', { action: 'delete-expired' });
  assert.equal(del.body.done, 2);
  const csv = await call('/api/export');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.raw.includes('"Imię i nazwisko";'));
  assert.ok(csv.raw.split('\r\n').length > 10);
  assert.ok(!csv.raw.includes("'+48"), 'phone numbers are not prefixed');
});

test('broken input is refused or flagged, never a crash', async () => {
  const upload = (blob, name) => {
    const fd = new FormData();
    fd.append('file', blob, name);
    return call('/api/candidates', { method: 'POST', body: fd });
  };
  assert.equal((await upload(new Blob([]), 'empty.pdf')).status, 400);
  assert.equal((await upload(new Blob(['MZ not a document']), 'tool.exe')).status, 400);
  // starts like a PDF but is not one: the profile is created and handed to a person
  const broken = await upload(new Blob(['%PDF-1.4\n1 0 obj << broken >> endobj']), 'broken.pdf');
  assert.equal(broken.status, 201);
  assert.equal((await detail(broken.body.id)).needsReview, true);
  // a message without any attachment
  const eml = [
    'From: Ewa Brak <ewa.brak@example.com>',
    'To: kariera@seka.pl',
    'Subject: Pytanie o prace (Poznań)',
    'Date: Mon, 12 Oct 2026 10:00:00 +0200',
    '',
    'Dzien dobry, czy prowadzicie nabor?',
    '',
  ].join('\r\n');
  const noPdf = await upload(new Blob([eml], { type: 'message/rfc822' }), 'pytanie.eml');
  assert.equal(noPdf.status, 201);
  const nd = await detail(noPdf.body.id);
  assert.equal(nd.city, 'Poznań');
  assert.equal(nd.needsReview, true);
  assert.equal(nd.file, null);
  // impossible dates are not stored, so a calendar file can always be built
  const some = (await candidates())[0];
  for (const bad of ['2026-02-31T10:00', '2026-10-12T25:00', 'jutro']) {
    assert.equal((await patch('/api/candidates/' + some.id, { interviewAt: bad })).status, 400, bad);
  }
  // an oversized request is turned away before it is read
  const big = await call('/api/candidates', { method: 'POST', body: new Blob([new Uint8Array(11 * 1024 * 1024)]) });
  assert.ok([400, 413].includes(big.status), 'status ' + big.status);
});

test('security headers and cookie flags', async () => {
  for (const url of ['/', '/api/health']) {
    const res = await call(url);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', url);
    assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'self'/, url);
    assert.equal(res.headers.get('x-powered-by'), null, url);
  }
  const res = await fetch(base + '/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ role: 'hr' }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Secure/i, 'secure behind an https proxy');
  const plain = await fetch(base + '/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'hr' }),
  });
  assert.doesNotMatch(plain.headers.get('set-cookie') || '', /Secure/i, 'not secure on plain http (local use)');
});

test('"upcoming interviews" follow the company clock, not UTC', async () => {
  const warsaw = (offsetMs) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(Date.now() + offsetMs)).map((x) => [x.type, x.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const make = async (name) => {
    const r = await post('/api/ingest', { from: `${name} <${name.toLowerCase().replace(/\W/g, '')}@example.org>`, subject: 'Aplikacja (Gdańsk)' }, null, { 'x-api-key': KEY });
    return r.body.id;
  };
  const soon = await make('Zegar Pozniej');
  const earlier = await make('Zegar Wczesniej');
  await patch('/api/candidates/' + soon, { interviewAt: warsaw(90 * 60000) });
  await patch('/api/candidates/' + earlier, { interviewAt: warsaw(-90 * 60000) });
  const upcoming = (await call('/api/stats')).body.stats.upcomingInterviews.map((x) => x.id);
  assert.ok(upcoming.includes(soon), 'an interview in 90 minutes is upcoming');
  assert.ok(!upcoming.includes(earlier), 'an interview 90 minutes ago is not');
});

test('GDPR: export and delete a profile, audit log, demo reset', async () => {
  const target = (await candidates()).find((c) => c.name === 'Paweł Woźniak');
  const exp = await call(`/api/candidates/${target.id}/export`);
  assert.equal(exp.status, 200);
  assert.equal(exp.body.candidate.id, target.id);
  assert.equal((await call('/api/candidates/' + target.id, { method: 'DELETE' })).status, 200);
  assert.equal((await call('/api/candidates/' + target.id)).status, 404);
  const audit = (await call('/api/audit')).body.entries.map((e) => e.action);
  for (const a of ['export', 'delete', 'bulk-delete-expired', 'bulk-reject']) assert.ok(audit.includes(a), a);
  const reset = await post('/api/demo/reset', {});
  assert.equal(reset.status, 200);
  assert.equal((await candidates()).length, 22);
});
