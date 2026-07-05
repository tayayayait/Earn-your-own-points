import { describe, expect, it } from "vitest";

import {
  buildSaveProductPolicyRpcArgs,
  emptyProductPolicyForm,
  normalizeProductPolicyResponse,
  productPolicyToForm,
  validateProductPolicyForm,
  type ProductPolicy,
} from "./product-policy-data";

const existingPolicies: ProductPolicy[] = [
  {
    id: "policy-1",
    name: "전자제품 5% 적립",
    targetType: "category",
    targetIds: ["CAT-ELECTRONICS"],
    targetSummary: "CAT-ELECTRONICS",
    earningRate: 5,
    excluded: false,
    priority: 20,
    status: "active",
    startsAt: "2026-07-03T00:00:00+09:00",
    startsAtLabel: "2026-07-03 00:00",
    endsAt: null,
    endsAtLabel: "종료일 없음",
    updatedAt: "2026-07-03T01:00:00+09:00",
    updatedAtLabel: "2026-07-03 01:00",
  },
];

describe("normalizeProductPolicyResponse", () => {
  it("normalizes product/category policies and period labels", () => {
    const data = normalizeProductPolicyResponse({
      policies: [
        {
          id: "policy-1",
          name: "VIP 상품 적립",
          target_type: "product",
          target_ids: ["SKU-001", "SKU-002"],
          earning_rate: "7.5",
          excluded: false,
          priority: "10",
          status: "active",
          starts_at: "2026-07-03T00:00:00+09:00",
          ends_at: null,
          updated_at: "2026-07-03T01:00:00+09:00",
        },
      ],
    });

    expect(data.policies[0]).toMatchObject({
      id: "policy-1",
      targetType: "product",
      targetIds: ["SKU-001", "SKU-002"],
      targetSummary: "SKU-001 외 1개",
      earningRate: 7.5,
      priority: 10,
      endsAtLabel: "종료일 없음",
    });
  });
});

describe("validateProductPolicyForm", () => {
  it("validates name, target type, selected targets, earning rate, and audit reason", () => {
    expect(
      validateProductPolicyForm(
        {
          ...emptyProductPolicyForm,
          name: "A",
          targetIds: ["SKU-001"],
          reason: "충분한 변경 사유입니다",
        },
        [],
      ),
    ).toBe("정책명은 2~50자로 입력하세요.");

    expect(
      validateProductPolicyForm(
        {
          ...emptyProductPolicyForm,
          name: "상품 정책",
          targetType: "brand" as "product",
          targetIds: ["SKU-001"],
          reason: "충분한 변경 사유입니다",
        },
        [],
      ),
    ).toBe("대상 유형은 상품 또는 카테고리만 가능합니다.");

    expect(
      validateProductPolicyForm(
        {
          ...emptyProductPolicyForm,
          name: "상품 정책",
          earningRate: "101",
          targetIds: ["SKU-001"],
          reason: "충분한 변경 사유입니다",
        },
        [],
      ),
    ).toBe("적립률은 0~100 사이로 입력하세요.");
  });

  it("allows an open-ended period but blocks reversed periods and priority conflicts", () => {
    expect(
      validateProductPolicyForm(
        {
          ...emptyProductPolicyForm,
          name: "신규 상품 정책",
          targetType: "category",
          targetIds: ["CAT-BEAUTY"],
          earningRate: "3",
          priority: "20",
          startsAt: "",
          endsAt: "",
          reason: "충분한 변경 사유입니다",
        },
        existingPolicies,
      ),
    ).toBe("같은 대상 유형에서 활성/예약 정책 우선순위가 중복됩니다.");

    expect(
      validateProductPolicyForm(
        {
          ...emptyProductPolicyForm,
          name: "신규 상품 정책",
          targetType: "product",
          targetIds: ["SKU-001"],
          earningRate: "3",
          priority: "30",
          startsAt: "2026-07-05T00:00",
          endsAt: "2026-07-04T00:00",
          reason: "충분한 변경 사유입니다",
        },
        existingPolicies,
      ),
    ).toBe("종료일은 시작일 이후여야 합니다.");
  });
});

describe("productPolicyToForm", () => {
  it("keeps target ids as editable multi-select values", () => {
    expect(productPolicyToForm(existingPolicies[0])).toMatchObject({
      id: "policy-1",
      name: "전자제품 5% 적립",
      targetType: "category",
      targetIds: ["CAT-ELECTRONICS"],
      priority: "20",
      excluded: false,
      reason: "",
    });
  });
});

describe("buildSaveProductPolicyRpcArgs", () => {
  it("converts form state to RPC args", () => {
    expect(
      buildSaveProductPolicyRpcArgs({
        ...emptyProductPolicyForm,
        id: "policy-1",
        name: "VIP 상품 적립",
        targetType: "product",
        targetIds: ["SKU-001", "SKU-002"],
        earningRate: "7.5",
        startsAt: "2026-07-03T00:00",
        endsAt: "",
        priority: "10",
        excluded: true,
        status: "active",
        reason: "정책 변경 사유입니다",
      }),
    ).toEqual({
      _policy_id: "policy-1",
      _name: "VIP 상품 적립",
      _target_type: "product",
      _target_ids: ["SKU-001", "SKU-002"],
      _earning_rate: 7.5,
      _starts_at: "2026-07-03T00:00",
      _ends_at: null,
      _priority: 10,
      _excluded: true,
      _status: "active",
      _reason: "정책 변경 사유입니다",
    });
  });
});
