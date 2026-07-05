# 포인트 적립 솔루션 — Gap 분석 및 구현 계획

상세서.md의 요구사항(1,318줄)과 현재 코드베이스를 비교하여 누락된 부분을 식별하고, 우선순위 순서로 구현 계획을 정리합니다.

---

## 현재 상태 요약

| 영역 | 구현율 | 상태 |
|---|:---:|---|
| DB 스키마 (Supabase) | ~30% | 핵심 3테이블(`profiles`, `user_roles`, `point_transactions`) 생성. 정책/이벤트/연동/브랜드/감사로그 테이블 미생성. Enum도 3개만(`app_role`, `tx_type`, `tx_status`), 상세서 기준보다 단순 |
| 인증/권한 | ~35% | 로그인/가입 동작. `user_roles` 기반 admin/customer 분기. OWNER/MANAGER/OPERATOR/VIEWER 세분화 없음 |
| 관리자 화면 | ~20% | 대시보드(클라이언트 합산 비효율), 고객 목록/상세(기본), 거래 목록/수동지급(기본, `created_by` 미설정) |
| 사용자 화면 | ~25% | 홈(기본), 내역(필터 없음), 혜택(빈 placeholder), 프로필(수정만, 비번변경/탈퇴 없음) |
| 디자인 시스템 | ~20% | shadcn/ui + Tailwind v4 CSS 토큰. 상세서 컴포넌트 규격(크기/간격/모달/테이블 등) 미적용 |
| 비즈니스 로직 | ~5% | 수동 지급 insert만 구현(잔액 검증 없음). 정책 엔진, 만료, 이벤트, 등급 시스템 전무 |

### 추가 발견 사항 (서브에이전트 코드 분석 결과)

| 이슈 | 심각도 | 상세 |
|---|:---:|---|
| `created_by` 미설정 | 🔴 | 수동 지급 시 관리자 ID가 기록되지 않음 (감사 추적 불가) |
| 유틸함수 중복 | 🟡 | `txLabel`, `statusLabel`, `sign`, `signColor` 등이 5개 파일에 반복 정의 |
| 대시보드 비효율 | 🟡 | 최근 1000건을 클라이언트로 가져와 JS 합산 → DB RPC로 전환 필요 |
| 타입 안전성 | 🟡 | `point_transactions` FK 관계 미정의로 join 시 `any` 캐스팅 사용 |
| 에러 핸들링 | 🟡 | 대부분 쿼리에서 `.data`만 사용, 에러 무시 |
| 모바일 Admin 내비 | 🟡 | 사이드바가 `hidden md:flex`로 숨겨지지만 대안 없음 |
| 페이지네이션 없음 | 🟡 | 모든 목록이 `limit(100~200)` 하드코딩 |
| 고객 앱 필터 없음 | 🟢 | 사용자 거래 내역에 기간/유형 필터 미구현 |

### DB 스키마 vs 상세서 Enum 비교

| 영역 | 현재 DB | 상세서 §12 요구 |
|---|---|---|
| 역할 | `app_role`: admin, customer | OWNER, MANAGER, OPERATOR, VIEWER + customer |
| 거래 유형 | `tx_type`: earn, redeem, cancel, expire, adjust (5개) | earn, event_earn, manual_earn, use, manual_deduct, earn_cancel, use_cancel, expire, adjust (9개) |
| 거래 상태 | `tx_status`: pending, completed, cancelled (3개) | pending, confirmed, canceled, failed, expired (5개) |
| 정책 상태 | **없음** | draft, scheduled, active, paused, ended, disabled (6개) |
| 비동기 작업 | **없음** | queued, running, succeeded, failed, retrying (5개) |

---

## User Review Required

> [!IMPORTANT]
> **기술 스택 불일치**: 상세서는 Vue.js + Java Spring Boot를 명시하지만, 실제 프로젝트는 **React + TanStack Start + Supabase(Lovable)** 기반입니다. 본 계획은 **현재 기술 스택(React/Supabase)을 유지**하면서 상세서의 UI/UX 요구사항을 충족하는 방향으로 작성했습니다.

> [!WARNING]
> **백엔드 한계**: Supabase는 서버리스 백엔드입니다. 상세서의 일부 기능(정책 엔진 계산, 배치 만료 처리, 복잡한 이벤트 지급 흐름)은 Supabase Edge Functions 또는 Database Functions로 구현해야 합니다. 복잡도가 높은 비즈니스 로직이 필요한 경우 별도 백엔드 서버 도입을 검토할 수 있습니다.

