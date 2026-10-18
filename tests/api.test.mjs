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
let MANAGER; // branch manager of Kraków
let HR; // HR manager (the default for every call)
let ADMIN;
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

/** Signs in as a demo account and returns the session cookie. */
async function login(account) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account }),
  });
  assert.equal(res.status, 200, 'sign in as ' + account);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

/** cookie: undefined = signed in as HR manager, null = not signed in, string = that session. */
async function call(url, init = {}, cookie) {
  const c = cookie === undefined ? HR : cookie;
  const res = await fetch(base + url, { ...init, headers: { ...(init.headers || {}), ...(c ? { cookie: c } : {}) } });
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
  HR = await login('hr');
  ADMIN = await login('admin');
  MANAGER = await login('mgr:Kraków');
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
  assert.equal(stats.attention.missingInfo, 1, 'one seeded application has no city');
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
  // the same address again: flagged as a possible duplicate of the complete profile
  const dup = await post('/api/ingest', { from: 'weronika.adamska@example.com', subject: 'Jeszcze raz (Gdańsk)' }, null, headers);
  const dd = await detail(dup.body.id);
  assert.equal(dd.duplicateOf, res.body.id);
  assert.equal(dd.city, 'Gdańsk');
  // ... but the answer of someone who was asked for missing data completes that profile instead
  const answer = await post('/api/ingest', { from: 'jan.testowy@example.com', subject: 'Odpowiedź (Gdańsk)' }, null, headers);
  assert.equal(answer.body.merged, true);
  assert.equal(answer.body.id, none.body.id);
  assert.equal((await detail(none.body.id)).city, 'Gdańsk');
});


test('merging a duplicate moves notes and history to the older profile', async () => {
  const headers = { 'x-api-key': KEY };
  const pdf = seedFile('incoming/CV_weronika_adamska.pdf').toString('base64');
  // a complete application from an address that already has profiles is flagged as a duplicate of the latest one
  const second = await post('/api/ingest', {
    from: 'Weronika Adamska <weronika.adamska@example.com>',
    subject: 'Aplikacja: Technik laboratoryjny (Kraków)',
    attachments: [{ name: 'CV.pdf', contentBase64: pdf }],
  }, null, headers);
  const first = { body: { id: (await detail(second.body.id)).duplicateOf } };
  assert.ok(first.body.id, 'flagged as a duplicate');
  assert.equal((await post(`/api/candidates/${second.body.id}/notes`, { text: 'Notatka na duplikacie' })).status, 201);
  // only HR may merge, and a profile that is not a duplicate cannot be merged
  assert.equal((await post(`/api/candidates/${second.body.id}/merge`, {}, MANAGER)).status >= 400, true);
  assert.equal((await post(`/api/candidates/${first.body.id}/merge`, {})).status, 400);
  const res = await post(`/api/candidates/${second.body.id}/merge`, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.targetId, first.body.id);
  assert.equal((await call('/api/candidates/' + second.body.id)).status, 404);
  const kept = await detail(first.body.id);
  assert.ok(kept.notes.some((n) => n.text === 'Notatka na duplikacie'));
  assert.ok(kept.events.some((h) => h.text.startsWith('Połączono z duplikatem')));
});


test('notifications: only the administrator, validated, and sent to HR and the branch manager', async () => {
  const put = send('PUT');
  const good = { enabled: true, onNew: true, onInterview: true, hrEmails: ['hr@seka.example'], managerEmails: { Gdańsk: 'gdansk@seka.example' }, teamsWebhook: '' };
  assert.equal((await put('/api/admin/settings', { notify: good }, HR)).status, 403);
  assert.equal((await put('/api/admin/settings', { notify: { ...good, hrEmails: ['nie-adres'] } }, ADMIN)).status, 400);
  assert.equal((await put('/api/admin/settings', { notify: { ...good, teamsWebhook: 'https://evil.example.com/hook' } }, ADMIN)).status, 400);
  assert.equal((await put('/api/admin/settings', { notify: { ...good, teamsWebhook: 'http://x.webhook.office.com/hook' } }, ADMIN)).status, 400);
  assert.equal((await put('/api/admin/settings', { notify: { ...good, managerEmails: { Atlantyda: 'a@b.pl' } } }, ADMIN)).status, 400);
  assert.equal((await put('/api/admin/settings', { notify: good }, ADMIN)).status, 200);
  assert.deepEqual((await call('/api/admin/settings', {}, ADMIN)).body.settings.notify.hrEmails, ['hr@seka.example']);

  const res = await post('/api/ingest', { from: 'Nina Powiadomiona <nina.powiadomiona@example.net>', subject: 'Aplikacja: Technik laboratoryjny (Gdańsk)' }, null, { 'x-api-key': KEY });
  assert.equal(res.status, 201);
  let entry;
  for (let i = 0; i < 20 && !entry; i++) {
    entry = (await call('/api/audit')).body.entries.find((e) => e.action === 'notify' && e.detail.includes('Nina Powiadomiona'));
    if (!entry) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(entry, 'notification was recorded');
  assert.ok(entry.detail.includes('hr@seka.example') && entry.detail.includes('gdansk@seka.example'));
  assert.equal(entry.detail.includes('krakow@'), false);

  assert.equal((await put('/api/admin/settings', { notify: { ...good, enabled: false } }, ADMIN)).status, 200);
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
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ account: 'hr' }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Secure/i, 'secure behind an https proxy');
  const plain = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: 'hr' }),
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

