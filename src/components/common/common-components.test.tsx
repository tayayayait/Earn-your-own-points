import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";
import { AppModalFrame } from "./AppModal";
import { EmptyState, ErrorState, LoadingState } from "./AppState";
import { AppTable } from "./AppTable";
import { FilterBar } from "./FilterBar";
import { PointDisplay } from "./PointDisplay";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders mapped labels and semantic tone classes", () => {
    const html = renderToStaticMarkup(<StatusBadge type="transaction" status="confirmed" />);

    expect(html).toContain("확정");
    expect(html).toContain("bg-[var(--color-earn-bg)]");
  });
});

describe("AppButton", () => {
  it("renders loading state without losing button text for assistive technology", () => {
    const html = renderToStaticMarkup(
      <AppButton loading loadingLabel="처리 중">
        저장
      </AppButton>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("처리 중");
    expect(html).toContain("min-h-11");
  });

  it("keeps small icon buttons at a 44px touch target", () => {
    const html = renderToStaticMarkup(
      <AppButton size="sm" aria-label="거래 취소">
        X
      </AppButton>,
    );

    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
  });
});

describe("AppInput", () => {
  it("connects label and error message to the input", () => {
    const html = renderToStaticMarkup(
      <AppInput id="phone" label="휴대폰" error="휴대폰 번호를 입력하세요." />,
    );

    expect(html).toContain('for="phone"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="phone-error"');
    expect(html).toContain("휴대폰 번호를 입력하세요.");
  });
});

describe("AppModalFrame", () => {
  it("renders title, body, and action region with the selected width", () => {
    const html = renderToStaticMarkup(
      <AppModalFrame title="차단 확인" size="lg" footer={<button type="button">확인</button>}>
        <p>고객을 차단합니다.</p>
      </AppModalFrame>,
    );

    expect(html).toContain("차단 확인");
    expect(html).toContain("고객을 차단합니다.");
    expect(html).toContain("max-w-[720px]");
    expect(html).toContain("overscroll-contain");
  });
});

describe("AppTable", () => {
  it("renders desktop table cells and mobile card labels from one column definition", () => {
    const html = renderToStaticMarkup(
      <AppTable
        columns={[
          { key: "name", header: "고객", render: (row) => row.name },
          { key: "points", header: "포인트", align: "right", render: (row) => row.points },
        ]}
        data={[{ id: "1", name: "홍길동", points: "1,000P" }]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(html).toContain("<th");
    expect(html).toContain("홍길동");
    expect(html).toContain("포인트");
    expect(html).toContain("md:hidden");
  });
});

describe("FilterBar", () => {
  it("renders search, period, status filters, and reset state", () => {
    const html = renderToStaticMarkup(
      <FilterBar
        searchValue="kim"
        onSearchChange={() => undefined}
        periodValue="30d"
        onPeriodChange={() => undefined}
        statusOptions={[
          { label: "확정", value: "confirmed" },
          { label: "예정", value: "pending" },
        ]}
        selectedStatuses={["confirmed"]}
        onStatusToggle={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(html).toContain("kim");
    expect(html).toContain("30");
    expect(html).toContain("확정");
    expect(html).not.toContain('disabled=""');
  });
});

describe("PointDisplay", () => {
  it("renders signed tabular point text", () => {
    const html = renderToStaticMarkup(<PointDisplay value={1200} type="use" align="right" />);

    expect(html).toContain("-1,200P");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("text-right");
  });
});

describe("AppState", () => {
  it("renders loading, empty, and error states with live regions and actions", () => {
    const loading = renderToStaticMarkup(<LoadingState title="고객 목록 로딩 중" />);
    const empty = renderToStaticMarkup(
      <EmptyState
        title="내역이 없습니다."
        description="필터를 변경하거나 수동 지급을 생성하세요."
        action={<button type="button">수동 지급</button>}
      />,
    );
    const error = renderToStaticMarkup(
      <ErrorState
        title="서버 오류"
        description="잠시 후 다시 시도하세요."
        onRetry={() => undefined}
      />,
    );

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(empty).toContain("내역이 없습니다.");
    expect(empty).toContain("수동 지급");
    expect(error).toContain('role="alert"');
    expect(error).toContain("다시 시도");
  });
});
