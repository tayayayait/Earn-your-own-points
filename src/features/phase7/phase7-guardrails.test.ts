import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminTransactions = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.transactions.tsx"),
  "utf8",
);
const adminManual = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.transactions.manual.tsx"),
  "utf8",
);
const adminIntegrations = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.integrations.tsx"),
  "utf8",
);
const auditLogs = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.settings.audit-logs.tsx"),
  "utf8",
);
const reports = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.reports.tsx"),
  "utf8",
);

describe("Phase 7 security and accessibility guardrails", () => {
  it("keeps transaction history append-only in the UI", () => {
    expect(adminTransactions).not.toContain(".delete(");
    expect(adminTransactions).not.toContain("delete_admin_transaction");
    expect(adminTransactions).toContain("취소 거래 생성");
    expect(adminTransactions).toContain("원거래와 연결된 역거래");
  });

  it("keeps dangerous actions behind confirmation and reason requirements", () => {
    expect(adminManual).toContain("처리 확인");
    expect(adminManual).toContain("수동 지급/차감 사유");
    expect(adminTransactions).toContain("취소 사유는 10자 이상");
    expect(adminTransactions).toContain("재처리 사유는 10자 이상");
  });

  it("keeps API keys one-time visible and audit logs read-only", () => {
    expect(adminIntegrations).toContain("rawSecret");
    expect(adminIntegrations).toContain("한 번만 표시");
    expect(auditLogs).toContain("읽기 전용");
    expect(auditLogs).toContain("삭제 기능 없음");
    expect(auditLogs).not.toContain("delete_admin_audit");
  });

  it("records CSV export audit intent before download", () => {
    expect(reports).toContain("create_admin_report_export");
    expect(reports).toContain("CSV 다운로드");
    expect(reports).toContain("필터 적용 결과만 다운로드");
  });
});