const INGEST = { 'x-api-key': KEY };
const ingest = (data) => post('/api/ingest', data, null, INGEST);
const pdfB64 = (rel) => seedFile(rel).toString('base64');

test('incomplete applications: the candidate is asked, the answer completes the same profile', async () => {
  // 1. no attachment at all: a request for the CV goes out right away
  const first = await ingest({ from: 'Łukasz Sadowski <lukasz.sadowski@example.com>', subject: 'Aplikacja – Specjalista ds. pomiarów emisji (Gdańsk)' });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body.missing, ['cv']);
  assert.equal(first.body.infoRequested, true);
  assert.equal(first.body.merged, false);
  let d = await detail(first.body.id);
  const request = d.emails.find((m) => m.template === 'missing');
  assert.ok(request, 'the request is recorded in the correspondence');
  assert.ok(!d.emails.some((m) => m.template === 'ack'), 'a request replaces the plain acknowledgement');
  assert.match(request.subject, /uzupełnienie/i);
  assert.match(request.body, /CV w formacie PDF/);
  assert.ok(request.body.includes('na stanowisko Specjalista ds. pomiarów emisji'));
  assert.ok(d.events.some((e) => e.text.includes('Prośba o uzupełnienie') && e.text.includes('brak CV')));
  assert.deepEqual(d.missing, ['cv']);
  assert.ok(d.infoRequestedAt);

  // 2. the candidate answers with the CV: the same profile is completed, no second profile appears
  const before = (await candidates()).length;
  const reply = await ingest({
    from: 'Łukasz Sadowski <lukasz.sadowski@example.com>',
    subject: 'Re: Aplikacja',
    attachments: [{ name: 'CV.pdf', contentBase64: pdfB64('incoming/CV_lukasz_sadowski.pdf') }],
  });
  assert.equal(reply.body.merged, true);
  assert.equal(reply.body.id, first.body.id);
  assert.deepEqual(reply.body.missing, []);
  assert.equal((await candidates()).length, before, 'no new profile');
  d = await detail(first.body.id);
  assert.ok(d.file, 'the CV is attached now');
  assert.deepEqual(d.missing, []);
  assert.ok(d.events.some((e) => e.text.startsWith('Uzupełnienie zgłoszenia') && e.text.includes('dodano CV')));
  assert.ok(d.events.some((e) => e.text === 'Zgłoszenie jest kompletne'));
  assert.equal(d.city, 'Gdańsk', 'what was known stays as it was');
  assert.ok(d.profile.skills.length > 0, 'the CV was read');
  // an application that is complete again is not matched a second time
  const again = await ingest({ from: 'lukasz.sadowski@example.com', subject: 'Aplikacja – Konsultant ds. BHP (Poznań)' });
  assert.equal(again.body.merged, false);
});

