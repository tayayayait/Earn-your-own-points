import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase4_admin_integrations.sql"),
);

if (!migrationFile) {
  throw new Error("phase4_admin_integrations migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase4 admin integrations migration", () => {
  it("creates guarded API key and webhook RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_integrations");
    expect(migrationSql).toContain("create or replace function public.create_admin_api_key");
    expect(migrationSql).toContain("create or replace function public.regenerate_admin_api_key");
    expect(migrationSql).toContain("create or replace function public.revoke_admin_api_key");
    expect(migrationSql).toContain("create or replace function public.save_admin_webhook");
    expect(migrationSql).toContain("create or replace function public.test_admin_webhook");
    expect(migrationSql).toContain("create or replace function public.retry_admin_webhook_log");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(7);
  });

  it("stores API keys securely and exposes only one-time secrets", () => {
    expect(migrationSql).toContain("gen_random_bytes");
    expect(migrationSql).toContain("digest(raw_key, 'sha256')");
    expect(migrationSql).toContain("key_hash");
    expect(migrationSql).toContain("key_prefix");
    expect(migrationSql).toContain("key_suffix");
    expect(migrationSql).toContain("'api_key_secret'");
    expect(migrationSql).not.toContain("'key_hash', key_hash");
  });

  it("supports webhook signing keys, test sends, status metrics, failure logs, and retries", () => {
    expect(migrationSql).toContain("signing_key_prefix");
    expect(migrationSql).toContain("signing_key_suffix");
    expect(migrationSql).toContain("'webhook_secret'");
    expect(migrationSql).toContain("'status'");
    expect(migrationSql).toContain("'success_rate'");
    expect(migrationSql).toContain("'avg_response_time_ms'");
    expect(migrationSql).toContain("'failure_logs'");
    expect(migrationSql).toContain("error_code");
    expect(migrationSql).toContain("retry_count");
  });

  it("records audit logs and grants only authenticated execution", () => {
    expect(migrationSql).toContain("'integration.api_key.create'");
    expect(migrationSql).toContain("'integration.api_key.regenerate'");
    expect(migrationSql).toContain("'integration.api_key.revoke'");
    expect(migrationSql).toContain("'integration.webhook.save'");
    expect(migrationSql).toContain("'integration.webhook.test'");
    expect(migrationSql).toContain("'integration.webhook.retry'");
    expect(migrationSql).toContain("revoke execute on function public.get_admin_integrations");
    expect(migrationSql).toContain("grant execute on function public.get_admin_integrations");
    expect(migrationSql).toContain("revoke execute on function public.create_admin_api_key");
    expect(migrationSql).toContain("grant execute on function public.create_admin_api_key");
  });
});