---

## Open Questions

> [!IMPORTANT]
> 1. **Supabase Edge Functions 사용 가능 여부**: 정책 엔진, 포인트 만료 배치, 이벤트 자동 상태 변경 등을 Supabase Edge Functions로 구현할지, 아니면 DB Functions(PL/pgSQL)만으로 처리할지 결정이 필요합니다.
> 2. **관리자 역할 세분화**: 현재 DB에는 `admin`/`user` 2가지 역할만 있습니다. 상세서의 OWNER/MANAGER/OPERATOR/VIEWER 4단계를 DB 스키마에 추가할지, 아니면 별도 `admin_roles` 테이블을 만들지 결정이 필요합니다.
> 3. **외부 연동(POS/결제) 실제 구현 범위**: API 연동 관리 화면은 만들되, 실제 외부 API 호출 및 Webhook 수신은 이번 범위에 포함할지 결정이 필요합니다.

---

## Phase 0: 디자인 시스템 & 공통 인프라 + DB 스키마 정비 (최우선)

상세서 §5~8의 디자인 토큰, 공통 컴포넌트 규격, 유틸리티를 먼저 구축합니다. 이후 모든 화면 구현의 기반이 됩니다.

---

### 0-1. 디자인 토큰 시스템

#### [MODIFY] [styles.css](file:///c:/Users/dbcdk/Desktop/적립/src/styles.css)

상세서 §6 색상 팔레트와 §5-4 간격 체계를 CSS 변수로 정의합니다.

```css
/* === 상세서 §6-1 색상 토큰 === */
--color-primary-50: #EFF6FF;
--color-primary-600: #2563EB;
--color-primary-700: #1D4ED8;
--color-accent-500: #10B981;
--color-accent-700: #047857;
--color-warning-500: #F59E0B;
--color-danger-600: #DC2626;
--color-info-600: #0891B2;
--color-slate-950: #020617;
--color-slate-900: #0F172A;
--color-slate-700: #334155;
--color-slate-500: #64748B;
--color-slate-300: #CBD5E1;
--color-slate-200: #E2E8F0;
--color-slate-100: #F1F5F9;
--color-slate-50: #F8FAFC;

/* === 상세서 §6-2 의미 색상 규칙 === */
--color-earn-bg: #ECFDF5;
--color-earn-text: #047857;
--color-earn-icon: #10B981;
--color-use-bg: #FEF2F2;
--color-use-text: #B91C1C;
--color-use-icon: #DC2626;
--color-pending-bg: #FFFBEB;
--color-pending-text: #B45309;
--color-pending-icon: #F59E0B;
--color-cancel-bg: #F1F5F9;
--color-cancel-text: #475569;
--color-cancel-icon: #64748B;
--color-error-bg: #FEF2F2;
--color-error-text: #B91C1C;

/* === 상세서 §5-4 간격 체계 === */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;

/* === 상세서 §7-1 폰트 === */
--font-family: Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif;
```

#### [NEW] [src/lib/design-tokens.ts](file:///c:/Users/dbcdk/Desktop/적립/src/lib/design-tokens.ts)

TypeScript에서 사용할 디자인 토큰 상수 정의:
- 타입 스케일 (§7-2): `display-sm`, `heading-lg`, `heading-md`, `heading-sm`, `body-md`, `body-sm`, `caption`
- 컴포넌트 크기 (§8-1 버튼 `sm/md/lg`)
- 모달 크기 (§8-8 `sm/md/lg/xl`)
- 반응형 breakpoint (§5-1: 0/640/1024/1440)

---

### 0-2. 공통 유틸리티

#### [NEW] [src/lib/formatters.ts](file:///c:/Users/dbcdk/Desktop/적립/src/lib/formatters.ts)

상세서 §13에 정의된 포맷 규칙을 함수로 구현합니다.

