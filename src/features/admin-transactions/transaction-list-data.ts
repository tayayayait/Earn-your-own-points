import {
  getTransactionPointDirection,
  getTransactionTypeLabel,
  type PointDirection,
} from "@/features/admin-dashboard/dashboard-data";
import { formatCustomerCode } from "@/features/admin-customers/customer-list-data";
import { formatDate } from "@/lib/formatters";

export const TRANSACTION_PAGE_SIZE = 20;

export type TransactionListSearchState = {
  transactionId?: string;
  customerId?: string;
  externalTransactionId?: string;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
};

export type TransactionListRpcArgs = {
  _transaction_id: string | null;
  _customer_id: string | null;
  _external_transaction_id: string | null;
  _type: string | null;
  _status: string | null;
  _date_from: string | null;
  _date_to: string | null;
  _page: number;
  _page_size: number;
};

type RawTransactionListResponse = {
  total_count?: unknown;
  page?: unknown;
  page_size?: unknown;
  transactions?: RawTransactionRow[];
} | null;

type RawTransactionRow = {
  sequence_number?: unknown;
  id?: unknown;
  user_id?: unknown;
  customer_code?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  customer_phone?: unknown;
  customer_status?: unknown;
  tier_name?: unknown;
  type?: unknown;
  status?: unknown;
  amount?: unknown;
  balance_after?: unknown;
  memo?: unknown;
  reference?: unknown;
  external_transaction_id?: unknown;
  original_transaction_id?: unknown;
  policy_snapshot?: unknown;
  created_at?: unknown;
  created_by_name?: unknown;
  created_by_email?: unknown;
  can_cancel?: unknown;
  can_retry?: unknown;
  has_reversal?: unknown;
};

type RawTransactionDetail = {
  transaction?: RawTransactionRow | null;
  customer?: RawCustomerDetail | null;
  policy?: RawPolicyDetail | null;
  logs?: RawProcessingLog[];
} | null;

type RawCustomerDetail = {
  id?: unknown;
  customer_code?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  status?: unknown;
  tier_name?: unknown;
};

type RawPolicyDetail = {
  policy_name?: unknown;
  policy_snapshot?: unknown;
};

type RawProcessingLog = {
  id?: unknown;
  action?: unknown;
  reason?: unknown;
  created_at?: unknown;
  actor_name?: unknown;
  actor_email?: unknown;
};

export type TransactionListRow = {
  sequenceNumber: number;
  id: string;
  transactionCode: string;
  userId: string;
  customerCode: string;
  customerName: string;
  customerEmail: string;
  customerLabel: string;
  type: string;
  typeLabel: string;
  status: string;
  amount: number;
  balanceAfter: number | null;
  memo: string | null;
  reference: string | null;
  externalTransactionId: string | null;
  originalTransactionId: string | null;
  createdAt: string;
  createdAtLabel: string;
  direction: PointDirection;
  canCancel: boolean;
  canRetry: boolean;
};

export type TransactionListData = {
  transactions: TransactionListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type TransactionDetail = {
  transaction: TransactionListRow;
  customer: {
    id: string;
    customerCode: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    tierName: string;
    customerLabel: string;
  };
  policy: {
    policyName: string;
    policySnapshot: unknown;
  };
  logs: Array<{
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
    createdAtLabel: string;
    actorName: string | null;
    actorEmail: string | null;
    actorLabel: string;
  }>;
};

export type CustomerOption = {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  label: string;
};

export function formatTransactionCode(createdAt: string, sequenceNumber: number): string {
  const dateLabel = formatDate(createdAt, "period").replace(/\./g, "");
  const normalizedDate = /^\d{8}$/.test(dateLabel) ? dateLabel : "00000000";
  const normalizedSequence = Math.max(0, sequenceNumber).toString().padStart(6, "0");

  return `PTX-${normalizedDate}-${normalizedSequence}`;
}

export function buildTransactionListRpcArgs(
  state: TransactionListSearchState = {},
): TransactionListRpcArgs {
  const page = Number.isInteger(state.page) && Number(state.page) > 0 ? Number(state.page) : 1;

  return {
    _transaction_id: normalizeText(state.transactionId),
    _customer_id: normalizeText(state.customerId),
    _external_transaction_id: normalizeText(state.externalTransactionId),
    _type: normalizeAllFilter(state.type),
    _status: normalizeAllFilter(state.status),
    _date_from: normalizeText(state.dateFrom),
    _date_to: normalizeText(state.dateTo),
    _page: page,
    _page_size: TRANSACTION_PAGE_SIZE,
  };
}

export function normalizeTransactionListResponse(
  raw: RawTransactionListResponse,
): TransactionListData {
  const totalCount = toNumber(raw?.total_count);
  const pageSize = Math.max(1, toNumber(raw?.page_size) || TRANSACTION_PAGE_SIZE);
  const page = Math.max(1, toNumber(raw?.page) || 1);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    totalCount,
    page,
    pageSize,
    totalPages,
    transactions: (raw?.transactions ?? []).map(normalizeTransactionRow),
  };
}

