# Moving to Laravel and Postgres

SEKA keeps its applications in PHP, so the production system is Laravel + PostgreSQL + Docker. This repository is a
working prototype (Next.js, SQLite) built to settle the behaviour with HR first. Nothing in it has to be thrown away:
the test suite describes the behaviour precisely and is the specification for the port.

## What carries over unchanged

- **The behaviour**, written down as 30+ API tests in `tests/` (permissions, intake, parsing, missing data, GDPR, settings, sign-in).
  Port them to PHPUnit/Pest feature tests and use them as the acceptance test of every step.
- **The e-mail intake contract**: `POST /api/ingest` with `x-api-key` and `{ from, subject, receivedAt?, attachments[] }`,
  answering `{ id, needsReview, missing[], infoRequested, merged }`. Power Automate flows built now keep working.
- **The data model** (below), the message texts, the status list and the role matrix (`docs/` and the admin screen).
- **The 22 sample CVs** with their expected values (`seed/seed.json`), the best test data for the CV parser.

## Where each part goes

| Prototype | Laravel |
|---|---|
| Sign-in with Entra ID (`src/lib/entra.ts`, `docs/entra-id.md`) | `laravel/socialite` with `socialiteproviders/microsoft-azure`; the `roles` claim sets the role, the app role `SEKA.Branch.<city>` sets the city |
| Roles admin / hr / manager | `spatie/laravel-permission` (or three gates); `users.city` for the branch manager |
| Branch scoping in `scopeSql()` | a global scope on the `Candidate` model that adds `where city = auth()->user()->city` for managers (one place, like today) |
| `requireSession` / `requireEditor` / `requireAdmin` | middleware (`auth`, `role:admin\|hr`, `role:admin`) and policies |
| SQLite tables | Postgres migrations: `candidates`, `notes`, `events`, `emails`, `feedback`, `vacancies`, `audit_log`, `settings` |
| FTS5 search over CV text | `tsvector` column with a GIN index, `unaccent` for Polish diacritics, `websearch_to_tsquery` |
| PDF text (unpdf) | `smalot/pdfparser`, or `pdftotext` through `symfony/process`; OCR for scans later (Tesseract) |
| CV rules (`cv-parse.ts`, `analyze.ts`) | one `CvParser` service class, same rules; no scoring, on purpose (GDPR art. 22) |
| Missing-data requests and matching the answer by e-mail | a service plus a queued job; the answer is matched on the sender address |
| Settings and editable message texts | `settings` table with cache; the admin screen as a Livewire or Inertia page |
| Sending mail (nodemailer) | Laravel Mail (queued Mailables), texts rendered from the `{{placeholders}}` templates |
| Calendar file (`ics.ts`) | `eluceo/ical` |
| Retention and "delete expired" | a scheduled command (`candidates:purge-expired`), audit with `spatie/laravel-activitylog` |
| UI (React) | keep it with Inertia.js (React adapter), or rebuild in Livewire/Blade; the visual design and Polish texts stay |
| Docker | `php-fpm` + `nginx` + `postgres` + a queue worker and the scheduler in one compose file, health check on `/api/health` |

## Data model

```
candidates(id, name, email, phone, city, position, status, received_at, channel, from_addr, subject, city_basis,
           rodo, file_id, file_name, file_size, raw_text, rating, interview_at, rejection_sent, needs_review,
           duplicate_of, vacancy_id, cv_state, info_requested_at, info_requested_items)
notes(candidate_id, author, text, created_at)      events(candidate_id, at, actor, text)
emails(candidate_id, at, template, to_addr, subject, body, status, actor, error, attachment)
feedback(candidate_id, author, at, communication, knowledge, fit, recommendation, comment)
vacancies(id, position, city, status, opened_at, closed_at, owner)
audit_log(at, actor, action, detail)               settings(key, value, updated_at, updated_by)
```

## Suggested order

1. Skeleton: Docker compose, Postgres, migrations, seed command that loads `seed/seed.json`.
2. Sign-in with Entra ID and the three roles, then the scoped candidate list (first tests: roles and branch scoping).
3. Intake: `/api/ingest`, PDF text, `CvParser` against the 22 sample CVs, city and position detection, duplicates.
4. Missing data: requests, matching the answer, attaching a CV by hand.
5. Profile, status changes, notes and opinions, interviews with the calendar file, vacancies.
6. Search, dashboard, CSV and JSON export, retention and the audit log.
7. Admin settings and message texts.
8. UI on top (Inertia), then the decision on OCR and on optional LLM extraction.

## Worth deciding with SEKA before step 1

Hosting (Azure container service or their own servers), where the mailbox is (Microsoft 365 and Power Automate, or a
Graph integration), how long CVs are kept, who is the data controller, and whether Word documents and scans must be
accepted from day one.
