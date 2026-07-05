import { formatCustomerCode } from "@/features/admin-customers/customer-list-data";

export const MAX_MANUAL_POINT_AMOUNT = 10_000_000;

export type ManualTransactionType = "manual_earn" | "manual_deduct";

type RawManualTransactionContext = {
  customer?: RawCustomer | null;
  balance?: RawBalance | null;
  policy?: RawPolicy | null;
} | null;

type RawCustomer = {
  id?: unknown;
  customer_code?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  status?: unknown;
};

type RawBalance = {
  available_points?: unknown;
  pending_points?: unknown;
};

type RawPolicy = {
  policy_name?: unknown;
  valid_months?: unknown;
  default_expires_at?: unknown;
};

export type ManualTransactionContext = {
  customer: {
    id: string;
    customerCode: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    label: string;
  };
  balance: {
    availablePoints: number;
    pendingPoints: number;
  };
  policy: {
    policyName: string;
    validMonths: number;
    defaultExpiresAt: string | null;
    defaultExpiresAtDate: string;
  };
};

export type ManualTransactionFormState = {
  userId: string;
  type: ManualTransactionType;
  amount: number;
  memo: string;
  availablePoints: number;
};

export type ManualTransactionIdempotencyInput = {
  userId: string;
  type: ManualTransactionType;
  amount: number;
  memo: string;
  expiresAt?: string | null;
};

export function normalizeManualTransactionContext(
  raw: RawManualTransactionContext,
): ManualTransactionContext {
  const customerId = toStringValue(raw?.customer?.id);
  const customerCode =
    toStringValue(raw?.customer?.customer_code) || fallbackCustomerCode(customerId);
  const name = toStringValue(raw?.customer?.full_name);
  const email = toStringValue(raw?.customer?.email);
  const defaultExpiresAt = toNullableString(raw?.policy?.default_expires_at);

  return {
    customer: {
      id: customerId,
      customerCode,
      name: name || email || "-",
      email,
      phone: toStringValue(raw?.customer?.phone),
      status: toStringValue(raw?.customer?.status) || "active",
      label: createCustomerLabel(name, email, customerCode),
    },
    balance: {
      availablePoints: toNumber(raw?.balance?.available_points),
      pendingPoints: toNumber(raw?.balance?.pending_points),
    },
    policy: {
      policyName: toStringValue(raw?.policy?.policy_name) || "기본 정책",
      validMonths: toNumber(raw?.policy?.valid_months),
      defaultExpiresAt,
      defaultExpiresAtDate: defaultExpiresAt ? defaultExpiresAt.slice(0, 10) : "",
    },
  };
}

export function calculateExpectedBalance(
  availablePoints: number,
  type: ManualTransactionType,
  amount: number,
): number {
  return type === "manual_earn" ? availablePoints + amount : availablePoints - amount;
}

export function validateManualTransactionForm({
  userId,
  type,
  amount,
  memo,
  availablePoints,
}: ManualTransactionFormState): string | null {
  if (!userId) return "고객을 선택하세요.";
  if (!Number.isInteger(amount) || amount <= 0) return "포인트는 1 이상의 정수로 입력하세요.";
  if (amount > MAX_MANUAL_POINT_AMOUNT) {
    return "포인트는 10,000,000P 이하로 입력하세요.";
  }
  if (memo.trim().length < 10) return "수동 지급/차감 사유는 10자 이상 입력해야 합니다.";
  if (memo.length > 500) return "내부 메모는 500자 이하로 입력하세요.";
  if (type === "manual_deduct" && amount > availablePoints) {
    return "보유 포인트보다 많이 차감할 수 없습니다.";
  }

  return null;
}

export function buildManualTransactionIdempotencyKey({
  userId,
  type,
  amount,
  memo,
  expiresAt,
}: ManualTransactionIdempotencyInput): string {
  return `manual:${userId}:${type}:${amount}:${memo.trim()}:${expiresAt ?? ""}`;
}

function createCustomerLabel(name: string, email: string, customerCode: string): string {
  const primary = name || email || "-";
  return customerCode ? `${primary} · ${customerCode}` : primary;
}

function fallbackCustomerCode(profileId: string): string {
  if (!profileId) return "";

  const numericSuffix = Number(profileId.replace(/\D/g, "").slice(-6));
  if (Number.isInteger(numericSuffix) && numericSuffix > 0) {
    return formatCustomerCode(numericSuffix);
  }

  return `CUS-${profileId.slice(0, 6).toUpperCase()}`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toStringValue(value);
  return normalized || null;
}
