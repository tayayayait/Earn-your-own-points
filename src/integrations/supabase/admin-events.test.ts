import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase3_admin_events.sql"),
);

if (!migrationFile) {
  throw new Error("phase3_admin_events migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase3 admin events migration", () => {
  it("creates guarded event read/save/status RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_events");
    expect(migrationSql).toContain("create or replace function public.save_admin_event");
    expect(migrationSql).toContain("create or replace function public.update_admin_event_status");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("validates period, reward, limits, priority, and returns overlap warnings", () => {
    expect(migrationSql).toContain("_ends_at < _starts_at");
    expect(migrationSql).toContain("_customer_limit <= 0");
    expect(migrationSql).toContain("_total_budget_points < 0");
    expect(migrationSql).toContain("_reward_type not in ('rate', 'fixed')");
    expect(migrationSql).toContain("_reward_value <= 0");
    expect(migrationSql).toContain("_priority < 1 or _priority > 999");
    expect(migrationSql).toContain("'overlap_events'");
  });

  it("records audit logs and grants only authenticated execution", () => {
    expect(migrationSql).toContain("'policy.event.save'");
    expect(migrationSql).toContain("'policy.event.status'");
    expect(migrationSql).toContain("before_data");
    expect(migrationSql).toContain("after_data");
    expect(migrationSql).toContain("revoke execute on function public.get_admin_events");
    expect(migrationSql).toContain("grant execute on function public.get_admin_events");
    expect(migrationSql).toContain("revoke execute on function public.save_admin_event");
    expect(migrationSql).toContain("grant execute on function public.save_admin_event");
  });
});
