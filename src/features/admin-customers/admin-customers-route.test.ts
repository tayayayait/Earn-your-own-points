import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const customersRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.customers.tsx"),
  "utf8",
);

describe("admin customers route", () => {
  it("uses the paginated customer list RPC instead of fixed 100 row profile loading", () => {
    expect(customersRoute).toContain("get_admin_customers");
    expect(customersRoute).not.toContain("limit(100)");
  });

  it("renders Phase 1-2 filters, sortable columns, and pagination controls", () => {
    expect(customersRoute).toContain("등급");
    expect(customersRoute).toContain("포인트 범위");
    expect(customersRoute).toContain("가입일");
    expect(customersRoute).toContain("보유 포인트");
    expect(customersRoute).toContain("적립 예정");
    expect(customersRoute).toContain("이전");
    expect(customersRoute).toContain("다음");
  });
});
