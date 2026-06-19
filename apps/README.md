# ICU Patient Monitoring Application

A minimalist, full-stack **patient monitoring** application added on top of the
Healthcare Big Data (ICU Sepsis) project. Clinicians can track admitted ICU
patients, record vital signs, and see an automatically-computed mortality risk
(SIRS / qSOFA / NEWS + a logistic estimate) that mirrors the project's Spark ML
feature engineering — and, in **hybrid** mode, ingest the actual ML pipeline's
predictions.

```
┌──────────────┐     REST/JWT     ┌──────────────┐    Prisma    ┌──────────────┐
│   React +    │  ───────────────▶│  NestJS API  │ ───────────▶ │  PostgreSQL  │
│  TypeScript  │◀───────────────  │  TypeScript  │ ◀─────────── │              │
│ (Vite, nginx)│                  └──────┬───────┘              └──────────────┘
└──────────────┘                         │  ▲
                                         │  │ POST /predictions/sync (x-api-key)
                                         ▼  │
                              ┌─────────────────────────┐
                              │  Spark / parquet ML      │  pipelines/bridge/
                              │  predictions (existing)  │  sync_predictions.py
                              └─────────────────────────┘
```

## Stack

| Layer    | Tech                                                       |
| -------- | ---------------------------------------------------------- |
| Frontend | React 18 + TypeScript, Vite 8 (plugin-react 6), React Router, Recharts, plain-CSS design system |
| Backend  | NestJS 11 + TypeScript, Prisma ORM, Passport-JWT, class-validator |
| Database | PostgreSQL 16                                              |
| Infra    | Docker Compose, multi-stage Dockerfiles, GitHub Actions CI |

## Features

- **JWT auth** with roles (`ADMIN`, `DOCTOR`, `NURSE`). Patient create/edit/delete is restricted to ADMIN/DOCTOR.
- **Dashboard** — active patients, risk distribution (donut), high-risk watchlist, live alerts.
- **Patient list** — search, status filter, latest risk per patient, open-alert counts.
- **Patient detail** — current vitals (out-of-range highlighting), vital-sign trend charts, clinical scores (SIRS/qSOFA/NEWS/MAP/Shock Index), labs, alert history.
- **Record vitals** — entering vitals runs the clinical risk engine, stores a `Prediction`, and raises `Alert`s automatically.
- **Alerts** — acknowledge workflow, filter active vs. handled.
- **Hybrid ML ingest** — `POST /api/predictions/sync` (API-key protected) accepts batches from the Spark/parquet pipeline; HIGH-risk predictions raise alerts. See [`pipelines/bridge/sync_predictions.py`](../pipelines/bridge/sync_predictions.py).

The risk engine ([`backend/src/risk/risk.engine.ts`](backend/src/risk/risk.engine.ts)) reuses the same
clinical thresholds as [`pipelines/ml/spark_ml_ultimate.py`](../pipelines/ml/spark_ml_ultimate.py).

---

## Run with Docker (everything)

From the repo root:

```bash
docker compose -f infra/compose/docker-compose.yml up --build -d
# create tables + demo data:
docker compose -f infra/compose/docker-compose.yml --profile seed run --rm seeder
```

Open **http://localhost:8080** → login `dokter@icu.test` / `password123`.

## Run locally (development)

**1. Start PostgreSQL only:**

```bash
docker compose -f infra/compose/docker-compose.yml up -d postgres
```

**2. Backend** (`apps/backend`):

```bash
cp .env.example .env          # DATABASE_URL points to localhost:5432
npm install
npx prisma migrate dev        # create + apply schema
npm run prisma:seed           # demo users + patients + vitals
npm run start:dev             # http://localhost:3000/api
```

**3. Frontend** (`apps/frontend`):

```bash
npm install
npm run dev                   # http://localhost:5173 (proxies /api → :3000)
```

### Demo accounts