test('incomplete applications: unreadable CV, no city, no position', async () => {
  // a scan has no text: the candidate is asked for a readable file
  const scan = await ingest({
    from: 'Julia Maciejewska <julia.maciejewska@example.com>',
    subject: 'Aplikacja – Młodszy specjalista ds. raportowania (Katowice)',
    attachments: [{ name: 'skan.pdf', contentBase64: pdfB64('incoming/CV_julia_maciejewska.pdf') }],
  });
  assert.deepEqual(scan.body.missing, ['cv_unreadable']);
  assert.equal(scan.body.infoRequested, true);
  const sd = await detail(scan.body.id);
  assert.ok(sd.file, 'the file is kept');
  assert.match(sd.emails.find((m) => m.template === 'missing').body, /nie udało się odczytać/);

  // a readable CV that names neither a city nor a position, in a mail that does not either
  const generic = await ingest({
    from: 'dorota.bezmiasta@example.com',
    subject: 'Aplikacja o pracę',
    attachments: [{ name: 'CV.pdf', contentBase64: pdfB64('incoming/CV_dorota_bezmiasta.pdf') }],
  });
  assert.deepEqual(generic.body.missing, ['city', 'position']);
  assert.equal(generic.body.infoRequested, true);
  let gd = await detail(generic.body.id);
  assert.equal(gd.city, 'Do przypisania');
  const body = gd.emails.find((m) => m.template === 'missing').body;
  assert.match(body, /miasto/);
  assert.match(body, /stanowisko/);
  assert.ok(body.includes('do naszej firmy'), 'no position is named in the greeting');

  // the answer is a short mail that names both
  const reply = await ingest({ from: 'dorota.bezmiasta@example.com', subject: 'Re: Aplikacja o pracę, Technik laboratoryjny, Katowice' });
  assert.equal(reply.body.merged, true);
  assert.equal(reply.body.id, generic.body.id);
  assert.deepEqual(reply.body.missing, []);
  gd = await detail(generic.body.id);
  assert.equal(gd.city, 'Katowice');
  assert.equal(gd.position, 'Technik laboratoryjny');
  assert.equal(gd.needsReview, false, 'a profile that is complete no longer needs a check');
  assert.ok(gd.events.some((e) => e.text.includes('ustalono miasto: Katowice')));
  // an answer that brings nothing new is noted, and nobody is asked twice
  const empty = await ingest({ from: 'Ktoś <ktos.bezcv@example.com>', subject: 'Aplikacja' });
  assert.equal(empty.body.infoRequested, true);
  const silly = await ingest({ from: 'ktos.bezcv@example.com', subject: 'Dzień dobry, czy ktoś tu jest?' });
  assert.equal(silly.body.merged, true);
  const sdl = await detail(empty.body.id);
  assert.ok(sdl.events.some((e) => e.text.includes('nie zawierała brakujących danych')));
  assert.equal(sdl.emails.filter((m) => m.template === 'missing').length, 1, 'no second request');
});

test('incomplete applications: HR asks again, attaches a CV; others cannot', async () => {
  const made = await ingest({ from: 'Test Reczny <test.reczny@example.com>', subject: 'Aplikacja – Księgowy (Poznań)' });
  const id = made.body.id;
  assert.deepEqual(made.body.missing, ['cv']);
  // a second request by hand
  const again = await post(`/api/candidates/${id}/emails`, { template: 'missing' });
  assert.equal(again.status, 201);
  assert.equal(again.body.delivery, 'simulated');
  assert.equal((await detail(id)).emails.filter((m) => m.template === 'missing').length, 2);
  assert.equal((await post(`/api/candidates/${id}/emails`, { template: 'missing' }, MANAGER)).status, 403, 'a branch manager cannot send');
  // not a PDF, then the PDF
  const upload = (blob, name, cookie) => {
    const fd = new FormData();
    fd.append('file', blob, name);
    return call(`/api/candidates/${id}/cv`, { method: 'POST', body: fd }, cookie);
  };
  assert.equal((await upload(new Blob(['hello']), 'x.pdf')).status, 400);
  assert.equal((await upload(new Blob([seedFile('incoming/CV_bartosz_kaczmarek.pdf')], { type: 'application/pdf' }), 'CV.pdf', null)).status, 401);
  const ok = await upload(new Blob([seedFile('incoming/CV_bartosz_kaczmarek.pdf')], { type: 'application/pdf' }), 'CV_bartosz.pdf');
  assert.equal(ok.status, 201);
  assert.ok(ok.body.changes.includes('dodano CV'));
  assert.deepEqual(ok.body.candidate.missing, []);
  assert.equal(ok.body.candidate.file.name, 'CV_bartosz.pdf');
  assert.equal(ok.body.candidate.city, 'Poznań', 'the city of the application is kept');
  // nothing missing any more: nothing to ask, nothing to attach
  assert.equal((await post(`/api/candidates/${id}/emails`, { template: 'missing' })).status, 400);
  assert.equal((await upload(new Blob([seedFile('incoming/CV_bartosz_kaczmarek.pdf')]), 'CV.pdf')).status, 409);
});

