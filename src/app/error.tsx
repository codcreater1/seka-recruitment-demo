'use client';

import { useEffect } from 'react';

/** Shown when something in the page crashes; the rest of the application is left intact. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="fallback" role="alert">
      <div className="fallback-card">
        <img className="logo" src="/seka-logo.png" alt="SEKA" />
        <h1>Coś poszło nie tak</h1>
        <p>Wystąpił nieoczekiwany błąd. Spróbuj ponownie albo wróć do panelu.</p>
        <div className="fallback-actions">
          <button type="button" className="btn primary" onClick={reset}>
            Spróbuj ponownie
          </button>
          <a className="btn" href="/">
            Wróć do panelu
          </a>
        </div>
        {error.digest ? <p className="hint">Kod błędu: {error.digest}</p> : null}
      </div>
    </main>
  );
}