```ts
// §13-1 포인트 형식
formatPoint(value: number | null, type?: 'earn' | 'use' | 'default'): string
// 예: formatPoint(12300, 'earn') → "+12,300P"
// 예: formatPoint(12300, 'use') → "-12,300P"
// 예: formatPoint(null) → "-"
// 포인트 명칭은 설정에서 동적으로 변경 가능

// §13-2 날짜 형식
formatDate(date: Date | string, variant: 'admin' | 'user' | 'short' | 'period'): string
// 예: formatDate(date, 'admin') → "2026-07-03 14:00"
// 예: formatDate(date, 'user') → "2026.07.03 14:00"

// §13-3 전화번호
formatPhone(phone: string, masked?: boolean): string
// 예: formatPhone("01012345678") → "010-1234-5678"
// 예: formatPhone("01012345678", true) → "010-****-5678"

// §13-3 이메일 마스킹
maskEmail(email: string): string
// 예: maskEmail("abcde@domain.com") → "ab***@domain.com"
```

#### [NEW] [src/lib/enums.ts](file:///c:/Users/dbcdk/Desktop/적립/src/lib/enums.ts)

상세서 §12에 정의된 상태값을 enum 매핑으로 구현합니다. **현재 DB의 `tx_type` 5종과 상세서의 9종 간 차이를 해소합니다.** DB 마이그레이션(Phase 0-5)에서 enum을 확장한 뒤, 이 매핑과 일치시킵니다.

```ts
// §12-1 고객 상태 (현재 DB에는 user_status 없음 → 마이그레이션 필요)
export const customerStatusMap = {
  active: { label: "활성", tone: "success" },
  dormant: { label: "휴면", tone: "warning" },
  withdrawn: { label: "탈퇴", tone: "neutral" },
  blocked: { label: "차단", tone: "danger" },
} as const;

// §12-2 포인트 거래 유형 (현재 DB tx_type: 5종 → 9종 확장 필요)
export const transactionTypeMap = {
  earn: { label: "구매 적립", sign: "+" },
  event_earn: { label: "이벤트 지급", sign: "+" },
  manual_earn: { label: "관리자 지급", sign: "+" },
  use: { label: "포인트 사용", sign: "-" },      // DB: redeem → use 변경
  manual_deduct: { label: "관리자 차감", sign: "-" },
  earn_cancel: { label: "적립 취소", sign: "-" },   // DB: cancel → 분리
  use_cancel: { label: "사용 취소", sign: "+" },
  expire: { label: "유효기간 만료", sign: "-" },
  adjust: { label: "정정", sign: "±" },
} as const;

// §12-3 포인트 거래 상태 (현재 DB tx_status: 3종 → 5종 확장 필요)
export const transactionStatusMap = {
  pending: { label: "예정", tone: "warning" },
  confirmed: { label: "확정", tone: "success" },    // DB: completed → confirmed
  canceled: { label: "취소", tone: "neutral" },      // DB: cancelled → canceled (오타 통일)
  failed: { label: "실패", tone: "danger" },
  expired: { label: "만료", tone: "neutral" },
} as const;

// §12-4 정책 상태 (DB에 없음 → 신규 생성)
export const policyStatusMap = {
  draft: { label: "초안", tone: "neutral" },
  scheduled: { label: "예약", tone: "info" },
  active: { label: "활성", tone: "success" },
  paused: { label: "일시중지", tone: "warning" },
  ended: { label: "종료", tone: "neutral" },
  disabled: { label: "비활성", tone: "danger" },
} as const;
```

**이 매핑은 현재 5개 파일에 중복 정의된 `txLabel`, `statusLabel`, `sign`, `signColor` 함수를 대체**하여 단일 소스로 통합합니다.

#### [NEW] [src/lib/api-error-handler.ts](file:///c:/Users/dbcdk/Desktop/적립/src/lib/api-error-handler.ts)

상세서 §14에 정의된 API 에러 응답 처리:
- 에러 코드별 사용자/관리자 메시지 매핑
- traceId 추출 및 표시
- 토스트 연동 (§8-9 규격: 성공 3000ms, 오류 6000ms, 정보 4000ms)

---

### 0-3. 공통 컴포넌트 강화

#### [NEW] [src/components/common/StatusBadge.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/StatusBadge.tsx)

상세서 §8-10 배지 규격:
- 높이 24px, 좌우 패딩 8px, 폰트 12px
- `tone` prop으로 색상 자동 결정 (§6-2 의미 색상)
- enum 매핑과 연동하여 라벨 자동 표시

```tsx
interface StatusBadgeProps {
  status: string;
  type: 'customer' | 'transaction' | 'transactionType' | 'policy';
}
```

#### [NEW] [src/components/common/AppButton.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/AppButton.tsx)

