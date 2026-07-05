import { formatDate, formatPhone, formatPoint } from "@/lib/formatters";

export type AppTransactionPeriod = "1m" | "3m" | "6m" | "custom";
export type AppTransactionTypeFilter = "all" | "earn" | "use" | "expire" | "cancel";
export type AppTransactionStatusFilter = "all" | "pending" | "confirmed" | "cancelled";

export type AppTransactionSearch = {
  period: AppTransactionPeriod;
  type: AppTransactionTypeFilter;
  status: AppTransactionStatusFilter;
  dateFrom: string;
  dateTo: string;
};

export type AppTransactionRpcFilters = {
  _date_from: string | null;
  _date_to: string | null;
  _type: AppTransactionTypeFilter | null;
  _status: AppTransactionStatusFilter | null;
};

export type AppProfileForm = {
  fullName: string;
  phone: string;
  email: string;
  pointEarnNotify: boolean;
  pointExpiryNotify: boolean;
  marketingOptIn: boolean;
};

export type AppPasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type SignupForm = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  termsAccepted: boolean;
  marketingOptIn: boolean;
};

export type ProfileUpdateRpcArgs = {
  _full_name: string;
  _phone: string;
  _email: string;
  _point_earn_notify: boolean;
  _point_expiry_notify: boolean;
  _marketing_opt_in: boolean;
};

export type AdminLoginAttemptState = {
  failures: number;
  lockedUntil: number | null;
  updatedAt: number;
};

type RawAppHomeResponse = {
  profile?: {
    full_name?: unknown;
    email?: unknown;
    tier_name?: unknown;
  };
  brand?: {
    point_label?: unknown;
    home_message?: unknown;
    primary_color?: unknown;
  };
  balance?: {
    available?: unknown;
    pending?: unknown;
    total?: unknown;
    expiring_soon?: unknown;
  };
  pending_earnings?: RawPendingEarning[];
  expiring_points?: RawExpiringPoint[];
  recent_transactions?: RawAppTransaction[];
  events?: RawAppEvent[];
} | null;

type RawPendingEarning = {
  id?: unknown;
  title?: unknown;
  amount?: unknown;
  confirm_at?: unknown;
};

type RawExpiringPoint = {
  id?: unknown;
  amount?: unknown;
  expires_at?: unknown;
};

type RawAppTransaction = {
  id?: unknown;
  type?: unknown;
  status?: unknown;
  title?: unknown;
  memo?: unknown;
  amount?: unknown;
  balance_after?: unknown;
  created_at?: unknown;
};

type RawAppEvent = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  reward_type?: unknown;
  reward_value?: unknown;
  ends_at?: unknown;
};

type RawAppTransactionsResponse = {
  transactions?: RawAppTransaction[];
} | null;

type RawAppBenefitsResponse = {
  current_tier?: RawTier | null;
  next_tier?: RawNextTier | null;
  progress?: RawTierProgress | null;
  tiers?: RawTierBenefit[];
  events?: RawAppEvent[];
  redeem_policy?: RawRedeemPolicy | null;
} | null;

type RawAppProfileResponse = {
  profile?: {
    id?: unknown;
    full_name?: unknown;
    email?: unknown;
    phone?: unknown;
    marketing_opt_in?: unknown;
    point_earn_notify?: unknown;
    point_expiry_notify?: unknown;
    status?: unknown;
    withdrawal_requested_at?: unknown;
  };
  balance?: {
    available?: unknown;
    pending?: unknown;
    total?: unknown;
  };
} | null;

type RawTier = {
  id?: unknown;
  name?: unknown;
  base_earn_rate?: unknown;
  bonus_earn_rate?: unknown;
};

type RawNextTier = {
  id?: unknown;
  name?: unknown;
  min_spend?: unknown;
  min_purchase_count?: unknown;
};

type RawTierProgress = {
  current_spend?: unknown;
  current_purchase_count?: unknown;
  required_spend?: unknown;
  required_purchase_count?: unknown;
  progress_rate?: unknown;
};

type RawTierBenefit = RawTier & {
  min_spend?: unknown;
  min_purchase_count?: unknown;
};

type RawRedeemPolicy = {
  min_redeem_points?: unknown;
  max_redeem_ratio?: unknown;
};

