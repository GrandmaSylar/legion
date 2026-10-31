# Build Plan: School Management System (solo)

Source: `SMS_Master_Blueprint.docx` (pre-school to Basic 9, Ghana-first, pilot school then SaaS) and `expected.png` (the "Sedela" glassmorphic dashboard). The current code is a prototype and design reference only. This repo becomes the real frontend.

## Planning principles

1. **Pilot school first.** The blueprint's 34-week, 8-phase roadmap assumes 5 people. Solo, treat roughly 40-50% of it as the first year. After the pilot MVP, re-plan from the pilot school's feedback.
2. **Vertical slices.** Each slice runs from database to API to UI and covers one workflow a real user can complete.
3. **Tenancy and RBAC from the first migration.** Every table carries `school_id`, and permission checks live in one place. Retrofitting either is expensive.
4. **Theming is a token layer.** Glass vs. flat is a theme (CSS variables plus a few component variants), so screens are written once.

## Decisions to lock in Phase 0

| Decision | Recommendation |
|---|---|
| Frontend framework | Next.js (blueprint says 14, App Router) for SSR on e-admission pages and `next-pwa`. Tailwind v4 and the shadcn kit carry over from this repo. Currently Vite. |
| Backend, solo | Next.js server code plus Supabase (Postgres, Auth, RLS) behind a thin data-access layer. Extract NestJS only if background jobs or multi-tenancy force it. **Departs from the blueprint (NestJS); needs approval.** |
| Auth | Supabase Auth behind an interface so it can be swapped later. |
| Tenancy | `school_id` + RLS for the pilot. Decide on schema-per-tenant once several schools exist. |
| Repo layout | Single app now. Turborepo only when an API or mobile app appears. |
| Visual direction | Glass is a theme option, not the only look. Flat is the default on mobile and in attendance/grading flows. |

## Phases

Estimates are rough and assume roughly full-time work.

### Phase 0: Foundation (1-2 weeks)
- Confirm the decisions above; write a short SRS covering only the pilot-school scope.
- ERD for core entities: school, user, role, student, guardian, class, section, term, subject, enrollment, attendance, assessment, grade. Review it with the pilot-school contact.
- Move the repo to Next.js; add `.gitignore`; fix `pnpm-workspace.yaml` (Linux-only `supportedArchitectures`); set up lint, typecheck, CI.
- Supabase project, migrations folder, seed data.
- Identify the pilot school and collect their current forms, report card format and spreadsheets.

### Phase 1: Design system and app shell (1-2 weeks)
- Tokens for colors, spacing, type and radii; `glass` / `flat` theme switch with light and dark. The accent-from-image idea seeds per-school branding later.
- Role-aware shell: nav and dashboard widgets come from a role-to-permissions config, not hardcoded tabs.
- Reusable dashboard widgets (stat card, chart card, list card) built on the shadcn kit.
- Mobile layout from the start; flat theme default on small screens.
- Remap `expected.png` to school content: Students, Staff, Attendance today, Fees collected, pending approvals, at-risk students.

### Phase 2: Core platform and RBAC (2-3 weeks)
- Auth with 2FA for admin roles; 10-role permission matrix (deny by default) enforced in RLS and server code.
- School setup: academic years, terms, classes, sections, subjects.
- Student and staff CRUD, guardian linking, photo upload, CSV import.
- Real admin and teacher dashboards on live data.
- Tests for the permission matrix.

### Phase 3: Pilot MVP (4-6 weeks)
In priority order:
1. Daily student attendance, mobile-first, offline entry via PWA.
2. Gradebook: GES 1-7 scale, CA 30% / exam 70%, configurable grading type per class (`ges_numeric`, `custom_numeric`, `descriptive`, `checklist`).
3. PDF report cards with school branding and remarks.
4. Parent portal, view-only: attendance, grades, announcements.
5. Notice board.
6. Basic timetable (view first; drag-and-drop builder later).

**Milestone: onboard the pilot school.** Re-prioritize everything after this from their feedback.

### Phase 4: Money and admissions (3-4 weeks, after pilot feedback)
- Fee structures, invoices, payment recording (cash, mobile money, bank).
- Paystack integration, outstanding balances, receipts.
- Expense approval workflow.
- E-admission: public form, document upload, workflow, one-click student creation.
- Bulk SMS and email via a provider.

### Later (re-plan after pilot data)
Timetable generation and substitutions, HR, recruitment, payroll (SSNIT/PAYE), library and assets, at-risk analytics, report builder, multi-tenant SaaS (billing, white-labeling, feature flags). Start security hardening (audit log, field encryption, pen-test) earlier than the blueprint's Phase 8, since the pilot holds children's data.

## Blueprint tensions to keep in mind
- `expected.png` is an e-learning admin (courses, bootcamps, affiliates, withdrawals). None of that exists in the blueprint's domain; content must be remapped.
- Ten roles need different dashboards; a single "Dashboard Overview" will not work.
- `backdrop-filter` blur is costly on low-end Android phones, which matches the target users.
- Moving off Supabase Auth in the blueprint's Phase 7 means an auth rewrite unless auth sits behind an interface from day one.
- Retrofitting schema-per-tenant onto a working app is risky; decide the tenancy approach before data piles up.

## Immediate next actions
1. Decide Next.js vs. Vite and Supabase vs. NestJS.
2. Identify the pilot school and gather their current forms and report card format.
3. Draft the ERD.
4. Restructure the repo, add `.gitignore`, and commit on a feature branch (never `main`).
