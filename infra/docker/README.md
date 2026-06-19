# Docker images

Each app ships its own multi-stage `Dockerfile` next to its source:

| Image    | Path                       | Base (runtime)     | Port |
| -------- | -------------------------- | ------------------ | ---- |
| backend  | `apps/backend/Dockerfile`  | `node:20-alpine`   | 3000 |
| frontend | `apps/frontend/Dockerfile` | `nginx:1.27-alpine`| 80   |
| postgres | (official image)           | `postgres:16-alpine` | 5432 |

Build & run everything together via Compose:

```bash
docker compose -f infra/compose/docker-compose.yml up --build -d
docker compose -f infra/compose/docker-compose.yml --profile seed run --rm seeder
```

See [`infra/compose/docker-compose.yml`](../compose/docker-compose.yml) for the wiring.
