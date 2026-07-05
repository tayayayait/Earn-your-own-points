import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase4_admin_reports.sql"),
);

if (!migrationFile) {
  throw new Error("phase4_admin_reports migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase4 admin reports migration", () => {
  it("creates guarded report read and export RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_reports");
    expect(migrationSql).toContain("create or replace function public.create_admin_report_export");
    expect(migrationSql).toContain("returns jsonb");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
  });

  it("returns every chart/table section required by Phase 4-1", () => {
    expect(migrationSql).toContain("'trend'");
    expect(migrationSql).toContain("'type_breakdown'");
    expect(migrationSql).toContain("'tier_balances'");
    expect(migrationSql).toContain("'customer_rankings'");
    expect(migrationSql).toContain("'event_performance'");
    expect(migrationSql).toContain("'csv_rows'");
    expect(migrationSql).toContain("'export_row_count'");
  });

  it("supports filtered CSV export, async jobs over 10,000 rows, and audit logs", () => {
    expect(migrationSql).toContain("create table if not exists public.report_export_jobs");
    expect(migrationSql).toContain("row_count > 10000");
    expect(migrationSql).toContain("'queued'");
    expect(migrationSql).toContain("'report.export.download'");
    expect(migrationSql).toContain("'report.export.queue'");
    expect(migrationSql).toContain("_date_from");
    expect(migrationSql).toContain("_date_to");
    expect(migrationSql).toContain("created_at >= _date_from");
    expect(migrationSql).toContain("created_at < _date_to");
  });

  it("enables RLS and grants only authenticated execution", () => {
    expect(migrationSql).toContain(
      "alter table public.report_export_jobs enable row level security",
    );
    expect(migrationSql).toContain('create policy "report_export_jobs admin manage"');
    expect(migrationSql).toContain("revoke execute on function public.get_admin_reports");
    expect(migrationSql).toContain("grant execute on function public.get_admin_reports");
    expect(migrationSql).toContain("revoke execute on function public.create_admin_report_export");
    expect(migrationSql).toContain("grant execute on function public.create_admin_report_export");
  });
});
