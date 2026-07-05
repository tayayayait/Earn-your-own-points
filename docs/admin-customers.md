# Admin Customers

Phase 1-2 replaces the fixed `profiles.limit(100)` customer list with a paginated Supabase RPC.

- Route: `src/routes/_authenticated/admin.customers.tsx`
- Data normalizer: `src/features/admin-customers/customer-list-data.ts`
- Migration: `supabase/migrations/20260703081647_phase1_admin_customers.sql`

The page calls `public.get_admin_customers(...)` through `supabase.rpc`.

Supported filters:

- Search by name, email, phone, customer code, or UUID.
- Multi-select customer status.
- Multi-select customer tier.
- Minimum and maximum held point balance.
- Joined date range.

Sorting and paging:

- Sort by joined date, held point balance, or customer name.
- Page size is fixed at 20 rows.
- Page state is synchronized through URL search parameters.
- The RPC returns `total_count`, `page`, `page_size`, and `customers`.

Returned row fields:

- Customer identifier: generated `CUS-000001` style code from the stable row number unless `profiles.customer_code` exists.
- Contact fields: name, email, phone.
- Status and tier labels.
- Point aggregates: held balance, pending points, total earned, and total redeemed.
- Last transaction date and joined date.

Security and access:

- The RPC checks `public.has_role((select auth.uid()), 'admin')`.
- `EXECUTE` is revoked from `PUBLIC` and `anon`.
- `EXECUTE` is explicitly granted to `authenticated`.
- The migration is local-only until pushed to the remote Supabase project.