기존 shadcn Button을 확장하여 상세서 §8-1 규격 적용:
- 크기: `sm`(32px), `md`(40px), `lg`(48px)
- Variant: `primary`, `secondary`, `ghost`, `danger`, `success`
- 상태: hover, focus(2px ring), disabled(opacity 0.45), loading(16px spinner)
- 로딩 시 버튼 폭 고정

#### [NEW] [src/components/common/AppInput.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/AppInput.tsx)

상세서 §8-3 입력창 규격:
- 높이 40px, 패딩 12px, 라운드 6px
- Focus: 보더 primary-600, ring primary-50 3px
- Error 상태: 보더 danger-600, 하단 오류 메시지 12px
- 라벨과 입력창 간격 6px

#### [NEW] [src/components/common/AppModal.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/AppModal.tsx)

상세서 §8-8 모달 규격:
- 크기: `sm`(400px), `md`(560px), `lg`(720px), `xl`(960px)
- 상단 제목 + 닫기 버튼
- 본문 최대 높이 `calc(100vh - 180px)`, 내부 스크롤
- 하단 액션 오른쪽 정렬, 취소→확인 순서
- 위험 액션: 확인 문구 입력 (예: "차단" 입력 후 버튼 활성화)
- 640px 미만: 전체 화면 모달

#### [NEW] [src/components/common/AppTable.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/AppTable.tsx)

상세서 §8-6 테이블 규격:
- 헤더 40px, 행 44px, 셀 패딩 12px
- 헤더: slate-50 배경, 12px/600/slate-500 텍스트
- 본문: 13~14px
- 정렬 규칙: 텍스트→좌측, 숫자/금액→우측
- Sticky Header (20행 이상)
- 모바일 카드 리스트 변환 (§16-1 관리자 모바일)

#### [NEW] [src/components/common/FilterBar.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/FilterBar.tsx)

상세서 §8-7 필터 바:
- 검색창 280~420px
- 기간 선택: 7일/30일/이번 달/직접 선택
- 다중 선택 상태 필터
- 초기화 버튼 (필터 적용 시에만 활성)
- 모바일: 필터 버튼 → 하단 시트

#### [NEW] [src/components/common/PointDisplay.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/components/common/PointDisplay.tsx)

포인트 숫자 표시 전용 컴포넌트:
- `font-variant-numeric: tabular-nums` 적용
- 오른쪽 정렬 옵션
- 적립(+녹색)/사용(-빨간색) 자동 색상
- 포인트 명칭 동적 반영

#### [MODIFY] [src/components/common/Toast 설정](file:///c:/Users/dbcdk/Desktop/적립/src/routes/__root.tsx)

Sonner 토스트 설정을 상세서 §8-9 기준으로 변경:
- 위치: 데스크톱 우상단, 모바일 하단 16px 위
- 성공: 3000ms, 오류: 6000ms(또는 수동 닫기), 정보: 4000ms

---

### 0-4. 레이아웃 리팩토링

#### [MODIFY] [admin.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.tsx)

관리자 레이아웃을 상세서 §5-2 규격으로 재구성:
- 사이드바: 기본 240px, 접힘 72px, 배경 #0F172A, 텍스트 #CBD5E1
- 상단 헤더: 높이 56px, 흰색 배경, 하단 보더 #E2E8F0
- 본문: 최소 높이 calc(100vh - 56px), 배경 #F8FAFC, 패딩 24px
- 반응형 (§16-1): 768-1023px 접힘, 640-767px 드로어, 0-639px 테이블→카드

#### [MODIFY] [app.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/app.tsx)

사용자 레이아웃을 상세서 §5-3 규격으로 재구성:
- 모바일: 상단 56px, 하단 내비게이션 64px, 패딩 16px
- 데스크톱: 상단 64px(로고/탭/프로필), 본문 최대 960px 중앙
- 반응형 (§16-2): 1024px+ 3열 카드, 640-1023px 2열, 0-639px 1열

---

## Phase 1: 관리자 핵심 화면 완성

기존 구현된 화면을 상세서 기준으로 완성하고, 핵심 누락 화면을 추가합니다.

---

### 1-1. 대시보드 실데이터 연동

#### [MODIFY] [admin.dashboard.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.dashboard.tsx)

현재 하드코딩된 mock 데이터를 Supabase 쿼리로 교체합니다.

