'use client';

import { useState } from 'react';
import { api } from './ui';

type Account = { id: string; name: string; email: string; role: string; roleLabel: string; city: string | null };

const ERRORS: Record<string, string> = {
  denied: 'To konto nie ma dostępu do systemu rekrutacji. Skontaktuj się z administratorem.',
  failed: 'Logowanie nie powiodło się. Spróbuj ponownie.',
  expired: 'Czas logowania minął. Spróbuj ponownie.',
};

const initials = (name: string) =>
  name
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** The four squares of the Microsoft sign-in button. */
function MicrosoftMark() {
  return (
    <svg className="ms-mark" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function LoginForm({ mode, error, accounts }: { mode: 'demo' | 'entra'; error: string; accounts: Account[] }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState(ERRORS[error] ?? '');

  const signInAs = async (id: string) => {
    setBusy(id);
    setFailure('');
    try {
      await api('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account: id }),
      });
      window.location.href = '/';
    } catch (e) {
      setFailure((e as Error).message);
      setBusy('');
    }
  };

  return (
    <main className="login">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/seka-logo.png" alt="SEKA" width={52} height={34} />
        <h1>Panel rekrutacji</h1>
        <p className="login-lead">Zaloguj się kontem służbowym, aby kontynuować.</p>

        {failure && (
          <p className="login-error" role="alert">
            {failure}
          </p>
        )}

        {mode === 'entra' ? (
          <a className="btn ms-btn wide" href="/api/auth/entra/login">
            <MicrosoftMark />
            Zaloguj przez Microsoft
          </a>
        ) : !choosing ? (
          <button className="btn ms-btn wide" type="button" onClick={() => setChoosing(true)}>
            <MicrosoftMark />
            Zaloguj przez Microsoft
          </button>
        ) : (
          <section aria-labelledby="pick">
            <h2 id="pick">Wybierz konto</h2>
            <ul className="accounts">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button className="account" type="button" disabled={!!busy} onClick={() => signInAs(a.id)}>
                    <span className={`avatar sm role-${a.role}`} aria-hidden="true">{initials(a.name)}</span>
                    <span className="who">
                      <strong>{a.role === 'manager' ? a.roleLabel : a.name}</strong>
                      <small>{a.email}</small>
                    </span>
                    <span className={`badge ${a.role === 'admin' || a.role === 'sysadmin' ? 'bad' : a.role === 'hr' ? 'info' : ''}`}>{a.city ?? a.roleLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">
              Tryb demonstracyjny: symulacja logowania Microsoft Entra ID. W wersji docelowej konto i rola pochodzą z firmowego katalogu
              (SSO).
            </p>
          </section>
        )}
      </div>
      <p className="login-foot">Dane fikcyjne · wersja {process.env.NEXT_PUBLIC_APP_VERSION}</p>
    </main>
  );
}