test('incomplete applications: they show up on the dashboard and can be switched off', async () => {
  const stats = (await call('/api/stats')).body.stats;
  assert.ok(stats.attention.missingInfo >= 3, 'counted for HR: ' + stats.attention.missingInfo);
  const list = await candidates();
  assert.ok(list.some((c) => c.missing.length && c.infoRequestedAt), 'the list tells who was asked');
  assert.ok(list.every((c) => Array.isArray(c.missing)));
  // the demo samples cover both cases
  const samples = (await call('/api/demo/samples')).body.samples;
  assert.ok(samples.some((x) => x.kind === 'nocv') && samples.some((x) => x.kind === 'nocity'));
  const nocv = await post('/api/demo/samples', { file: samples.find((x) => x.kind === 'nocv').file });
  assert.equal(nocv.status, 201);
  assert.deepEqual(nocv.body.missing, ['cv']);
  const nocity = await post('/api/demo/samples', { file: samples.find((x) => x.kind === 'nocity').file });
  assert.deepEqual(nocity.body.missing, ['city', 'position']);
  // the rejection text shown in the profile is the real one
  const any = (await candidates())[0];
  assert.match((await detail(any.id)).rejectionPreview, /Dział HR/);
});

test('administration: only the administrator reads or changes the settings', async () => {
  for (const [cookie, status] of [[null, 401], [HR, 403], [MANAGER, 403], [ADMIN, 200]]) {
    assert.equal((await call('/api/admin/settings', {}, cookie)).status, status, 'GET for ' + status);
  }
  const put = send('PUT');
  assert.equal((await put('/api/admin/settings', { autoAck: false }, HR)).status, 403);
  assert.equal((await put('/api/admin/settings', { autoAck: false }, MANAGER)).status, 403);
  assert.equal((await put('/api/admin/settings', { autoAck: false }, null)).status, 401);
  const cfg = (await call('/api/admin/settings', {}, ADMIN)).body;
  assert.equal(cfg.settings.autoAck, true);
  assert.equal(cfg.settings.autoMissing, true);
  assert.equal(cfg.settings.retentionMonths, 6);
  assert.deepEqual(cfg.templates.map((t) => t.id).sort(), ['ack', 'invite', 'missing', 'rejection']);
  assert.ok(cfg.templates.every((t) => t.subject && t.body && !t.customized));
  assert.ok(cfg.permissions.length >= 8);
  assert.equal(cfg.directory.filter((a) => a.role === 'manager').length, 6);
  assert.ok(cfg.directory.every((a) => a.entraRole.startsWith('SEKA.')));
  assert.equal(cfg.integrations.authMode, 'demo');
  assert.equal(cfg.integrations.ingestEnabled, true);
  assert.equal(cfg.integrations.smtpConfigured, false);
  assert.ok(cfg.dictionaries.cities.includes('Kraków'));
});

