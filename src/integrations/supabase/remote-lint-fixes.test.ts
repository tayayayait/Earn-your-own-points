import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_fix_remote_lint_errors.sql"),
);

if (!migrationFile) {
  throw new Error("fix_remote_lint_errors migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("remote lint fix migration", () => {
  it("replaces the admin role function without the reserved current_role variable", () => {
    expect(migrationSql).toContain("create or replace function public.update_admin_role");
    expect(migrationSql).toContain("selected_admin_role public.admin_role");
    expect(migrationSql).not.toContain("current_role public.admin_role");
    expect(migrationSql).toContain("selected_admin_role = 'owner'::public.admin_role");
  });

  it("pre-aggregates tier balances before JSON aggregation", () => {
    expect(migrationSql).toContain("tier_rows as");
    expect(migrationSql).toContain("coalesce(sum(balance.balance), 0)::bigint as balance");
    expect(migrationSql).toContain("'tier_balances', tier_json.items");
    expect(migrationSql).not.toContain("'balance', coalesce(sum(balance.balance), 0)");
  });

  it("keeps execution grants scoped to authenticated users", () => {
    expect(migrationSql).toContain("revoke execute on function public.update_admin_role");
    expect(migrationSql).toContain("grant execute on function public.update_admin_role");
    expect(migrationSql).toContain("revoke execute on function public.get_admin_reports");
    expect(migrationSql).toContain("grant execute on function public.get_admin_reports");
  });
});
