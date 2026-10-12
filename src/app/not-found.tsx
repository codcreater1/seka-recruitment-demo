export default function NotFound() {
  return (
    <main className="fallback">
      <div className="fallback-card">
        <img className="logo" src="/seka-logo.png" alt="SEKA" />
        <h1>Nie znaleziono strony</h1>
        <p>Ten adres nie istnieje albo został zmieniony.</p>
        <div className="fallback-actions">
          <a className="btn primary" href="/">
            Wróć do panelu
          </a>
        </div>
      </div>
    </main>
  );
}