export type AppHomeData = {
  profile: {
    name: string;
    email: string;
    tierName: string;
  };
  brand: {
    pointLabel: string;
    homeMessage: string;
    primaryColor: string;
  };
  balance: {
    available: number;
    pending: number;
    total: number;
    expiringSoon: number;
    availableLabel: string;
    pendingLabel: string;
    expiringSoonLabel: string;
  };
  pendingEarnings: Array<{
    id: string;
    title: string;
    amount: number;
    pointLabel: string;
    confirmAt: string | null;
    confirmAtLabel: string;
  }>;
  expiringPoints: Array<{
    id: string;
    amount: number;
    pointLabel: string;
    expiresAt: string | null;
    expiresAtLabel: string;
  }>;
  recentTransactions: AppTransaction[];
  events: AppEvent[];
};

export type AppTransaction = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  title: string;
  amount: number;
  amountLabel: string;
  balanceAfter: number | null;
  balanceAfterLabel: string;
  createdAt: string;
  createdAtLabel: string;
};

export type AppBenefitsData = {
  currentTier: {
    id: string;
    name: string;
    baseEarnRate: number;
    bonusEarnRate: number;
  };
  nextTier: {
    id: string;
    name: string;
    minSpend: number;
    minPurchaseCount: number;
  } | null;
  nextTierProgress: {
    currentSpend: number;
    currentPurchaseCount: number;
    requiredSpend: number;
    requiredPurchaseCount: number;
    rate: number;
    reviewReady: boolean;
    message: string;
  };
  tiers: Array<{
    id: string;
    name: string;
    baseEarnRate: number;
    bonusEarnRate: number;
    minSpendLabel: string;
    minPurchaseCountLabel: string;
  }>;
  events: AppEvent[];
  redeemPolicy: {
    minRedeemPoints: number;
    maxRedeemRatio: number;
    minRedeemPointsLabel: string;
    maxRedeemRatioLabel: string;
  };
};

export type AppEvent = {
  id: string;
  name: string;
  description: string;
  rewardLabel: string;
  endsAt: string | null;
  endsAtLabel: string;
};

export type AppProfileData = {
  form: AppProfileForm;
  status: string;
  withdrawalRequestedAt: string | null;
  balance: {
    available: number;
    pending: number;
    total: number;
    availableLabel: string;
  };
};

const earnTypes = new Set(["earn", "event_earn", "manual_earn", "adjust", "use_cancel"]);
const useTypes = new Set(["redeem", "use", "manual_deduct", "expire", "cancel", "earn_cancel"]);
const transactionTypeLabels: Record<string, string> = {
  earn: "구매 적립",
  event_earn: "이벤트 지급",
  manual_earn: "관리자 지급",
  redeem: "포인트 사용",
  use: "포인트 사용",
  manual_deduct: "관리자 차감",
  cancel: "취소",
  earn_cancel: "적립 취소",
  use_cancel: "사용 취소",
  expire: "유효기간 만료",
  adjust: "정정",
};
const transactionStatusLabels: Record<string, string> = {
  pending: "예정",
  completed: "확정",
  confirmed: "확정",
  cancelled: "취소",
  canceled: "취소",
  failed: "실패",
  expired: "만료",
};

export const defaultTransactionSearch: AppTransactionSearch = {
  period: "3m",
  type: "all",
  status: "all",
  dateFrom: "",
  dateTo: "",
};

const publicEventRows: RawAppEvent[] = [
  {
    id: "public-event-1",
    name: "주말 추가 적립",
    description: "주말 결제 금액에 추가 적립률이 적용됩니다.",
    reward_type: "rate",
    reward_value: 3,
    ends_at: "2026-07-31T14:59:59.000Z",
  },
  {
    id: "public-event-2",
    name: "신규 방문 혜택",
    description: "첫 이용 고객에게 고정 포인트를 지급합니다.",
    reward_type: "fixed",
    reward_value: 1000,
    ends_at: null,
  },
];

