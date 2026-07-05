import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.integrations.tsx"),
  "utf8",
);
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin integrations route", () => {
  it("uses guarded integration RPCs and is linked from admin navigation", () => {
    expect(route).toContain("get_admin_integrations");
    expect(route).toContain("create_admin_api_key");
    expect(route).toContain("regenerate_admin_api_key");
    expect(route).toContain("revoke_admin_api_key");
    expect(route).toContain("save_admin_webhook");
    expect(route).toContain("test_admin_webhook");
    expect(route).toContain("retry_admin_webhook_log");
    expect(adminPermissions).toContain("/admin/integrations");
  });

  it("renders Phase 4-2 integration sections and security affordances", () => {
    expect(route).toContain("API Key 관리");
    expect(route).toContain("한 번만 표시");
    expect(route).toContain("마스킹");
    expect(route).toContain("재발급");
    expect(route).toContain("비활성화");
    expect(route).toContain("Webhook 설정");
    expect(route).toContain("서명 검증 키");
    expect(route).toContain("테스트 전송");
    expect(route).toContain("연동 상태");
    expect(route).toContain("성공률");
    expect(route).toContain("최근 실패");
    expect(route).toContain("평균 응답시간");
    expect(route).toContain("실패 로그");
    expect(route).toContain("요청 ID");
    expect(route).toContain("오류 코드");
    expect(route).toContain("재시도");
  });
});
