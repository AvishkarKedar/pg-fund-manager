# PG Fund Manager — Professional Rewrite

A complete, working replacement for the static legacy app: PG/hostel property
finance & management built with **Next.js 16, TypeScript, Tailwind CSS 4,
shadcn/ui, Prisma and Recharts**.

Runs zero-config on SQLite (default) or PostgreSQL in production.

## Quick start

```bash
cd pgmanager
cp .env.example .env        # SQLite by default — no server needed
npm install                 # or: bun install
npx prisma db push          # create the schema
npx prisma generate
npm run db:seed             # realistic demo data (7 rooms, 20 tenants, 6 months of rent)

npm run dev                 # http://localhost:3000
```

Demo login: **owner@pgdemo.in / owner123**

### Using PostgreSQL instead

1. In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres/Supabase connection string.
3. `npx prisma db push && npm run db:seed`.

## What's included

| Area | Details |
| --- | --- |
| **Dashboard** | KPI cards with count-up animation, collections-vs-expenses chart, rent status, occupancy by floor, debtor list with one-tap WhatsApp reminders (from your template) + **UPI collect QR**, expense breakdown + **budget health**, **vacancies ahead** (move-out notices), recent activity, **AI insights** (optional) |
| **Rooms & beds** | Floor-grouped room cards, bed tiles (vacant/occupied/notice), add/edit/delete with occupied-bed guards |
| **Tenants** | Full profiles, bed assignment & history-preserving transfers, notice period, check-out with settlement preview, payment backfill, **broadcast composer** (message all/selected tenants) |
| **Rent engine** | Monthly invoices auto-roll on read, PAID/PARTIAL/DUE/OVERDUE statuses, partial payments, undo (soft reverse), per-tenant due day + grace |
| **Payments** | Append-only ledger, deterministic receipt numbers (RCP-YYYYMM-####), printable receipts, reversals |
| **Budgets & templates** | Monthly per-category expense caps (settings) with over-budget warnings; customizable WhatsApp rent-reminder template with live preview |
| **UPI collect** | Per-debtor "Collect via UPI" dialog: scannable QR code + deep link + copy (uses the UPI ID from Settings) |
| **Reliability & statements** | Per-tenant on-time payment streak; printable monthly rent statement (A4) |
| **Command palette** | Ctrl/Cmd+K global search across tenants & rooms + quick actions |
| **Backup & restore** | One-file full JSON export/import (transactional restore with confirm) |
| **Expenses** | Categories, vendor, monthly trend, CSV export |
| **Issues** | Maintenance workflow with status stepper and auto-logging of repair costs as expenses |
| **Excel import** | 3-step wizard: upload (xlsx/xls/csv/tsv/json) → auto-detected column mapping with editable preview → transactional apply. Auto-fixes phones, dates (day-first Indian format), rent amounts; "unpaid" never counts as paid; auto-sorts rooms & beds; dedupes tenants by phone |
| **Reports** | 12-month performance, debtor aging, method split, **security-deposits ledger**, CSV exports (ledger/tenants/payments/expenses) |
| **Data doctor** | One-click *Sort & Fix*: renumbers bed slots, relabels A–H, merges duplicate tenants, self-heals every invoice status |
| **Auth** | scrypt password hashing, httpOnly cookie sessions, 401 JSON (never redirects), audit log on every write |

## Architecture notes (why it's shaped this way)

- **Money is `Decimal`, never floats.** Every amount goes through Prisma
  `Decimal` and is converted to number only at the JSON boundary.
- **Payments are append-only.** Mistakes are soft-reversed (`reversedAt`),
  never deleted, so the money history can always be audited.
- **Tenancies preserve history.** Transfers and check-outs close the old
  tenancy row and open a new one instead of mutating it.
- **One date/timezone rule.** All "today" logic runs in `Asia/Kolkata`
  (`src/lib/dates.ts`), and overdue detection has a single definition
  (`isPastDue`) — the legacy app had two conflicting ones and shifted a day
  before 05:30 IST.
- **Excel imports can only touch rooms/beds/tenants/rent.** Settings, rate
  cards and house rules are whitelisted away from the import path — the
  legacy import silently wiped them.
- **Every rent-roll read ensures the month's invoices exist** (auto
  roll-over), so paid flags can never go stale like the legacy app's did.

## Optional: AI insights

`GET /api/insights` summarises the month into 3 insights + 1 recommendation.
If the `z-ai-web-dev-sdk` package is installed it uses the LLM; otherwise it
falls back to deterministic locally-computed insights. Nothing else changes.

## API surface

```
POST /api/auth/login | logout          GET  /api/auth/me
GET  /api/dashboard?month=             GET  /api/rooms          POST /api/rooms
PATCH|DELETE /api/rooms/[id]           GET  /api/tenants        POST /api/tenants
GET|PATCH /api/tenants/[id]            POST /api/tenants/[id]/checkout
GET  /api/rent?month=                  POST /api/rent/mark | unmark | backfill
GET  /api/payments                     POST /api/payments       POST /api/payments/[id]/reverse
GET  /api/expenses                     POST /api/expenses       PATCH|DELETE /api/expenses/[id]
GET  /api/complaints                   POST /api/complaints     PATCH|DELETE /api/complaints/[id]
POST /api/import/parse | apply         GET  /api/reports?month=
GET  /api/reports/export?type=…        GET|PATCH /api/settings  POST /api/maintenance
GET  /api/insights                GET  /api/search?q=…           GET|POST /api/backup
```

## Folder map

```
pgmanager/
├── prisma/schema.prisma      # 12 models, Decimal money, history-preserving FKs
├── prisma/seed.ts            # realistic demo dataset
└── src/
    ├── app/page.tsx          # the whole SPA (single route)
    ├── app/api/…             # 26 route handlers
    ├── components/pg/…       # 18 view components
    ├── components/ui/…       # shadcn/ui primitives used by the app
    ├── hooks/pg/…            # useApi, useTheme
    └── lib/                  # auth, dates, money, rent-engine, import-engine, maintenance
```
