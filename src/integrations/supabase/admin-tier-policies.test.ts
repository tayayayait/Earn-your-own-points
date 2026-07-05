import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase2_admin_tier_policies.sql"),
);

if (!migrationFile) {
  throw new Error("phase2_admin_tier_policies migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase2 admin tier policies migration", () => {
  it("creates guarded tier policy list/save/reorder/disable RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_tier_policies");
    expect(migrationSql).toContain("create or replace function public.save_admin_tier_policy");
    expect(migrationSql).toContain("create or replace function public.reorder_admin_tier_policies");
    expect(migrationSql).toContain("create or replace function public.disable_admin_tier_policy");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
  });

  it("validates duplicate names, qualification months, rates, and sort order", () => {
    expect(migrationSql).toContain("lower(name) = lower(trim(_name))");
    expect(migrationSql).toContain("_qualification_months < 1 or _qualification_months > 24");
    expect(migrationSql).toContain("_base_earn_rate < 0 or _base_earn_rate > 100");
    expect(migrationSql).toContain("_bonus_earn_rate < 0 or _bonus_earn_rate > 100");
    expect(migrationSql).toContain("sort_order");
  });

  it("moves customers on tier disable and records audit logs", () => {
    expect(migrationSql).toContain("update public.profiles");
    expect(migrationSql).toContain("set tier_id = _replacement_tier_id");
    expect(migrationSql).toContain("'policy.tier.save'");
    expect(migrationSql).toContain("'policy.tier.reorder'");
    expect(migrationSql).toContain("'policy.tier.disable'");
    expect(migrationSql).toContain("before_data");
    expect(migrationSql).toContain("after_data");
  });

  it("revokes public execution and grants authenticated execution", () => {
    expect(migrationSql).toContain("revoke execute on function public.get_admin_tier_policies");
    expect(migrationSql).toContain("grant execute on function public.get_admin_tier_policies");
    expect(migrationSql).toContain("revoke execute on function public.save_admin_tier_policy");
    expect(migrationSql).toContain("grant execute on function public.save_admin_tier_policy");
  });
});
