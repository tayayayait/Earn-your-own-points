# Admin Reports

Phase 4-1 adds the administrator report route:

- `src/routes/_authenticated/admin.reports.tsx`
- `src/features/admin-reports/report-data.ts`
- `supabase/migrations/20260704005200_phase4_admin_reports.sql`

## Scope

The report page exposes five filtered report sections:

- 기간별 적립/사용 Line Chart
- 거래 유형 비율 Donut Chart
- 등급별 잔액 Bar Chart
- 고객 랭킹 Table
- 이벤트 성과 Table with progress bars

Each chart includes a keyboard-focusable chart frame and a data table with the same values, so information is not color-only.

## Supabase RPCs

`public.get_admin_reports(_date_from, _date_to, _limit)` returns a JSON payload with:

- `trend`
- `type_breakdown`
- `tier_balances`
- `customer_rankings`
- `event_performance`
- `csv_rows`
- `export_row_count`

`public.create_admin_report_export(_date_from, _date_to, _row_count, _reason)` writes an audit log for every export request.

- `row_count <= 10000`: records `report.export.download`.
- `row_count > 10000`: inserts `report_export_jobs` with `queued` status and records `report.export.queue`.

Both RPCs use `SECURITY DEFINER`, check `public.has_role((select auth.uid()), 'admin')`, revoke public execution, and grant execution only to `authenticated`.

## CSV

CSV download uses only the currently filtered `csv_rows` returned by the report RPC. The client writes a UTF-8 BOM CSV file and escapes commas, quotes, and newlines.

Rows above 10,000 are not downloaded synchronously. They are registered as async export jobs.

## Current State

- Migration file exists locally.
- Remote Supabase DB has not been pushed or modified.
- Migration content is covered by `src/integrations/supabase/admin-reports.test.ts`.
- Report data normalization and CSV helpers are covered by `src/features/admin-reports/report-data.test.ts`.
- Route requirements are covered by `src/features/admin-reports/admin-reports-route.test.ts`.
