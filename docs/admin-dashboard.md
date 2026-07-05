# Admin Dashboard

Phase 1-1 replaces client-side dashboard aggregation with a Supabase RPC:

- Route: `src/routes/_authenticated/admin.dashboard.tsx`
- Data normalizer: `src/features/admin-dashboard/dashboard-data.ts`
- Migration: `supabase/migrations/20260703075528_phase1_admin_dashboard_metrics.sql`

The dashboard calls `public.get_admin_dashboard_metrics(_days)` through `supabase.rpc`.

Returned sections:

- `kpis`: total customers, total earned points, total redeemed points, remaining points, and points expiring within 30 days.
- `changes`: percent changes compared with the previous period window.
- `trend`: daily earned, redeemed, expired, and pending point totals.
- `type_breakdown`: selected-period transaction totals by type.
- `recent_transactions`: latest 10 transactions in the selected period.
- `customer_rankings`: top 10 customers by remaining point balance.

Security and access:

- The RPC checks `public.has_role((select auth.uid()), 'admin')`.
- `EXECUTE` is revoked from `PUBLIC` and `anon`.
- `EXECUTE` is explicitly granted to `authenticated`, matching the current Supabase Data API grant requirements.
- The function is local-only until migrations are pushed to the remote Supabase project.

UI behavior:

- Period controls support 7 days, 30 days, 90 days, and this month.
- KPI cards show previous-period percent change.
- Recharts renders the line trend and type donut chart.
- Empty selected periods show a reset action back to 30 days.