**KPI 카드 (§9-2):**
- 누적 적립 포인트: `SUM(points) WHERE type IN (earn, event_earn, manual_earn) AND status = 'confirmed'`
- 누적 사용 포인트: `SUM(points) WHERE type IN (use, manual_deduct) AND status = 'confirmed'`
- 잔여 포인트 총액: `SUM(balance_after) from latest transaction per profile WHERE status = 'active'`
- 만료 예정 포인트: `SUM(points) WHERE expires_at BETWEEN now() AND now()+30days AND status = 'confirmed'`
- 각 카드에 전월 대비 증감률 표시

**차트 (§9-2):**
- 기간별 추이 Line Chart (Recharts): 일자별 적립/사용/만료
- 거래 유형 Donut Chart
- 기간 옵션: 7일, 30일, 90일, 이번 달, 직접 선택
- 색상: 적립=녹색, 사용=빨간색, 만료=회색, 예정=주황색

**최근 거래 & 고객 랭킹:**
- 최근 거래 10건 테이블
- 고객 보유 포인트 랭킹 TOP 10

**빈 상태:**
- `선택한 기간에 포인트 거래가 없습니다.` + 기간 초기화 버튼

---

### 1-2. 고객 목록 완성

#### [MODIFY] [admin.customers.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.customers.tsx)

**추가 필터 (§9-3):**
- 등급 다중 선택
- 포인트 범위 (최소/최대 숫자)
- 가입일 날짜 범위

**테이블 컬럼 완성:**
- 고객 ID (CUS-000001 형식), 이름+연락처, 등급 배지, 상태 배지, 보유 포인트(우측 정렬), 적립 예정(우측 정렬), 최근 거래일, 액션

**행 액션:**
- 상세 → 고객 상세 이동
- 지급 → 수동 지급 모달 (탈퇴/차단 고객 비활성)
- 차단 → 확인 모달 (활성/휴면만 가능)

**페이지네이션:**
- URL query 동기화
- 페이지당 20건, 전체 건수 표시

**정렬:**
- 이름, 보유 포인트, 가입일 정렬 가능

---

### 1-3. 고객 상세 완성

#### [MODIFY] [admin.customers.$id.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.customers.$id.tsx)

**포인트 요약 (§9-4):**
- 사용 가능, 적립 예정, 만료 예정(30일), 누적 적립, 누적 사용

**주요 액션:**
- 정보 수정 → 이름/연락처/이메일 편집 모달
- 포인트 지급 → 수동 지급 모달
- 포인트 차감 → 수동 차감 모달
- 상태 변경 → 확인 모달 (§9-4 수정 규칙 적용)

**탭:**
- 기본정보: 이름, 연락처, 이메일, 생년월일, 마케팅 수신
- 포인트 내역: 필터 + 테이블 (해당 고객만)
- 관리자 메모: 새 메모 추가 (삭제 불가, 누적)

**수정 규칙 (§9-4):**
- 탈퇴 고객 → 개인정보 수정 숨김
- 차단 고객 → 지급/사용 비활성
- 포인트 조정 사유 필수 10자 이상

---

### 1-4. 거래 내역 완성

#### [MODIFY] [admin.transactions.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.transactions.tsx)

**필터 강화 (§9-5):**
- 거래 ID 정확 검색
- 고객 Async Combobox (300ms debounce)
- 외부 거래 ID 검색

**테이블 컬럼 완성 (§9-5):**
- 거래 ID (PTX-20260703-000001 형식), 고객(이름+ID), 유형 배지, 상태 배지, 포인트(부호+색상), 잔액, 사유, 외부 거래 ID, 생성일, 액션

**거래 상세 패널 (§9-5):**
- 사이드 패널 또는 모달로 거래 상세 표시
- 기본 거래 정보, 고객 정보, 정책 적용 정보, 처리 로그
- 취소/재처리 가능 여부 표시

**취소/재처리 (§11-3):**
- 취소 가능 조건 검증 (§11-3 표 참조)
- 취소 시 새 거래 생성 (원 거래와 연결)
- 재처리 버튼 (FAILED 상태만)

---

### 1-5. 수동 지급/차감 강화

#### [MODIFY] [admin.transactions.manual.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.transactions.manual.tsx)

