# Running the demo where others can reach it

The application is one container with a data volume (`/data`: SQLite database and CVs). Choose the way that fits the day.

| Way | Effort | Good for | Watch out |
|---|---|---|---|
| **Coolify** (the instructor's server) | 10 min, needs a permission | a stable link | the 403 on "new resource" is a permission problem on that account, not in the app |
| **Your computer + a tunnel** | 5 min | a demo, a call, an afternoon | the computer must stay on and awake; the link changes unless you reserve one |
| **A small cloud host** (Azure Container Apps, Fly.io, Render) | 30-60 min | a link that stays | needs an account and a payment method; mount a persistent disk on `/data` |
| **A screen recording** | 15 min | a fallback if everything else fails | record after resetting the demo data, with the dashboard first |

Vercel and similar serverless hosts do not fit as they are: the database is a file and the CVs are files, and a
serverless disk is read-only and temporary. They would need Postgres and object storage, which is the direction of
`docs/laravel-migration.md` anyway.

## Settings for any public link

Without these anyone who finds the address can sign in as the administrator (demo accounts have no password).

| Variable | Why |
|---|---|
| `DEMO_PASSWORD` | HTTP Basic password in front of everything (any user name); ten wrong tries in a minute block that address for a minute |
| `SESSION_SECRET` | a long random string; otherwise one is generated and kept in the volume |
| `INGEST_API_KEY` | only if the e-mail intake endpoint should be reachable |
| `AUTH_MODE=entra` + `ENTRA_*` | real sign-in, see `docs/entra-id.md` (then the demo accounts are off) |

Serve it over HTTPS (all of the options below do), so the password and the session cookie are not sent in clear text.

## Local computer with a tunnel

Start the app (`docker compose up -d`, or `npm run build && npm start`), then in a second window one of:

```bash
cloudflared tunnel --url http://localhost:3000      # no account; prints a https://....trycloudflare.com address
ngrok http 3000                                      # needs a free account and `ngrok config add-authtoken ...` once
```

Give the printed address and the `DEMO_PASSWORD` to the people who should look. Stop the tunnel when you are done; the
address works only while the command runs.

Before presenting: open the menu → "Przewodnik po demo" → "Przywróć dane demonstracyjne…" (administrator account), so
the dates are current. Keep the computer awake (power settings), plugged in, with a few GB of free disk space.

## Coolify

New resource → this GitHub repository → build pack *Dockerfile* → port 3000, health check `/api/health`, a persistent
volume with destination `/data`, the variables above → deploy.

## A cloud container host

Any of them works with the same image and settings: build from the `Dockerfile`, expose port 3000, mount a persistent
volume at `/data`, set the variables, use `/api/health` as the health probe, run **one** instance only (SQLite is a single-writer
database and the rate limits are kept in memory).
