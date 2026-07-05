import { describe, expect, it } from "vitest";

import { getToastOptions, normalizeApiError } from "./api-error-handler";

describe("normalizeApiError", () => {
  it("maps known API error codes to user-safe messages", () => {
    expect(normalizeApiError({ code: "INSUFFICIENT_BALANCE", traceId: "trace-1" })).toEqual({
      code: "INSUFFICIENT_BALANCE",
      message: "보유 포인트보다 많이 차감할 수 없습니다.",
      traceId: "trace-1",
      severity: "error",
    });
  });

  it("uses a generic error message for unknown values", () => {
    expect(normalizeApiError(new Error("raw database failure"))).toEqual({
      code: "UNKNOWN",
      message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
      traceId: undefined,
      severity: "error",
    });
  });
});

describe("getToastOptions", () => {
  it("applies implementation-plan toast durations", () => {
    expect(getToastOptions("success")).toEqual({ duration: 3000 });
    expect(getToastOptions("error")).toEqual({ duration: 6000 });
    expect(getToastOptions("info")).toEqual({ duration: 4000 });
  });
});