**누락 기능 구현 (§9-6):**
- 만료일 필드: 지급 시 기본 정책 만료일 자동 계산
- 내부 메모 textarea (500자)
- 차감 시 잔액 검증: `보유 포인트보다 많이 차감할 수 없습니다.`
- 확인 모달: 고객명, 처리 유형, 포인트, 처리 후 예상 잔액, 사유 표시
- idempotency key 생성: 중복 제출 방지
- balance_after 자동 계산 후 저장

---

## Phase 2: 정책 관리 시스템

상세서 §9-7, 9-8, 9-9의 정책 관리 화면 전체를 새로 구현합니다.

---

### 2-1. 기본 정책 관리

#### [NEW] [admin.policies.base.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.policies.base.tsx)

상세서 §9-7 전체 구현:

**3개 섹션 폼:**
- 적립 기준: 기본 적립률 (0~100%, 소수점 2자리), 적립 단위 (1P/10P/100P), 반올림 방식
- 사용 조건: 최소 사용 포인트, 최대 사용 비율, 사용 단위
- 만료/확정 조건: 유효기간 N개월, 적립 예정 기간 N일, 적립 제외 결제수단

**저장 규칙:**
- 변경 diff 표시 (변경 전/후 비교)
- 즉시 적용 vs 예약 적용 선택
- 예약 시 시작일 검증 (현재 이후)
- 활성 정책 삭제 불가 (비활성만)
- 감사 로그 자동 기록

---

### 2-2. 등급 정책 관리

#### [NEW] [admin.policies.tiers.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.policies.tiers.tsx)

상세서 §9-8 전체 구현:

**등급 목록 테이블:**
- 등급명, 승급 기준, 기본 적립률, 추가 적립률, 최소 유지 조건, 상태

**등급 편집:**
- 등급 순서 드래그 변경
- 중복 등급명 방지
- 승급 기준 기간 1~24개월
- 등급 삭제 시 고객 처리 방식 선택 (하위/기본 등급 이동)

---

### 2-3. 상품/카테고리 정책 관리

#### [NEW] [admin.policies.products.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.policies.products.tsx)

상세서 §9-9 전체 구현:

**정책 CRUD:**
- 정책명 (2~50자), 대상 유형 (상품/카테고리), 대상 선택 (Async Combobox, 다중)
- 적립률 (0~100%), 적용 기간 (종료일 없음 허용), 우선순위 (1~999)
- 제외 여부 토글 (적립률 비활성)

**우선순위 체계 (§9-9):**
- 상품 > 카테고리 > 이벤트 > 등급 > 기본 순서
- 동일 우선순위 충돌 시 저장 차단

---

## Phase 3: 이벤트 관리

### 3-1. 이벤트 목록 및 생성

#### [NEW] [admin.events.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.events.tsx)

상세서 §9-10 전체 구현:

**이벤트 목록:**
- 이벤트명, 상태(예정/진행/일시중지/종료), 기간, 대상, 지급 방식, 지급 한도, 지급 현황

**이벤트 생성 5단계 위자드 (§9-10):**
1. 기본정보: 이벤트명, 설명, 기간
2. 대상 설정: 등급/세그먼트/상품/카테고리
3. 지급 방식: 추가 적립률 또는 고정 포인트
4. 한도 설정: 고객당 최대/전체 예산
5. 검토: 예상 지급 조건, 충돌 정책 표시

**충돌 처리 (§9-10):**
- 기간 중복 경고 + 우선순위 설정
- 고객당 한도 0 저장 불가
- 종료일 < 시작일 저장 불가

---

## Phase 4: 통계/리포트 & 연동 관리

### 4-1. 통계 및 리포트

#### [NEW] [admin.reports.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.reports.tsx)

상세서 §9-11 전체 구현:

**필수 차트 5개:**
1. 기간별 적립/사용 Line Chart (일자별)
2. 거래 유형 비율 Donut Chart
3. 등급별 잔액 Bar Chart
4. 고객 랭킹 Table (보유/사용/적립 포인트)
5. 이벤트 성과 Table + Progress Bar

**CSV 다운로드 (§9-11):**
- 필터 적용 결과만 다운로드
- 10,000건 초과 시 비동기 작업
- 다운로드 감사 로그 기록

**차트 접근성 (§15):**
- 차트 아래 데이터 테이블 제공
- 키보드 tooltip 접근
- 색상만으로 구분하지 않음

---

### 4-2. API 연동 관리

#### [NEW] [admin.integrations.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.integrations.tsx)

