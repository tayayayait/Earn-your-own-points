import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase2_admin_base_policies.sql"),
);

if (!migrationFile) {
  throw new Error("phase2_admin_base_policies migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase2 admin base policies migration", () => {
  it("creates guarded base policy read/save/disable RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_base_policy");
    expect(migrationSql).toContain("create or replace function public.save_admin_base_policy");
    expect(migrationSql).toContain("create or replace function public.disable_admin_base_policy");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("supports immediate and scheduled application with future schedule validation", () => {
    expect(migrationSql).toContain("_apply_mode text");
    expect(migrationSql).toContain("_scheduled_at timestamptz");
    expect(migrationSql).toContain("_apply_mode not in ('immediate', 'scheduled')");
    expect(migrationSql).toContain("_scheduled_at <= now()");
    expect(migrationSql).toContain("'scheduled'");
    expect(migrationSql).toContain("'active'");
  });

  it("returns current policy, history, and records audit logs", () => {
    expect(migrationSql).toContain("'current_policy'");
    expect(migrationSql).toContain("'history'");
    expect(migrationSql).toContain("'policy.base.save'");
    expect(migrationSql).toContain("'policy.base.disable'");
    expect(migrationSql).toContain("before_data");
    expect(migrationSql).toContain("after_data");
  });

  it("prevents active policy deletion/disable and grants authenticated execution", () => {
    expect(migrationSql).toContain("current_policy.status::text = 'active'");
    expect(migrationSql).toContain("active policy cannot be disabled");
    expect(migrationSql).toContain("revoke execute on function public.get_admin_base_policy");
    expect(migrationSql).toContain("grant execute on function public.get_admin_base_policy");
    expect(migrationSql).toContain("revoke execute on function public.save_admin_base_policy");
    expect(migrationSql).toContain("grant execute on function public.save_admin_base_policy");
  });
});
