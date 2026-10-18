'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMAIL_TEMPLATE_IDS, renderTemplate, type EmailTemplate, type Role } from '@/lib/domain';
import { api } from './ui';

type TemplateInfo = {
  id: EmailTemplate;
  label: string;
  placeholders: string[];
  defaultSubject: string;
  defaultBody: string;
  subject: string;
  body: string;
  customized: boolean;
};
type AdminData = {
  settings: { autoAck: boolean; autoMissing: boolean; retentionMonths: number; poolRetentionMonths: number };
  templates: TemplateInfo[];
  directory: { id: string; name: string; email: string; role: Role; roleLabel: string; city: string | null; entraRole: string }[];
  roles: { label: string; scope: string }[];
  permissions: { what: string; admin: boolean; hr: boolean; manager: string }[];
  integrations: {
    authMode: 'demo' | 'entra';
    ingestEnabled: boolean;
    smtpConfigured: boolean;
    timezone: string;
    retentionDefaults: { months: number; poolMonths: number };
  };
  dictionaries: { cities: string[]; positions: string[]; statuses: string[] };
};

const SAMPLE = { position: 'Technik laboratoryjny', interviewAt: '2026-10-21T09:00', missing: ['cv', 'city'] as ('cv' | 'city')[] };

export default function Admin({ onSaved, onRetentionChanged }: { onSaved: (msg: string) => void; onRetentionChanged: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [tpl, setTpl] = useState<EmailTemplate>('missing');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [months, setMonths] = useState({ retention: 6, pool: 24 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api<AdminData>('/api/admin/settings');
    setData(d);
    setMonths({ retention: d.settings.retentionMonths, pool: d.settings.poolRetentionMonths });
    return d;
  }, []);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  // the editor shows the text of the template that is selected
  useEffect(() => {
    const t = data?.templates.find((x) => x.id === tpl);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }, [data, tpl]);

  const save = async (patch: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await load();
      onSaved(message);
      return true;
    } catch (e) {
      onSaved((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="notice">Nie udało się wczytać ustawień: {error}</div>;
  if (!data) return <div className="loading">Wczytywanie ustawień…</div>;

  const current = data.templates.find((t) => t.id === tpl);
  const preview = renderTemplate(tpl, SAMPLE, { subject, body });
  const dirty = !!current && (subject !== current.subject || body !== current.body);

  return (
    <div className="admin">
      <section className="panel">
        <h2>Role i uprawnienia</h2>
        <p className="hint">
          Trzy role. Uprawnienia są sprawdzane na serwerze przy każdej operacji, niezależnie od tego, co widać w interfejsie.
        </p>
        <div className="table-wrap" role="region" aria-label="Macierz uprawnień" tabIndex={0}>
          <table className="audit matrix">
            <thead>
              <tr>
                <th>Możliwość</th>
                <th>Administrator</th>
                <th>HR manager</th>
                <th>Kierownik oddziału</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Zakres danych</td>
                {data.roles.map((r) => (
                  <td key={r.label}>{r.scope}</td>
                ))}
              </tr>
              {data.permissions.map((p) => (
                <tr key={p.what}>
                  <td>{p.what}</td>
                  <td>{p.admin ? 'Tak' : '—'}</td>
                  <td>{p.hr ? 'Tak' : '—'}</td>
                  <td>{p.manager}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Konta i logowanie</h2>
        <p className="hint">
          {data.integrations.authMode === 'entra'
            ? 'Logowanie przez Microsoft Entra ID. Rola wynika z ról aplikacji lub grup przypisanych użytkownikowi w katalogu (tabela poniżej pokazuje nazwy, które system rozpoznaje).'
            : 'Tryb demonstracyjny: konta wybiera się na stronie logowania. Po podłączeniu Microsoft Entra ID rolę nadaje przypisanie użytkownika lub grupy w katalogu.'}
        </p>
        <div className="table-wrap" role="region" aria-label="Konta" tabIndex={0}>
          <table className="audit">
            <thead>
              <tr>
                <th>Konto</th>
                <th>E-mail</th>
                <th>Rola</th>
                <th>Rola aplikacji / grupa w Entra ID</th>
              </tr>
            </thead>
            <tbody>
              {data.directory.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="mono">{a.email}</td>
                  <td>{a.roleLabel}{a.city ? ` (${a.city})` : ''}</td>
                  <td className="mono">{a.entraRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Automatyczne wiadomości do kandydatów</h2>
        <div className="toggles">
          <label className="switch" htmlFor="auto-ack">
            <input
              id="auto-ack"
              type="checkbox"
              checked={data.settings.autoAck}
              disabled={busy}
              onChange={(e) => save({ autoAck: e.target.checked }, e.target.checked ? 'Potwierdzenia przyjęcia włączone' : 'Potwierdzenia przyjęcia wyłączone')}
            />
            <span>Potwierdzenie przyjęcia zgłoszenia</span>
          </label>
          <label className="switch" htmlFor="auto-missing">
            <input
              id="auto-missing"
              type="checkbox"
              checked={data.settings.autoMissing}
              disabled={busy}
              onChange={(e) => save({ autoMissing: e.target.checked }, e.target.checked ? 'Prośby o uzupełnienie włączone' : 'Prośby o uzupełnienie wyłączone')}
            />
            <span>Prośba o uzupełnienie, gdy brakuje CV, miasta lub stanowiska</span>
          </label>
        </div>
        <p className="hint">
          {data.integrations.smtpConfigured
            ? 'Wiadomości są wysyłane przez skonfigurowany serwer SMTP.'
            : 'Serwer SMTP nie jest skonfigurowany: wiadomości są zapisywane na profilu jako „symulacja”. Przy wdrożeniu mogą też wychodzić z Power Automate (odpowiedź /api/ingest zawiera listę braków).'}
        </p>

        <div className="tpl-head">
          <label htmlFor="tpl">Treść wiadomości</label>
          <select id="tpl" value={tpl} onChange={(e) => setTpl(e.target.value as EmailTemplate)}>
            {EMAIL_TEMPLATE_IDS.map((id) => (
              <option key={id} value={id}>
                {data.templates.find((t) => t.id === id)?.label}
                {data.templates.find((t) => t.id === id)?.customized ? ' (zmieniona)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="tpl-edit">
          <div className="form">
            <div className="field">
              <label htmlFor="tpl-subject">Temat</label>
              <input id="tpl-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tpl-body">Treść</label>
              <textarea id="tpl-body" rows={11} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
            </div>
            <p className="hint">
              Znaczniki zastępowane automatycznie: <span className="mono">{current?.placeholders.join('  ')}</span>
            </p>
            <div className="inline-row">
              <button
                className="btn small primary"
                type="button"
                disabled={busy || !dirty}
                onClick={() => save({ templates: { [tpl]: { subject, body } } }, 'Zapisano treść wiadomości')}
              >
                Zapisz
              </button>
              <button
                className="btn small"
                type="button"
                disabled={busy || !current?.customized}
                onClick={() => save({ templates: { [tpl]: null } }, 'Przywrócono tekst domyślny')}
              >
                Przywróć tekst domyślny
              </button>
            </div>
          </div>
          <div className="tpl-preview" aria-live="polite">
            <p className="hint">Podgląd (przykładowe dane)</p>
            <strong>{preview.subject}</strong>
            <pre>{preview.body}</pre>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Przechowywanie danych (RODO)</h2>
        <form
          className="retention"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save({ retentionMonths: months.retention, poolRetentionMonths: months.pool }, 'Zapisano okresy przechowywania')) onRetentionChanged();
          }}
        >
          <div className="field">
            <label htmlFor="ret-months">Zgłoszenie: miesięcy od otrzymania</label>
            <input id="ret-months" type="number" min={1} max={240} value={months.retention} onChange={(e) => setMonths({ ...months, retention: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="ret-pool">Baza kandydatów (zgoda na przyszłe rekrutacje): miesięcy</label>
            <input id="ret-pool" type="number" min={1} max={240} value={months.pool} onChange={(e) => setMonths({ ...months, pool: Number(e.target.value) })} />
          </div>
          <button className="btn small primary" type="submit" disabled={busy}>Zapisz</button>
        </form>
        <p className="hint">
          Po upływie okresu profil jest oznaczany na liście i może zostać usunięty jedną operacją. Wartości domyślne: {data.integrations.retentionDefaults.months} i {data.integrations.retentionDefaults.poolMonths} mies.
        </p>
      </section>

      <section className="panel">
        <h2>Integracje i słowniki</h2>
        <dl className="kv">
          <dt>Przyjmowanie e-maili</dt>
          <dd>
            {data.integrations.ingestEnabled ? (
              <>Włączone: <span className="mono">POST /api/ingest</span> (Power Automate, klucz API)</>
            ) : (
              <span className="flag">Wyłączone: brak klucza INGEST_API_KEY</span>
            )}
          </dd>
          <dt>Wysyłka e-maili</dt>
          <dd>{data.integrations.smtpConfigured ? 'SMTP skonfigurowany' : 'Symulacja (brak SMTP)'}</dd>
          <dt>Logowanie</dt>
          <dd>{data.integrations.authMode === 'entra' ? 'Microsoft Entra ID' : 'Tryb demonstracyjny'}</dd>
          <dt>Strefa czasowa</dt>
          <dd className="mono">{data.integrations.timezone}</dd>
          <dt>Miasta (oddziały)</dt>
          <dd><span className="chips">{data.dictionaries.cities.map((c) => <span className="skill" key={c}>{c}</span>)}</span></dd>
          <dt>Stanowiska</dt>
          <dd><span className="chips">{data.dictionaries.positions.map((c) => <span className="skill" key={c}>{c}</span>)}</span></dd>
          <dt>Statusy</dt>
          <dd><span className="chips">{data.dictionaries.statuses.map((c) => <span className="skill" key={c}>{c}</span>)}</span></dd>
        </dl>
      </section>
    </div>
  );
}
