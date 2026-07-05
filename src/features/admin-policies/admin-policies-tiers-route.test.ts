import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.policies.tiers.tsx"),
  "utf8",
);
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin tier policies route", () => {
  it("uses guarded tier policy RPCs and is linked from admin navigation", () => {
    expect(route).toContain("get_admin_tier_policies");
    expect(route).toContain("save_admin_tier_policy");
    expect(route).toContain("reorder_admin_tier_policies");
    expect(route).toContain("disable_admin_tier_policy");
    expect(adminPermissions).toContain("/admin/policies/tiers");
  });

  it("renders Phase 2-2 table columns, edit fields, reorder controls, and deletion handling", () => {
    expect(route).toContain("등급명");
    expect(route).toContain("승급 기준");
    expect(route).toContain("기본 적립률");
    expect(route).toContain("추가 적립률");
    expect(route).toContain("최소 유지 조건");
    expect(route).toContain("순서 변경");
    expect(route).toContain("고객 처리 방식");
    expect(route).toContain("하위 등급");
    expect(route).toContain("기본 등급");
    expect(route).toContain("감사 사유");
  });
});
