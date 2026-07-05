# Admin Base Policies

Phase 2-1 adds the base point policy management screen.

- Route: `src/routes/_authenticated/admin.policies.base.tsx`
- Data normalizer: `src/features/admin-policies/base-policy-data.ts`
- Migration: `supabase/migrations/20260703130111_phase2_admin_base_policies.sql`

RPCs:

- `get_admin_base_policy()`: returns the current policy candidate and latest policy history.
- `save_admin_base_policy(...)`: validates policy fields, writes a new active or scheduled policy, and records an audit log.
- `disable_admin_base_policy(_policy_id, _reason)`: disables non-active policies and records an audit log. Active policies are intentionally blocked.

UI behavior:

- Sections match Phase 2-1: earning criteria, usage conditions, and expiration/confirmation.
- The right panel shows before/after diffs for changed fields.
- Apply mode supports immediate activation and scheduled activation.
- Scheduled activation requires a future datetime.
- Audit reason is required and must be at least 10 characters.
- Admin navigation links to `/admin/policies/base`.

Security and access:

- Every RPC checks `public.has_role((select auth.uid()), 'admin')`.
- Public and anon execution is revoked.
- Authenticated execution is explicitly granted for Supabase Data API access.
- The migration is local-only until pushed to the remote Supabase project.
