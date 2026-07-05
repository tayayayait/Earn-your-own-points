import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const transactionsRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.transactions.tsx"),
  "utf8",
);

describe("admin transactions route", () => {
  it("uses transaction list/detail/action RPCs instead of fixed direct table loading", () => {
    expect(transactionsRoute).toContain("get_admin_transactions");
    expect(transactionsRoute).toContain("get_admin_transaction_detail");
    expect(transactionsRoute).toContain("cancel_admin_transaction");
    expect(transactionsRoute).toContain("retry_admin_transaction");
    expect(transactionsRoute).not.toContain("limit(200)");
  });

  it("renders Phase 1-4 filters, table columns, detail modal, and guarded actions", () => {
    expect(transactionsRoute).toContain("거래 ID");
    expect(transactionsRoute).toContain("고객 검색");
    expect(transactionsRoute).toContain("외부 거래 ID");
    expect(transactionsRoute).toContain("300");
    expect(transactionsRoute).toContain("PTX-");
    expect(transactionsRoute).toContain("포인트");
    expect(transactionsRoute).toContain("잔액");
    expect(transactionsRoute).toContain("처리 로그");
    expect(transactionsRoute).toContain("취소 가능");
    expect(transactionsRoute).toContain("재처리");
  });
});