const publicTransactionRows: RawAppTransaction[] = [
  {
    id: "public-transaction-1",
    type: "earn",
    status: "confirmed",
    title: "매장 구매 적립",
    amount: 3200,
    balance_after: 12800,
    created_at: "2026-07-03T05:20:00.000Z",
  },
  {
    id: "public-transaction-2",
    type: "event_earn",
    status: "pending",
    title: "주말 추가 적립 예정",
    amount: 2100,
    balance_after: 14900,
    created_at: "2026-07-02T09:10:00.000Z",
  },
  {
    id: "public-transaction-3",
    type: "redeem",
    status: "confirmed",
    title: "쿠폰 교환",
    amount: -1500,
    balance_after: 9600,
    created_at: "2026-06-28T02:30:00.000Z",
  },
];

const publicAppHomeResponse: RawAppHomeResponse = {
  profile: {
    full_name: "방문 고객",
    email: "guest@example.com",
    tier_name: "Silver",
  },
  brand: {
    point_label: "P",
    home_message: "포인트 혜택을 바로 확인하세요.",
    primary_color: "#2563EB",
  },
  balance: {
    available: 12800,
    pending: 2100,
    total: 14900,
    expiring_soon: 500,
  },
  pending_earnings: [
    {
      id: "public-pending-1",
      title: "주말 추가 적립",
      amount: 2100,
      confirm_at: "2026-07-07T09:00:00.000Z",
    },
  ],
  expiring_points: [
    {
      id: "public-expiring-1",
      amount: 500,
      expires_at: "2026-07-29T14:59:59.000Z",
    },
  ],
  recent_transactions: publicTransactionRows,
  events: publicEventRows,
};

const publicAppBenefitsResponse: RawAppBenefitsResponse = {
  current_tier: {
    id: "silver",
    name: "Silver",
    base_earn_rate: 1,
    bonus_earn_rate: 1,
  },
  next_tier: {
    id: "gold",
    name: "Gold",
    min_spend: 300000,
    min_purchase_count: 5,
  },
  progress: {
    current_spend: 180000,
    current_purchase_count: 3,
    required_spend: 300000,
    required_purchase_count: 5,
    progress_rate: 60,
  },
  tiers: [
    {
      id: "basic",
      name: "Basic",
      base_earn_rate: 1,
      bonus_earn_rate: 0,
      min_spend: 0,
      min_purchase_count: 0,
    },
    {
      id: "silver",
      name: "Silver",
      base_earn_rate: 1,
      bonus_earn_rate: 1,
      min_spend: 100000,
      min_purchase_count: 2,
    },
    {
      id: "gold",
      name: "Gold",
      base_earn_rate: 2,
      bonus_earn_rate: 2,
      min_spend: 300000,
      min_purchase_count: 5,
    },
  ],
  events: publicEventRows,
  redeem_policy: {
    min_redeem_points: 1000,
    max_redeem_ratio: 30,
  },
};

const publicAppProfileResponse: RawAppProfileResponse = {
  profile: {
    id: "public-profile",
    full_name: "방문 고객",
    email: "guest@example.com",
    phone: "010-0000-0000",
    marketing_opt_in: false,
    point_earn_notify: true,
    point_expiry_notify: true,
    status: "active",
    withdrawal_requested_at: null,
  },
  balance: {
    available: 12800,
    pending: 2100,
    total: 14900,
  },
};
const publicTimelineNow = new Date("2026-07-04T00:00:00.000Z");

export function getPublicAppHomeData(): AppHomeData {
  return normalizeAppHomeResponse(publicAppHomeResponse);
}

export function getPublicAppTransactionsData(search: AppTransactionSearch): AppTransaction[] {
  return normalizeAppTransactionsResponse({ transactions: publicTransactionRows }).filter((item) =>
    matchesPublicTransactionSearch(item, search),
  );
}

export function getPublicAppBenefitsData(): AppBenefitsData {
  return normalizeAppBenefitsResponse(publicAppBenefitsResponse);
}

export function getPublicAppProfileData(): AppProfileData {
  return normalizeAppProfileResponse(publicAppProfileResponse);
}

