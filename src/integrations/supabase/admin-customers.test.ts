import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase1_admin_customers.sql"),
);

if (!migrationFile) {
  throw new Error("phase1_admin_customers migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase1 admin customers migration", () => {
  it("creates a guarded customer list RPC", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_customers");
    expect(migrationSql).toContain("returns jsonb");
    expect(migrationSql).toContain("public.has_role((select auth.uid()), 'admin')");
  });

  it("accepts filter, sort, and pagination arguments required by Phase 1-2", () => {
    expect(migrationSql).toContain("_query text");
    expect(migrationSql).toContain("_tier_ids uuid[]");
    expect(migrationSql).toContain("_statuses text[]");
    expect(migrationSql).toContain("_min_points integer");
    expect(migrationSql).toContain("_max_points integer");
    expect(migrationSql).toContain("_joined_from date");
    expect(migrationSql).toContain("_joined_to date");
    expect(migrationSql).toContain("_sort_by text");
    expect(migrationSql).toContain("_sort_dir text");
    expect(migrationSql).toContain("_page integer");
    expect(migrationSql).toContain("_page_size integer");
  });

  it("returns table rows with point aggregates and total count", () => {
    expect(migrationSql).toContain("'customers'");
    expect(migrationSql).toContain("'total_count'");
    expect(migrationSql).toContain("'balance'");
    expect(migrationSql).toContain("'pending_points'");
    expect(migrationSql).toContain("'last_transaction_at'");
  });

  it("does not let non-numeric text searches match every phone number", () => {
    expect(migrationSql).toContain("regexp_replace(safe_query, '[^0-9]', '', 'g') <> ''");
  });

  it("revokes public execution and grants authenticated execution", () => {
    expect(migrationSql).toContain(
      "revoke execute on function public.get_admin_customers(text, uuid[], text[], integer, integer, date, date, text, text, integer, integer) from public, anon",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.get_admin_customers(text, uuid[], text[], integer, integer, date, date, text, text, integer, integer) to authenticated",
    );
  });
});
