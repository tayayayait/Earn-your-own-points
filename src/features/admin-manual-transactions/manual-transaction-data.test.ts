import { describe, expect, it } from "vitest";

import {
  MAX_MANUAL_POINT_AMOUNT,
  buildManualTransactionIdempotencyKey,
  calculateExpectedBalance,
  normalizeManualTransactionContext,
  validateManualTransactionForm,
} from "./manual-transaction-data";

describe("normalizeManualTransactionContext", () => {
  it("normalizes selected customer balance and default expiration policy", () => {
    const context = normalizeManualTransactionContext({
      customer: {
        id: "user-1",
        customer_code: "CUS-000001",
        full_name: "홍길동",
        email: "hong@example.com",
        phone: "01012345678",
        status: "active",
      },
      balance: {
        available_points: "1200",
        pending_points: 300,
      },
      policy: {
        policy_name: "기본 적립",
        valid_months: "12",
        default_expires_at: "2027-07-03T00:00:00+09:00",
      },
    });

    expect(context).toMatchObject({
      customer: {
        id: "user-1",
        label: "홍길동 · CUS-000001",
        status: "active",
      },
      balance: {
        availablePoints: 1200,
        pendingPoints: 300,
      },
      policy: {
        policyName: "기본 적립",
        validMonths: 12,
        defaultExpiresAtDate: "2027-07-03",
      },
    });
  });
});

describe("calculateExpectedBalance", () => {
  it("adds earn points and subtracts deduct points", () => {
    expect(calculateExpectedBalance(1000, "manual_earn", 300)).toBe(1300);
    expect(calculateExpectedBalance(1000, "manual_deduct", 300)).toBe(700);
  });
});

describe("validateManualTransactionForm", () => {
  it("requires a customer, positive amount, and a 10 character memo", () => {
    expect(
      validateManualTransactionForm({
        userId: "",
        type: "manual_earn",
        amount: 0,
        memo: "짧음",
        availablePoints: 0,
      }),
    ).toEqual("고객을 선택하세요.");

    expect(
      validateManualTransactionForm({
        userId: "user-1",
        type: "manual_earn",
        amount: 0,
        memo: "충분한 지급 사유입니다",
        availablePoints: 0,
      }),
    ).toEqual("포인트는 1 이상의 정수로 입력하세요.");

    expect(
      validateManualTransactionForm({
        userId: "user-1",
        type: "manual_earn",
        amount: 100,
        memo: "짧음",
        availablePoints: 0,
      }),
    ).toEqual("수동 지급/차감 사유는 10자 이상 입력해야 합니다.");
  });

  it("blocks decimal, negative, and excessive point amounts", () => {
    for (const amount of [-1, 1.5, MAX_MANUAL_POINT_AMOUNT + 1]) {
      expect(
        validateManualTransactionForm({
          userId: "user-1",
          type: "manual_earn",
          amount,
          memo: "충분한 지급 사유입니다",
          availablePoints: MAX_MANUAL_POINT_AMOUNT,
        }),
      ).toBe(
        amount > MAX_MANUAL_POINT_AMOUNT
          ? "포인트는 10,000,000P 이하로 입력하세요."
          : "포인트는 1 이상의 정수로 입력하세요.",
      );
    }
  });

  it("blocks deductions larger than the available point balance", () => {
    expect(
      validateManualTransactionForm({
        userId: "user-1",
        type: "manual_deduct",
        amount: 1500,
        memo: "충분한 차감 사유입니다",
        availablePoints: 1000,
      }),
    ).toEqual("보유 포인트보다 많이 차감할 수 없습니다.");
  });

  it("limits internal memo text to 500 characters", () => {
    expect(
      validateManualTransactionForm({
        userId: "user-1",
        type: "manual_earn",
        amount: 100,
        memo: "a".repeat(501),
        availablePoints: 1000,
      }),
    ).toEqual("내부 메모는 500자 이하로 입력하세요.");
  });
});

describe("buildManualTransactionIdempotencyKey", () => {
  it("creates stable keys from customer, type, amount, memo, and expiration", () => {
    expect(
      buildManualTransactionIdempotencyKey({
        userId: "user-1",
        type: "manual_earn",
        amount: 1000,
        memo: "이벤트 보상 지급",
        expiresAt: "2027-07-03",
      }),
    ).toBe("manual:user-1:manual_earn:1000:이벤트 보상 지급:2027-07-03");
  });
});
