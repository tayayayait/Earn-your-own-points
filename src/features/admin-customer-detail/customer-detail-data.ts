import {
  getTransactionPointDirection,
  getTransactionTypeLabel,
} from "@/features/admin-dashboard/dashboard-data";
import { formatCustomerCode } from "@/features/admin-customers/customer-list-data";
import { formatDate } from "@/lib/formatters";

export type ManualPointType = "manual_earn" | "manual_deduct";

type RawCustomerDetail = {
  profile?: RawProfile | null;
  summary?: RawSummary;
  transactions?: RawTransaction[];
  notes?: RawNote[];
} | null;

type RawProfile = {
  id?: unknown;
  customer_code?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  birth_date?: unknown;
  status?: unknown;
  tier_id?: unknown;
  tier_name?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  last_transaction_at?: unknown;
};

type RawSummary = {
  available_points?: unknown;
  pending_points?: unknown;
  expiring_points_30d?: unknown;
  total_earned_points?: unknown;
  total_redeemed_points?: unknown;
};

type RawTransaction = {
  id?: unknown;
  type?: unknown;
  status?: unknown;
  amount?: unknown;
  balance_after?: unknown;
  memo?: unknown;
  reference?: unknown;
  expires_at?: unknown;
  created_at?: unknown;
};

type RawNote = {
  id?: unknown;
  body?: unknown;
  created_at?: unknown;
  created_by?: unknown;
  created_by_name?: unknown;
  created_by_email?: unknown;
};

export type CustomerDetail = {
  profile: {
    id: string;
    customerCode: string;
    name: string;
    email: string;
    phone: string;
    birthDate: string;
    status: string;
    tierId: string | null;
    tierName: string;
    createdAt: string;
    createdAtLabel: string;
    updatedAt: string;
    lastTransactionAt: string | null;
    lastTransactionLabel: string;
  };
  summary: {
    availablePoints: number;
    pendingPoints: number;
    expiringPoints30d: number;
    totalEarnedPoints: number;
    totalRedeemedPoints: number;
  };
  transactions: Array<{
    id: string;
    type: string;
    typeLabel: string;
    status: string;
    amount: number;
    balanceAfter: number | null;
    memo: string | null;
    reference: string | null;
    expiresAt: string | null;
    createdAt: string;
    createdAtLabel: string;
    direction: "earn" | "use" | "default";
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    createdAtLabel: string;
    createdBy: string | null;
    createdByName: string | null;
    createdByEmail: string | null;
    createdByLabel: string;
  }>;
};

export function canEditCustomerProfile(status: string): boolean {
  return status !== "withdrawn";
}

export function canProcessCustomerPoints(status: string): boolean {
  return status !== "blocked" && status !== "withdrawn";
}

export function isValidAdminReason(value: string): boolean {
  return value.trim().length >= 10;
}

export function createIdempotencyKey(
  userId: string,
  type: ManualPointType,
  amount: number,
  memo: string,
): string {
  return `manual:${userId}:${type}:${amount}:${memo.trim()}`;
}

export function normalizeCustomerDetail(raw: RawCustomerDetail): CustomerDetail {
  const profileId = toStringValue(raw?.profile?.id);
  const createdAt = toStringValue(raw?.profile?.created_at);
  const updatedAt = toStringValue(raw?.profile?.updated_at);
  const lastTransactionAt = toNullableString(raw?.profile?.last_transaction_at);
  const name = toStringValue(raw?.profile?.full_name);
  const email = toStringValue(raw?.profile?.email);

  return {
    profile: {
      id: profileId,
      customerCode: toStringValue(raw?.profile?.customer_code) || fallbackCustomerCode(profileId),
      name: name || email || "-",
      email,
      phone: toStringValue(raw?.profile?.phone),
      birthDate: toStringValue(raw?.profile?.birth_date),
      status: toStringValue(raw?.profile?.status) || "active",
      tierId: toNullableString(raw?.profile?.tier_id),
      tierName: toStringValue(raw?.profile?.tier_name) || "기본",
      createdAt,
      createdAtLabel: createdAt ? formatDate(createdAt, "period") : "-",
      updatedAt,
      lastTransactionAt,
      lastTransactionLabel: lastTransactionAt ? formatDate(lastTransactionAt, "admin") : "-",
    },
    summary: {
      availablePoints: toNumber(raw?.summary?.available_points),
      pendingPoints: toNumber(raw?.summary?.pending_points),
      expiringPoints30d: toNumber(raw?.summary?.expiring_points_30d),
      totalEarnedPoints: toNumber(raw?.summary?.total_earned_points),
      totalRedeemedPoints: toNumber(raw?.summary?.total_redeemed_points),
    },
    transactions: (raw?.transactions ?? []).map((transaction) => {
      const type = toStringValue(transaction.type);
      const created = toStringValue(transaction.created_at);

      return {
        id: toStringValue(transaction.id),
        type,
        typeLabel: getTransactionTypeLabel(type),
        status: toStringValue(transaction.status),
        amount: toNumber(transaction.amount),
        balanceAfter:
          transaction.balance_after == null ? null : toNumber(transaction.balance_after),
        memo: toNullableString(transaction.memo),
        reference: toNullableString(transaction.reference),
        expiresAt: toNullableString(transaction.expires_at),
        createdAt: created,
        createdAtLabel: created ? formatDate(created, "admin") : "-",
        direction: getTransactionPointDirection(type),
      };
    }),
    notes: (raw?.notes ?? []).map((note) => {
      const created = toStringValue(note.created_at);
      const createdByName = toNullableString(note.created_by_name);
      const createdByEmail = toNullableString(note.created_by_email);

      return {
        id: toStringValue(note.id),
        body: toStringValue(note.body),
        createdAt: created,
        createdAtLabel: created ? formatDate(created, "admin") : "-",
        createdBy: toNullableString(note.created_by),
        createdByName,
        createdByEmail,
        createdByLabel: createdByName || createdByEmail || "-",
      };
    }),
  };
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
