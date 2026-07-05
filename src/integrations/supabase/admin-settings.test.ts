import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase5_admin_settings.sql"),
);

if (!migrationFile) {
  throw new Error("phase5_admin_settings migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase5 admin settings migration", () => {
  it("creates guarded brand, admin, invitation, and audit RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_brand_settings");
    expect(migrationSql).toContain("create or replace function public.save_admin_brand_settings");
    expect(migrationSql).toContain("create or replace function public.get_admin_admins");
    expect(migrationSql).toContain("create or replace function public.invite_admin_user");
    expect(migrationSql).toContain("create or replace function public.update_admin_role");
    expect(migrationSql).toContain("create or replace function public.get_admin_audit_logs");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(6);
  });

  it("validates brand settings and records audit logs", () => {
    expect(migrationSql).toContain("_service_name");
    expect(migrationSql).toContain("_point_label");
    expect(migrationSql).toContain("_primary_color !~");
    expect(migrationSql).toContain("char_length(trim(coalesce(_home_message, ''))) > 100");
    expect(migrationSql).toContain("'settings.brand.save'");
  });

  it("supports admin invitations, roles, and owner minimum rule", () => {
    expect(migrationSql).toContain("create table if not exists public.admin_invitations");
    expect(migrationSql).toContain("now() + interval '24 hours'");
    expect(migrationSql).toContain("admin_role public.admin_role not null");
    expect(migrationSql).toContain("owner minimum");
    expect(migrationSql).toContain("'settings.admin.invite'");
    expect(migrationSql).toContain("'settings.admin.role'");
  });

  it("returns filtered read-only audit logs and grants only authenticated execution", () => {
    expect(migrationSql).toContain("_actor_id uuid");
    expect(migrationSql).toContain("_action text");
    expect(migrationSql).toContain("_target_table text");
    expect(migrationSql).toContain("_date_from date");
    expect(migrationSql).toContain("'audit_logs'");
    expect(migrationSql).not.toContain("delete from public.audit_logs");
    expect(migrationSql).toContain("revoke execute on function public.get_admin_audit_logs");
    expect(migrationSql).toContain("grant execute on function public.get_admin_audit_logs");
  });
});
