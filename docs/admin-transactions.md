# Admin Transactions

Phase 1-4 replaces direct transaction table loading with Supabase RPC-backed admin workflows.

- Route: `src/routes/_authenticated/admin.transactions.tsx`
- Data normalizer: `src/features/admin-transactions/transaction-list-data.ts`
- Migration: `supabase/migrations/20260703083910_phase1_admin_transactions.sql`

RPCs:

- `get_admin_transactions(...)`: paginated transaction list with exact transaction ID, customer, external transaction ID, type, status, and date filters.
- `search_admin_transaction_customers(_query, _limit)`: admin-only async customer search for the 300ms debounced customer combobox.
- `get_admin_transaction_detail(_transaction_id)`: transaction, customer, policy snapshot, and processing log detail payload.
- `cancel_admin_transaction(_transaction_id, _reason, _idempotency_key)`: creates a linked reversal transaction instead of deleting or mutating history.
- `retry_admin_transaction(_transaction_id, _reason)`: allows retry only for `failed` transactions and records the action in `audit_logs`.

UI behavior:

- URL search state is used for filters and pagination.
- Transaction codes are displayed as `PTX-YYYYMMDD-000001`.
- The table shows customer, type/status badges, signed point display, balance, reason, external transaction ID, created date, and actions.
- The detail modal shows basic transaction info, customer info, policy snapshot JSON, and processing logs.
- Cancel/retry actions require a 10+ character reason before calling the RPC.

Security and access:

- All RPCs check `public.has_role((select auth.uid()), 'admin')`.
- Public and anon execution is revoked.
- Authenticated execution is explicitly granted for Supabase Data API access.
- The migration is local-only until pushed to the remote Supabase project.
