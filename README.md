# Test Mela

A UPSC / state-PCS test-prep platform: Next.js student app, a separate Next.js admin console, and a NestJS + Prisma + MySQL API. Bilingual (English/Hindi) throughout, with a server-authoritative test engine (scoring, timers and negative marking are computed on the backend — the client can never influence a result).

## Stack

- **Backend** — NestJS, TypeScript, Prisma ORM, MySQL, JWT auth (access token + httpOnly refresh cookie), Razorpay-ready payments
- **Frontend** (`/frontend`) — Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn-style components, `next-intl` (EN/HI)
- **Admin** (`/admin`) — Next.js 15 App Router, TypeScript, Tailwind CSS — separate app, same API, `ADMIN`-role only

## 1. Requirements

- Node.js 20+ and npm 10+
- Docker Desktop (for local MySQL) — or your own MySQL 8 server

## 2. Install

From the repo root (an npm workspace covering `backend`, `frontend`, `admin`):

```bash
npm install
```

## 3. Environment variables

Copy the example env file to the root and to `backend/` (the backend loads `backend/.env`; the root copy is for `docker compose` and reference):

```bash
cp .env.example .env
cp .env.example backend/.env
```

Also create `frontend/.env.local` and `admin/.env.local`:

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:4100/api" > frontend/.env.local
echo "NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4100/api" > admin/.env.local
```

(Ports: the API listens on `PORT` from `.env`, default `4100`. If that port is already in use on your machine, change `PORT` in `.env`/`backend/.env` and the `NEXT_PUBLIC_*_API_URL` values above to match.)

See `.env.example` for every variable, including:

- `DATABASE_URL` — MySQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — set these to long random strings before anything beyond local dev
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` — leave blank in dev; free items still work, paid checkout requires real keys
- `NOTIFICATION_TRANSPORT` — `console` (default) logs OTPs/emails to the backend console instead of sending them; switch to `smtp` and fill `SMTP_*` to send real email

## 4. MySQL setup (Docker)

```bash
npm run db:up
```

This starts MySQL 8 on `localhost:3306` (root password `root`, database `test_mela`) and Adminer at `http://localhost:8080` for browsing the database. Stop it with `npm run db:down`.

If you'd rather use your own MySQL server, just point `DATABASE_URL` at it — the app doesn't require Docker specifically, only a MySQL 8+ database. Note: Prisma Migrate needs a user with `CREATE DATABASE` privileges (for its shadow database), which is why local dev uses `root`; use a least-privilege user in production.

## 5. Prisma migration & seed

```bash
npm run prisma:migrate   # applies backend/prisma/schema.prisma
npm run prisma:seed      # creates demo data (see below)
```

Seed data includes:

- Admin login: `admin@testmela.com` / `Admin@123`
- Student login: `student@testmela.com` / `Student@123`
- A course → test series → test volume → a 5-question bilingual practice test
- A sample blog post, current-affairs entry, and batch

## 6. Running the apps

Each in its own terminal (or use the root scripts):

```bash
npm run dev:backend    # NestJS API — http://localhost:4100/api
npm run dev:frontend   # Student app — http://localhost:3000
npm run dev:admin      # Admin console — http://localhost:3002
```

Open `http://localhost:3000`, sign in with the student account (or register a new one), and try a test. Open `http://localhost:3002` and sign in with the admin account to manage content.

## 7. Production build

```bash
npm run build   # builds backend, frontend, and admin in sequence
```

Or individually: `npm run build:backend`, `npm run build:frontend`, `npm run build:admin`.

To run the built backend: `cd backend && npm run start:prod` (after `npm run prisma:deploy` against your production database). The frontend/admin apps run with `npm start` in their own directories after `next build`.

## 8. Importing legacy questions

From the admin Question Bank, use **Import Excel** and download the template.
The `.xlsx` template uses one row per question with bilingual question,
explanation, and option columns, plus `correctOption`, optional subject/topic,
comma-separated existing tag names, type, difficulty, and marks. Correct
option numbers can be comma-separated for multiple-choice questions. The
dialog previews and validates rows before import, supports up to 100 questions
per workbook, and reports row-specific validation issues.

The legacy question importer reads the original MySQL `questions` and
`questiontags` tables. Restore the legacy SQL dump into a separate scratch
database first; do not restore it over the application's database. Set
`DATABASE_URL` to the application's database and `LEGACY_DB_*` to the scratch
database connection, then run the importer from the repository root:

```powershell
$env:DATABASE_URL = "mysql://app_user:app_password@localhost:3306/test_mela"
$env:LEGACY_DB_HOST = "localhost"
$env:LEGACY_DB_PORT = "3306"
$env:LEGACY_DB_USER = "legacy_user"
$env:LEGACY_DB_PASSWORD = "legacy_password"
$env:LEGACY_DB_NAME = "legacy_import"
npm run import:legacy:questions -w backend
```

The import is repeatable: existing legacy question IDs and tag IDs are
recognized, questions without valid text/options/correct answers are logged
and skipped, and imported questions retain their legacy tags. A question
containing Devanagari is stored as Hindi; otherwise it is stored as English.
This does not translate content or infer separate bilingual translations. Use
`IMPORT_LIMIT` to run a small positive-integer sample first. To re-derive
question and option text from the source after a decoding fix, run
`npm run fix:legacy:question-entities -w backend` with the same environment.
Imported questions remain unpublished and follow the existing legacy
eligibility/review workflow.

## 9. Project layout

```
backend/    NestJS API — one module per domain (auth, users, catalog, test-series,
            tests, questions, attempts, notes, videos, blogs, current-affairs,
            batches, coins, coupons, payments), Prisma schema + seed in backend/prisma/
frontend/   Student-facing Next.js app, locale-prefixed routes (/en, /hi)
admin/      Admin console — separate Next.js app, English-only UI, ADMIN-role gated
legacy-static/   The original static HTML/CSS/JS prototype, kept for reference
```

## 10. Notes on the test engine

Scoring, timers and negative marking are computed entirely server-side in `backend/src/attempts/attempts.service.ts`. The client sends only which option a student selected; the server independently looks up the correct option and computes marks — a tampered or forged `score`/`isCorrect` field in a request body is silently stripped by the global `ValidationPipe` (`whitelist: true`) before it ever reaches the service layer, since the DTOs for that endpoint don't declare those fields. A scheduled job auto-submits any attempt whose time has expired.

## 11. Deployment (outline)

- **Database**: run `npm run prisma:deploy -w backend` against your production MySQL instance (this applies migrations without needing shadow-database privileges).
- **Backend**: build with `npm run build:backend`, run `node backend/dist/main.js` behind a process manager (pm2/systemd) or containerize it; set real `JWT_*` secrets, `RAZORPAY_*` keys, `CORS_ORIGINS` (your deployed frontend/admin origins), and `NODE_ENV=production`.
- **Frontend/Admin**: `npm run build:frontend` / `npm run build:admin`, then deploy the standard Next.js output (Vercel, or `next start` behind a reverse proxy). Point `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_ADMIN_API_URL` at your deployed backend origin.
- Put all three services behind HTTPS; the refresh-token cookie is marked `secure` automatically when `NODE_ENV=production`.
