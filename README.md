# SEKA recruitment demo

Demo of a recruitment management system for SEKA (ATA student project).
HR receives applications as e-mails with a PDF CV. The system creates a candidate profile from each
application, groups applications by branch city and tracks the status of every candidate.
Branch managers get access to the candidates of their own city only. Sign-in is meant to go through Microsoft Entra ID
(SSO); three roles: administrator, HR manager (whole company), branch manager (one city).

- UI language: Polish
- Look: logo, colours and typeface follow the SEKA website (blue #1b3985, Plus Jakarta Sans). The logo file
  `public/seka-logo.png` belongs to SEKA S.A. and is used here only for this demonstration.
- Layout: narrow icon rail, one-line filters, list and profile panels that scroll independently (the page itself
  never scrolls), profile in tabs (overview, CV, opinions and notes, correspondence, history). One pane at a time
  below 1100 px. Light and dark theme (follows the system) and text size S / M / L, both in the user menu. The text
  size defaults to M on screens with display scaling of 125% or more, and everything is sized in rem.
- Data: fictional (generated, see `scripts/generate_seed.py`)
- Authentication: sign-in page with demo accounts, or Microsoft Entra ID (`AUTH_MODE=entra`, see [`docs/entra-id.md`](docs/entra-id.md))

## What works

| Area | Behaviour |
|---|---|
| Views | List with profile, Kanban board (drag a card to change status), interview calendar, vacancies, summary dashboard |
| Applications | City tabs, status filters, quick filters, sorting, CSV export |
| Search | Name, position, e-mail and the **text of the CVs** (SQLite FTS5, diacritics-insensitive) |
| Profile | Contact data, source e-mail, embedded CV (PDF) with a download button (downloads are logged), facts read from the CV, notes, history, rating, interview date |
| Status pipeline | Nowa, W weryfikacji, Rozmowa, Oferta, Zatrudniony/a, Odrzucona |
| Vacancies (Ogłoszenia) | Open and closed vacancies per city and position, applications linked automatically at intake, candidate counts per stage |
| Talent pool (Baza kandydatów) | Candidates whose CV consents to future recruitments; longer retention period (`POOL_RETENTION_MONTHS`) |
| Interviews | Weekly calendar, `.ics` file for every interview, invitation e-mail with the calendar file attached |
| Opinions | HR and the branch manager add a structured opinion after an interview (three criteria, recommendation, comment); opinions are never summed or ranked |
| Anonymous mode | Hides names, e-mails and the CV preview; names are not searchable |
| Guided demo | "Przewodnik" walks through the features and can reset the demo data |
| Intake | `POST /api/ingest` (Power Automate), manual PDF or `.eml` upload, bundled sample CVs |
| PDF reading | Server-side text extraction; name, e-mail, phone, city and position are detected; scans are flagged "Do sprawdzenia" |
| City logic | From the e-mail subject, otherwise from the CV address; unknown goes to "Do przypisania" |
| Correspondence | Acknowledgement on intake, interview invitation, thank-you after rejection; logged on the profile; bulk "reject and thank" |
| Incomplete applications | No CV, an unreadable CV, no city or no position: the candidate gets an e-mail asking for exactly that (switchable), the profile is marked "Czeka na uzupełnienie", and the answer (the same sender) completes the same profile. HR can ask again or attach the CV by hand. `/api/ingest` returns the list of gaps (`missing`) so Power Automate can send the mail itself instead |
| Duplicates | Same e-mail address as an existing profile is flagged |
| Roles | **Administrator**: everything, the settings, the demo reset. **HR manager**: all cities, all candidate operations. **Branch manager**: only the own city, can read, comment and add opinions. Enforced on the server for every request |
| Administration | Administrator only: the permission matrix, the accounts with their Entra ID role names, which automatic messages are sent, the wording of every message (with a live preview), retention periods, integration status |
| GDPR | Export a candidate as JSON, delete a profile with its file, retention warning and bulk clean-up, audit log |
| Fairness | No automatic scoring or ranking of candidates; ratings are entered by a person |

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

The database and uploaded CVs are stored in `./data` (ignored by git). Delete the folder to reset the demo data.

```bash
npm run build && npm start     # production server (the same one the Docker image runs)
npm run typecheck
npm test                       # API tests (needs a build first)
```

`npm test` starts the production server on a free port with throw-away data and checks permissions, intake,
search, vacancies, interviews, e-mail, GDPR functions and the demo reset. CI (`.github/workflows/ci.yml`) runs
type check, build, tests and a Docker smoke test on every push.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_MODE` | `demo` | `demo`: demo accounts on the sign-in page (no passwords, so protect public links with `DEMO_PASSWORD`). `entra`: Microsoft Entra ID |
| `SESSION_SECRET` | generated, kept in the data volume | Signs the session cookie. Set a long random value when you run several copies |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `APP_URL`, `ENTRA_ROLE_MAP` | empty | Microsoft Entra ID, see [`docs/entra-id.md`](docs/entra-id.md) |
| `DEMO_PASSWORD` | empty (no gate) | Password gate (HTTP Basic auth, any user name) for a public demo |
| `INGEST_API_KEY` | empty (endpoint disabled) | Secret for `POST /api/ingest` |
| `RETENTION_MONTHS` | `6` | Age after which a profile is flagged as past retention |
| `POOL_RETENTION_MONTHS` | `24` | Same for candidates with consent for future recruitments |
| `SEED_DEMO_DATA` | `true` | Load the fictional candidates when the database is empty |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | empty | Real outgoing e-mail. Without `SMTP_HOST` messages are only recorded as "symulacja" |
| `DATA_DIR` | `./data` (`/data` in Docker) | SQLite database and uploaded files |
| `APP_TIMEZONE` | `Europe/Warsaw` | Time zone of the company. Interview times are wall-clock times, so "upcoming" is decided in this zone, whatever the server's own clock says |

## Deploy on Coolify

1. New resource, source: this GitHub repository, build pack **Dockerfile**.
2. Port: `3000`. Health check path: `/api/health`.
3. Persistent storage: add a volume with destination **`/data`** (database and CVs live there).
4. Environment variables: `DEMO_PASSWORD` (demo accounts have no passwords, so set one before sharing the link) or `AUTH_MODE=entra` with the `ENTRA_*` values, and, for the e-mail intake, `INGEST_API_KEY`.
   Serve the app over HTTPS (assign a domain in Coolify) so the password is not sent in clear text.
5. Deploy. On first start the database is created and filled with the demo candidates.

To try the image locally: `docker compose up --build`. Other ways to show the demo when Coolify is not available (tunnel, cloud host, a recording) are in [`docs/deployment.md`](docs/deployment.md).

### Before the demo

- Sign in as the administrator (login page → "Zaloguj przez Microsoft" → "Administrator systemu"), open the menu (top right) → "Przewodnik po demo" → "Przywróć dane demonstracyjne". The dates of the sample data are
  relative to the first start, so a reset right before presenting makes "2 godz. temu" and the interview calendar current.
- The walkthrough with talking points is in [`docs/demo-script.md`](docs/demo-script.md).
- Every screen has its own address (`/#/lista`, `/#/tablica`, `/#/kalendarz`, `/#/ogloszenia`, `/#/pulpit`, and
  `/#/lista/<id>` for a profile), so a refresh or a pasted link opens the same place and the browser's Back button works.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Coolify answers 403 on "new resource" | The account has no permission in that project. Ask the instructor to grant it; nothing to change in the app. |
