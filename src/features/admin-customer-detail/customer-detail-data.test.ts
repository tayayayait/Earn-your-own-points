import { describe, expect, it } from "vitest";

import {
  canEditCustomerProfile,
  canProcessCustomerPoints,
  createIdempotencyKey,
  isValidAdminReason,
  normalizeCustomerDetail,
} from "./customer-detail-data";

describe("customer action guards", () => {
  it("blocks personal information edits for withdrawn customers", () => {
    expect(canEditCustomerProfile("active")).toBe(true);
    expect(canEditCustomerProfile("blocked")).toBe(true);
    expect(canEditCustomerProfile("withdrawn")).toBe(false);
  });

  it("blocks point processing for blocked or withdrawn customers", () => {
    expect(canProcessCustomerPoints("active")).toBe(true);
    expect(canProcessCustomerPoints("dormant")).toBe(true);
    expect(canProcessCustomerPoints("blocked")).toBe(false);
    expect(canProcessCustomerPoints("withdrawn")).toBe(false);
  });

  it("requires administrator reasons to be at least 10 trimmed characters", () => {
    expect(isValidAdminReason("짧음")).toBe(false);
    expect(isValidAdminReason("고객 요청에 따른 수정")).toBe(true);
  });
});

describe("createIdempotencyKey", () => {
  it("creates stable manual adjustment keys from action inputs", () => {
    expect(createIdempotencyKey("user1", "manual_earn", 1000, "이벤트 보상 지급")).toBe(
      "manual:user1:manual_earn:1000:이벤트 보상 지급",
    );
  });
});

describe("normalizeCustomerDetail", () => {
  it("normalizes detail RPC payloads into render-safe data", () => {
    const detail = normalizeCustomerDetail({
      profile: {
        id: "user1",
        customer_code: null,
        full_name: "홍길동",
        email: "hong@example.com",
        phone: "01012345678",
        birth_date: "1990-01-01",
        status: "active",
        tier_name: "VIP",
        created_at: "2026-01-01T00:00:00+09:00",
      },
      summary: {
        available_points: "1200",
        pending_points: 300,
        expiring_points_30d: null,
        total_earned_points: 2000,
        total_redeemed_points: 800,
      },
      transactions: [
        {
          id: "tx1",
          type: "manual_earn",
          status: "confirmed",
          amount: 1000,
          balance_after: 1200,
          memo: "관리자 지급",
          created_at: "2026-07-03T00:00:00+09:00",
        },
      ],
      notes: [
        {
          id: "note1",
          body: "고객 응대 메모",
          created_at: "2026-07-03T00:00:00+09:00",
          created_by_name: "관리자",
          created_by_email: "admin@example.com",
        },
      ],
    });

    expect(detail.profile.name).toBe("홍길동");
    expect(detail.profile.customerCode).toBe("CUS-000001");
    expect(detail.summary.availablePoints).toBe(1200);
    expect(detail.summary.expiringPoints30d).toBe(0);
    expect(detail.transactions[0].typeLabel).toBe("관리자 지급");
    expect(detail.notes[0].createdByLabel).toBe("관리자");
  });

  it("returns stable defaults for missing payloads", () => {
    const detail = normalizeCustomerDetail(null);

    expect(detail.profile.id).toBe("");
    expect(detail.summary.availablePoints).toBe(0);
    expect(detail.transactions).toEqual([]);
    expect(detail.notes).toEqual([]);
  });
});