export function normalizeAppHomeResponse(raw: RawAppHomeResponse): AppHomeData {
  const pointLabel = toString(raw?.brand?.point_label) || "P";

  return {
    profile: {
      name: toString(raw?.profile?.full_name) || "고객",
      email: toString(raw?.profile?.email),
      tierName: toString(raw?.profile?.tier_name) || "기본",
    },
    brand: {
      pointLabel,
      homeMessage: toString(raw?.brand?.home_message),
      primaryColor: toString(raw?.brand?.primary_color) || "#2563EB",
    },
    balance: {
      available: toNumber(raw?.balance?.available),
      pending: toNumber(raw?.balance?.pending),
      total: toNumber(raw?.balance?.total),
      expiringSoon: toNumber(raw?.balance?.expiring_soon),
      availableLabel: formatPoint(toNumber(raw?.balance?.available), "default", pointLabel),
      pendingLabel: formatPoint(toNumber(raw?.balance?.pending), "default", pointLabel),
      expiringSoonLabel: formatPoint(toNumber(raw?.balance?.expiring_soon), "default", pointLabel),
    },
    pendingEarnings: (raw?.pending_earnings ?? []).map((item) =>
      normalizePendingEarning(item, pointLabel),
    ),
    expiringPoints: (raw?.expiring_points ?? []).map((item) =>
      normalizeExpiringPoint(item, pointLabel),
    ),
    recentTransactions: normalizeTransactions(raw?.recent_transactions ?? [], pointLabel),
    events: (raw?.events ?? []).map(normalizeEvent),
  };
}

export function normalizeAppTransactionsResponse(
  raw: RawAppTransactionsResponse,
  pointLabel = "P",
): AppTransaction[] {
  return normalizeTransactions(raw?.transactions ?? [], pointLabel);
}

export function normalizeAppBenefitsResponse(raw: RawAppBenefitsResponse): AppBenefitsData {
  const progressRate = Math.max(
    0,
    Math.min(100, Math.round(toNumber(raw?.progress?.progress_rate))),
  );
  const reviewReady =
    progressRate >= 100 ||
    (toNumber(raw?.progress?.required_spend) <= 0 &&
      toNumber(raw?.progress?.required_purchase_count) <= 0);

  return {
    currentTier: {
      id: toString(raw?.current_tier?.id),
      name: toString(raw?.current_tier?.name) || "기본",
      baseEarnRate: toNumber(raw?.current_tier?.base_earn_rate),
      bonusEarnRate: toNumber(raw?.current_tier?.bonus_earn_rate),
    },
    nextTier: raw?.next_tier
      ? {
          id: toString(raw.next_tier.id),
          name: toString(raw.next_tier.name),
          minSpend: toNumber(raw.next_tier.min_spend),
          minPurchaseCount: toNumber(raw.next_tier.min_purchase_count),
        }
      : null,
    nextTierProgress: {
      currentSpend: toNumber(raw?.progress?.current_spend),
      currentPurchaseCount: toNumber(raw?.progress?.current_purchase_count),
      requiredSpend: toNumber(raw?.progress?.required_spend),
      requiredPurchaseCount: toNumber(raw?.progress?.required_purchase_count),
      rate: progressRate,
      reviewReady,
      message: reviewReady ? "승급 심사 예정" : "다음 등급까지 진행 중",
    },
    tiers: (raw?.tiers ?? []).map((tier) => ({
      id: toString(tier.id),
      name: toString(tier.name),
      baseEarnRate: toNumber(tier.base_earn_rate),
      bonusEarnRate: toNumber(tier.bonus_earn_rate),
      minSpendLabel: formatPoint(toNumber(tier.min_spend)),
      minPurchaseCountLabel: `${toNumber(tier.min_purchase_count).toLocaleString("ko-KR")}회`,
    })),
    events: (raw?.events ?? []).map(normalizeEvent),
    redeemPolicy: {
      minRedeemPoints: toNumber(raw?.redeem_policy?.min_redeem_points),
      maxRedeemRatio: toNumber(raw?.redeem_policy?.max_redeem_ratio),
      minRedeemPointsLabel: formatPoint(toNumber(raw?.redeem_policy?.min_redeem_points)),
      maxRedeemRatioLabel: `${toNumber(raw?.redeem_policy?.max_redeem_ratio)}%`,
    },
  };
}

