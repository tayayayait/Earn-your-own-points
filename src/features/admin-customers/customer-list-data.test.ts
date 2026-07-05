import { describe, expect, it } from "vitest";

import {
  buildCustomerListRpcArgs,
  formatCustomerCode,
  normalizeCustomerListResponse,
  toggleArrayValue,
} from "./customer-list-data";

describe("formatCustomerCode", () => {
  it("formats one-based customer row numbers as CUS identifiers", () => {
    expect(formatCustomerCode(1)).toBe("CUS-000001");
    expect(formatCustomerCode(1203)).toBe("CUS-001203");
  });
});

describe("toggleArrayValue", () => {
  it("adds and removes filter values without mutating the source", () => {
    const selected = ["active"];

    expect(toggleArrayValue(selected, "blocked")).toEqual(["active", "blocked"]);
    expect(toggleArrayValue(selected, "active")).toEqual([]);
    expect(selected).toEqual(["active"]);
  });
});

describe("buildCustomerListRpcArgs", () => {
  it("normalizes route search state into typed RPC args", () => {
    expect(
      buildCustomerListRpcArgs({
        q: " hong ",
        statuses: ["active", "blocked"],
        tierIds: ["tier1"],
        minPoints: "100",
        maxPoints: "2000",
        joinedFrom: "2026-01-01",
        joinedTo: "2026-07-03",
        sortBy: "balance",
        sortDir: "asc",
        page: 3,
      }),
    ).toEqual({
      _query: "hong",
      _statuses: ["active", "blocked"],
      _tier_ids: ["tier1"],
      _min_points: 100,
      _max_points: 2000,
      _joined_from: "2026-01-01",
      _joined_to: "2026-07-03",
      _sort_by: "balance",
      _sort_dir: "asc",
      _page: 3,
      _page_size: 20,
    });
  });

  it("falls back to safe defaults for invalid numeric state", () => {
    expect(
      buildCustomerListRpcArgs({
        minPoints: "abc",
        maxPoints: "",
        page: -1,
      }),
    ).toMatchObject({
      _min_points: null,
      _max_points: null,
      _page: 1,
      _page_size: 20,
      _sort_by: "created_at",
      _sort_dir: "desc",
    });
  });
});

describe("normalizeCustomerListResponse", () => {
  it("normalizes RPC payloads into table-safe data", () => {
    const result = normalizeCustomerListResponse({
      total_count: "21",
      page: 2,
      page_size: 20,
      customers: [
        {
          row_number: 21,
          id: "user1",
          full_name: "홍길동",
          email: "hong@example.com",
          phone: "01012345678",
          status: "active",
          tier_id: "tier1",
          tier_name: "VIP",
          balance: "1200",
          pending_points: 300,
          total_earned: 1500,
          total_redeemed: 300,
          last_transaction_at: "2026-07-03T00:00:00+09:00",
          created_at: "2026-01-01T00:00:00+09:00",
        },
      ],
    });

    expect(result.totalCount).toBe(21);
    expect(result.totalPages).toBe(2);
    expect(result.customers[0]).toMatchObject({
      customerCode: "CUS-000021",
      name: "홍길동",
      status: "active",
      tierName: "VIP",
      balance: 1200,
      pendingPoints: 300,
    });
  });
});
