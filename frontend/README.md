# SplitSecure frontend

React + Vite + TypeScript SPA.

## Local development

1. Copy `.env.example` to `.env` (defaults to `http://localhost:4000` for
   the API, which matches the backend's default port).
2. `npm install`
3. `npm run dev`

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - typecheck (`tsc -b`) and build for production
- `npm run lint` - oxlint

## Notes

- The access token is held in memory only (never `localStorage`), refreshed
  transparently via an httpOnly cookie - see `src/api/client.ts`.
- CSRF protection reads a non-httpOnly cookie set by the backend and echoes
  it back as a header on state-changing requests - see the same file.
