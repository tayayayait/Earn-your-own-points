import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase1_admin_manual_transactions.sql"),
);

if (!migrationFile) {
  throw new Error("phase1_admin_manual_transactions migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase1 admin manual transactions migration", () => {
  it("creates a guarded manual transaction context RPC", () => {
    expect(migrationSql).toContain(
      "create or replace function public.get_admin_manual_transaction_context",
    );
    expect(migrationSql).toContain("public.has_role((select auth.uid()), 'admin')");
  });

  it("returns customer balance and default active policy expiration data", () => {
    expect(migrationSql).toContain("'customer'");
    expect(migrationSql).toContain("'balance'");
    expect(migrationSql).toContain("'available_points'");
    expect(migrationSql).toContain("'policy'");
    expect(migrationSql).toContain("'valid_months'");
    expect(migrationSql).toContain("'default_expires_at'");
    expect(migrationSql).toContain("status::text = 'active'");
  });

  it("revokes public execution and grants authenticated execution", () => {
    expect(migrationSql).toContain(
      "revoke execute on function public.get_admin_manual_transaction_context",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.get_admin_manual_transaction_context",
    );
  });
});
