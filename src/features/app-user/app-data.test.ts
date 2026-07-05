import { describe, expect, it } from "vitest";

import {
  buildAppTransactionFilters,
  buildProfileUpdateArgs,
  defaultTransactionSearch,
  getAdminLoginLockoutState,
  getPublicAppBenefitsData,
  getPublicAppHomeData,
  getPublicAppProfileData,
  getPublicAppTransactionsData,
  normalizeAppBenefitsResponse,
  normalizeAppHomeResponse,
  normalizeAppTransactionsResponse,
  registerAdminLoginFailure,
  validateAppPasswordForm,
  validateAppProfileForm,
  validateSignupForm,
  validateWithdrawalConfirmation,
  formatPhoneInput,
  type AdminLoginAttemptState,
} from "./app-data";

describe("normalizeAppHomeResponse", () => {
  it("builds the user home summary with pending, expiring, recent, and event sections", () => {
    const data = normalizeAppHomeResponse({
      profile: { full_name: "김고객", email: "customer@example.com", tier_name: "Gold" },
      brand: { point_label: "P", home_message: "이번 달 포인트 혜택을 확인하세요." },
      balance: { available: 12500, pending: 3000, total: 42000, expiring_soon: 900 },
      pending_earnings: [
        {
          id: "pending-1",
          title: "주문 적립 예정",
          amount: 3000,
          confirm_at: "2026-07-10T10:00:00+09:00",
        },
      ],
      expiring_points: [{ id: "expire-1", amount: 900, expires_at: "2026-07-20T23:59:00+09:00" }],
      recent_transactions: [
        {
          id: "tx-1",
          type: "earn",
          status: "confirmed",
          title: "구매 적립",
          amount: 1500,
          balance_after: 12500,
          created_at: "2026-07-03T10:30:00+09:00",
        },
      ],
      events: [
        {
          id: "event-1",
          name: "주말 더블 적립",
          description: "토요일 결제 시 추가 적립",
          reward_type: "rate",
          reward_value: 5,
          ends_at: "2026-07-31T23:59:00+09:00",
        },
      ],
    });

    expect(data.profile.name).toBe("김고객");
    expect(data.profile.tierName).toBe("Gold");
    expect(data.brand.pointLabel).toBe("P");
    expect(data.balance).toMatchObject({
      available: 12500,
      pending: 3000,
      expiringSoon: 900,
    });
    expect(data.pendingEarnings[0]).toMatchObject({
      title: "주문 적립 예정",
      pointLabel: "+3,000P",
      confirmAtLabel: "2026.07.10",
    });
    expect(data.expiringPoints[0].expiresAtLabel).toBe("2026.07.20");
    expect(data.recentTransactions[0]).toMatchObject({
      title: "구매 적립",
      amountLabel: "+1,500P",
      statusLabel: "확정",
      balanceAfterLabel: "12,500P",
    });
    expect(data.events[0].rewardLabel).toBe("추가 적립률 5%");
  });
});

describe("app transaction helpers", () => {
  it("builds date/type/status RPC filters and normalizes transaction labels", () => {
    const filters = buildAppTransactionFilters(
      { period: "3m", type: "earn", status: "confirmed", dateFrom: "", dateTo: "" },
      new Date("2026-07-04T00:00:00+09:00"),
    );

    expect(filters).toMatchObject({
      _type: "earn",
      _status: "confirmed",
    });
    expect(filters._date_from).toContain("2026-04");

    const transactions = normalizeAppTransactionsResponse({
      transactions: [
        {
          id: "tx-1",
          type: "manual_deduct",
          status: "confirmed",
          title: "관리자 차감",
          amount: 700,
          balance_after: 1800,
          created_at: "2026-07-04T09:00:00+09:00",
        },
      ],
    });

    expect(transactions[0]).toMatchObject({
      typeLabel: "관리자 차감",
      statusLabel: "확정",
      amountLabel: "-700P",
      balanceAfterLabel: "1,800P",
    });
  });
});

