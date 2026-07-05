# Design System

Phase 0-1 defines the shared design-token baseline from `implementation_plan.md`.

- CSS tokens live in `src/styles.css` under `:root`.
- TypeScript tokens live in `src/lib/design-tokens.ts`.
- Token groups cover color, semantic status color, spacing, type scale, button sizes, modal sizes, and responsive breakpoints.
- `npm test` runs lint and production build verification for this project.
- Since Phase 0-2, `npm test` also runs Vitest unit tests before lint and build.
- Since Phase 0-3, shared app components live in `src/components/common`.
- Since Phase 0-4, authenticated layout shell rules live in `src/components/layout/layout-shell.ts`.
- Phase 0 Supabase schema foundation is documented in `docs/supabase-schema.md`.
