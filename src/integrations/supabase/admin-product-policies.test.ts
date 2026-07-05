import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase2_admin_product_policies.sql"),
);

if (!migrationFile) {
  throw new Error("phase2_admin_product_policies migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase2 admin product policies migration", () => {
  it("creates guarded product policy read/save/disable/search RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_product_policies");
    expect(migrationSql).toContain("create or replace function public.save_admin_product_policy");
    expect(migrationSql).toContain(
      "create or replace function public.disable_admin_product_policy",
    );
    expect(migrationSql).toContain("create or replace function public.search_admin_policy_targets");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
  });

  it("validates target type, target ids, rate, active period, and priority conflict", () => {
    expect(migrationSql).toContain("_target_type not in ('product', 'category')");
    expect(migrationSql).toContain("cardinality(_target_ids) = 0");
    expect(migrationSql).toContain("_earning_rate < 0 or _earning_rate > 100");
    expect(migrationSql).toContain("_priority < 1 or _priority > 999");
    expect(migrationSql).toContain("_ends_at <= _starts_at");
    expect(migrationSql).toContain("priority conflict");
    expect(migrationSql).toContain("status::text in ('active', 'scheduled')");
  });

  it("records audit logs and exposes only authenticated RPC execution", () => {
    expect(migrationSql).toContain("'policy.product.save'");
    expect(migrationSql).toContain("'policy.product.disable'");
    expect(migrationSql).toContain("before_data");
    expect(migrationSql).toContain("after_data");
    expect(migrationSql).toContain("revoke execute on function public.get_admin_product_policies");
    expect(migrationSql).toContain("grant execute on function public.get_admin_product_policies");
    expect(migrationSql).toContain("revoke execute on function public.save_admin_product_policy");
    expect(migrationSql).toContain("grant execute on function public.save_admin_product_policy");
  });
});
