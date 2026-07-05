import { describe, expect, it } from "vitest";

import {
  buildSaveTierPolicyRpcArgs,
  buildTierOrder,
  normalizeTierPolicyResponse,
  validateTierPolicyForm,
} from "./tier-policy-data";

describe("normalizeTierPolicyResponse", () => {
  it("normalizes tier policy rows and customer counts", () => {
    const data = normalizeTierPolicyResponse({
      tiers: [
        {
          id: "tier-1",
          name: "VIP",
          sort_order: "1",
          qualification_months: "12",
          min_spend: "1000000",
          min_purchase_count: "10",
          base_earn_rate: "1.5",
          bonus_earn_rate: "0.5",
          min_keep_spend: "500000",
          status: "active",
          customer_count: "12",
          updated_at: "2026-07-03T00:00:00+09:00",
        },
      ],
    });

    expect(data.tiers[0]).toMatchObject({
      id: "tier-1",
      name: "VIP",
      sortOrder: 1,
      qualificationMonths: 12,
      minSpend: 1000000,
      minPurchaseCount: 10,
      baseEarnRate: 1.5,
      bonusEarnRate: 0.5,
      minKeepSpend: 500000,
      status: "active",
      customerCount: 12,
    });
  });
});

describe("validateTierPolicyForm", () => {
  it("validates name, duplicate name, qualification period, rates, and reason", () => {
    const existingNames = ["VIP", "Gold"];

    expect(
      validateTierPolicyForm(
        {
          id: null,
          name: "V",
          qualificationMonths: "12",
          minSpend: "0",
          minPurchaseCount: "0",
          baseEarnRate: "1",
          bonusEarnRate: "0",
          minKeepSpend: "0",
          status: "active",
          reason: "충분한 변경 사유입니다",
        },
        existingNames,
      ),
    ).toBe("등급명은 2~50자로 입력하세요.");

    expect(
      validateTierPolicyForm(
        {
          id: null,
          name: "vip",
          qualificationMonths: "12",
          minSpend: "0",
          minPurchaseCount: "0",
          baseEarnRate: "1",
          bonusEarnRate: "0",
          minKeepSpend: "0",
          status: "active",
          reason: "충분한 변경 사유입니다",
        },
        existingNames,
      ),
    ).toBe("이미 사용 중인 등급명입니다.");

    expect(
      validateTierPolicyForm(
        {
          id: "tier-1",
          name: "VIP",
          qualificationMonths: "25",
          minSpend: "0",
          minPurchaseCount: "0",
          baseEarnRate: "1",
          bonusEarnRate: "0",
          minKeepSpend: "0",
          status: "active",
          reason: "충분한 변경 사유입니다",
        },
        existingNames,
      ),
    ).toBe("승급 기준 기간은 1~24개월로 입력하세요.");

    expect(
      validateTierPolicyForm(
        {
          id: "tier-1",
          name: "VIP",
          qualificationMonths: "12",
          minSpend: "0",
          minPurchaseCount: "0",
          baseEarnRate: "101",
          bonusEarnRate: "0",
          minKeepSpend: "0",
          status: "active",
          reason: "충분한 변경 사유입니다",
        },
        existingNames,
      ),
    ).toBe("적립률은 0~100 사이로 입력하세요.");
  });

  it("requires a 10 character audit reason", () => {
    expect(
      validateTierPolicyForm(
        {
          id: null,
          name: "Silver",
          qualificationMonths: "12",
          minSpend: "0",
          minPurchaseCount: "0",
          baseEarnRate: "1",
          bonusEarnRate: "0",
          minKeepSpend: "0",
          status: "active",
          reason: "짧음",
        },
        [],
      ),
    ).toBe("감사 사유는 10자 이상 입력해야 합니다.");
  });
});

describe("buildSaveTierPolicyRpcArgs", () => {
  it("converts form state to RPC args", () => {
    expect(
      buildSaveTierPolicyRpcArgs(
        {
          id: "tier-1",
          name: "VIP",
          qualificationMonths: "12",
          minSpend: "1000000",
          minPurchaseCount: "10",
          baseEarnRate: "1.5",
          bonusEarnRate: "0.5",
          minKeepSpend: "500000",
          status: "active",
          reason: "정책 변경 사유입니다",
        },
        3,
      ),
    ).toEqual({
      _tier_id: "tier-1",
      _name: "VIP",
      _sort_order: 3,
      _qualification_months: 12,
      _min_spend: 1000000,
      _min_purchase_count: 10,
      _base_earn_rate: 1.5,
      _bonus_earn_rate: 0.5,
      _min_keep_spend: 500000,
      _status: "active",
      _reason: "정책 변경 사유입니다",
    });
  });
});

describe("buildTierOrder", () => {
  it("moves one tier up or down without mutating the source list", () => {
    const ids = ["bronze", "silver", "gold"];

    expect(buildTierOrder(ids, "silver", "up")).toEqual(["silver", "bronze", "gold"]);
    expect(buildTierOrder(ids, "silver", "down")).toEqual(["bronze", "gold", "silver"]);
    expect(ids).toEqual(["bronze", "silver", "gold"]);
  });
});
