# Admin Product Policies

Phase 2-3 adds product/category point policy management.

- Route: `src/routes/_authenticated/admin.policies.products.tsx`
- Data normalizer: `src/features/admin-policies/product-policy-data.ts`
- Migration: `supabase/migrations/20260703142427_phase2_admin_product_policies.sql`

RPCs:

- `get_admin_product_policies()`: returns product/category policies ordered by hierarchy and priority.
- `search_admin_policy_targets(_target_type, _query, _limit)`: searches known product/category target IDs already used by policies. The UI also allows direct target ID entry because no product catalog table exists yet.
- `save_admin_product_policy(...)`: creates or updates a policy after validating name, target type, target IDs, earning rate, active period, priority, status, and audit reason.
- `disable_admin_product_policy(_policy_id, _reason)`: disables a policy and records an audit log instead of deleting it.

UI behavior:

- The table shows policy name, target type, selected targets, earning rate or exclusion state, priority, active period, status, and disable action.
- The edit panel supports product/category target selection with a 300ms debounced async search.
- Active period supports an empty end date, displayed as `종료일 없음`.
- Active or scheduled policies cannot share the same priority within the same target type.
- The hierarchy copy is shown explicitly: product > category > event > tier > base.
- Audit reason is required for save and disable flows.

Security and access:

- Every RPC checks `public.has_role((select auth.uid()), 'admin')`.
- Public and anon execution is revoked.
- Authenticated execution is explicitly granted for Supabase Data API access.
- The migration is local-only until pushed to the remote Supabase project.
