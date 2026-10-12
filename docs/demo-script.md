# Demo script (about 10 minutes)

Audience: SEKA HR (Mrs Agnieszka) and the instructor. The interface is in Polish; the labels below are the ones you
click, in quotes.

## Before you start (2 minutes)

1. Open the deployed address (or `http://localhost:3000` after `docker compose up --build`).
2. Top-right menu → "Przewodnik po demo" → "Przywróć dane demonstracyjne…" (confirm). The dates of the sample data are relative to
   the first start, so reset right before presenting: "2 godz. temu" and the interview calendar then look current.
3. Display: text size "Średni" (menu → "Rozmiar tekstu"), browser zoom 100 %, one browser tab. Light or dark theme, both work.
4. Sample files are in `seed/incoming/` (seven CVs, two of them `.eml`), and "Nowe zgłoszenie" offers them as buttons.

## Storyline

| # | Say | Do |
|---|---|---|
| 1 | "Applications arrive as e-mails with a PDF. HR should see them sorted by city, with a status, without retyping." | Open "Pulpit": the numbers, applications per city, "Wymaga uwagi" (needs review, duplicates, waiting more than 7 days). |
| 2 | "Every application becomes a profile; the city comes from the subject, then from the address in the CV." | "Lista": click the city tabs. Open a profile: contact data, facts read from the CV, the source e-mail. |
| 3 | "We read the text of the CV, so HR can search by skill, not only by name." | Type `chromatografia` in the search box: candidates are found by what their CV says, and the matching text is shown under the name. |
| 4 | "The original document stays one click away." | Profile → "CV": preview, "Pobierz CV (PDF)" (the download is logged). |
| 5 | "A new application arrives." | "Nowe zgłoszenie" → pick a sample (a text CV, then the scanned one). The text CV is parsed completely and linked to the matching vacancy; the scan is flagged "Do sprawdzenia" because there is no text layer. Mention OCR as the next step. |
| 6 | "A returning candidate is flagged, not merged blindly." | Open the profile marked "Możliwy duplikat". |
| 7 | "Moving a candidate is one gesture." | "Tablica": drag a card to "Rozmowa". |
| 8 | "An interview invitation carries a calendar file." | Profile → "Przegląd": set "Termin rozmowy" → "Wyślij zaproszenie (z plikiem .ics)". Show "Kalendarz". Without SMTP the message is recorded as "symulacja"; with `SMTP_HOST` set it is really sent. |
| 9 | "The branch manager sees only the own city." | Menu → "Zalogowano jako" → "Kierownik oddziału – Kraków". Only Kraków appears; the manager can comment and add an opinion after the interview, but cannot change data (enforced on the server). Switch back to HR. |
| 10 | "Opinions are structured and never summed into a score." | Profile → "Opinie i notatki": three criteria, recommendation, comment. Say it plainly: the system does not rank people. |
| 11 | "Fairness: review without names." | Menu → "Tryb anonimowy": names, e-mails and the CV preview are hidden. |
| 12 | "GDPR is part of the workflow." | Profile → "Historia" → "Eksportuj dane (JSON)" and "Usuń profil"; "Pulpit" → "Wymaga uwagi" → "Po terminie przechowywania danych"; menu → "Dziennik zdarzeń" (audit log). |
| 13 | "Vacancies and the talent pool." | "Ogłoszenia": applications per vacancy and stage; "Baza kandydatów" chip in the list (consent for future recruitment, longer retention). |
| 14 | "How it plugs into SEKA." | Mention: Power Automate calls `POST /api/ingest` for each new mail (no mailbox access needed), SSO with Microsoft Entra ID replaces the role switcher (`getSession()` is the single seam). Menu → "Do omówienia" lists the open questions for SEKA. |

## If something goes wrong

| Situation | What to do |
|---|---|
| The list is empty or odd | Menu → "Przewodnik po demo" → "Przywróć dane demonstracyjne…". |
| A toast shows an error text | It is the server's message in Polish (for example "Brak uprawnień" for a manager). Switch the role back to HR. |
| The page looks stale | Refresh (F5): the screen is kept in the address (`/#/tablica`, `/#/lista/<id>`), so you return to the same place. |
| The deployed site is not reachable | Run it locally: `docker compose up --build` (or `npm run build && npm start`) and open `http://localhost:3000`. |
| The browser asks for a password | `DEMO_PASSWORD` is set on the server; any user name works. |

## Honest limits (say them before you are asked)

- The role switcher is a stand-in for single sign-on; the permission rules themselves are real and enforced on the server.
- E-mail is simulated unless SMTP is configured.
- Scanned CVs are flagged, not read (OCR is on the roadmap); the field detection is rule-based, not an LLM.
- Data is fictional (generated); the SEKA logo is used for the demonstration only.

## Likely questions

- **How do mails get in?** A Power Automate flow on SEKA's side posts each mail to `/api/ingest` with a key; the app never
  needs mailbox credentials.
- **Where is the data?** One SQLite file and the CVs in the `/data` volume; backing up means copying that folder.
- **Who can see what?** HR sees all; a branch manager sees one city. With Entra ID the role comes from group membership.
- **Does it rate candidates?** No. Ratings and opinions are written by people and are never combined into a score.
- **What about retention?** Six months by default, 24 months with consent for future recruitment, configurable; expired
  profiles are listed and can be removed in one action, and every deletion is audited.
