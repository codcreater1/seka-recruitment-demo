'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMAIL_TEMPLATE_IDS, STATUS_KINDS, renderTemplate, setStatusList, type EmailTemplate, type PermissionId, type Role, type RoleDef, type StatusDef, type StatusKind } from '@/lib/domain';
import { api } from './ui';
import SystemSettings from './SystemSettings';

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
type NotifyForm = {
  enabled: boolean;
  onNew: boolean;
  onInterview: boolean;
  hrEmails: string[];
  managerEmails: Record<string, string>;
  teamsWebhook: string;
};
type RoleRow = { id?: string; label: string; scope: 'all' | 'city'; permissions: PermissionId[]; entraRole: string; builtin: boolean };
type StatusRow = { id?: string; label: string; kind: StatusKind; builtin: boolean; used: number };
type AdminData = {
  statuses: (StatusDef & { used: number })[];
  settings: { autoAck: boolean; autoMissing: boolean; retentionMonths: number; poolRetentionMonths: number; notify: NotifyForm };
  templates: TemplateInfo[];
  directory: { id: string; name: string; email: string; role: Role; roleLabel: string; city: string | null; entraRole: string }[];
  roles: RoleDef[];
  permissionCatalog: { id: PermissionId; label: string }[];
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

export default function Admin({ canSystem, onSaved, onRetentionChanged, onStatusesChanged }: { canSystem: boolean; onSaved: (msg: string) => void; onRetentionChanged: () => void; onStatusesChanged: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [tpl, setTpl] = useState<EmailTemplate>('missing');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [months, setMonths] = useState({ retention: 6, pool: 24 });
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState<NotifyForm>({ enabled: false, onNew: true, onInterview: true, hrEmails: [], managerEmails: {}, teamsWebhook: '' });
  const [hrText, setHrText] = useState('');
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);

  const load = useCallback(async () => {
    const d = await api<AdminData>('/api/admin/settings');
    setData(d);
    setMonths({ retention: d.settings.retentionMonths, pool: d.settings.poolRetentionMonths });
    setRows(d.statuses.map((s) => ({ id: s.id, label: s.label, kind: s.kind, builtin: s.builtin, used: s.used })));
    setRoleRows(d.roles.map((r) => ({ id: r.id, label: r.label, scope: r.scope, permissions: r.permissions, entraRole: r.entraRole, builtin: r.builtin })));
    setNf(d.settings.notify);
    setHrText(d.settings.notify.hrEmails.join('\n'));
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
          Uprawnienia są sprawdzane na serwerze przy każdej operacji, niezależnie od tego, co widać w interfejsie. Każdy zalogowany widzi zgłoszenia ze
          swojego zakresu; poniżej wybiera się, co może dodatkowo. Rola o zakresie „jeden oddział” widzi tylko swoje miasto. Można dodać własne role
          (na przykład asystenta kierownika). Uprawnienie do ustawień systemowych nadaje tylko administrator systemu.
        </p>
        <div className="table-wrap" role="region" aria-label="Role i uprawnienia" tabIndex={0}>
          <table className="audit matrix">
            <thead>
              <tr>
                <th>Rola</th>
                <th>Zakres</th>
                {data.permissionCatalog.map((p) => (
                  <th key={p.id} title={p.label}>{p.label.split(':')[0]}</th>
                ))}
                <th>Rola w Entra ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roleRows.map((r, i) => {
                const fixed = r.id === 'sysadmin';
                return (
                  <tr key={r.id ?? `new-${i}`}>
                    <td>
                      <input aria-label={`Nazwa roli ${i + 1}`} value={r.label} maxLength={40} onChange={(e) => setRoleRows(roleRows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    </td>
                    <td>
                      {r.builtin ? (
                        r.scope === 'city' ? 'Jeden oddział' : 'Cała firma'
                      ) : (
                        <select aria-label={`Zakres roli ${i + 1}`} value={r.scope} onChange={(e) => setRoleRows(roleRows.map((x, j) => (j === i ? { ...x, scope: e.target.value as 'all' | 'city' } : x)))}>
                          <option value="all">Cała firma</option>
                          <option value="city">Jeden oddział</option>
                        </select>
                      )}
                    </td>
                    {data.permissionCatalog.map((p) => (
                      <td key={p.id}>
                        <input
                          type="checkbox"
                          aria-label={`${r.label}: ${p.label}`}
                          checked={r.permissions.includes(p.id)}
                          disabled={fixed || (p.id === 'settings.system' && !canSystem)}
                          onChange={(e) =>
                            setRoleRows(roleRows.map((x, j) => (j === i ? { ...x, permissions: e.target.checked ? [...x.permissions, p.id] : x.permissions.filter((q) => q !== p.id) } : x)))
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <input className="mono" aria-label={`Rola Entra ID ${i + 1}`} value={r.entraRole} maxLength={60} onChange={(e) => setRoleRows(roleRows.map((x, j) => (j === i ? { ...x, entraRole: e.target.value } : x)))} />
                      {r.scope === 'city' && <small className="hint"> + .Miasto</small>}
                    </td>
                    <td>
                      {!r.builtin && (
                        <button className="btn small danger" type="button" onClick={() => setRoleRows(roleRows.filter((_, j) => j !== i))}>
                          Usuń
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="inline-row">
          <button
            className="btn small"
            type="button"
            onClick={() => setRoleRows([...roleRows, { label: '', scope: 'all', permissions: ['comment'], entraRole: '', builtin: false }])}
          >
            Dodaj rolę
          </button>
          <button
            className="btn small primary"
            type="button"
            disabled={busy}
            onClick={() =>
              save({ roles: roleRows.map((r) => ({ id: r.id, label: r.label, scope: r.scope, permissions: r.permissions, entraRole: r.entraRole })) }, 'Role zapisane')
            }
          >
            Zapisz role
          </button>
        </div>
      </section>

      {canSystem && <SystemSettings onSaved={onSaved} />}

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
        <h2>Statusy zgłoszeń</h2>
        <p className="hint">
          Statusy podstawowe można przemianować i przesunąć. Dodane statusy mają rodzaj, który mówi systemowi, jak je traktować (kalendarz rozmów, podziękowanie po odrzuceniu, okres przechowywania).
          Status używany przez zgłoszenia nie może zostać usunięty.
        </p>
        <ol className="status-edit">
          {rows.map((r, i) => (
            <li key={r.id ?? `new-${i}`} className="inline-row">
              <input
                aria-label={`Nazwa statusu ${i + 1}`}
                value={r.label}
                maxLength={40}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              {r.builtin ? (
                <span className="hint">{STATUS_KINDS.find((k) => k.id === r.kind)?.label ?? 'Początkowy'}</span>
              ) : (
                <select
                  aria-label={`Rodzaj statusu ${i + 1}`}
                  value={r.kind}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as StatusKind } : x)))}
                >
                  {STATUS_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              )}
              <span className="hint">{r.used ? `${r.used} zgłoszeń` : ''}</span>
              <button
                className="btn small"
                type="button"
                aria-label="Przesuń w górę"
                disabled={i <= 1}
                onClick={() => setRows(rows.map((x, j) => (j === i - 1 ? rows[i] : j === i ? rows[i - 1] : x)))}
              >
                ↑
              </button>
              <button
                className="btn small"
                type="button"
                aria-label="Przesuń w dół"
                disabled={i === 0 || i === rows.length - 1}
                onClick={() => setRows(rows.map((x, j) => (j === i + 1 ? rows[i] : j === i ? rows[i + 1] : x)))}
              >
                ↓
              </button>
              {!r.builtin && (
                <button
                  className="btn small danger"
                  type="button"
                  disabled={r.used > 0}
                  title={r.used > 0 ? 'Status jest używany' : undefined}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  Usuń
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className="inline-row">
          <button className="btn small" type="button" onClick={() => setRows([...rows, { label: '', kind: 'active', builtin: false, used: 0 }])}>
            Dodaj status
          </button>
          <button
            className="btn small primary"
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await save({ statuses: rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind })) }, 'Statusy zapisane')) {
                setStatusList(rows.length ? (await api<AdminData>('/api/admin/settings')).statuses : []);
                onStatusesChanged();
              }
            }}
          >
            Zapisz statusy
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Powiadomienia dla HR i kierowników</h2>
        <div className="toggles">
          <label className="switch" htmlFor="nf-enabled">
            <input id="nf-enabled" type="checkbox" checked={nf.enabled} onChange={(e) => setNf({ ...nf, enabled: e.target.checked })} />
            <span>Włącz powiadomienia</span>
          </label>
          <label className="switch" htmlFor="nf-new">
            <input id="nf-new" type="checkbox" checked={nf.onNew} onChange={(e) => setNf({ ...nf, onNew: e.target.checked })} />
            <span>Nowe zgłoszenie</span>
          </label>
          <label className="switch" htmlFor="nf-interview">
            <input id="nf-interview" type="checkbox" checked={nf.onInterview} onChange={(e) => setNf({ ...nf, onInterview: e.target.checked })} />
            <span>Ustalono termin rozmowy</span>
          </label>
        </div>
        <div className="form">
          <div className="field">
            <label htmlFor="nf-hr">E-maile HR (wszystkie oddziały), jeden w wierszu</label>
            <textarea id="nf-hr" rows={3} value={hrText} onChange={(e) => setHrText(e.target.value)} />
          </div>
          {data.dictionaries.cities.map((city) => (
            <div className="field" key={city}>
              <label htmlFor={`nf-city-${city}`}>Kierownik oddziału: {city}</label>
              <input
                id={`nf-city-${city}`}
                type="email"
                value={nf.managerEmails[city] ?? ''}
                onChange={(e) => setNf({ ...nf, managerEmails: { ...nf.managerEmails, [city]: e.target.value } })}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="nf-teams">Webhook Teams (opcjonalnie)</label>
            <input id="nf-teams" type="url" value={nf.teamsWebhook} placeholder="https://…webhook.office.com/… lub …logic.azure.com/…" onChange={(e) => setNf({ ...nf, teamsWebhook: e.target.value })} />
          </div>
          <p className="hint">
            Powiadomienie zawiera imię i nazwisko, stanowisko, oddział i odnośnik do profilu, bez treści CV. Kierownik dostaje tylko zgłoszenia ze
            swojego oddziału. {data.integrations.smtpConfigured ? '' : 'Serwer SMTP nie jest skonfigurowany: e-maile są tylko zapisywane w dzienniku („symulacja”).'}
          </p>
          <div className="inline-row">
            <button
              className="btn small primary"
              type="button"
              disabled={busy}
              onClick={() =>
                save(
                  { notify: { ...nf, hrEmails: hrText.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean) } },
                  'Ustawienia powiadomień zapisane',
                )
              }
            >
              Zapisz powiadomienia
            </button>
          </div>
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
