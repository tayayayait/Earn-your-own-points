import { describe, expect, it } from "vitest";

import {
  adminLayoutClasses,
  appLayoutClasses,
  isAdminNavActive,
  isAppNavActive,
} from "./layout-shell";

describe("adminLayoutClasses", () => {
  it("matches the Phase 0-4 admin layout dimensions", () => {
    expect(adminLayoutClasses.sidebar).toContain("md:w-[72px]");
    expect(adminLayoutClasses.sidebar).toContain("lg:w-[240px]");
    expect(adminLayoutClasses.header).toContain("h-14");
    expect(adminLayoutClasses.main).toContain("min-h-[calc(100vh-56px)]");
    expect(adminLayoutClasses.main).toContain("bg-[var(--color-slate-50)]");
    expect(adminLayoutClasses.mobileDrawer).toContain("sm:max-md");
  });

  it("keeps transaction root active without activating manual transaction routes", () => {
    expect(isAdminNavActive("/admin/transactions", "/admin/transactions")).toBe(true);
    expect(isAdminNavActive("/admin/transactions/manual", "/admin/transactions")).toBe(false);
    expect(isAdminNavActive("/admin/customers/abc", "/admin/customers")).toBe(true);
  });
});

describe("appLayoutClasses", () => {
  it("matches the Phase 0-4 user layout dimensions", () => {
    expect(appLayoutClasses.header).toContain("h-14");
    expect(appLayoutClasses.header).toContain("md:h-16");
    expect(appLayoutClasses.main).toContain("max-w-[960px]");
    expect(appLayoutClasses.main).toContain("px-4");
    expect(appLayoutClasses.bottomNav).toContain("h-16");
  });

  it("marks nested user app routes active", () => {
    expect(isAppNavActive("/app/transactions", "/app/transactions")).toBe(true);
    expect(isAppNavActive("/app/transactions/detail", "/app/transactions")).toBe(true);
    expect(isAppNavActive("/app/profile", "/app/home")).toBe(false);
  });
});