export function normalizeTransactionDetail(raw: RawTransactionDetail): TransactionDetail | null {
  if (!raw?.transaction) return null;

  const transaction = normalizeTransactionRow(raw.transaction);
  const customerId = toStringValue(raw.customer?.id) || transaction.userId;
  const customerName = toStringValue(raw.customer?.full_name) || transaction.customerName;
  const customerEmail = toStringValue(raw.customer?.email) || transaction.customerEmail;
  const customerCode =
    toStringValue(raw.customer?.customer_code) ||
    transaction.customerCode ||
    fallbackCustomerCode(customerId);

  return {
    transaction,
    customer: {
      id: customerId,
      customerCode,
      name: customerName || customerEmail || "-",
      email: customerEmail,
      phone: toStringValue(raw.customer?.phone),
      status: toStringValue(raw.customer?.status) || "active",
      tierName: toStringValue(raw.customer?.tier_name) || "기본",
      customerLabel: createCustomerLabel(customerName, customerEmail, customerCode),
    },
    policy: {
      policyName: toStringValue(raw.policy?.policy_name) || "정책 정보 없음",
      policySnapshot: raw.policy?.policy_snapshot ?? {},
    },
    logs: (raw.logs ?? []).map((log) => {
      const createdAt = toStringValue(log.created_at);
      const actorName = toNullableString(log.actor_name);
      const actorEmail = toNullableString(log.actor_email);

      return {
        id: toStringValue(log.id),
        action: toStringValue(log.action),
        reason: toNullableString(log.reason),
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
        actorName,
        actorEmail,
        actorLabel: actorName || actorEmail || "-",
      };
    }),
  };
}

export function normalizeCustomerOptions(raw: unknown): CustomerOption[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((row) => {
    const item = row as Record<string, unknown>;
    const id = toStringValue(item.id);
    const customerCode = toStringValue(item.customer_code) || fallbackCustomerCode(id);
    const name = toStringValue(item.full_name);
    const email = toStringValue(item.email);

    return {
      id,
      customerCode,
      name: name || email || "-",
      email,
      label: createCustomerLabel(name, email, customerCode),
    };
  });
}

export function canCancelTransaction(status: string, hasReversal = false): boolean {
  return !hasReversal && (status === "completed" || status === "confirmed");
}

export function canRetryTransaction(status: string): boolean {
  return status === "failed";
}

export function createCancellationIdempotencyKey(transactionId: string): string {
  return `cancel:${transactionId}`;
}

function normalizeTransactionRow(row: RawTransactionRow): TransactionListRow {
  const sequenceNumber = toNumber(row.sequence_number);
  const createdAt = toStringValue(row.created_at);
  const userId = toStringValue(row.user_id);
  const customerCode = toStringValue(row.customer_code) || fallbackCustomerCode(userId);
  const customerName = toStringValue(row.customer_name);
  const customerEmail = toStringValue(row.customer_email);
  const type = toStringValue(row.type);
  const status = toStringValue(row.status);
  const originalTransactionId = toNullableString(row.original_transaction_id);
  const hasReversal = toBoolean(row.has_reversal);

  return {
    sequenceNumber,
    id: toStringValue(row.id),
    transactionCode: formatTransactionCode(createdAt, sequenceNumber),
    userId,
    customerCode,
    customerName: customerName || customerEmail || "-",
    customerEmail,
    customerLabel: createCustomerLabel(customerName, customerEmail, customerCode),
    type,
    typeLabel: getTransactionTypeLabel(type),
    status,
    amount: toNumber(row.amount),
    balanceAfter: row.balance_after == null ? null : toNumber(row.balance_after),
    memo: toNullableString(row.memo),
    reference: toNullableString(row.reference),
    externalTransactionId: toNullableString(row.external_transaction_id),
    originalTransactionId,
    createdAt,
    createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
    direction: getTransactionPointDirection(type),
    canCancel:
      typeof row.can_cancel === "boolean"
        ? row.can_cancel
        : canCancelTransaction(status, Boolean(originalTransactionId) || hasReversal),
    canRetry: typeof row.can_retry === "boolean" ? row.can_retry : canRetryTransaction(status),
  };
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

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeAllFilter(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized && normalized !== "all" ? normalized : null;
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

function toBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}