describe("public app data", () => {
  it("provides visitor-safe fallback data without a session", () => {
    const home = getPublicAppHomeData();
    const transactions = getPublicAppTransactionsData(defaultTransactionSearch);
    const benefits = getPublicAppBenefitsData();
    const profile = getPublicAppProfileData();

    expect(home.profile.name).toBe("방문 고객");
    expect(home.balance.available).toBeGreaterThan(0);
    expect(transactions.length).toBeGreaterThan(0);
    expect(benefits.currentTier.name).toBe("Silver");
    expect(profile.form.email).toBe("guest@example.com");
  });

  it("filters public transactions by type and status", () => {
    const earnTransactions = getPublicAppTransactionsData({
      ...defaultTransactionSearch,
      type: "earn",
      status: "confirmed",
    });

    expect(earnTransactions).toHaveLength(1);
    expect(earnTransactions[0].type).toBe("earn");
    expect(earnTransactions[0].status).toBe("confirmed");
  });
});

describe("normalizeAppBenefitsResponse", () => {
  it("caps next-tier progress at 100 and marks review-ready users", () => {
    const data = normalizeAppBenefitsResponse({
      current_tier: {
        id: "gold",
        name: "Gold",
        base_earn_rate: 2,
        bonus_earn_rate: 1,
      },
      next_tier: {
        id: "vip",
        name: "VIP",
        min_spend: 100000,
        min_purchase_count: 5,
      },
      progress: {
        current_spend: 120000,
        current_purchase_count: 6,
        required_spend: 0,
        required_purchase_count: 0,
        progress_rate: 140,
      },
      tiers: [
        {
          id: "gold",
          name: "Gold",
          base_earn_rate: 2,
          bonus_earn_rate: 1,
          min_spend: 50000,
          min_purchase_count: 2,
        },
      ],
      events: [],
      redeem_policy: { min_redeem_points: 5000, max_redeem_ratio: 50 },
    });

    expect(data.nextTierProgress.rate).toBe(100);
    expect(data.nextTierProgress.reviewReady).toBe(true);
    expect(data.nextTierProgress.message).toBe("승급 심사 예정");
    expect(data.redeemPolicy).toMatchObject({
      minRedeemPointsLabel: "5,000P",
      maxRedeemRatioLabel: "50%",
    });
  });
});

describe("profile and signup validation", () => {
  it("formats phone input and validates profile update constraints", () => {
    expect(formatPhoneInput("01012345678")).toBe("010-1234-5678");
    expect(formatPhoneInput("010-123-4567")).toBe("010-123-4567");

    expect(
      validateAppProfileForm({
        fullName: "김",
        phone: "010-1234-5678",
        email: "user@example.com",
        pointEarnNotify: true,
        pointExpiryNotify: true,
        marketingOptIn: false,
      }),
    ).toBe("이름은 2~30자로 입력하세요.");

    expect(
      buildProfileUpdateArgs({
        fullName: "김고객",
        phone: "010-1234-5678",
        email: "user@example.com",
        pointEarnNotify: true,
        pointExpiryNotify: false,
        marketingOptIn: true,
      }),
    ).toEqual({
      _full_name: "김고객",
      _phone: "010-1234-5678",
      _email: "user@example.com",
      _point_earn_notify: true,
      _point_expiry_notify: false,
      _marketing_opt_in: true,
    });
  });

  it("validates password change, withdrawal confirmation, and signup consent", () => {
    expect(
      validateAppPasswordForm({
        currentPassword: "old-password",
        newPassword: "short",
        confirmPassword: "short",
      }),
    ).toBe("새 비밀번호는 8자 이상이어야 합니다.");

    expect(validateWithdrawalConfirmation("탈퇴")).toBeNull();
    expect(validateWithdrawalConfirmation("delete")).toBe('탈퇴 확인 문구로 "탈퇴"를 입력하세요.');

    expect(
      validateSignupForm({
        fullName: "김고객",
        email: "customer@example.com",
        phone: "010-1234-5678",
        password: "secure-password",
        termsAccepted: false,
        marketingOptIn: true,
      }),
    ).toBe("필수 약관에 동의해야 가입할 수 있습니다.");
  });
});

describe("admin login lockout", () => {
  it("locks admin login for 10 minutes after five failures", () => {
    let state: AdminLoginAttemptState = { failures: 4, lockedUntil: null, updatedAt: 0 };
    state = registerAdminLoginFailure(state, 1_000);

    expect(state.failures).toBe(5);
    expect(state.lockedUntil).toBe(601_000);

    const locked = getAdminLoginLockoutState(state, 100_000);
    expect(locked.locked).toBe(true);
    expect(locked.remainingSeconds).toBe(501);

    const released = getAdminLoginLockoutState(state, 601_001);
    expect(released.locked).toBe(false);
    expect(released.remainingSeconds).toBe(0);
  });
});