| Data disappears after every deploy | No volume on `/data`. Add a persistent storage with destination `/data`. |
| Empty list on a fresh server | `SEED_DEMO_DATA=false` was set, or the database already exists (and is empty). Use "Przywróć dane demonstracyjne". |
| Browser asks for a password | `DEMO_PASSWORD` is set. Any user name works; ten wrong passwords in a minute block that address for a minute. |
| `POST /api/ingest` answers 503 | `INGEST_API_KEY` is not set. 401 means a wrong key, 429 too many wrong keys from one address. |
| Container is "unhealthy" | `GET /api/health` must answer `{"ok":true}`; check the volume is writable by the `node` user (uid 1000). |
| Dates look off by an hour or two | Set `APP_TIMEZONE` (default `Europe/Warsaw`). |

## E-mail intake (Power Automate)

SEKA IT can keep the mailbox on their side. A flow triggered by new mail in the careers mailbox calls the
endpoint with the attachment, so the application never needs access to the mailbox.

```bash
curl -X POST https://<your-host>/api/ingest \
  -H "x-api-key: $INGEST_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "from": "Jan Kowalski <jan.kowalski@example.com>",
    "subject": "Aplikacja na stanowisko: Technik laboratoryjny (Kraków)",
    "receivedAt": "2026-10-12T09:15:00Z",
    "attachments": [{ "name": "CV.pdf", "contentBase64": "<base64 of the PDF>" }]
  }'
```

Response: `201 { "id": "...", "needsReview": false, "missing": [], "infoRequested": false, "merged": false, "attachmentAccepted": true }`.

