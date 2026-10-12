// Password gate and brute-force protection. Runs its own server so the failed attempts
// cannot lock out the other test file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'correct horse battery staple';
const KEY = 'gate-test-ingest-key';
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

const basic = (password, user = 'ktokolwiek') => 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
const open = (headers = {}, url = '/') => fetch(base + url, { headers, redirect: 'manual' });

before(async () => {
  assert.ok(fs.existsSync(path.join(root, '.next', 'standalone', 'server.js')), 'run "npm run build" first');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruitment-gate-'));
  server = spawn(process.execPath, [path.join(root, 'scripts', 'start.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      DEMO_PASSWORD: PASSWORD,
      INGEST_API_KEY: KEY,
      SMTP_HOST: '',
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

test('the page and the data API need the password; health and intake do not', async () => {
  const anon = await open();
  assert.equal(anon.status, 401);
  assert.match(anon.headers.get('www-authenticate') || '', /^Basic realm=/);
  assert.equal((await open({}, '/api/candidates')).status, 401);
  assert.equal((await open({}, '/api/health')).status, 200, 'container health check stays open');
  const ok = await open({ authorization: basic(PASSWORD) });
  assert.equal(ok.status, 200);
  assert.equal((await open({ authorization: basic(PASSWORD, '') }, '/api/candidates')).status, 200, 'any user name works');
  const ingest = await fetch(base + '/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ from: 'Test Gate <test.gate@example.com>', subject: 'Aplikacja (Kraków)' }),
  });
  assert.equal(ingest.status, 201, 'intake is protected by its own key, not by the gate');
});

test('requests without credentials are not counted as attempts', async () => {
  const headers = { 'x-forwarded-for': '203.0.113.20' };
  for (let i = 0; i < 15; i++) assert.equal((await open(headers)).status, 401);
  assert.equal((await open({ ...headers, authorization: basic(PASSWORD) })).status, 200);
});

test('repeated wrong passwords are slowed down per address', async () => {
  const attacker = { 'x-forwarded-for': '203.0.113.30' };
  for (let i = 0; i < 10; i++) {
    assert.equal((await open({ ...attacker, authorization: basic('wrong-' + i) })).status, 401);
  }
  const blocked = await open({ ...attacker, authorization: basic(PASSWORD) });
  assert.equal(blocked.status, 429, 'even the right password waits while the address is blocked');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  const someoneElse = await open({ 'x-forwarded-for': '203.0.113.31', authorization: basic(PASSWORD) });
  assert.equal(someoneElse.status, 200, 'other addresses are not affected');
});

test('repeated wrong intake keys are slowed down per address', async () => {
  const post = (key, ip) =>
    fetch(base + '/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'x-forwarded-for': ip },
      body: JSON.stringify({ from: 'Ktos <ktos@example.com>', subject: 'Aplikacja (Gdańsk)' }),
    });
  for (let i = 0; i < 10; i++) assert.equal((await post('bad-' + i, '203.0.113.40')).status, 401);
  assert.equal((await post(KEY, '203.0.113.40')).status, 429);
  assert.equal((await post(KEY, '203.0.113.41')).status, 201);
});
