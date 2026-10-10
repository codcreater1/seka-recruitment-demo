# SEKA recruitment demo

Demo of a recruitment management system for SEKA (ATA student project).

- UI language: Polish
- Data: fictional
- Authentication: none in the demo (target: Microsoft Entra ID SSO)

## What it does

HR (Mrs Agnieszka) receives applications as e-mails with a PDF CV. The system creates a candidate profile
for each application, groups applications by branch city and tracks the status of every candidate.
Branch managers later get read access to the candidates of their own city.

## Repository layout

| Path | Content |
|---|---|
| `prototype/panel-rekrutacji.html` | First clickable prototype. Single HTML file, data kept in the browser. Open it in a browser. |

## Roadmap

- [ ] Real backend and database (shared data, not browser storage)
- [ ] Real PDF files for the sample CVs, embedded PDF viewer
- [ ] Server-side PDF text extraction
- [ ] E-mail intake endpoint (Power Automate webhook) and `.eml` upload
- [ ] Branch-scoped permissions enforced on the server
- [ ] GDPR tools: delete, export, retention warning, audit log
- [ ] Interview scheduling, e-mail templates, ratings, reports
- [ ] Docker setup for Coolify
