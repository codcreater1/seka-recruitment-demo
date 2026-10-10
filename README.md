# SEKA recruitment demo

Demo of a recruitment management system for SEKA (ATA student project).
HR receives applications as e-mails with a PDF CV. The system creates a candidate profile from each
application, groups applications by branch city and tracks the status of every candidate.
Branch managers get access to the candidates of their own city only.

- UI language: Polish
- Data: fictional (generated, see `scripts/generate_seed.py`)
- Authentication: demo role switcher (target: Microsoft Entra ID SSO, see "Authentication")

## What works

| Area | Behaviour |
|---|---|
| Applications | List grouped by city tabs, status filters, search, sorting |
| Profile | Contact data, source e-mail, embedded CV (PDF), notes, history, rating, interview date |
| Status pipeline | Nowa, W weryfikacji, Rozmowa, Oferta, Zatrudniony/a, Odrzucona; rejection template (sending is simulated) |
| Intake | `POST /api/ingest` (Power Automate), manual PDF upload, or one of five bundled sample CVs |
| PDF reading | Server-side text extraction; name, e-mail, phone, city and position are detected; scans are flagged "Do sprawdzenia" |
| City logic | From the e-mail subject, otherwise from the CV address; unknown goes to "Do przypisania" |
| Duplicates | Same e-mail address as an existing profile is flagged |
| Roles | HR sees everything; a branch manager sees only the own city, can comment, cannot change anything else (enforced on the server) |
| GDPR | Export a candidate as JSON, delete a profile with its file, retention warning, audit log |

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

The database and uploaded CVs are stored in `./data` (ignored by git). Delete the folder to reset the demo data.

```bash
npm run build && npm start     # production build
npm run typecheck
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `INGEST_API_KEY` | empty (endpoint disabled) | Secret for `POST /api/ingest` |
| `RETENTION_MONTHS` | `6` | Age after which a profile is flagged as past retention |
| `SEED_DEMO_DATA` | `true` | Load the fictional candidates when the database is empty |
| `DATA_DIR` | `./data` (`/data` in Docker) | SQLite database and uploaded files |

## Deploy on Coolify

1. New resource, source: this GitHub repository, build pack **Dockerfile**.
2. Port: `3000`. Health check path: `/api/health`.
3. Persistent storage: add a volume with destination **`/data`** (database and CVs live there).
4. Environment variables: at least `INGEST_API_KEY` if you want the e-mail intake.
5. Deploy. On first start the database is created and filled with the demo candidates.

To try the image locally: `docker compose up --build`.

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

Response: `201 { "id": "...", "needsReview": false, "attachmentAccepted": true }`.
Mails without a PDF still create a profile (from the sender data) flagged for review.

## Authentication

The demo has no login: the role is picked in the header and kept in a cookie. Every API route reads the role
through `getSession()` in `src/lib/auth.ts`, so permissions are already enforced on the server. A real
deployment replaces `getSession()` with Microsoft Entra ID (for example Auth.js with the `microsoft-entra-id`
provider) and maps groups or app roles to "HR" and "manager of city X".

## Repository layout

| Path | Content |
|---|---|
| `src/app` | Next.js pages and API routes |
| `src/components` | React UI |
| `src/lib` | Database, domain constants, PDF parsing, intake logic, auth |
| `seed/` | Generated sample CVs (PDF) and `seed.json` |
| `scripts/generate_seed.py` | Regenerates the sample CVs (needs `reportlab`, `pypdfium2`) |
| `prototype/` | First single-file prototype (browser storage only) |
| `Dockerfile`, `docker-compose.yml` | Container build for Coolify or local use |

## Roadmap

- [ ] Microsoft Entra ID sign-in
- [ ] Optional LLM extraction of CV fields (rule-based parsing is used now)
- [ ] Real outgoing e-mails (confirmation and rejection are simulated)
- [ ] OCR for scanned CVs
- [ ] Reports (applications per city, time per stage)
- [ ] Tests in CI
