// Sign-in with Microsoft Entra ID (OpenID Connect), tested against a small identity provider that runs in this file.
// It speaks the same endpoints as Microsoft (authorize, token, signing keys), so the whole flow of the application is
// exercised: state, nonce, PKCE, the code exchange, the checks of the ID token and the mapping of roles.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'client-123';
const SECRET = 'client-secret-xyz';

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

// ---------- the identity provider ----------
const signing = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...signing.publicKey.export({ format: 'jwk' }), kid: 'key-1', use: 'sig', alg: 'RS256' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims, key = signing.privateKey, header = { alg: 'RS256', kid: 'key-1', typ: 'JWT' }) => {
  const data = `${b64(header)}.${b64(claims)}`;
  return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
};

let idpPort = 0;
let appPort = 0;
let app = '';
let server;
let idp;
let dataDir;
const codes = new Map();
const mock = { user: {}, mode: 'ok' };

function startIdp() {
  return new Promise((resolve) => {
    idp = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${idpPort}`);
      const json = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === `/${TENANT}/oauth2/v2.0/authorize`) {
        const q = url.searchParams;
        if (q.get('client_id') !== CLIENT_ID || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256') {
          res.writeHead(400);
          return res.end('bad authorize request');
        }
        const code = crypto.randomBytes(8).toString('hex');
        codes.set(code, { nonce: q.get('nonce'), challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), user: mock.user, mode: mock.mode });
        res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state'))}` });
        return res.end();
      }
      if (url.pathname === `/${TENANT}/oauth2/v2.0/token` && req.method === 'POST') {
        let text = '';
        for await (const chunk of req) text += chunk;
        const f = new URLSearchParams(text);
        const entry = codes.get(f.get('code'));
        codes.delete(f.get('code')); // a code works once
        if (
          !entry || f.get('client_secret') !== SECRET || f.get('client_id') !== CLIENT_ID ||
          f.get('grant_type') !== 'authorization_code' || f.get('redirect_uri') !== entry.redirect ||
          crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== entry.challenge
        ) {
          return json(400, { error: 'invalid_grant' });
        }
        const now = Math.floor(Date.now() / 1000);
        const claims = { iss: `http://127.0.0.1:${idpPort}/${TENANT}/v2.0`, aud: CLIENT_ID, iat: now, nbf: now, exp: now + 3600, nonce: entry.nonce, tid: TENANT, ...entry.user };
        let token;
        if (entry.mode === 'expired') token = jwt({ ...claims, exp: now - 3600 });
        else if (entry.mode === 'audience') token = jwt({ ...claims, aud: 'someone-else' });
        else if (entry.mode === 'nonce') token = jwt({ ...claims, nonce: 'another-nonce' });
        else if (entry.mode === 'issuer') token = jwt({ ...claims, iss: 'https://evil.example/v2.0' });
        else if (entry.mode === 'tenant') token = jwt({ ...claims, tid: 'another-tenant' });
        else if (entry.mode === 'signature') token = jwt(claims, stranger.privateKey);
        else if (entry.mode === 'unknown-key') token = jwt(claims, signing.privateKey, { alg: 'RS256', kid: 'rotated-away' });
        else if (entry.mode === 'alg-none') token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
        else if (entry.mode === 'hs256') token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.${crypto.createHmac('sha256', 'x').update('y').digest('base64url')}`;
        else token = jwt(claims);
        return json(200, { id_token: token, access_token: 'unused', token_type: 'Bearer', expires_in: 3600 });
      }
      if (url.pathname === `/${TENANT}/discovery/v2.0/keys`) return json(200, { keys: [jwk] });
      res.writeHead(404);
      res.end();
    });
    idp.listen(idpPort, '127.0.0.1', resolve);
  });
}

// ---------- the application ----------
before(async () => {
  assert.ok(fs.existsSync(path.join(root, '.next', 'standalone', 'server.js')), 'run "npm run build" first');
  idpPort = await freePort();
  appPort = await freePort();
  app = `http://127.0.0.1:${appPort}`;
  await startIdp();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruitment-entra-'));
  server = spawn(process.execPath, [path.join(root, 'scripts', 'start.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      AUTH_MODE: 'entra',
      ENTRA_TENANT_ID: TENANT,
      ENTRA_CLIENT_ID: CLIENT_ID,
      ENTRA_CLIENT_SECRET: SECRET,
      ENTRA_AUTHORITY: `http://127.0.0.1:${idpPort}/${TENANT}`,
      ENTRA_ROLE_MAP: JSON.stringify({ 'group-hr-0001': 'hr', 'group-krakow-0002': 'manager:Kraków' }),
      APP_URL: app,
      SMTP_HOST: '',
      DEMO_PASSWORD: '',
      INGEST_API_KEY: 'k',
      SEED_DEMO_DATA: 'true',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(app + '/api/health')).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
});

after(() => {
  server?.kill();
  idp?.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

function jar() {
  const cookies = new Map();
  return {
    take(res) {
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const value = pair.slice(i + 1);
        if (/Max-Age=0/i.test(c) || value === '') cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    has: (name) => cookies.has(name),
  };
}

/** The whole browser flow: application -> identity provider -> application. */
async function signIn(user, mode = 'ok') {
  mock.user = user;
  mock.mode = mode;
  const cookies = jar();
  let res = await fetch(app + '/api/auth/entra/login', { redirect: 'manual' });
  assert.equal(res.status, 302);
  cookies.take(res);
  const authorize = res.headers.get('location');
  res = await fetch(authorize, { redirect: 'manual' });
  assert.equal(res.status, 302, 'the identity provider answers with a redirect');
  const callback = res.headers.get('location');
  res = await fetch(callback, { redirect: 'manual', headers: { cookie: cookies.header() } });
  cookies.take(res);
  return { res, cookies, authorize, callback };
}

const me = async (cookies) => fetch(app + '/api/session', { headers: { cookie: cookies.header() } });
const ADMIN = { oid: 'oid-admin', name: 'Ewa Admin', preferred_username: 'ewa.admin@seka.example', roles: ['SEKA.Admin'] };

test('the sign-in page offers Microsoft only; the demo accounts are switched off', async () => {
  const page = await (await fetch(app + '/login')).text();
  assert.ok(page.includes('/api/auth/entra/login'), 'the button leads to Microsoft');
  assert.ok(!page.includes('seka.example'), 'no demo accounts are listed');
  const demo = await fetch(app + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin' }) });
  assert.equal(demo.status, 403);
  assert.equal((await fetch(app + '/api/session')).status, 401);
  assert.equal((await fetch(app + '/api/candidates')).status, 401);
  const shown = await (await fetch(app + '/login?error=denied')).text();
  assert.match(shown, /nie ma dostępu/);
});

test('the request to Microsoft carries state, nonce and PKCE', async () => {
  const res = await fetch(app + '/api/auth/entra/login', { redirect: 'manual' });
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('location'));
  assert.equal(`${to.origin}${to.pathname}`, `http://127.0.0.1:${idpPort}/${TENANT}/oauth2/v2.0/authorize`);
  const q = to.searchParams;
  assert.equal(q.get('client_id'), CLIENT_ID);
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('redirect_uri'), `${app}/api/auth/entra/callback`);
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.ok(q.get('code_challenge').length >= 40 && q.get('state').length >= 30 && q.get('nonce').length >= 30);
  assert.match(q.get('scope'), /openid/);
  const cookie = res.headers.get('set-cookie') || '';
  assert.match(cookie, /seka-oidc=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\/api\/auth\/entra/);
  // every attempt has its own values
  const second = new URL((await fetch(app + '/api/auth/entra/login', { redirect: 'manual' })).headers.get('location'));
  assert.notEqual(second.searchParams.get('state'), q.get('state'));
  assert.notEqual(second.searchParams.get('nonce'), q.get('nonce'));
});

test('an administrator signs in; the session carries name, e-mail and role', async () => {
  const { res, cookies } = await signIn(ADMIN);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/');
  assert.ok(cookies.has('seka-session'));
  assert.ok(!cookies.has('seka-oidc'), 'the one-time cookie is gone');
  const body = await (await me(cookies)).json();
  assert.equal(body.session.role, 'admin');
  assert.equal(body.session.name, 'Ewa Admin');
  assert.equal(body.session.email, 'ewa.admin@seka.example');
  assert.equal(body.session.id, 'entra:oid-admin');
  assert.equal(body.session.canConfigure, true);
  assert.equal(body.authMode, 'entra');
  assert.deepEqual(body.accounts, [], 'no account switcher with real sign-in');
  const list = await fetch(app + '/api/candidates', { headers: { cookie: cookies.header() } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).candidates.length, 22);
  const audit = (await (await fetch(app + '/api/audit', { headers: { cookie: cookies.header() } })).json()).entries;
  assert.ok(audit.some((e) => e.action === 'login' && e.actor === 'Ewa Admin' && e.detail.includes('Entra ID')));
});

test('roles come from app roles and from groups; the highest one wins', async () => {
  const roleOf = async (user) => (await (await me((await signIn(user)).cookies)).json()).session;
  const hr = await roleOf({ oid: 'o1', name: 'Anna HR', preferred_username: 'anna@seka.example', roles: ['SEKA.HR'] });
  assert.equal(hr.role, 'hr');
  assert.equal(hr.canEdit, true);
  assert.equal(hr.canConfigure, false);
  const byGroup = await roleOf({ oid: 'o2', name: 'Grupa HR', preferred_username: 'g@seka.example', groups: ['group-hr-0001'] });
  assert.equal(byGroup.role, 'hr', 'a group id from ENTRA_ROLE_MAP');
  const mgr = await roleOf({ oid: 'o3', name: 'Jan Kraków', preferred_username: 'jan@seka.example', roles: ['SEKA.Branch.Kraków'] });
  assert.equal(mgr.role, 'manager');
  assert.equal(mgr.city, 'Kraków');
  assert.equal(mgr.canEdit, false);
  const mgrByGroup = await roleOf({ oid: 'o4', name: 'Maria Kraków', preferred_username: 'm@seka.example', groups: ['group-krakow-0002'] });
  assert.equal(mgrByGroup.city, 'Kraków');
  const both = await roleOf({ oid: 'o5', name: 'Dwa Role', preferred_username: 'd@seka.example', roles: ['SEKA.Branch.Gdańsk', 'SEKA.HR'] });
  assert.equal(both.role, 'hr');
  // a branch manager sees only the own city, the data scope follows the role from Microsoft
  const { cookies } = await signIn({ oid: 'o6', name: 'Jan Kraków', preferred_username: 'jan@seka.example', roles: ['SEKA.Branch.Kraków'] });
  const list = (await (await fetch(app + '/api/candidates', { headers: { cookie: cookies.header() } })).json()).candidates;
  assert.ok(list.length > 0 && list.every((c) => c.city === 'Kraków'));
  const patch = await fetch(app + `/api/candidates/${list[0].id}`, {
    method: 'PATCH', headers: { cookie: cookies.header(), 'content-type': 'application/json' }, body: JSON.stringify({ rating: 5 }),
  });
  assert.equal(patch.status, 403);
});

test('an account without a role gets no access', async () => {
  for (const user of [
    { oid: 'x1', name: 'Bez Roli', preferred_username: 'brak@seka.example', roles: [] },
    { oid: 'x2', name: 'Inna Rola', preferred_username: 'inna@seka.example', roles: ['Reader', 'SEKA.Branch.Londyn'] },
    { oid: 'x3', name: 'Nieznana Grupa', preferred_username: 'g@seka.example', groups: ['group-unknown'] },
  ]) {
    const { res, cookies } = await signIn(user);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login?error=denied');
    assert.ok(!cookies.has('seka-session'), user.name);
    assert.equal((await me(cookies)).status, 401);
  }
});

test('a token that is not right is refused', async () => {
  for (const mode of ['expired', 'audience', 'nonce', 'issuer', 'tenant', 'signature', 'unknown-key', 'alg-none', 'hs256']) {
    const { res, cookies } = await signIn(ADMIN, mode);
    assert.equal(res.headers.get('location'), '/login?error=failed', mode);
    assert.ok(!cookies.has('seka-session'), mode + ': no session');
  }
  mock.mode = 'ok';
});

test('state, cookie and code are checked and work once', async () => {
  mock.user = ADMIN;
  mock.mode = 'ok';
  // the redirect back without the cookie of the attempt (another browser)
  let cookies = jar();
  let res = await fetch(app + '/api/auth/entra/login', { redirect: 'manual' });
  cookies.take(res);
  let authorize = res.headers.get('location');
  const callback = (await fetch(authorize, { redirect: 'manual' })).headers.get('location');
  res = await fetch(callback, { redirect: 'manual' });
  assert.equal(res.headers.get('location'), '/login?error=failed', 'no cookie');
  // a state that is not the one of the attempt
  const wrong = new URL(callback);
  wrong.searchParams.set('state', 'forged-state');
  res = await fetch(wrong, { redirect: 'manual', headers: { cookie: cookies.header() } });
  assert.equal(res.headers.get('location'), '/login?error=failed', 'wrong state');
  // the real answer works once ...
  cookies = jar();
  res = await fetch(app + '/api/auth/entra/login', { redirect: 'manual' });
  cookies.take(res);
  authorize = res.headers.get('location');
  const good = (await fetch(authorize, { redirect: 'manual' })).headers.get('location');
  const header = cookies.header();
  res = await fetch(good, { redirect: 'manual', headers: { cookie: header } });
  assert.equal(res.headers.get('location'), '/');
  // ... and not a second time (the code and the cookie of the attempt are used up)
  res = await fetch(good, { redirect: 'manual', headers: { cookie: header } });
  assert.equal(res.headers.get('location'), '/login?error=failed', 'replay');
  // the identity provider reporting an error
  res = await fetch(`${app}/api/auth/entra/callback?error=access_denied&state=x`, { redirect: 'manual', headers: { cookie: header } });
  assert.equal(res.headers.get('location'), '/login?error=failed');
});

test('sign-out ends the session', async () => {
  const { cookies } = await signIn(ADMIN);
  assert.equal((await me(cookies)).status, 200);
  const out = await fetch(app + '/api/auth/logout', { method: 'POST', headers: { cookie: cookies.header() } });
  assert.equal(out.status, 200);
  cookies.take(out);
  assert.ok(!cookies.has('seka-session'));
  assert.equal((await me(cookies)).status, 401);
});
