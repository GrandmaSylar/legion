# Decisions

Locked in Phase 0. Each entry records what was chosen and what would make us revisit it.

| # | Area | Decision | Revisit when |
|---|---|---|---|
| 1 | Frontend | Vite single-page app (React, Tailwind v4, shadcn kit), built on the existing prototype. Chosen over Next.js because the dashboard must feel fast and fluid (instant client-side navigation) and the offline PWA is simpler on a static app. | Public pages (e-admission) need server rendering or SEO. Then build that part separately. |
| 2 | Backend | Supabase (Postgres, Auth, RLS) with Edge Functions for server-side work (webhooks, SMS, creating users), behind a thin data-access layer. No separate API yet. Departs from the blueprint's NestJS. | PDF report cards need a real Node environment (headless browser), so expect a small separate service. Extract NestJS if jobs or multi-tenancy outgrow Edge Functions. |
| 3 | Tenancy | `school_id` on every table, enforced by RLS. | Several real schools are live, or a customer requires physical isolation. Then evaluate schema-per-tenant. |
| 4 | Auth | Supabase Auth behind an interface, so it can be swapped for custom JWT later. | Leaving Supabase managed hosting. |
| 5 | Repo layout | Single app. Turborepo only when an API or mobile app appears. | A second deployable is added. |
| 6 | Visual direction | Glass is a theme option; flat is the default on mobile and in attendance and grading flows. | Pilot users report performance or readability problems. |

## Implications

- Every migration includes `school_id` and an RLS policy from the first table.
- All auth calls go through one module (for example `lib/auth`); nothing else imports the Supabase auth client directly.
- All data access goes through one layer (for example `lib/data`) so the backend can move without touching screens.
- Business rules (GES grading, permission checks) live in the database or server code, never only in the client.

## Project context

- **Pilot school:** Pinks Academy.
- **Supabase project:** `https://xipvlmwczocshjhklwvj.supabase.co` (project ref `xipvlmwczocshjhklwvj`). Keys live in `.env.local` only, never in the repo; `.env.example` holds placeholders.
