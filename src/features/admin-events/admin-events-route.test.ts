import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.events.tsx"),
  "utf8",
);
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin events route", () => {
  it("uses guarded event RPCs and is linked from admin navigation", () => {
    expect(route).toContain("get_admin_events");
    expect(route).toContain("save_admin_event");
    expect(route).toContain("update_admin_event_status");
    expect(adminPermissions).toContain("/admin/events");
  });

  it("renders Phase 3-1 event list and five step creation wizard", () => {
    expect(route).toContain("이벤트 목록");
    expect(route).toContain("이벤트명");
    expect(route).toContain("상태");
    expect(route).toContain("기간");
    expect(route).toContain("대상");
    expect(route).toContain("지급 방식");
    expect(route).toContain("지급 한도");
    expect(route).toContain("지급 현황");
    expect(route).toContain("기본정보");
    expect(route).toContain("대상 설정");
    expect(route).toContain("한도 설정");
    expect(route).toContain("검토");
    expect(route).toContain("예상 지급 조건");
    expect(route).toContain("충돌 정책");
    expect(route).toContain("기간 중복 경고");
    expect(route).toContain("우선순위");
  });
});
