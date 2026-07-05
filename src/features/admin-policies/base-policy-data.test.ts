import { describe, expect, it } from "vitest";

import {
  buildBasePolicyDiff,
  buildSaveBasePolicyRpcArgs,
  normalizeBasePolicyResponse,
  validateBasePolicyForm,
} from "./base-policy-data";

describe("normalizeBasePolicyResponse", () => {
  it("normalizes current base policy and history rows", () => {
    const data = normalizeBasePolicyResponse({
      current_policy: {
        id: "policy-1",
        name: "기본 적립 정책",
        earning_rate: "1.5",
        earn_unit: "10",
        rounding_method: "floor",
        min_redeem_points: "1000",
        max_redeem_ratio: "50",
        redeem_unit: "100",
        valid_months: "12",
        pending_days: "7",
        excluded_payment_methods: ["gift_card"],
        status: "active",
        starts_at: "2026-07-03T00:00:00+09:00",
        ends_at: null,
        updated_at: "2026-07-03T01:00:00+09:00",
      },
      history: [
        {
          id: "policy-0",
          name: "이전 정책",
          earning_rate: 1,
          earn_unit: 1,
          rounding_method: "round",
          min_redeem_points: 500,
          max_redeem_ratio: 30,
          redeem_unit: 10,
          valid_months: 6,
          pending_days: 0,
          excluded_payment_methods: [],
          status: "disabled",
          starts_at: "2026-01-01T00:00:00+09:00",
          ends_at: "2026-07-02T23:59:59+09:00",
          updated_at: "2026-07-02T23:59:59+09:00",
        },
      ],
    });

    expect(data.currentPolicy).toMatchObject({
      id: "policy-1",
      name: "기본 적립 정책",
      earningRate: 1.5,
      earnUnit: 10,
      maxRedeemRatio: 50,
      excludedPaymentMethods: ["gift_card"],
      status: "active",
    });
    expect(data.form).toMatchObject({
      name: "기본 적립 정책",
      applyMode: "immediate",
      earningRate: "1.5",
      earnUnit: "10",
      validMonths: "12",
      excludedPaymentMethods: "gift_card",
    });
    expect(data.history[0].status).toBe("disabled");
  });
});

describe("validateBasePolicyForm", () => {
  it("validates policy name, rates, units, and memo", () => {
    expect(
      validateBasePolicyForm({
        name: "A",
        earningRate: "1",
        earnUnit: "1",
        roundingMethod: "floor",
        minRedeemPoints: "0",
        maxRedeemRatio: "100",
        redeemUnit: "1",
        validMonths: "12",
        pendingDays: "0",
        excludedPaymentMethods: "",
        applyMode: "immediate",
        scheduledAt: "",
        reason: "충분한 변경 사유입니다",
      }),
    ).toBe("정책명은 2~50자로 입력하세요.");

    expect(
      validateBasePolicyForm({
        name: "기본 정책",
        earningRate: "101",
        earnUnit: "1",
        roundingMethod: "floor",
        minRedeemPoints: "0",
        maxRedeemRatio: "100",
        redeemUnit: "1",
        validMonths: "12",
        pendingDays: "0",
        excludedPaymentMethods: "",
        applyMode: "immediate",
        scheduledAt: "",
        reason: "충분한 변경 사유입니다",
      }),
    ).toBe("기본 적립률은 0~100 사이로 입력하세요.");
  });

  it("requires future schedule time and a 10 character audit reason", () => {
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(
      validateBasePolicyForm({
        name: "기본 정책",
        earningRate: "1",
        earnUnit: "1",
        roundingMethod: "floor",
        minRedeemPoints: "0",
        maxRedeemRatio: "100",
        redeemUnit: "1",
        validMonths: "12",
        pendingDays: "0",
        excludedPaymentMethods: "",
        applyMode: "scheduled",
        scheduledAt: past,
        reason: "충분한 변경 사유입니다",
      }),
    ).toBe("예약 적용 시간은 현재 이후여야 합니다.");

    expect(
      validateBasePolicyForm({
        name: "기본 정책",
        earningRate: "1",
        earnUnit: "1",
        roundingMethod: "floor",
        minRedeemPoints: "0",
        maxRedeemRatio: "100",
        redeemUnit: "1",
        validMonths: "12",
        pendingDays: "0",
        excludedPaymentMethods: "",
        applyMode: "immediate",
        scheduledAt: "",
        reason: "짧음",
      }),
    ).toBe("감사 사유는 10자 이상 입력해야 합니다.");
  });
});

describe("buildBasePolicyDiff", () => {
  it("returns before/after values only for changed fields", () => {
    expect(
      buildBasePolicyDiff(
        {
          name: "기본 정책",
          earningRate: "1",
          earnUnit: "1",
          roundingMethod: "floor",
          minRedeemPoints: "0",
          maxRedeemRatio: "100",
          redeemUnit: "1",
          validMonths: "12",
          pendingDays: "0",
          excludedPaymentMethods: "",
          applyMode: "immediate",
          scheduledAt: "",
          reason: "",
        },
        {
          name: "기본 정책",
          earningRate: "2",
          earnUnit: "1",
          roundingMethod: "floor",
          minRedeemPoints: "0",
          maxRedeemRatio: "80",
          redeemUnit: "1",
          validMonths: "12",
          pendingDays: "0",
          excludedPaymentMethods: "",
          applyMode: "immediate",
          scheduledAt: "",
          reason: "",
        },
      ),
    ).toEqual([
      { label: "기본 적립률", before: "1", after: "2" },
      { label: "최대 사용 비율", before: "100", after: "80" },
    ]);
  });
});

describe("buildSaveBasePolicyRpcArgs", () => {
  it("converts form state to RPC args", () => {
    expect(
      buildSaveBasePolicyRpcArgs({
        name: "기본 정책",
        earningRate: "1.5",
        earnUnit: "10",
        roundingMethod: "floor",
        minRedeemPoints: "1000",
        maxRedeemRatio: "50",
        redeemUnit: "100",
        validMonths: "12",
        pendingDays: "7",
        excludedPaymentMethods: "gift_card, voucher",
        applyMode: "scheduled",
        scheduledAt: "2026-07-04T00:00",
        reason: "정책 변경 사유입니다",
      }),
    ).toEqual({
      _name: "기본 정책",
      _earning_rate: 1.5,
      _earn_unit: 10,
      _rounding_method: "floor",
      _min_redeem_points: 1000,
      _max_redeem_ratio: 50,
      _redeem_unit: 100,
      _valid_months: 12,
      _pending_days: 7,
      _excluded_payment_methods: ["gift_card", "voucher"],
      _apply_mode: "scheduled",
      _scheduled_at: "2026-07-04T00:00",
      _reason: "정책 변경 사유입니다",
    });
  });
});
