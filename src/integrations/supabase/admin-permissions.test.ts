import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) => file.includes("admin_permissions"));

const migrationSql = migrationFile
  ? readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase()
  : "";

describe("admin permission migration", () => {
  it("adds permission helpers that use profiles.admin_role", () => {
    expect(migrationFile).toBeDefined();
    expect(migrationSql).toContain("create or replace function public.get_current_admin_context");
    expect(migrationSql).toContain("create or replace function public.has_admin_permission");
    expect(migrationSql).toContain("create or replace function public.require_admin_permission");
    expect(migrationSql).toContain("profiles");
    expect(migrationSql).toContain("admin_role");
  });

  it("enforces role-specific write permissions in administrator RPCs", () => {
    expect(migrationSql).toContain("public.require_admin_permission('customers.write')");
    expect(migrationSql).toContain("public.require_admin_permission('points.write')");
    expect(migrationSql).toContain("public.require_admin_permission('policies.write')");
    expect(migrationSql).toContain("public.require_admin_permission('admins.write')");
    expect(migrationSql).toContain("public.require_admin_permission('integrations.write')");
    expect(migrationSql).toContain("public.require_admin_permission('brand.write')");
  });
});
