'use client';

/**
 * Last resort: replaces the whole page when the root layout itself fails. It cannot rely on the
 * application styles, so it carries its own.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: '#F4F6FB',
          color: '#0E1B3D',
          fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <main role="alert" style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>Coś poszło nie tak</h1>
          <p style={{ margin: '0 0 1.25rem', color: '#4A5673' }}>Aplikacja napotkała błąd. Spróbuj ponownie albo odśwież stronę.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '0.65rem 1.2rem',
              border: 0,
              borderRadius: '0.75rem',
              background: '#1B3985',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Spróbuj ponownie
          </button>
        </main>
      </body>
    </html>
  );
}
