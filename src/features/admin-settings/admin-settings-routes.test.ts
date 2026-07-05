import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const brandRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.settings.brand.tsx"),
  "utf8",
);
const adminsRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.settings.admins.tsx"),
  "utf8",
);
const auditRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.settings.audit-logs.tsx"),
  "utf8",
);
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin settings routes", () => {
  it("uses guarded settings RPCs and links settings routes from admin navigation", () => {
    expect(brandRoute).toContain("get_admin_brand_settings");
    expect(brandRoute).toContain("save_admin_brand_settings");
    expect(adminsRoute).toContain("get_admin_admins");
    expect(adminsRoute).toContain("invite_admin_user");
    expect(adminsRoute).toContain("update_admin_role");
    expect(auditRoute).toContain("get_admin_audit_logs");
    expect(adminPermissions).toContain("/admin/settings/brand");
    expect(adminPermissions).toContain("/admin/settings/admins");
    expect(adminPermissions).toContain("/admin/settings/audit-logs");
  });

  it("renders brand settings requirements", () => {
    expect(brandRoute).toContain("브랜드 설정");
    expect(brandRoute).toContain("서비스명");
    expect(brandRoute).toContain("포인트 명칭");
    expect(brandRoute).toContain("로고 업로드");
    expect(brandRoute).toContain("SVG/PNG/WebP");
    expect(brandRoute).toContain("최대 2MB");
    expect(brandRoute).toContain("WCAG 대비 검사");
    expect(brandRoute).toContain("사용자 홈 안내문");
  });

  it("renders admin role and invitation requirements", () => {
    expect(adminsRoute).toContain("관리자 계정 및 권한");
    expect(adminsRoute).toContain("OWNER");
    expect(adminsRoute).toContain("MANAGER");
    expect(adminsRoute).toContain("OPERATOR");
    expect(adminsRoute).toContain("VIEWER");
    expect(adminsRoute).toContain("관리자 초대");
    expect(adminsRoute).toContain("24시간 만료");
    expect(adminsRoute).toContain("OWNER 최소 1명 유지");
  });

  it("renders read-only audit logs and JSON diff viewer requirements", () => {
    expect(auditRoute).toContain("감사 로그");
    expect(auditRoute).toContain("관리자");
    expect(auditRoute).toContain("액션");
    expect(auditRoute).toContain("대상");
    expect(auditRoute).toContain("기간");
    expect(auditRoute).toContain("삭제 기능 없음");
    expect(auditRoute).toContain("읽기 전용");
    expect(auditRoute).toContain("JSON diff");
    expect(auditRoute).toContain("User Agent");
  });
});
