# CI/CD

The CI pipeline lives at [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

On every push/PR touching `apps/**` it:

1. **Backend** — installs deps, runs `prisma generate`, and compiles the NestJS app.
2. **Frontend** — installs deps and runs the Vite production build (`tsc` + `vite build`).

Container images are built from:

- `apps/backend/Dockerfile` (multi-stage → Node runtime, runs `prisma migrate deploy` on boot)
- `apps/frontend/Dockerfile` (multi-stage → nginx serving the static SPA)

These are orchestrated by [`infra/compose/docker-compose.yml`](../compose/docker-compose.yml).
