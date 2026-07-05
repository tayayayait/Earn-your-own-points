import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.policies.base.tsx"),
  "utf8",
);
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin base policies route", () => {
  it("uses guarded policy RPCs and is linked from admin navigation", () => {
    expect(route).toContain("get_admin_base_policy");
    expect(route).toContain("save_admin_base_policy");
    expect(route).toContain("disable_admin_base_policy");
    expect(adminPermissions).toContain("/admin/policies/base");
  });

  it("renders Phase 2-1 sections, diff preview, apply modes, and audit controls", () => {
    expect(route).toContain("적립 기준");
    expect(route).toContain("사용 조건");
    expect(route).toContain("만료/확정");
    expect(route).toContain("변경 전");
    expect(route).toContain("변경 후");
    expect(route).toContain("즉시 적용");
    expect(route).toContain("예약 적용");
    expect(route).toContain("활성 정책은 삭제할 수 없습니다.");
    expect(route).toContain("감사 사유");
  });
});
