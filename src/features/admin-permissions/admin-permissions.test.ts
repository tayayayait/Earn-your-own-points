import { describe, expect, it } from "vitest";

import {
  adminNavItems,
  canAccessAdminNavItem,
  hasAdminPermission,
  normalizeAdminRole,
  requiredPermissionForPath,
  type AdminRole,
} from "./permissions";

describe("admin permissions", () => {
  it("matches the detail spec role matrix", () => {
    const roles: AdminRole[] = ["owner", "manager", "operator", "viewer"];

    expect(roles.filter((role) => hasAdminPermission(role, "dashboard.read"))).toEqual(roles);
    expect(roles.filter((role) => hasAdminPermission(role, "customers.write"))).toEqual([
      "owner",
      "manager",
      "operator",
    ]);
    expect(roles.filter((role) => hasAdminPermission(role, "points.write"))).toEqual([
      "owner",
      "manager",
      "operator",
    ]);
    expect(roles.filter((role) => hasAdminPermission(role, "policies.write"))).toEqual([
      "owner",
      "manager",
    ]);
    expect(roles.filter((role) => hasAdminPermission(role, "admins.write"))).toEqual(["owner"]);
    expect(roles.filter((role) => hasAdminPermission(role, "audit.read"))).toEqual([
      "owner",
      "manager",
    ]);
  });

  it("filters administrator navigation by role", () => {
    const ownerNav = adminNavItems.filter((item) => canAccessAdminNavItem("owner", item));
    const operatorNav = adminNavItems.filter((item) => canAccessAdminNavItem("operator", item));
    const viewerNav = adminNavItems.filter((item) => canAccessAdminNavItem("viewer", item));

    expect(ownerNav.map((item) => item.to)).toContain("/admin/settings/admins");
    expect(operatorNav.map((item) => item.to)).toContain("/admin/transactions/manual");
    expect(operatorNav.map((item) => item.to)).not.toContain("/admin/policies/base");
    expect(operatorNav.map((item) => item.to)).not.toContain("/admin/settings/audit-logs");
    expect(viewerNav.map((item) => item.to)).toContain("/admin/policies/base");
    expect(viewerNav.map((item) => item.to)).not.toContain("/admin/transactions/manual");
  });

  it("normalizes unknown roles to the safest read-only role", () => {
    expect(normalizeAdminRole("owner")).toBe("owner");
    expect(normalizeAdminRole("unexpected")).toBe("viewer");
    expect(requiredPermissionForPath("/admin/settings/audit-logs")).toBe("audit.read");
    expect(requiredPermissionForPath("/admin/unknown")).toBe("dashboard.read");
  });
});