| Email             | Role   | Password    |
| ----------------- | ------ | ----------- |
| admin@icu.test    | ADMIN  | password123 |
| dokter@icu.test   | DOCTOR | password123 |
| perawat@icu.test  | NURSE  | password123 |

---

## API quick reference

All routes are under `/api`. All require `Authorization: Bearer <token>` except
`/health`, `/auth/login`, `/auth/register`, and `/predictions/sync` (which uses `x-api-key`).

| Method | Route                              | Notes                                  |
| ------ | ---------------------------------- | -------------------------------------- |
| POST   | `/auth/login`                      | `{ email, password }` → `{ accessToken, user }` |
| GET    | `/auth/me`                         | current user                           |
| GET    | `/dashboard/summary`               | counts + risk distribution             |
| GET    | `/dashboard/watchlist`             | high/moderate patients by probability  |
| GET    | `/patients?search=&status=&risk=`  | list with latest risk                  |
| POST   | `/patients`                        | create (ADMIN/DOCTOR)                  |
| GET    | `/patients/:id`                    | detail + vitals + predictions + alerts |
| GET    | `/patients/:id/vitals`             | vital history                          |
| POST   | `/patients/:id/vitals`             | record vitals → risk + alerts          |
| GET    | `/alerts?acknowledged=`            | list alerts                            |
| PATCH  | `/alerts/:id/acknowledge`          | acknowledge                            |
| GET    | `/predictions?limit=`              | recent predictions                     |
| POST   | `/predictions/sync`                | **ML ingest** (header `x-api-key`)     |

## Realtime monitoring

Patient conditions change continuously and the UI updates on its own — the
dashboard, patient list, and patient detail **poll every 5s** (look for the
pulsing **LIVE** badge), so vitals, risk, charts, and alerts move without a
manual refresh. There are two ways to drive the changing data:

### Mode A — Built-in simulator (default, no Kafka/Spark needed)

The backend runs a vitals simulator: every `SIMULATOR_INTERVAL_MS` (default 8s)
it advances each admitted patient's vitals via a clinical random-walk
(mean-reversion + occasional deterioration/recovery events — same idea as
[`producer_icu_monitor.py`](../pipelines/streaming/kafka/producer_icu_monitor.py)),
re-scores risk, and escalates alerts. Toggle with env:

```bash
SIMULATOR_ENABLED=true        # default; set false to use Mode B
SIMULATOR_INTERVAL_MS=8000
```

### Mode B — Real Spark + Kafka streaming pipeline

The Big Data path that already exists in this repo:

```
producer_icu_monitor.py → Kafka → streaming_inference.py (Spark + ML model)
   → parquet (data/serving/realtime_predictions) → bridge → API → UI
```

1. Turn the built-in simulator **off** so the app reflects pipeline data:
   set `SIMULATOR_ENABLED=false` and restart the backend.
2. Start the stream (separate terminals): Kafka broker, then
   `python pipelines/streaming/kafka/producer_icu_monitor.py` and
   `python pipelines/streaming/spark/streaming_inference.py`.
3. Continuously sync the parquet output into the app (realtime):

```bash
python pipelines/bridge/sync_predictions.py \
  --source data/serving/realtime_predictions \
  --api-url http://localhost:3000/api \
  --api-key ml-pipeline-ingest-key-change-me \
  --watch 5            # poll for new parquet every 5s; omit for a one-shot sync
```

Synced rows appear as predictions with source `ML_PIPELINE` (badged "Model ML" in the UI).

## Project layout

```
apps/
  backend/    NestJS API (Prisma schema + seed in prisma/)
  frontend/   React SPA (pages in src/pages, design system in src/styles)
infra/
  compose/    docker-compose.yml (+ .env.example)
  docker/     image notes
  cicd/       CI notes (workflow in .github/workflows/ci.yml)
pipelines/
  bridge/     sync_predictions.py (ML → API)
```
