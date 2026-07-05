# Supabase Schema Foundation

Phase 0 schema work is captured in:

- `supabase/migrations/20260703074916_phase0_schema_foundation.sql`

The migration is intentionally additive and preserves existing values:

- Existing `tx_type` values such as `redeem` and `cancel` remain valid.
- Existing `tx_status` values such as `completed` and `cancelled` remain valid.
- New detailed enum values are added for later phases.
- `get_balance` supports both legacy and new transaction/status values by comparing enum columns through text casts.

New foundation tables include:

- `audit_logs`
- `brand_settings`
- `point_policies`
- `customer_tiers`
- `product_point_policies`
- `point_events`
- `api_keys`
- `webhooks`
- `webhook_logs`

Every new public table has explicit grants and RLS enabled. Admin-only tables use `public.has_role((select auth.uid()), 'admin')`.

Current state:

- Migration file exists locally.
- Phase 1 dashboard RPC migration also exists locally:
  `supabase/migrations/20260703075528_phase1_admin_dashboard_metrics.sql`.
- Phase 1 customer list RPC migration also exists locally:
  `supabase/migrations/20260703081647_phase1_admin_customers.sql`.
- Phase 1 customer detail RPC and admin notes migration also exists locally:
  `supabase/migrations/20260703082709_phase1_admin_customer_detail.sql`.
- Phase 1 transaction list/detail/action RPC migration also exists locally:
  `supabase/migrations/20260703083910_phase1_admin_transactions.sql`.
- Phase 1 manual transaction context RPC migration also exists locally:
  `supabase/migrations/20260703084949_phase1_admin_manual_transactions.sql`.
- Phase 2 base policy management RPC migration also exists locally:
  `supabase/migrations/20260703130111_phase2_admin_base_policies.sql`.
- Phase 2 tier policy management RPC migration also exists locally:
  `supabase/migrations/20260703130922_phase2_admin_tier_policies.sql`.
- Phase 2 product/category policy management RPC migration also exists locally:
  `supabase/migrations/20260703142427_phase2_admin_product_policies.sql`.
- Phase 3 event management RPC migration also exists locally:
  `supabase/migrations/20260703153934_phase3_admin_events.sql`.
- Phase 4 admin report RPC and export job migration also exists locally:
  `supabase/migrations/20260704005200_phase4_admin_reports.sql`.
- Phase 4 admin integration RPC migration also exists locally:
  `supabase/migrations/20260703160535_phase4_admin_integrations.sql`.
- Phase 5 admin settings RPC and invitation migration also exists locally:
  `supabase/migrations/20260703161554_phase5_admin_settings.sql`.
- Phase 6 user app RPC and profile notification migration also exists locally:
  `supabase/migrations/20260703163412_phase6_app_user.sql`.
- Remote lint fix migration also exists locally:
  `supabase/migrations/20260704013627_fix_remote_lint_errors.sql`.
- Admin permission helper migration also exists locally:
  `supabase/migrations/20260704020930_admin_permissions.sql`.
- Remote Supabase project `sjuvzphbqpefdltkczzv` (`적립s`) has all 18 local migrations applied.
- `.env` points to `https://sjuvzphbqpefdltkczzv.supabase.co` and uses that project's publishable key.
- Local Supabase/Postgres stack is not required for the current workflow; remote operations use `npx supabase ... --linked`.
- Phase 4 integration and Phase 5 settings migrations qualify `extensions.gen_random_bytes` and `extensions.digest` explicitly because Supabase installs `pgcrypto` functions in the `extensions` schema on the linked project.
- `20260704020930_admin_permissions.sql` adds `has_admin_permission`, `require_admin_permission`, and `get_current_admin_context`; admin RPCs now check `profiles.admin_role` permission keys instead of only the broad `user_roles.role = admin` gate.
- `npx supabase db advisors --linked --type security --level warn --fail-on error` reports warnings for intentional `SECURITY DEFINER` RPCs exposed to `authenticated`; those functions perform role/self checks inside the function body.
- `npx supabase db advisors --linked --type performance --level warn --fail-on error` reports performance warnings for RLS initplan and multiple permissive policies; no advisor errors were returned.
- `npx supabase db lint --linked --level warning --fail-on error` returns no schema errors after `20260704013627_fix_remote_lint_errors.sql`.
- Generated TypeScript types are synced from the linked remote project in `src/integrations/supabase/types.ts`.
- Migration content is covered by `src/integrations/supabase/schema-foundation.test.ts`.
- Dashboard RPC content is covered by `src/integrations/supabase/admin-dashboard-metrics.test.ts`.
- Customer list RPC content is covered by `src/integrations/supabase/admin-customers.test.ts`.
- Customer detail RPC content is covered by `src/integrations/supabase/admin-customer-detail.test.ts`.
- Transaction RPC content is covered by `src/integrations/supabase/admin-transactions.test.ts`.
- Manual transaction context RPC content is covered by
  `src/integrations/supabase/admin-manual-transactions.test.ts`.
- Base policy RPC content is covered by `src/integrations/supabase/admin-base-policies.test.ts`.
- Tier policy RPC content is covered by `src/integrations/supabase/admin-tier-policies.test.ts`.
- Product/category policy RPC content is covered by
  `src/integrations/supabase/admin-product-policies.test.ts`.
- Event management RPC content is covered by `src/integrations/supabase/admin-events.test.ts`.
- Admin report RPC and export job content is covered by
  `src/integrations/supabase/admin-reports.test.ts`.
- Admin integration RPC content is covered by
  `src/integrations/supabase/admin-integrations.test.ts`.
- Admin settings RPC content is covered by
  `src/integrations/supabase/admin-settings.test.ts`.
- User app RPC content is covered by
  `src/integrations/supabase/app-user.test.ts`.
- Remote lint fix migration content is covered by
  `src/integrations/supabase/remote-lint-fixes.test.ts`.
- Admin permission migration content is covered by
  `src/integrations/supabase/admin-permissions.test.ts`.
