import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase6_app_user.sql"),
);

if (!migrationFile) {
  throw new Error("phase6_app_user migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase6 app user migration", () => {
  it("adds user notification and withdrawal fields without creating public auth decisions", () => {
    expect(migrationSql).toContain("add column if not exists point_earn_notify");
    expect(migrationSql).toContain("add column if not exists point_expiry_notify");
    expect(migrationSql).toContain("add column if not exists withdrawal_requested_at");
    expect(migrationSql).toContain("raw_user_meta_data->>'phone'");
    expect(migrationSql).toContain("raw_user_meta_data->>'marketing_opt_in'");
  });

  it("creates authenticated app RPCs scoped to auth.uid", () => {
    for (const fn of [
      "get_app_home",
      "get_app_transactions",
      "get_app_benefits",
      "get_app_profile",
      "update_app_profile",
      "request_app_withdrawal",
    ]) {
      expect(migrationSql).toContain(`create or replace function public.${fn}`);
      expect(migrationSql).toContain(`revoke execute on function public.${fn}`);
      expect(migrationSql).toContain(`grant execute on function public.${fn}`);
    }

    expect(migrationSql.match(/\(select auth\.uid\(\)\)/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("records profile and withdrawal audit events", () => {
    expect(migrationSql).toContain("'user.profile.update'");
    expect(migrationSql).toContain("'user.withdrawal.request'");
    expect(migrationSql).toContain("target_table");
    expect(migrationSql).toContain("before_data");
    expect(migrationSql).toContain("after_data");
  });
});