export function normalizeAppProfileResponse(raw: RawAppProfileResponse): AppProfileData {
  const available = toNumber(raw?.balance?.available);

  return {
    form: {
      fullName: toString(raw?.profile?.full_name),
      phone: toString(raw?.profile?.phone),
      email: toString(raw?.profile?.email),
      pointEarnNotify: toBoolean(raw?.profile?.point_earn_notify, true),
      pointExpiryNotify: toBoolean(raw?.profile?.point_expiry_notify, true),
      marketingOptIn: toBoolean(raw?.profile?.marketing_opt_in, false),
    },
    status: toString(raw?.profile?.status) || "active",
    withdrawalRequestedAt: toNullableString(raw?.profile?.withdrawal_requested_at),
    balance: {
      available,
      pending: toNumber(raw?.balance?.pending),
      total: toNumber(raw?.balance?.total),
      availableLabel: formatPoint(available),
    },
  };
}

export function buildAppTransactionFilters(
  search: AppTransactionSearch,
  now = new Date(),
): AppTransactionRpcFilters {
  const range = getPeriodRange(search, now);

  return {
    _date_from: range.dateFrom,
    _date_to: range.dateTo,
    _type: search.type === "all" ? null : search.type,
    _status: search.status === "all" ? null : search.status,
  };
}

export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return formatPhone(digits);
}

export function validateAppProfileForm(form: AppProfileForm): string | null {
  const name = form.fullName.trim();
  if (name.length < 2 || name.length > 30) return "이름은 2~30자로 입력하세요.";
  if (!isValidEmail(form.email)) return "이메일 형식이 올바르지 않습니다.";
  if (!isValidKoreanPhone(form.phone)) return "휴대폰 번호는 10~11자리 숫자로 입력하세요.";
  return null;
}

export function buildProfileUpdateArgs(form: AppProfileForm): ProfileUpdateRpcArgs {
  return {
    _full_name: form.fullName.trim(),
    _phone: formatPhoneInput(form.phone),
    _email: form.email.trim().toLowerCase(),
    _point_earn_notify: form.pointEarnNotify,
    _point_expiry_notify: form.pointExpiryNotify,
    _marketing_opt_in: form.marketingOptIn,
  };
}

export function validateAppPasswordForm(form: AppPasswordForm): string | null {
  if (form.currentPassword.length < 1) return "현재 비밀번호를 입력하세요.";
  if (form.newPassword.length < 8) return "새 비밀번호는 8자 이상이어야 합니다.";
  if (form.newPassword === form.currentPassword) {
    return "새 비밀번호는 현재 비밀번호와 달라야 합니다.";
  }
  if (form.newPassword !== form.confirmPassword) return "새 비밀번호 확인이 일치하지 않습니다.";
  return null;
}

export function validateWithdrawalConfirmation(value: string): string | null {
  return value.trim() === "탈퇴" ? null : '탈퇴 확인 문구로 "탈퇴"를 입력하세요.';
}

export function validateSignupForm(form: SignupForm): string | null {
  const name = form.fullName.trim();
  if (name.length < 2 || name.length > 30) return "이름은 2~30자로 입력하세요.";
  if (!isValidEmail(form.email)) return "이메일 형식이 올바르지 않습니다.";
  if (!isValidKoreanPhone(form.phone)) return "휴대폰 번호는 10~11자리 숫자로 입력하세요.";
  if (form.password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!form.termsAccepted) return "필수 약관에 동의해야 가입할 수 있습니다.";
  return null;
}

export function registerAdminLoginFailure(
  state: AdminLoginAttemptState,
  now = Date.now(),
): AdminLoginAttemptState {
  const failures =
    state.lockedUntil && state.lockedUntil > now ? state.failures : state.failures + 1;

  return {
    failures,
    lockedUntil: failures >= 5 ? now + 10 * 60 * 1000 : null,
    updatedAt: now,
  };
}

export function getAdminLoginLockoutState(
  state: AdminLoginAttemptState,
  now = Date.now(),
): { locked: boolean; remainingSeconds: number } {
  const lockedUntil = state.lockedUntil ?? 0;
  const locked = lockedUntil > now;

  return {
    locked,
    remainingSeconds: locked ? Math.ceil((lockedUntil - now) / 1000) : 0,
  };
}

