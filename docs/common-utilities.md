# Common Utilities

Phase 0-2 adds shared utility modules from `implementation_plan.md`.

- `src/lib/formatters.ts`
  - `formatPoint` for signed point labels.
  - `formatDate` for admin, user, short, and period date formats.
  - `formatPhone` and `maskEmail` for display and privacy masking.
- `src/lib/enums.ts`
  - Single-source status and transaction type metadata.
  - `getStatusMeta` fallback behavior for unknown values.
- `src/lib/api-error-handler.ts`
  - User-safe API error normalization.
  - Toast duration constants matching the plan: success 3000ms, error 6000ms, info 4000ms.

Tests for these modules live next to the source files under `src/lib/*.test.ts`.
