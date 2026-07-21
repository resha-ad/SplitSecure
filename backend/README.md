# SplitSecure backend

Express + TypeScript API. See `../docs` for the threat model and pentest
write-ups; see the root `README.md` for the overall project.

## Local development (without Docker)

1. Copy `.env.example` to `.env` and fill in real secrets (generate 32-byte
   base64 values with `openssl rand -base64 32` for the JWT/CSRF/encryption
   secrets).
2. Have Postgres and Redis running locally (or via `docker compose up
   postgres redis` from the repo root).
3. `npm install`
4. `npm run prisma:migrate` (first run) or `npm run prisma:deploy` (apply
   existing migrations without generating a new one).
5. `npm run dev`

## Scripts

- `npm run dev` - start with hot reload
- `npm run build` / `npm start` - production build and run
- `npm run lint` - ESLint (includes `eslint-plugin-security`)
- `npm test` - Jest unit + integration tests (integration tests need a real
  Postgres reachable via `DATABASE_URL`)
- `npm run prisma:migrate` / `npm run prisma:deploy` - schema migrations

## Layout

```
src/
  config/      env loading, Prisma client, Redis client, Passport strategy
  middleware/  auth, RBAC, CSRF, rate limiting, error handling
  modules/     one folder per domain area (auth, users, groups, expenses, settlements)
  utils/       crypto, password hashing, TOTP, audit logging, logger
```
