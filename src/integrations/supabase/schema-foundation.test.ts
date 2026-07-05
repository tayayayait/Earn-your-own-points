import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase0_schema_foundation.sql"),
);

if (!migrationFile) {
  throw new Error("phase0_schema_foundation migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase0_schema_foundation migration", () => {
  it("adds the planned foundation enums and compatibility enum values", () => {
    expect(migrationSql).toContain("create type public.admin_role");
    expect(migrationSql).toContain("create type public.user_status");
    expect(migrationSql).toContain("add value if not exists 'manual_earn'");
    expect(migrationSql).toContain("add value if not exists 'confirmed'");
  });

  it("creates public tables with explicit grants and RLS enabled", () => {
    const tableNames = [
      "audit_logs",
      "brand_settings",
      "point_policies",
      "customer_tiers",
      "point_events",
      "api_keys",
      "webhooks",
      "webhook_logs",
    ];

    for (const tableName of tableNames) {
      expect(migrationSql).toContain(`create table if not exists public.${tableName}`);
      expect(migrationSql).toContain(`alter table public.${tableName} enable row level security`);
      expect(migrationSql).toContain(`grant`);
      expect(migrationSql).toContain(`public.${tableName}`);
    }
  });

  it("updates get_balance for new and legacy transaction values", () => {
    expect(migrationSql).toContain("create or replace function public.get_balance");
    expect(migrationSql).toContain("'manual_earn'");
    expect(migrationSql).toContain("'redeem'");
    expect(migrationSql).toContain("'confirmed'");
    expect(migrationSql).toContain("'completed'");
  });
});
