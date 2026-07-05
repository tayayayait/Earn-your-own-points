import { describe, expect, it } from "vitest";

import {
  buildSaveEventRpcArgs,
  emptyEventWizardForm,
  eventToForm,
  normalizeEventResponse,
  validateEventWizardForm,
  type AdminEvent,
} from "./event-data";

const existingEvents: AdminEvent[] = [
  {
    id: "event-1",
    name: "여름 적립 이벤트",
    description: "여름 시즌",
    status: "active",
    startsAt: "2026-07-01T00:00:00+09:00",
    startsAtLabel: "2026-07-01 00:00",
    endsAt: "2026-07-31T23:59:00+09:00",
    endsAtLabel: "2026-07-31 23:59",
    targetRules: { tierIds: ["vip"], segments: [], productIds: [], categoryIds: [] },
    targetSummary: "등급 1개",
    rewardType: "rate",
    rewardValue: 5,
    rewardLabel: "추가 적립률 5%",
    customerLimit: 1000,
    totalBudgetPoints: 500000,
    spentPoints: 100000,
    budgetUsageRate: 20,
    priority: 50,
    updatedAt: "2026-07-03T00:00:00+09:00",
    updatedAtLabel: "2026-07-03 00:00",
  },
];

describe("normalizeEventResponse", () => {
  it("normalizes event list rows, target summary, reward label, and budget usage", () => {
    const data = normalizeEventResponse({
      events: [
        {
          id: "event-1",
          name: "VIP 주말 이벤트",
          description: "주말 추가 적립",
          status: "active",
          starts_at: "2026-07-04T00:00:00+09:00",
          ends_at: "2026-07-06T23:59:00+09:00",
          target_rules: {
            tier_ids: ["vip"],
            segments: ["new_customer"],
            product_ids: ["SKU-001"],
            category_ids: ["CAT-BEAUTY"],
          },
          reward_type: "rate",
          reward_value: "7.5",
          customer_limit: "3",
          total_budget_points: "100000",
          spent_points: "25000",
          priority: "20",
          updated_at: "2026-07-03T01:00:00+09:00",
        },
      ],
    });

    expect(data.events[0]).toMatchObject({
      id: "event-1",
      name: "VIP 주말 이벤트",
      status: "active",
      targetSummary: "등급 1개 · 세그먼트 1개 · 상품 1개 · 카테고리 1개",
      rewardType: "rate",
      rewardLabel: "추가 적립률 7.5%",
      customerLimit: 3,
      totalBudgetPoints: 100000,
      spentPoints: 25000,
      budgetUsageRate: 25,
      priority: 20,
    });
  });
});

describe("validateEventWizardForm", () => {
  it("validates basic info, period order, reward, and limits", () => {
    expect(
      validateEventWizardForm(
        {
          ...emptyEventWizardForm,
          name: "A",
          startsAt: "2026-07-04T00:00",
          endsAt: "2026-07-05T00:00",
          reason: "충분한 변경 사유입니다",
        },
        [],
      ),
    ).toBe("이벤트명은 2~50자로 입력하세요.");

    expect(
      validateEventWizardForm(
        {
          ...emptyEventWizardForm,
          name: "VIP 이벤트",
          startsAt: "2026-07-05T00:00",
          endsAt: "2026-07-04T00:00",
          reason: "충분한 변경 사유입니다",
        },
        [],
      ),
    ).toBe("종료일은 시작일 이후여야 합니다.");

    expect(
      validateEventWizardForm(
        {
          ...emptyEventWizardForm,
          name: "VIP 이벤트",
          startsAt: "2026-07-04T00:00",
          endsAt: "2026-07-05T00:00",
          customerLimit: "0",
          reason: "충분한 변경 사유입니다",
        },
        [],
      ),
    ).toBe("고객당 한도는 1 이상이어야 합니다.");
  });

  it("allows overlap with a warning but requires priority and audit reason", () => {
    const form = {
      ...emptyEventWizardForm,
      name: "겹치는 이벤트",
      startsAt: "2026-07-10T00:00",
      endsAt: "2026-07-12T00:00",
      priority: "60",
      reason: "충분한 변경 사유입니다",
    };

    expect(validateEventWizardForm(form, existingEvents)).toBeNull();
    expect(validateEventWizardForm({ ...form, priority: "1000" }, existingEvents)).toBe(
      "우선순위는 1~999 사이 정수로 입력하세요.",
    );
    expect(validateEventWizardForm({ ...form, reason: "짧음" }, existingEvents)).toBe(
      "감사 사유는 10자 이상 입력해야 합니다.",
    );
  });
});

describe("eventToForm", () => {
  it("keeps target rules and limits editable", () => {
    expect(eventToForm(existingEvents[0])).toMatchObject({
      id: "event-1",
      name: "여름 적립 이벤트",
      tierIds: ["vip"],
      rewardType: "rate",
      rewardValue: "5",
      customerLimit: "1000",
      totalBudgetPoints: "500000",
      priority: "50",
      reason: "",
    });
  });
});

describe("buildSaveEventRpcArgs", () => {
  it("converts wizard form state to RPC args", () => {
    expect(
      buildSaveEventRpcArgs({
        ...emptyEventWizardForm,
        id: "event-1",
        name: "VIP 주말 이벤트",
        description: "주말 추가 적립",
        startsAt: "2026-07-04T00:00",
        endsAt: "2026-07-06T23:59",
        tierIds: ["vip"],
        segments: ["new_customer"],
        productIds: ["SKU-001"],
        categoryIds: ["CAT-BEAUTY"],
        rewardType: "fixed",
        rewardValue: "500",
        customerLimit: "3",
        totalBudgetPoints: "100000",
        priority: "20",
        status: "scheduled",
        reason: "이벤트 변경 사유입니다",
      }),
    ).toEqual({
      _event_id: "event-1",
      _name: "VIP 주말 이벤트",
      _description: "주말 추가 적립",
      _starts_at: "2026-07-04T00:00",
      _ends_at: "2026-07-06T23:59",
      _target_rules: {
        tier_ids: ["vip"],
        segments: ["new_customer"],
        product_ids: ["SKU-001"],
        category_ids: ["CAT-BEAUTY"],
      },
      _reward_type: "fixed",
      _reward_value: 500,
      _customer_limit: 3,
      _total_budget_points: 100000,
      _priority: 20,
      _status: "scheduled",
      _reason: "이벤트 변경 사유입니다",
    });
  });
});