function normalizePendingEarning(item: RawPendingEarning, pointLabel: string) {
  const amount = toNumber(item.amount);
  const confirmAt = toNullableString(item.confirm_at);

  return {
    id: toString(item.id),
    title: toString(item.title) || "적립 예정",
    amount,
    pointLabel: formatPoint(amount, "earn", pointLabel),
    confirmAt,
    confirmAtLabel: confirmAt ? formatDate(confirmAt, "period") : "-",
  };
}

function normalizeExpiringPoint(item: RawExpiringPoint, pointLabel: string) {
  const amount = toNumber(item.amount);
  const expiresAt = toNullableString(item.expires_at);

  return {
    id: toString(item.id),
    amount,
    pointLabel: formatPoint(amount, "use", pointLabel),
    expiresAt,
    expiresAtLabel: expiresAt ? formatDate(expiresAt, "period") : "-",
  };
}

function normalizeTransactions(rows: RawAppTransaction[], pointLabel: string): AppTransaction[] {
  return rows.map((row) => {
    const type = toString(row.type);
    const status = toString(row.status);
    const amount = toNumber(row.amount);
    const balanceAfter = toNullableNumber(row.balance_after);
    const createdAt = toString(row.created_at);
    const direction = earnTypes.has(type) ? "earn" : useTypes.has(type) ? "use" : "default";
    const typeLabel = transactionTypeLabels[type] ?? type;

    return {
      id: toString(row.id),
      type,
      typeLabel,
      status,
      statusLabel: transactionStatusLabels[status] ?? status,
      title: toString(row.title) || toString(row.memo) || typeLabel,
      amount,
      amountLabel: formatPoint(amount, direction, pointLabel),
      balanceAfter,
      balanceAfterLabel:
        balanceAfter === null ? "-" : formatPoint(balanceAfter, "default", pointLabel),
      createdAt,
      createdAtLabel: createdAt ? formatDate(createdAt, "user") : "-",
    };
  });
}

function normalizeEvent(raw: RawAppEvent): AppEvent {
  const endsAt = toNullableString(raw.ends_at);

  return {
    id: toString(raw.id),
    name: toString(raw.name),
    description: toString(raw.description),
    rewardLabel: formatRewardLabel(toString(raw.reward_type), toNumber(raw.reward_value)),
    endsAt,
    endsAtLabel: endsAt ? formatDate(endsAt, "period") : "상시",
  };
}

function formatRewardLabel(type: string, value: number): string {
  return type === "fixed" ? `고정 ${formatPoint(value)}` : `추가 적립률 ${value}%`;
}

function getPeriodRange(
  search: AppTransactionSearch,
  now: Date,
): { dateFrom: string | null; dateTo: string | null } {
  if (search.period === "custom") {
    return {
      dateFrom: search.dateFrom ? startOfDayIso(search.dateFrom) : null,
      dateTo: search.dateTo ? endOfDayIso(search.dateTo) : null,
    };
  }

  const months = search.period === "1m" ? 1 : search.period === "3m" ? 3 : 6;
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);

  return {
    dateFrom: from.toISOString(),
    dateTo: now.toISOString(),
  };
}

function matchesPublicTransactionSearch(
  transaction: AppTransaction,
  search: AppTransactionSearch,
): boolean {
  if (search.type === "earn" && !earnTypes.has(transaction.type)) return false;
  if (search.type === "use" && !useTypes.has(transaction.type)) return false;
  if (search.type === "expire" && transaction.type !== "expire") return false;
  if (
    search.type === "cancel" &&
    transaction.type !== "cancel" &&
    !transaction.type.endsWith("_cancel")
  ) {
    return false;
  }
  if (search.status !== "all" && transaction.status !== search.status) return false;

  const createdAt = Date.parse(transaction.createdAt);
  if (!Number.isFinite(createdAt)) return true;

  const range = getPeriodRange(search, publicTimelineNow);
  if (range.dateFrom && createdAt < Date.parse(range.dateFrom)) return false;
  if (range.dateTo && createdAt > Date.parse(range.dateTo)) return false;
  return true;
}

function startOfDayIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

function endOfDayIso(value: string): string {
  return new Date(`${value}T23:59:59`).toISOString();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidKoreanPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toString(value);
  return normalized || null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
