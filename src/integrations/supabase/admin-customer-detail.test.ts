import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase1_admin_customer_detail.sql"),
);

if (!migrationFile) {
  throw new Error("phase1_admin_customer_detail migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase1 admin customer detail migration", () => {
  it("creates admin notes and guarded customer detail RPCs", () => {
    expect(migrationSql).toContain("create table if not exists public.admin_customer_notes");
    expect(migrationSql).toContain("create or replace function public.get_admin_customer_detail");
    expect(migrationSql).toContain(
      "create or replace function public.update_admin_customer_profile",
    );
    expect(migrationSql).toContain(
      "create or replace function public.update_admin_customer_status",
    );
    expect(migrationSql).toContain(
      "create or replace function public.create_admin_customer_point_transaction",
    );
    expect(migrationSql).toContain("create or replace function public.add_admin_customer_note");
  });

  it("guards all RPCs with admin role checks and explicit execute grants", () => {
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(5);
    expect(migrationSql).toContain("revoke execute on function public.get_admin_customer_detail");
    expect(migrationSql).toContain("grant execute on function public.get_admin_customer_detail");
    expect(migrationSql).toContain(
      "grant select, insert on public.admin_customer_notes to authenticated",
    );
  });

  it("returns all Phase 1-3 detail sections and applies action business rules", () => {
    expect(migrationSql).toContain("'profile'");
    expect(migrationSql).toContain("'summary'");
    expect(migrationSql).toContain("'transactions'");
    expect(migrationSql).toContain("'notes'");
    expect(migrationSql).toContain("'expiring_points_30d'");
    expect(migrationSql).toContain("current_status in ('blocked', 'withdrawn')");
    expect(migrationSql).toContain("char_length(trim(coalesce(_reason, ''))) < 10");
    expect(migrationSql).toContain("idempotency_key");
  });
});
