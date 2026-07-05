import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((file) =>
  file.endsWith("_phase1_admin_transactions.sql"),
);

if (!migrationFile) {
  throw new Error("phase1_admin_transactions migration was not found");
}

const migrationSql = readFileSync(join(migrationsDir, migrationFile), "utf8").toLowerCase();

describe("phase1 admin transactions migration", () => {
  it("creates guarded transaction list, detail, cancellation, and retry RPCs", () => {
    expect(migrationSql).toContain("create or replace function public.get_admin_transactions");
    expect(migrationSql).toContain(
      "create or replace function public.get_admin_transaction_detail",
    );
    expect(migrationSql).toContain("create or replace function public.cancel_admin_transaction");
    expect(migrationSql).toContain("create or replace function public.retry_admin_transaction");
    expect(
      migrationSql.match(/public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
  });

  it("accepts exact transaction, async customer, external id, type, status, date, and pagination filters", () => {
    expect(migrationSql).toContain("_transaction_id text");
    expect(migrationSql).toContain("_customer_id uuid");
    expect(migrationSql).toContain("_external_transaction_id text");
    expect(migrationSql).toContain("_type text");
    expect(migrationSql).toContain("_status text");
    expect(migrationSql).toContain("_date_from date");
    expect(migrationSql).toContain("_date_to date");
    expect(migrationSql).toContain("_page integer");
    expect(migrationSql).toContain("_page_size integer");
  });

  it("returns Phase 1-4 table and detail sections", () => {
    expect(migrationSql).toContain("'transactions'");
    expect(migrationSql).toContain("'total_count'");
    expect(migrationSql).toContain("'customer'");
    expect(migrationSql).toContain("'policy'");
    expect(migrationSql).toContain("'logs'");
    expect(migrationSql).toContain("'external_transaction_id'");
    expect(migrationSql).toContain("'can_cancel'");
    expect(migrationSql).toContain("'can_retry'");
  });

  it("implements cancellation as a reversal transaction and retry only for failed status", () => {
    expect(migrationSql).toContain("original_transaction_id");
    expect(migrationSql).toContain("'earn_cancel'");
    expect(migrationSql).toContain("'use_cancel'");
    expect(migrationSql).toContain("current_tx.status::text not in ('completed', 'confirmed')");
    expect(migrationSql).toContain("current_tx.status::text <> 'failed'");
    expect(migrationSql).toContain("'transaction.cancel'");
    expect(migrationSql).toContain("'transaction.retry'");
  });

  it("revokes public execution and grants authenticated execution for Data API access", () => {
    expect(migrationSql).toContain("revoke execute on function public.get_admin_transactions");
    expect(migrationSql).toContain("grant execute on function public.get_admin_transactions");
    expect(migrationSql).toContain("revoke execute on function public.cancel_admin_transaction");
    expect(migrationSql).toContain("grant execute on function public.cancel_admin_transaction");
  });
});
