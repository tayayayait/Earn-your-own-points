import { describe, expect, it } from "vitest";

import { formatDate, formatPhone, formatPoint, maskEmail } from "./formatters";

describe("formatPoint", () => {
  it("formats signed point values by transaction direction", () => {
    expect(formatPoint(12300, "earn")).toBe("+12,300P");
    expect(formatPoint(12300, "use")).toBe("-12,300P");
    expect(formatPoint(12300)).toBe("12,300P");
  });

  it("returns a dash for nullish point values", () => {
    expect(formatPoint(null)).toBe("-");
  });

  it("supports custom point labels", () => {
    expect(formatPoint(1000, "earn", "포인트")).toBe("+1,000포인트");
  });
});

describe("formatDate", () => {
  const date = "2026-07-03T14:05:00+09:00";

  it("formats dates for admin and user surfaces", () => {
    expect(formatDate(date, "admin")).toBe("2026-07-03 14:05");
    expect(formatDate(date, "user")).toBe("2026.07.03 14:05");
  });

  it("formats short and period labels", () => {
    expect(formatDate(date, "short")).toBe("07.03");
    expect(formatDate(date, "period")).toBe("2026.07.03");
  });
});

describe("formatPhone", () => {
  it("formats Korean mobile numbers and masks the middle segment when requested", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("01012345678", true)).toBe("010-****-5678");
  });

  it("passes through unsupported lengths without inventing formatting", () => {
    expect(formatPhone("12345")).toBe("12345");
  });
});

describe("maskEmail", () => {
  it("masks the local part while preserving domain", () => {
    expect(maskEmail("abcde@domain.com")).toBe("ab***@domain.com");
    expect(maskEmail("a@domain.com")).toBe("*@domain.com");
  });
});
