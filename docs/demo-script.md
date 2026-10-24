# Demo script (about 12 minutes)

Audience: SEKA HR (Mrs Agnieszka), the instructor and perhaps IT. The interface is in Polish; the labels below are the
ones you click, in quotes.

## Before you start (3 minutes)

1. Open the deployed address (or `http://localhost:3000` after `docker compose up --build`).
2. Sign in as the administrator: "Zaloguj przez Microsoft" → "Administrator systemu". Menu (top right) →
   "Przewodnik po demo" → "Przywróć dane demonstracyjne…" (confirm). The dates of the sample data are relative to the first
   start, so reset right before presenting: "2 godz. temu" and the interview calendar then look current. Only the
   administrator can reset.
3. Switch to the HR account (menu → "Przełącz konto (demo)" → "Agnieszka (HR) · HR manager"): that is Mrs Agnieszka's view.
4. Display: text size "Średni" (menu → "Rozmiar tekstu"), browser zoom 100 %, one browser tab. Light or dark theme, both work.
5. Sample files are in `seed/incoming/`, and "Nowe zgłoszenie" offers them as buttons (nine of them, including a mail without
   an attachment, a scan, and a CV without city and position).

## Storyline

| # | Say | Do |
|---|---|---|
| 1 | "Everybody signs in with their Microsoft account. The role decides what they see." | Show the sign-in page (log out, "Zaloguj przez Microsoft"): administrator, HR manager, one branch manager per city. Say that in production these are the Entra ID app roles `SEKA.Admin`, `SEKA.HR`, `SEKA.Branch.<city>`. |
| 2 | "Applications arrive as e-mails with a PDF. HR should see them sorted by city, with a status, without retyping." | HR account → "Pulpit": the numbers, applications per city, "Wymaga uwagi" (missing data, needs review, duplicates, waiting more than 7 days). |
| 3 | "Every application becomes a profile; the city comes from the subject, then from the address in the CV." | "Lista": click the city tabs. Open a profile: contact data, facts read from the CV, the source e-mail. |
| 4 | "We read the text of the CV, so HR can search by skill, not only by name." | Type `chromatografia` in the search box: candidates are found by what their CV says, and the matching text is shown under the name. |
| 5 | "The original document stays one click away." | Profile → "CV": preview, "Pobierz CV (PDF)" (the download is logged). |
| 6 | "A complete application: the candidate gets a confirmation." | "Nowe zgłoszenie" → pick a text CV. The profile is complete and linked to the vacancy; "Korespondencja" shows the acknowledgement. |
| 7 | "**An incomplete application: the system asks for what is missing, by itself.**" | "Nowe zgłoszenie" → "wiadomość bez załącznika" (no CV), then "CV bez miasta i stanowiska" and the scan. Each profile shows "Czeka na uzupełnienie" and "Korespondencja" has the request listing exactly what is missing. |
| 8 | "The candidate's answer completes the same profile." | Show how HR completes it: profile → "CV" → "Dołącz CV…" (any PDF from `seed/incoming/`), or set the city in "Przegląd". The banner "Brakuje: …" disappears and the history says "Zgłoszenie jest kompletne". With real mail the answer is matched on the sender address automatically. |
| 9 | "A returning candidate is flagged, not merged blindly." | Open the profile marked "Możliwy duplikat". |
| 10 | "Moving a candidate is one gesture." | "Tablica": drag a card to "Rozmowa". |
| 11 | "An interview invitation carries a calendar file." | Profile → "Przegląd": set "Termin rozmowy" → "Wyślij zaproszenie (z plikiem .ics)". Show "Kalendarz". Without SMTP the message is recorded as "symulacja"; with `SMTP_HOST` set it is really sent. |
| 12 | "The branch manager sees only the own city." | Menu → "Przełącz konto (demo)" → "Kierownik oddziału – Kraków". Only Kraków appears; the manager can comment and add an opinion after the interview, but cannot change data (enforced on the server). Switch back to HR. |
| 13 | "Opinions are structured and never summed into a score." | Profile → "Opinie i notatki": three criteria, recommendation, comment. Say it plainly: the system does not rank people. |
| 14 | "Fairness: review without names." | Menu → "Tryb anonimowy": names, e-mails and the CV preview are hidden. |
| 15 | "GDPR is part of the workflow." | Profile → "Historia" → "Eksportuj dane (JSON)" and "Usuń profil"; "Pulpit" → "Wymaga uwagi" → "Po terminie przechowywania danych"; menu → "Dziennik zdarzeń" (audit log, sign-ins included). |
| 16 | "Vacancies and the talent pool." | "Ogłoszenia": applications per vacancy and stage; "Baza kandydatów" chip in the list (consent for future recruitment, longer retention). |
| 17 | "**The administrator configures the system.**" | Switch to "Administrator systemu" → "Admin" in the left rail: the roles and permissions (add an "Asystent" role limited to one branch), the statuses, the system settings with the company mailbox kariera@seka.pl, the accounts with their Entra ID role names, the two automatic messages (switch one off), the wording of a message (change "Prośba o uzupełnienie", watch the preview, save), the retention periods. HR and branch managers do not see this screen and the server refuses them. |
| 18 | "How it plugs into SEKA." | Power Automate calls `POST /api/ingest` for each new mail (no mailbox access needed) and gets back what is missing, so it can also send the request itself; Microsoft Entra ID sign-in is built in (`docs/entra-id.md`); the production system is Laravel + Postgres, the map is in `docs/laravel-migration.md`. Menu → "Do omówienia" lists the open questions for SEKA. |

