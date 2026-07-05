import { describe, expect, it } from "vitest";

import {
  customerStatusMap,
  getStatusMeta,
  policyStatusMap,
  transactionStatusMap,
  transactionTypeMap,
} from "./enums";

describe("enum maps", () => {
  it("contains customer and policy status values required by the implementation plan", () => {
    expect(Object.keys(customerStatusMap)).toEqual(["active", "dormant", "withdrawn", "blocked"]);
    expect(Object.keys(policyStatusMap)).toEqual([
      "draft",
      "scheduled",
      "active",
      "paused",
      "ended",
      "disabled",
    ]);
  });

  it("supports new and legacy transaction statuses", () => {
    expect(transactionStatusMap.confirmed).toMatchObject({ label: "확정", tone: "success" });
    expect(transactionStatusMap.completed).toMatchObject({ label: "확정", tone: "success" });
    expect(transactionStatusMap.canceled).toMatchObject({ label: "취소", tone: "neutral" });
    expect(transactionStatusMap.cancelled).toMatchObject({ label: "취소", tone: "neutral" });
  });

  it("maps transaction type labels and signs from one source", () => {
    expect(transactionTypeMap.manual_earn).toMatchObject({ label: "관리자 지급", sign: "+" });
    expect(transactionTypeMap.manual_deduct).toMatchObject({ label: "관리자 차감", sign: "-" });
    expect(transactionTypeMap.redeem).toMatchObject({ label: "포인트 사용", sign: "-" });
    expect(transactionTypeMap.adjust.sign).toBe("±");
  });
});

describe("getStatusMeta", () => {
  it("returns mapped metadata for known statuses", () => {
    expect(getStatusMeta("transaction", "confirmed")).toMatchObject({
      label: "확정",
      tone: "success",
    });
  });

  it("falls back to neutral metadata for unknown statuses", () => {
    expect(getStatusMeta("policy", "unknown")).toEqual({ label: "unknown", tone: "neutral" });
  });
});