test('administration: wording, switches and retention take effect and are logged', async () => {
  const put = send('PUT');
  const settings = async () => (await call('/api/admin/settings', {}, ADMIN)).body;
  // wrong input is refused
  for (const bad of [
    { retentionMonths: 0 }, { retentionMonths: 241 }, { retentionMonths: 'x' }, { poolRetentionMonths: 1.5 }, { autoAck: 'yes' },
    { templates: { nope: { subject: 'a', body: 'b' } } },
    { templates: { ack: { subject: '', body: 'x' } } },
    { templates: { ack: { subject: 'x', body: '' } } },
    { templates: { missing: { subject: 'Temat', body: 'tekst bez listy braków' } } },
    { templates: { invite: { subject: 'Temat', body: 'tekst bez terminu' } } },
    [1, 2],
  ]) {
    assert.equal((await put('/api/admin/settings', bad, ADMIN)).status, 400, JSON.stringify(bad));
  }

  // own wording is used from the next message on
  const wording = { subject: 'Własny temat', body: 'Cześć! Dziękujemy za zgłoszenie {{positionPhrase}}. Do zobaczenia.' };
  assert.equal((await put('/api/admin/settings', { templates: { ack: wording } }, ADMIN)).status, 200);
  assert.equal((await settings()).templates.find((t) => t.id === 'ack').customized, true);
  const cv = (rel) => [{ name: 'CV.pdf', contentBase64: pdfB64(rel) }];
  const ok = await ingest({ from: 'Ala Testowa <ala.ack@example.com>', subject: 'Aplikacja – Specjalista ds. ochrony środowiska (Wrocław)', attachments: cv('incoming/CV_izabela_nowicka.pdf') });
  assert.deepEqual(ok.body.missing, []);
  const ack = (await detail(ok.body.id)).emails.find((m) => m.template === 'ack');
  assert.equal(ack.subject, 'Własny temat');
  assert.equal(ack.body, 'Cześć! Dziękujemy za zgłoszenie na stanowisko Specjalista ds. ochrony środowiska. Do zobaczenia.');
  // back to the default text
  assert.equal((await put('/api/admin/settings', { templates: { ack: null } }, ADMIN)).status, 200);
  assert.equal((await settings()).templates.find((t) => t.id === 'ack').customized, false);
  const dflt = await ingest({ from: 'Ola Domyslna <ola.default@example.com>', subject: 'Aplikacja – Specjalista ds. ochrony środowiska (Wrocław)', attachments: cv('incoming/CV_izabela_nowicka.pdf') });
  assert.equal((await detail(dflt.body.id)).emails.find((m) => m.template === 'ack').subject, 'Potwierdzenie otrzymania zgłoszenia');

  // the request for missing data can be switched off: the candidate then only gets the acknowledgement
  assert.equal((await put('/api/admin/settings', { autoMissing: false }, ADMIN)).status, 200);
  const quiet = await ingest({ from: 'Cichy Kandydat <cichy.bezcv@example.com>', subject: 'Aplikacja – Księgowy (Poznań)' });
  assert.deepEqual(quiet.body.missing, ['cv'], 'the gap is still recorded');
  assert.equal(quiet.body.infoRequested, false);
  const qd = await detail(quiet.body.id);
  assert.ok(qd.emails.some((m) => m.template === 'ack') && !qd.emails.some((m) => m.template === 'missing'));
  // HR can still ask by hand
  assert.equal((await post(`/api/candidates/${quiet.body.id}/emails`, { template: 'missing' })).status, 201);
  // and every automatic message can be switched off
  assert.equal((await put('/api/admin/settings', { autoAck: false }, ADMIN)).status, 200);
  const mute = await ingest({ from: 'Cisza Kandydat <cisza.bezcv@example.com>', subject: 'Aplikacja – Księgowy (Poznań)' });
  assert.equal((await detail(mute.body.id)).emails.length, 0);
  assert.equal((await put('/api/admin/settings', { autoAck: true, autoMissing: true }, ADMIN)).status, 200);
  const loud = await ingest({ from: 'Glosny Kandydat <glosny.bezcv@example.com>', subject: 'Aplikacja – Księgowy (Poznań)' });
  assert.equal(loud.body.infoRequested, true);

  // the retention period is a setting too: a profile that is 100 days old is due after three months, not after six
  const old = await ingest({
    from: 'Stary Kandydat <stary.bezcv@example.com>',
    subject: 'Aplikacja – Księgowy (Poznań)',
    receivedAt: new Date(Date.now() - 100 * 864e5).toISOString(),
  });
  const dueNow = async () => (await candidates()).find((c) => c.id === old.body.id).retentionDue;
  assert.equal(await dueNow(), false);
  assert.equal((await put('/api/admin/settings', { retentionMonths: 3 }, ADMIN)).status, 200);
  assert.equal((await settings()).settings.retentionMonths, 3);
  assert.equal(await dueNow(), true, 'three months: due');
  assert.equal((await put('/api/admin/settings', { retentionMonths: 6 }, ADMIN)).status, 200);
  assert.equal(await dueNow(), false, 'six months again: not due');

  const audit = (await call('/api/audit')).body.entries;
  assert.ok(audit.some((e) => e.action === 'settings-update' && e.detail.includes('retentionMonths=3')));
  assert.ok(audit.some((e) => e.action === 'settings-update' && e.actor.startsWith('Administrator')));
});

