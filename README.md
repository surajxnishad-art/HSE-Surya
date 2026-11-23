# INDUSTRIAL HSE PRO — Enterprise Safety Management System

A working, server-rendered industrial HSE ERP: real authentication, real database
persistence, real CRUD across 14 safety modules, live KPIs, PDF/Excel reporting and an
optional Gemini assistant. Nothing in the UI is hard-coded sample data — every number is
aggregated from stored records.

---

## 1. What is included

| Area | Implementation |
| --- | --- |
| Authentication | Server-side sessions (HttpOnly cookie), scrypt password hashing, login, registration, logout, remember-me, forgot-password request, admin-approval gate |
| Roles | `super_admin`, `admin`, `hse_manager`, `safety_officer`, `supervisor`, `viewer` |
| Admin panel | User approval, role assignment, activate/deactivate, password reset, department management, audit log, system settings |
| HSE modules | Incidents, inspections, hazards & risk assessment, permits to work, PPE stock & issue register, training & toolbox talks, fire & emergency equipment, drills, emergency contacts, corrective actions, environmental records, man-hours, employees, documents |
| Analytics | Dashboard KPIs (TRIR, LTIFR, compliance %, open hazards, active permits), monthly trend, incident mix, department comparison, action closure |
| Reporting | 12 report types, JSON preview, print-ready HTML, PDF (pdfkit) and Excel (exceljs) export with date/department filters |
| Notifications | Derived alerts for overdue actions, expiring permits, training expiry, inspection due, pending approvals |
| AI (optional) | Gemini via `GEMINI_API_KEY`, server-side only; the app runs fully without it |
| Files | Document upload/download stored server-side (PDF, Excel, images) with metadata in the database |

## 2. Stack

- **Frontend** — React 18 + React Router 6 + Recharts, bundled by Vite 7, hand-written CSS design system (navy sidebar, blue/teal/orange accents, mobile bottom navigation).
- **Backend** — Node.js + Express 4, `express-session`-style cookie sessions, Zod-free explicit validators, RBAC middleware.
- **Database** — PostgreSQL when `DATABASE_URL` is set (Supabase free tier works), otherwise a local SQLite file for development.
- **Reports** — pdfkit (PDF), exceljs (Excel).

## 3. Quick start (local)

```bash
npm install
npm run build      # build the client into dist/
npm start          # serve API + built client on http://localhost:3000
```

Open the URL. With an empty database the app redirects to **/setup**, where you create the
first Super Admin. That page disables itself permanently once any user exists.

### First-run Super Admin (two secure options)

1. **Through the UI** — open `/setup` on a fresh database and create the account. No secret is ever stored in code.
2. **Through server-side secrets** — set `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` (plus optional `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`) in the hosting environment before first boot. The account is created on startup, hashed with scrypt, and the environment values are never sent to the browser.

## 4. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | platform-provided | HTTP port (default 3000) |
| `DATABASE_URL` | recommended for production | PostgreSQL/Supabase connection string. Without it the app uses a local SQLite file. |
| `DATA_DIR` | no | Directory for the SQLite file and uploads (default `./data`, container uses `/app/data`) |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` | no | Bootstrap the first Super Admin on startup |
| `SUPER_ADMIN_NAME` / `SUPER_ADMIN_EMAIL` | no | Profile details for the bootstrapped admin |
| `GEMINI_API_KEY` | no | Enables the AI assistant; the rest of the app works without it |
| `GEMINI_MODEL` | no | Defaults to `gemini-2.5-flash` |
| `COMPANY_NAME` | no | Company name printed on reports (default `Surya Industrial Works`) |
| `PGSSL` | no | Set to `disable` to turn off TLS for a local Postgres |
| `PG_POOL_MAX` | no | Postgres pool size (default 5) |
| `FORCE_SECURE_COOKIES` | no | Set `true` behind a proxy that terminates TLS |

Secrets are read only on the server (`process.env`); the browser bundle never contains them.

## 5. Database and persistence

- **Development / single container** — SQLite file at `DATA_DIR`. Fast, zero setup, but the file lives on the container's temporary layer unless you attach storage.
- **Production (recommended)** — create a free Supabase project, copy the Postgres connection string into `DATABASE_URL`, and the same schema and queries run unchanged. Accounts and all HSE records then survive redeploys and are shared across devices.

Authorization is enforced **server-side on every request**: sessions are validated, records are scoped by ownership/department, and role permissions are checked before any read or write. The browser never talks to the database directly, so no credentials are exposed to clients. If you connect Supabase, keep the service-role/connection string in the server environment only; do not add it to any `VITE_*` variable. Postgres row-level security can be added as defence in depth, but it is not a substitute for — and not required by — the API-layer authorization described above.

Schema changes are applied automatically at boot (`server/migrate.js`) and are additive, so upgrading does not destroy existing rows. Back up by taking a Supabase database backup/snapshot (or copying the SQLite file) on your normal schedule.

## 6. Optional: enabling Gemini AI

1. Create an API key in Google AI Studio.
2. Add `GEMINI_API_KEY` in your hosting environment (Settings → Environment variables) — never in client code.
3. Restart/redeploy. The AI Assistant page will report the model as configured.

If the key is missing, invalid, rate-limited or the provider is unreachable, the API returns a clear error and every core HSE module keeps working.

## 7. Deployment

The repository ships a `Dockerfile` (Node 22 LTS Alpine, non-root user, build then prune to
production dependencies) and serves the built client and API from one process on `0.0.0.0:$PORT`.

On AppJet: the app is already built and running at the deployment URL. After adding
`DATABASE_URL` (and optionally `GEMINI_API_KEY`) in **Settings → Environment variables**,
redeploy so the process picks up the new values.

Any other Docker host works the same way:

```bash
docker build -t industrial-hse-pro .
docker run -p 3000:3000 -e DATABASE_URL="postgres://..." -v hse-data:/app/data industrial-hse-pro
```

Mount `/app/data` as a volume if you stay on SQLite so records survive container recreation.

## 8. Verification

```bash
npm run build     # production bundle
npm run smoke     # end-to-end API suite against a throwaway database
```

The smoke suite covers registration, approval, login, logout and re-login with record
retrieval, RBAC denial for viewers, dashboard aggregates, report generation (PDF + Excel),
document upload/download, notifications, settings, audit log and deletion — 45 assertions.
It also proves unauthenticated requests are rejected.

## 9. Service limits and honest caveats

- AppJet hosting (Free plan) gives each app 1 GB RAM and 1 vCPU with unlimited traffic; it is intended for development and testing, not guaranteed high-concurrency production traffic. Larger production load should be directed to a scaled host such as qoddi.com using the `appjet` branch.
- Custom domains and persistent disks are paid AppJet features. Without a persistent disk, the **SQLite** file is recreated on redeploy — use `DATABASE_URL` for durable storage.
- Supabase and Google Gemini free tiers have their own quotas and can change; nothing here is lifetime-free.
- `react-router` 6.30.6 has two moderate advisories whose only fix is the v7 major upgrade; the affected paths (SSR hydration error deserialisation and `<Link>` backslash redirects) are not used for untrusted input in this SPA. Track the upgrade separately.
- Passwords are scrypt-hashed with per-user salts; sessions are HttpOnly cookies. There is no email delivery configured, so "forgot password" records a request that an administrator resolves with the secure admin reset action.
