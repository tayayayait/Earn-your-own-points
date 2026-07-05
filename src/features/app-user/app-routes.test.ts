import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appLayout = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "app.tsx"),
  "utf8",
);
const authenticatedShell = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "route.tsx"),
  "utf8",
);
const authenticatedIndex = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "index.tsx"),
  "utf8",
);
const homeRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "app.home.tsx"),
  "utf8",
);
const transactionsRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "app.transactions.tsx"),
  "utf8",
);
const benefitsRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "app.benefits.tsx"),
  "utf8",
);
const profileRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "app.profile.tsx"),
  "utf8",
);
const authRoute = readFileSync(join(process.cwd(), "src", "routes", "auth.tsx"), "utf8");
const adminLoginRoute = readFileSync(
  join(process.cwd(), "src", "routes", "admin.login.tsx"),
  "utf8",
);

describe("Phase 6 user routes", () => {
  it("links the app navigation with readable labels", () => {
    expect(appLayout).toContain("포인트 리워드");
    expect(appLayout).toContain("홈");
    expect(appLayout).toContain("내역");
    expect(appLayout).toContain("혜택");
    expect(appLayout).toContain("프로필");
  });

  it("allows visitor access to the customer app while preserving admin login separation", () => {
    expect(authenticatedShell).not.toContain("supabase.auth.getUser");
    expect(authenticatedIndex).toContain('to: "/app/home"');
    expect(authRoute).toContain('to: "/app/home"');
    expect(appLayout).toContain("useAuth");
    expect(homeRoute).toContain("getPublicAppHomeData");
    expect(transactionsRoute).toContain("getPublicAppTransactionsData");
    expect(benefitsRoute).toContain("getPublicAppBenefitsData");
    expect(profileRoute).toContain("getPublicAppProfileData");
    expect(adminLoginRoute).toContain('createFileRoute("/admin/login")');
  });

  it("uses app RPCs for home, transactions, benefits, and profile", () => {
    expect(homeRoute).toContain("get_app_home");
    expect(transactionsRoute).toContain("get_app_transactions");
    expect(benefitsRoute).toContain("get_app_benefits");
    expect(profileRoute).toContain("get_app_profile");
    expect(profileRoute).toContain("update_app_profile");
    expect(profileRoute).toContain("request_app_withdrawal");
  });

  it("renders Phase 6 home, transaction filters, benefits, and profile controls", () => {
    expect(homeRoute).toContain("적립 예정");
    expect(homeRoute).toContain("30일 내 만료 예정");
    expect(homeRoute).toContain("최근 내역");
    expect(homeRoute).toContain("이벤트 혜택");
    expect(transactionsRoute).toContain("1개월");
    expect(transactionsRoute).toContain("직접 선택");
    expect(transactionsRoute).toContain("타임라인");
    expect(benefitsRoute).toContain("내 등급");
    expect(benefitsRoute).toContain("등급 혜택");
    expect(benefitsRoute).toContain("사용 조건");
    expect(profileRoute).toContain("비밀번호 변경");
    expect(profileRoute).toContain("탈퇴 요청");
    expect(profileRoute).toContain("잔여 포인트");
  });

  it("separates customer signup from admin login", () => {
    expect(authRoute).toContain("termsAccepted");
    expect(authRoute).toContain("marketingOptIn");
    expect(authRoute).toContain("formatPhoneInput");
    expect(adminLoginRoute).toContain('createFileRoute("/admin/login")');
    expect(adminLoginRoute).toContain("로그인 유지");
    expect(adminLoginRoute).toContain("비밀번호 재설정");
    expect(adminLoginRoute).toContain("registerAdminLoginFailure");
  });
});