test('sign-in: nothing is open without a session, tampered cookies are refused', async () => {
  for (const url of ['/api/candidates', '/api/stats', '/api/vacancies', '/api/session', '/api/search?q=abc', '/api/export', '/api/audit']) {
    assert.equal((await call(url, {}, null)).status, 401, url);
  }
  assert.equal((await post('/api/candidates/x/notes', { text: 'a' }, null)).status, 401);
  // the page sends a visitor to the sign-in page, the sign-in page itself is open
  const home = await fetch(base + '/', { redirect: 'manual' });
  assert.ok([302, 303, 307, 308].includes(home.status), 'home redirects, got ' + home.status);
  assert.match(home.headers.get('location') || '', /\/login$/);
  assert.equal((await call('/login', {}, null)).status, 200);
  // a made-up or altered cookie is not a session
  const good = HR.split('=')[1];
  const [body, mac] = good.split('.');
  assert.equal((await call('/api/candidates', {}, 'seka-session=' + body + '.' + mac.slice(0, -2) + 'xx')).status, 401);
  const forged = Buffer.from(JSON.stringify({ id: 'admin', role: 'admin', city: null, name: 'x', email: 'x', exp: 9999999999 })).toString('base64url');
  assert.equal((await call('/api/candidates', {}, 'seka-session=' + forged + '.' + mac)).status, 401);
  assert.equal((await call('/api/candidates', {}, 'seka-session=garbage')).status, 401);
  assert.equal((await call('/api/candidates', {}, 'demo-role=hr')).status, 401, 'the old role cookie means nothing');
  // unknown account
  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'root' }) });
  assert.equal(bad.status, 400);
});

test('three roles: administrator, HR manager, branch manager', async () => {
  const me = async (cookie) => (await call('/api/session', {}, cookie)).body;
  const admin = await me(ADMIN);
  assert.equal(admin.session.role, 'admin');
  assert.equal(admin.session.canEdit, true);
  assert.equal(admin.session.canConfigure, true);
  const hr = await me(HR);
  assert.equal(hr.session.role, 'hr');
  assert.equal(hr.session.canEdit, true);
  assert.equal(hr.session.canConfigure, false);
  assert.equal(hr.session.city, null);
  const mgr = await me(MANAGER);
  assert.equal(mgr.session.role, 'manager');
  assert.equal(mgr.session.canEdit, false);
  assert.equal(mgr.session.canConfigure, false);
  assert.equal(mgr.session.city, 'Kraków');
  assert.equal(admin.authMode, 'demo');
  assert.ok(admin.accounts.length >= 8, 'the demo offers an account for every role and branch');

  // the administrator works like the HR manager, over all cities
  assert.equal((await candidates(ADMIN)).length, (await candidates(HR)).length);
  const first = (await candidates(HR))[0];
  assert.equal((await patch('/api/candidates/' + first.id, { rating: 4 }, ADMIN)).status, 200);
  // the demo reset (and later the settings) belong to the administrator only
  assert.equal((await post('/api/demo/reset', {}, HR)).status, 403);
  assert.equal((await post('/api/demo/reset', {}, MANAGER)).status, 403);
});

test('sign-out ends the browser session', async () => {
  const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie: HR } });
  assert.equal(res.status, 200);
  const cleared = res.headers.get('set-cookie') || '';
  assert.match(cleared, /seka-session=;|seka-session=$/m);
  assert.match(cleared, /Max-Age=0|Expires=/i);
  const audit = (await call('/api/audit')).body.entries.map((e) => e.action);
  assert.ok(audit.includes('login') && audit.includes('logout'), 'sign-in and sign-out are logged');
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
  const stranger = await ingest({ from: 'Ktos Do Usuniecia <ktos.do.usuniecia@example.com>', subject: 'Aplikacja – Księgowy (Poznań)' });
  assert.equal((await call('/api/candidates/' + stranger.body.id)).status, 200);
  const reset = await post('/api/demo/reset', {}, ADMIN);
  assert.equal(reset.status, 200);
  assert.equal((await candidates()).length, 22);
  assert.ok((await candidates()).every((c) => c.id.startsWith('seed-')), 'only the demo set is left');
  assert.equal((await call('/api/candidates/' + stranger.body.id)).status, 404, 'the profile is gone');
  assert.equal((await call('/api/candidates/' + stranger.body.id + '/file')).status, 404, 'and so is its file');
  // a clean slate: the audit log of the earlier demo sessions is gone too, only the loading and the reset are noted
  const left = (await call('/api/audit')).body.entries.map((e) => e.action).sort();
  assert.deepEqual(left, ['demo-reset', 'seed']);
  // configuration is not data: the settings stay
  assert.equal((await call('/api/admin/settings', {}, ADMIN)).body.settings.retentionMonths, 6);
});