상세서 §9-12 전체 구현:

**4개 섹션:**
1. API Key 관리: 생성(1회만 전체 표시), 목록(마스킹), 재발급, 비활성화
2. Webhook 설정: URL, 이벤트 유형, 서명 검증 키, 테스트 전송
3. 연동 상태: 성공률, 최근 실패, 평균 응답시간
4. 실패 로그: 요청 ID, 오류 코드, 재시도

#### [NEW] DB 마이그레이션: `api_keys` 및 `webhooks` 테이블

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- 앞 6자
  key_suffix TEXT NOT NULL, -- 뒤 4자
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  event_types TEXT[] NOT NULL,
  signing_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id),
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INT,
  response_time_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 5: 설정 화면

### 5-1. 브랜드 설정

#### [NEW] [admin.settings.brand.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.settings.brand.tsx)

상세서 §9-13 전체 구현:
- 서비스명 (2~30자), 포인트 명칭 (1~12자)
- 로고 업로드 (SVG/PNG/WebP, 최대 2MB)
- 대표 색상/보조 색상 (HEX 입력 + WCAG 대비 검사)
- 사용자 홈 안내문 (100자)
- 미리보기: 사이드바, 포인트 카드, 버튼/배지 대비

#### [NEW] DB 마이그레이션: `brand_settings` 테이블

```sql
CREATE TABLE brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL DEFAULT '포인트 솔루션',
  point_label TEXT NOT NULL DEFAULT 'P',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2563EB',
  secondary_color TEXT,
  home_message TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 5-2. 관리자 계정 및 권한

#### [NEW] [admin.settings.admins.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.settings.admins.tsx)

상세서 §9-14 전체 구현:
- 관리자 목록: 이름, 이메일, 역할, 상태
- 역할 변경: OWNER/MANAGER/OPERATOR/VIEWER
- 관리자 초대 (24시간 만료)
- OWNER 최소 1명 유지 규칙
- 권한 변경 즉시 적용 + 감사 로그

#### [MODIFY] DB 마이그레이션: `profiles` 테이블에 `admin_role` 컬럼 추가

```sql
-- user_role을 세분화
CREATE TYPE admin_role AS ENUM ('owner', 'manager', 'operator', 'viewer');
ALTER TABLE profiles ADD COLUMN admin_role admin_role;
```

---

### 5-3. 감사 로그

#### [NEW] [admin.settings.audit-logs.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/admin.settings.audit-logs.tsx)

상세서 §9-15 전체 구현:
- 필터: 관리자, 액션, 대상, 기간
- 테이블: 로그 ID, 관리자(이름/이메일/역할), 액션, 대상, 변경 전/후(JSON diff), 사유, IP, User Agent, 생성일
- 삭제 기능 없음 (읽기 전용)
- JSON diff 뷰어 컴포넌트

---

## Phase 6: 사용자 화면 완성

### 6-1. 사용자 홈 강화

#### [MODIFY] [app.home.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/app.home.tsx)

**상단 포인트 카드 (§10-2):**
- 카드 배경: primary-600 (브랜드 색상 교체 가능)
- 모바일 180px, 데스크톱 220px
- 32px 흰색 tabular nums 숫자
- 보조 값: 적립 예정, 30일 내 만료 예정

**본문 카드 (§10-2):**
- 적립 예정 카드: 확정 예정일, 포인트, 주문명
- 만료 예정 카드: 만료일, 포인트
- 최근 내역 5건
- 이벤트 혜택 2건

**CTA:**
- 내역 전체보기, 사용 조건 확인

---

### 6-2. 사용자 내역 강화

#### [MODIFY] [app.transactions.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/app.transactions.tsx)

**필터 (§10-3):**
- 기간: 1개월/3개월/6개월/직접 선택
- 유형: 전체/적립/사용/만료/취소
- 상태: 전체/예정/확정/취소

**목록 아이템 (§10-3):**
- 제목, 날짜(YYYY.MM.DD HH:mm), 포인트(+/-), 상태 배지, 잔액

**반응형:**
- 모바일: 타임라인 형태
- 데스크톱: 테이블

---

### 6-3. 사용자 혜택

#### [MODIFY] [app.benefits.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/app.benefits.tsx)

현재 빈 페이지를 상세서 §10-4 기준으로 전체 구현:

**4개 섹션:**
1. 내 등급: 현재 등급, 다음 등급까지 조건
2. 등급 혜택: 등급별 적립률, 추가 혜택
3. 이벤트: 진행 중 이벤트 목록
4. 사용 조건: 최소 사용 포인트, 최대 사용 비율

**Progress Bar:**
- 다음 등급까지 필요 금액/횟수
- 100% 초과 시 고정 + `승급 심사 예정` 문구

---

### 6-4. 사용자 프로필 완성

#### [MODIFY] [app.profile.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/_authenticated/app.profile.tsx)

**누락 기능 구현 (§10-5):**
- 기본정보 수정: 이름, 휴대폰, 이메일
- 알림 설정: 포인트 적립 알림, 만료 예정 알림, 마케팅 수신
- 비밀번호 변경: 현재/새 비밀번호 폼
- 탈퇴 요청: 잔여 포인트 경고 + "탈퇴" 입력 확인 모달

---

### 6-5. 사용자 인증 분리

#### [MODIFY] [auth.tsx](file:///c:/Users/dbcdk/Desktop/적립/src/routes/auth.tsx)

현재 통합 페이지를 상세서 §10-1 기준으로 강화:

**회원가입 필드 추가:**
- 휴대폰 (숫자 입력 → 자동 하이픈)
- 약관 동의 (필수 약관 체크박스)
- 마케팅 수신 (선택)

**관리자 로그인 분리:**
- `/admin/login` 경로 추가 (§9-1)
- 로그인 유지 체크박스
- 비밀번호 재설정 링크
- 5회 실패 시 10분 잠금

---

## Phase 7: 예외 처리 & 접근성 & 보안

### 7-1. 로딩/빈 상태/오류 처리 (§17)

모든 화면에 대해:
- **로딩**: Skeleton 표시 (§17-1)
- **빈 상태**: 화면별 전용 문구 + 액션 (§17-2)
- **오류**: 네트워크/서버/권한/세션 만료 처리 (§17-3)
- **동시성 충돌**: version 기반 낙관적 잠금 (§17-4)
- **포인트 입력 검증**: 음수/소수점/최대값/잔액 (§17-5)

### 7-2. 접근성 (§15)

- 키보드 접근: 모든 인터랙티브 요소 Tab 접근
- Focus ring: 2px 이상
- aria-label: 아이콘 버튼, 차트, 배지
- 모달: focus trap + focus 복귀
- 오류 메시지: aria-describedby 연결
- 터치 영역: 최소 44x44px

### 7-3. 보안/감사 UI (§18)

- 거래 삭제 불가 (UI에서 제거)
- 취소/정정은 새 거래 생성
- 수동 지급/차감 사유 필수
- 위험 액션 확인 모달
- API Key 1회 표시
- 감사 로그 읽기 전용
- 개인정보 마스킹 (권한별)
- CSV 다운로드 감사 로그 기록

---

## Verification Plan

### Automated Tests
```bash
# 린트 검사
bun run lint