## If something goes wrong

| Situation | What to do |
|---|---|
| The list is empty or odd | Administrator account → menu → "Przewodnik po demo" → "Przywróć dane demonstracyjne…". |
| A toast shows an error text | It is the server's message in Polish (for example "Brak uprawnień" for a manager). Switch the account back to HR. |
| "Zaloguj się, aby kontynuować" or the sign-in page appears | The session ended (12 hours) or the data folder was reset: sign in again. |
| The page looks stale | Refresh (F5): the screen is kept in the address (`/#/tablica`, `/#/lista/<id>`), so you return to the same place. |
| The deployed site is not reachable | Run it locally: `docker compose up --build` (or `npm run build && npm start`) and open `http://localhost:3000`; other options in `docs/deployment.md`. |
| The browser asks for a password | `DEMO_PASSWORD` is set on the server; any user name works. |

## Honest limits (say them before you are asked)

- The accounts on the sign-in page are demo accounts. The Microsoft Entra ID sign-in is implemented and tested against a
  local identity provider, but not yet against SEKA's tenant (that needs their app registration). The permission rules are
  real and enforced on the server in both modes.
- E-mail is simulated unless SMTP is configured; the requests for missing data are recorded on the profile.
- Scanned CVs are flagged and the candidate is asked for a readable file, not read (OCR is on the roadmap); the field detection
  is rule-based, not an LLM.
- Data is fictional (generated); the SEKA logo is used for the demonstration only.
- The prototype is Next.js with SQLite; SEKA's stack is Laravel and Postgres, which is why `docs/laravel-migration.md` exists.

## Likely questions

- **How do mails get in?** A Power Automate flow on SEKA's side posts each mail to `/api/ingest` with a key; the app never
  needs mailbox credentials. The answer says what is missing, so SEKA can choose who sends the request: the app or the flow.
- **What if the candidate never answers?** The profile stays "Czeka na uzupełnienie" and shows on the dashboard under
  "Brakujące dane lub CV"; HR can ask again or decide.
- **Where is the data?** One SQLite file and the CVs in the `/data` volume; backing up means copying that folder. In production: Postgres.
- **Who can see what?** Administrator: everything and the settings. HR manager: all cities. Branch manager: one city. With
  Entra ID the role comes from the app roles or groups assigned to the user.
- **Does it rate candidates?** No. Ratings and opinions are written by people and are never combined into a score.
- **What about retention?** Six months by default, 24 months with consent for future recruitment, changeable by the
  administrator; expired profiles are listed and can be removed in one action, and every deletion is audited.
