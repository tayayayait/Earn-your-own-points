import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase1_admin_dashboard_metrics.sql"),
);

if (!migrationFile) {
  throw new Error("phase1_admin_dashboard_metrics migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase1 admin dashboard metrics migration", () => {
  it("creates a guarded RPC for dashboard metrics", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_dashboard_metrics");
    expect(migrationSql).toContain("returns jsonb");
    expect(migrationSql).toContain("security definer");
    expect(migrationSql).toContain("public.has_role((select auth.uid()), 'admin')");
  });

  it("returns all dashboard sections required by Phase 1-1", () => {
    expect(migrationSql).toContain("'kpis'");
    expect(migrationSql).toContain("'changes'");
    expect(migrationSql).toContain("'trend'");
    expect(migrationSql).toContain("'type_breakdown'");
    expect(migrationSql).toContain("'recent_transactions'");
    expect(migrationSql).toContain("'customer_rankings'");
  });

  it("handles legacy and new transaction/status enum values", () => {
    expect(migrationSql).toContain("'completed'");
    expect(migrationSql).toContain("'confirmed'");
    expect(migrationSql).toContain("'redeem'");
    expect(migrationSql).toContain("'manual_deduct'");
  });

  it("revokes public execution and grants authenticated execution", () => {
    expect(migrationSql).toContain(
      "revoke execute on function public.get_admin_dashboard_metrics(integer) from public, anon",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.get_admin_dashboard_metrics(integer) to authenticated",
    );
  });
});
