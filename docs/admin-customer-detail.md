# Admin Customer Detail

Phase 1-3 replaces direct customer detail queries with guarded Supabase RPCs.

- Route: `src/routes/_authenticated/admin.customers.$id.tsx`
- Data normalizer: `src/features/admin-customer-detail/customer-detail-data.ts`
- Migration: `supabase/migrations/20260703082709_phase1_admin_customer_detail.sql`

RPCs:

- `get_admin_customer_detail(_user_id)`: returns profile, point summary, recent transactions, and admin notes.
- `update_admin_customer_profile(...)`: updates editable profile fields and writes an audit log.
- `update_admin_customer_status(...)`: changes customer status and writes an audit log.
- `create_admin_customer_point_transaction(...)`: creates an idempotent manual earn/deduct transaction with `balance_after`.
- `add_admin_customer_note(...)`: appends a non-deletable admin note.

Detail sections:

- Summary cards: available points, pending points, 30-day expiring points, total earned, and total redeemed.
- Basic info tab: customer code, profile/contact fields, status, tier, joined date, and latest transaction date.
- Point history tab: latest 50 point transactions.
- Admin notes tab: latest 20 non-deletable admin notes.

Business rules:

- Withdrawn customers cannot have personal information edited.
- Blocked or withdrawn customers cannot process point adjustments.
- Profile edits, status changes, and point adjustments require a trimmed reason of at least 10 characters.
- Manual point adjustments use an idempotency key to avoid duplicate submissions.

Security and access:

- Every RPC checks `public.has_role((select auth.uid()), 'admin')`.
- `admin_customer_notes` has explicit `SELECT, INSERT` grants for `authenticated`, RLS enabled, and admin-only policies.
- RPC `EXECUTE` is revoked from `PUBLIC` and `anon`, and granted to `authenticated`.
- The migration is local-only until pushed to the remote Supabase project.
