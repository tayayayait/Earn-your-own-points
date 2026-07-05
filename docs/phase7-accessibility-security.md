# Phase 7 Accessibility And Security

Phase 7 adds shared UI guardrails for loading, empty, error, accessibility, and security-sensitive flows.

## Shared States

`src/components/common/AppState.tsx` adds:

- `LoadingState`: `role="status"` and `aria-live="polite"`
- `EmptyState`: screen-specific message plus optional action
- `ErrorState`: `role="alert"` plus optional retry action

`AppButton` now keeps all button sizes at a minimum 44px touch target. `AppModal` scroll containers use `overscroll-contain`.

## Manual Point Validation

`src/features/admin-manual-transactions/manual-transaction-data.ts` now enforces:

- Customer required
- Positive integer point amount
- Maximum manual point amount: `10,000,000P`
- Deduct amount cannot exceed current available points
- Reason required, minimum 10 characters
- Internal memo maximum 500 characters

Manual payment and deduction still create append-only point transactions through guarded RPCs.

## Security Guardrails

The Phase 7 route tests assert:

- No transaction delete UI or delete RPC
- Cancellation creates a linked reversal transaction
- Dangerous transaction actions require confirmation and 10+ character reasons
- API keys and webhook signing keys are shown only once, then masked
- Audit logs remain read-only and cannot be deleted from the UI
- CSV report export goes through an audit RPC before download
- Administrator navigation, route access, and admin RPCs enforce OWNER/MANAGER/OPERATOR/VIEWER permissions through `src/features/admin-permissions/permissions.ts` and `public.require_admin_permission`.
- Permission failures route authenticated users to `/admin/no-permission` with the required permission label.

## Current State

- Shared state components are covered by `src/components/common/common-components.test.tsx`.
- Manual point validation is covered by
  `src/features/admin-manual-transactions/manual-transaction-data.test.ts`.
- Security guardrails are covered by `src/features/phase7/phase7-guardrails.test.ts`.
- Admin permission behavior is covered by `src/features/admin-permissions/admin-permissions.test.ts`
  and `src/features/admin-permissions/admin-access-routes.test.ts`.
