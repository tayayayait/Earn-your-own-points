# Admin Manual Transactions

Phase 1-5 replaces direct manual point inserts with guarded Supabase RPC workflows.

- Route: `src/routes/_authenticated/admin.transactions.manual.tsx`
- Data normalizer: `src/features/admin-manual-transactions/manual-transaction-data.ts`
- Migration: `supabase/migrations/20260703084949_phase1_admin_manual_transactions.sql`

RPCs:

- `search_admin_transaction_customers(_query, _limit)`: reused from Phase 1-4 for async customer search.
- `get_admin_manual_transaction_context(_user_id)`: returns selected customer identity, available/pending balance, and active default policy expiration.
- `create_admin_customer_point_transaction(...)`: reused from Phase 1-3 to create idempotent manual earn/deduct transactions with `balance_after`.

UI behavior:

- Customer search uses a 300ms debounce and admin-only RPC.
- Selecting a customer loads current balance and default expiration based on the active point policy.
- Manual earn supports an editable expiration date.
- Manual 지급/차감 사유 is required, must be at least 10 characters, and is capped at 500 characters.
- Manual point amount must be a positive integer and cannot exceed `10,000,000P`.
- Manual deduct is blocked client-side when the amount exceeds available points.
- The confirmation modal shows customer, type, points, expected balance, expiration date, and idempotency key before submission.

Security and access:

- The new context RPC checks `public.has_role((select auth.uid()), 'admin')`.
- Public and anon execution is revoked.
- Authenticated execution is explicitly granted for Supabase Data API access.
- The migration is local-only until pushed to the remote Supabase project.
