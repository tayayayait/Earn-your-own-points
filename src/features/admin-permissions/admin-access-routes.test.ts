import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminLayout = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.tsx"),
  "utf8",
);
const adminLogin = readFileSync(join(process.cwd(), "src", "routes", "admin.login.tsx"), "utf8");
const noPermissionRoutePath = join(process.cwd(), "src", "routes", "admin.no-permission.tsx");

describe("admin access routes", () => {
  it("provides a dedicated no-permission route for authenticated non-admins", () => {
    expect(existsSync(noPermissionRoutePath)).toBe(true);

    const noPermissionRoute = readFileSync(noPermissionRoutePath, "utf8");
    expect(noPermissionRoute).toContain('createFileRoute("/admin/no-permission")');
    expect(noPermissionRoute).toContain("권한이 없습니다.");
    expect(noPermissionRoute).toContain("필요한 권한");
    expect(noPermissionRoute).toContain("/admin/login");
  });

  it("routes permission failures to the dedicated 403 page", () => {
    expect(adminLogin).toContain("/admin/no-permission");
    expect(adminLayout).toContain("/admin/no-permission");
    expect(adminLayout).toContain("/admin/login");
    expect(adminLayout).toContain("requiredPermissionForPath");
  });
});
