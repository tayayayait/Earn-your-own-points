import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = join(
  process.cwd(),
  "src",
  "routes",
  "_authenticated",
  "admin.policies.products.tsx",
);
const route = readFileSync(routePath, "utf8");
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin product policies route", () => {
  it("uses guarded product policy RPCs and is linked from admin navigation", () => {
    expect(route).toContain("get_admin_product_policies");
    expect(route).toContain("save_admin_product_policy");
    expect(route).toContain("disable_admin_product_policy");
    expect(route).toContain("search_admin_policy_targets");
    expect(adminPermissions).toContain("/admin/policies/products");
  });

  it("renders Phase 2-3 policy CRUD, async target selection, periods, and priority hierarchy", () => {
    expect(route).toContain("상품/카테고리 정책");
    expect(route).toContain("정책명");
    expect(route).toContain("대상 유형");
    expect(route).toContain("대상 선택");
    expect(route).toContain("대상 검색");
    expect(route).toContain("적용 기간");
    expect(route).toContain("종료일 없음");
    expect(route).toContain("우선순위");
    expect(route).toContain("상품 > 카테고리 > 이벤트 > 등급 > 기본");
    expect(route).toContain("중복 우선순위");
    expect(route).toContain("적립 제외");
    expect(route).toContain("감사 사유");
  });
});
