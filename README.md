# SplitSecure

A secure group expense-splitting and settlement application, built for ST6005CEM
Security CW2. Groups of users log shared expenses, the app calculates who owes
whom, and members settle balances through an auditable, transactional ledger.

## Why this exists

Splitting shared costs is a genuine everyday problem, but most tools treat it as
a UX problem only. SplitSecure treats it as a **security** problem too: every
balance calculation, settlement, and role check has to be correct and tamper-
resistant, because the data being protected is financial (who owes whom, how
much) and the trust model is inherently multi-party (group members do not
automatically trust each other, only the roles they've been assigned).

## Stack

- **Backend:** Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, Redis
- **Frontend:** React, Vite, TypeScript
- **Auth:** Argon2id password hashing, JWT access + rotating refresh tokens,
  TOTP-based MFA, Google OAuth (as an additional login method)
- **Infra:** Docker Compose, GitHub Actions CI/CD with SAST + dependency scanning

## Project structure

```
splitsecure/
  backend/    Express API, Prisma schema, business logic
  frontend/   React SPA
  docs/       Threat model, ER diagram, pentest evidence for the report
```

## Local development

See `backend/README.md` and `frontend/README.md` (added as those modules are
built out) for setup instructions.