# TypeScript 타입 체크
bunx tsc --noEmit

# 빌드 검증
bun run build
```

### Manual Verification
- 각 Phase 완료 후 로컬 `bun run dev`로 시각적 검증
- 상세서 §20 화면별 완료 기준 체크리스트 검증
- 상세서 §21 QA 체크리스트 (디자인/기능/접근성) 검증
- 반응형 검증: 360px, 640px, 1024px, 1440px

---

## 작업 우선순위 요약

| 순서 | Phase | 작업 | 예상 규모 |
|:---:|:---:|---|---|
| 1 | Phase 0 | 디자인 토큰, 공통 유틸, 공통 컴포넌트, 레이아웃 | 대 |
| 2 | Phase 1 | 대시보드, 고객 목록/상세, 거래 내역/수동지급 완성 | 대 |
| 3 | Phase 2 | 기본/등급/상품 정책 관리 (전체 신규) | 대 |
| 4 | Phase 3 | 이벤트 관리 (전체 신규) | 중 |
| 5 | Phase 4 | 통계/리포트, API 연동 관리 (전체 신규) | 대 |
| 6 | Phase 5 | 브랜드 설정, 관리자 권한, 감사 로그 (전체 신규) | 중 |
| 7 | Phase 6 | 사용자 홈/내역/혜택/프로필 완성, 인증 강화 | 중 |
| 8 | Phase 7 | 예외 처리, 접근성, 보안/감사 전체 적용 | 중 |
