'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './ui';

type Secret = { set: boolean; fromEnvironment: boolean; hint: string };
type SystemData = {
  values: {
    mailbox: string; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string;
    entraTenant: string; entraClient: string; appUrl: string; aiProvider: string;
  };
  secrets: { smtpPass: Secret; entraSecret: Secret; aiKey: Secret };
};
type SecretKey = keyof SystemData['secrets'];

/** Technical settings for the system administrator: company mailbox, mail server, Azure / Entra ID, AI key. */
export default function SystemSettings({ onSaved }: { onSaved: (msg: string) => void }) {
  const [data, setData] = useState<SystemData | null>(null);
  const [form, setForm] = useState<SystemData['values'] | null>(null);
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>({ smtpPass: '', entraSecret: '', aiKey: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const d = await api<SystemData>('/api/admin/system');
    setData(d);
    setForm(d.values);
    setSecrets({ smtpPass: '', entraSecret: '', aiKey: '' });
  }, []);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  const save = async (extra: Record<string, unknown> = {}) => {
    if (!form) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...form, ...extra };
      for (const k of Object.keys(secrets) as SecretKey[]) if (secrets[k]) body[k] = secrets[k];
      await api('/api/admin/system', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await load();
      onSaved('Ustawienia systemowe zapisane');
    } catch (e) {
      onSaved((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="notice">Nie udało się wczytać ustawień systemowych: {error}</div>;
  if (!data || !form) return <div className="loading">Wczytywanie ustawień systemowych…</div>;

  const text = (key: keyof SystemData['values'], label: string, type = 'text', placeholder = '') => (
    <div className="field">
      <label htmlFor={`sys-${key}`}>{label}</label>
      <input
        id={`sys-${key}`}
        type={type}
        value={String(form[key])}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setForm({ ...form, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
      />
    </div>
  );
  const secret = (key: SecretKey, label: string) => (
    <div className="field">
      <label htmlFor={`sys-${key}`}>{label}</label>
      <div className="inline-row">
        <input
          id={`sys-${key}`}
          type="password"
          autoComplete="new-password"
          value={secrets[key]}
          placeholder={data.secrets[key].set ? `ustawione (${data.secrets[key].hint})${data.secrets[key].fromEnvironment ? ', ze zmiennej środowiskowej' : ''}` : 'nie ustawiono'}
          onChange={(e) => setSecrets({ ...secrets, [key]: e.target.value })}
        />
        {data.secrets[key].set && !data.secrets[key].fromEnvironment && (
          <button className="btn small danger" type="button" disabled={busy} onClick={() => save({ clear: [key] })}>
            Usuń
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="panel">
      <h2>Ustawienia systemowe</h2>
      <p className="hint">
        Dostępne tylko dla administratora systemu. Hasła i klucze są zapisywane w postaci zaszyfrowanej i nigdy nie wracają do przeglądarki; puste pole
        oznacza „bez zmian”. Wartość tutaj ma pierwszeństwo przed zmienną środowiskową.
      </p>
      <div className="form">
        <h3>Skrzynka firmowa i serwer poczty</h3>
        {text('mailbox', 'Skrzynka, z której wychodzą wszystkie wiadomości do kandydatów', 'email', 'kariera@seka.pl')}
        {text('smtpHost', 'Serwer SMTP')}
        {text('smtpPort', 'Port SMTP', 'number')}
        <label className="switch" htmlFor="sys-secure">
          <input id="sys-secure" type="checkbox" checked={form.smtpSecure} onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })} />
          <span>Połączenie szyfrowane od początku (port 465)</span>
        </label>
        {text('smtpUser', 'Użytkownik SMTP')}
        {secret('smtpPass', 'Hasło SMTP')}
        <h3>Azure / Microsoft Entra ID</h3>
        {text('entraTenant', 'Identyfikator katalogu (tenant ID)')}
        {text('entraClient', 'Identyfikator aplikacji (client ID)')}
        {secret('entraSecret', 'Wpis tajny klienta (client secret)')}
        {text('appUrl', 'Publiczny adres aplikacji', 'url', 'https://rekrutacja.seka.pl')}
        <p className="hint">Tryb logowania (demo lub Entra ID) przełącza się zmienną środowiskową AUTH_MODE, żeby pomyłka w formularzu nie zablokowała wszystkim dostępu.</p>
        <h3>Sztuczna inteligencja</h3>
        {text('aiProvider', 'Dostawca (np. Anthropic)')}
        {secret('aiKey', 'Klucz API')}
        <div className="inline-row">
          <button className="btn small primary" type="button" disabled={busy} onClick={() => save()}>
            Zapisz ustawienia systemowe
          </button>
        </div>
      </div>
    </section>
  );
}