- Mails without a PDF still create a profile (from the sender data) flagged for review.
- `missing` lists what the application lacks: `cv`, `cv_unreadable`, `city`, `position`. With the default settings the
  candidate is then asked for it by e-mail (`infoRequested: true`); a complete application gets the acknowledgement. A flow
  that prefers to send the mail itself can switch the automatic request off in the administration screen and branch on `missing`.
- A later mail from the same sender, while the first one is still incomplete, is the answer: it completes that profile
  (`merged: true`, same `id`) and does not create a second one.
- Messages are recorded on the profile, and sent only when SMTP is configured.

## Security notes

What is in place:

- Every endpoint needs a signed-in user and checks the role on the server (a manager cannot read or change another city
  by guessing ids; only the administrator reaches the settings).
- Optional password gate (`DEMO_PASSWORD`) and API key for intake (`INGEST_API_KEY`), both compared in constant time,
  with a limit of ten wrong attempts per minute per address (in memory, one process).
- Security headers on every response (`nosniff`, frame protection, referrer and permissions policy), the role cookie is
  `HttpOnly`, `SameSite=Lax` and `Secure` behind an HTTPS proxy.
- Uploads: type and size are checked (PDF or `.eml`, 10 MB), a request that declares too large a body is refused before it is read, PDF reading
  is limited to 30 pages and 20 seconds, text kept per CV is capped, and CSV export neutralises spreadsheet formulas.
- The health endpoint reveals nothing about the data. CV downloads are written to the audit log.

What is deliberately not there (demo scope): real sign-in (the role switcher is a stand-in, see below), per-user audit
identity, malware scanning of attachments, encryption of the database at rest (use disk or volume encryption), and a
full Content-Security-Policy for scripts. `npm audit` lists advisories (up to "high") for the PostCSS copy that Next.js 15
depends on. They concern processing untrusted CSS; the app runs PostCSS only at build time, on its own stylesheet. The fix
is a major upgrade (Next.js 16) that is not worth the risk before the demo.

## Authentication

Every page and API route needs a session (a signed cookie). Two ways to get one, both ending in the same cookie:

- **Demo** (`AUTH_MODE=demo`, default): the sign-in page offers demo accounts for every role and branch. There are no passwords,
  so a public link needs `DEMO_PASSWORD` in front. The menu switches accounts without leaving the page.
- **Microsoft Entra ID** (`AUTH_MODE=entra`): OpenID Connect code flow with PKCE and a verified ID token; roles from app roles
  (`SEKA.Admin`, `SEKA.HR`, `SEKA.Branch.<city>`) or groups. Setup in [`docs/entra-id.md`](docs/entra-id.md). Tested against a
  local identity provider; to be tried with SEKA's tenant.

The prototype is Next.js and SQLite; SEKA's production stack is Laravel, Postgres and Docker. How each part maps is in
[`docs/laravel-migration.md`](docs/laravel-migration.md).

## Repository layout

| Path | Content |
|---|---|
| `src/app` | Next.js pages and API routes |
| `src/components` | React UI (list, board, summary, profile, dialogs) |
| `src/lib` | Database, domain constants, PDF parsing and CV facts, intake, search, calendar files, mailer, auth |
| `seed/` | Generated sample CVs (PDF), sample e-mails (`.eml`) and `seed.json` |
| `scripts/generate_seed.py` | Regenerates the sample CVs (needs `reportlab`, `pypdfium2`) |
| `tests/` | `node:test`: `api.test.mjs` (features, roles, parsing, settings), `gate.test.mjs` (password gate, brute-force limits), `entra.test.mjs` (Microsoft sign-in against a local identity provider) |
| `docs/` | Demo walkthrough, Microsoft Entra ID setup, deployment options, Laravel migration map |
| `prototype/` | First single-file prototype (browser storage only) |
| `Dockerfile`, `docker-compose.yml` | Container build for Coolify or local use |

## Roadmap

- [ ] Try the Microsoft Entra ID sign-in against SEKA's tenant (implemented, tested locally)
- [ ] Port to Laravel + Postgres (map in `docs/laravel-migration.md`)
- [ ] Optional LLM extraction of CV fields (rule-based parsing is used now)
- [ ] OCR for scanned CVs
- [ ] Outlook `.msg` import (`.eml` works)
- [ ] Several attachments per application (cover letter, certificates)
- [x] Merge duplicate profiles ("Połącz z poprzednim" on a flagged duplicate)
- [ ] Notifications to HR and managers (e-mail or Teams webhook)
