# User App And Auth

Phase 6 completes the customer-facing app and separates administrator login.

- `src/features/app-user/app-data.ts`
- `src/routes/_authenticated/app.home.tsx`
- `src/routes/_authenticated/app.transactions.tsx`
- `src/routes/_authenticated/app.benefits.tsx`
- `src/routes/_authenticated/app.profile.tsx`
- `src/routes/auth.tsx`
- `src/routes/admin.login.tsx`
- `supabase/migrations/20260703163412_phase6_app_user.sql`

## Public Access

The customer app is reachable without a customer login:

- `/`, `/auth`, and the authenticated route index redirect to `/app/home`.
- The shared route shell no longer blocks non-admin customer routes on Supabase Auth.
- Customer home, transactions, benefits, and profile screens use public sample data when no active Supabase session exists.
- Existing authenticated RPC calls remain unchanged for signed-in users.
- Administrator routes still require Supabase Auth and admin role checks through `/admin/login`.

This does not grant `anon` database access to customer RPCs. Public mode is a frontend preview path only.

## User Home

The home screen uses `get_app_home` for signed-in users and public sample data for visitors. It renders:

- Top point card with available, pending, and 30-day expiring point amounts
- Pending earning cards with confirmation dates
- Expiring point cards with expiration dates
- Five recent transactions
- Two active event benefits
- CTAs to transaction history and benefit conditions

## Transactions

The transaction screen uses `get_app_transactions` for signed-in users and public sample data for visitors. It supports:

- Period filter: 1 month, 3 months, 6 months, custom date range
- Type filter: all, earn, use, expire, cancel
- Status filter: all, pending, confirmed, cancelled
- Mobile timeline layout
- Desktop table layout

## Benefits

The benefits screen uses `get_app_benefits` for signed-in users and public sample data for visitors. It renders:

- Current tier and next-tier progress
- Capped 100% progress bar
- `승급 심사 예정` state when requirements are satisfied
- Tier benefit list
- Active events
- Minimum redeem points and maximum redeem ratio

## Profile

The profile screen uses `get_app_profile`, `update_app_profile`, and `request_app_withdrawal` for signed-in users. Visitors see public sample data; profile save, password change, and withdrawal requests are not persisted in public mode.

It supports:

- Name, phone, and email editing
- Point earning, point expiry, and marketing notification preferences
- Password change via Supabase Auth `updateUser`
- Withdrawal request modal requiring the exact text `탈퇴`
- Residual point warning before withdrawal request

## Auth

The customer auth route redirects visitors directly to `/app/home`. The underlying customer auth component remains available in source for future account-based flows and includes:

- Phone input with auto hyphen formatting
- Required terms checkbox
- Optional marketing opt-in checkbox
- Supabase Auth signup metadata for `full_name`, `phone`, `marketing_opt_in`, and `terms_accepted_at`

The administrator login page is available at `/admin/login` and adds:

- Admin-only role check through `user_roles`
- Remember-login checkbox
- Password reset email trigger
- 5-failure, 10-minute client-side lockout UX

Supabase Auth and platform rate limits still remain the security boundary. The client-side lockout is a UX guard, not a server-side brute-force control.

## Current State

- Migration file exists locally.
- Remote Supabase DB has not been pushed or modified.
- Migration content is covered by `src/integrations/supabase/app-user.test.ts`.
- Data normalization, filters, validation, and lockout calculations are covered by `src/features/app-user/app-data.test.ts`.
- Route requirements are covered by `src/features/app-user/app-routes.test.ts`.
