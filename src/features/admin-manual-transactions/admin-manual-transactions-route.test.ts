import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manualRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.transactions.manual.tsx"),
  "utf8",
);

describe("admin manual transactions route", () => {
  it("uses guarded RPCs instead of direct profile search and point transaction inserts", () => {
    expect(manualRoute).toContain("search_admin_transaction_customers");
    expect(manualRoute).toContain("get_admin_manual_transaction_context");
    expect(manualRoute).toContain("create_admin_customer_point_transaction");
    expect(manualRoute).not.toContain('.from("profiles")');
    expect(manualRoute).not.toContain('.from("point_transactions").insert');
  });

  it("renders Phase 1-7 expiration, reason, balance validation, confirmation, and idempotency UI", () => {
    expect(manualRoute).toContain("만료일");
    expect(manualRoute).toContain("수동 지급/차감 사유");
    expect(manualRoute).toContain("500");
    expect(manualRoute).toContain("보유 포인트보다 많이 차감할 수 없습니다.");
    expect(manualRoute).toContain("예상 잔액");
    expect(manualRoute).toContain("처리 확인");
    expect(manualRoute).toContain("idempotency");
  });
});
