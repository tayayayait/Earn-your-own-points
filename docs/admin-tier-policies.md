# Admin Tier Policies

Phase 2-2 adds customer tier policy management.

- Route: `src/routes/_authenticated/admin.policies.tiers.tsx`
- Data normalizer: `src/features/admin-policies/tier-policy-data.ts`
- Migration: `supabase/migrations/20260703130922_phase2_admin_tier_policies.sql`

RPCs:

- `get_admin_tier_policies()`: returns tiers ordered by `sort_order` with customer counts.
- `save_admin_tier_policy(...)`: creates or updates a tier after validating duplicate names, qualification period, rates, and thresholds.
- `reorder_admin_tier_policies(_tier_ids, _reason)`: rewrites tier order and records an audit log.
- `disable_admin_tier_policy(_tier_id, _replacement_tier_id, _reason)`: disables a tier and moves customers to the selected lower tier or the default tier.

UI behavior:

- The table shows tier name, promotion criteria, base earn rate, bonus earn rate, minimum keep condition, status, customer count, reorder actions, and disable action.
- The edit panel supports tier creation and update.
- Order changes are exposed through up/down controls backed by the reorder RPC.
- Disabling a tier requires selecting customer handling: lower tier or default tier.
- Audit reason is required for save, reorder, and disable flows.

Security and access:

- Every RPC checks `public.has_role((select auth.uid()), 'admin')`.
- Public and anon execution is revoked.
- Authenticated execution is explicitly granted for Supabase Data API access.
- The migration is local-only until pushed to the remote Supabase project.
