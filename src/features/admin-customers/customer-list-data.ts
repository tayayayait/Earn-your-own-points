import { formatDate } from "@/lib/formatters";

export const CUSTOMER_PAGE_SIZE = 20;

export type CustomerSortBy = "name" | "balance" | "created_at";
export type SortDirection = "asc" | "desc";

export type CustomerListSearchState = {
  q?: string;
  statuses?: string[];
  tierIds?: string[];
  minPoints?: string;
  maxPoints?: string;
  joinedFrom?: string;
  joinedTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
};

export type CustomerListRpcArgs = {
  _query: string | null;
  _statuses: string[];
  _tier_ids: string[];
  _min_points: number | null;
  _max_points: number | null;
  _joined_from: string | null;
  _joined_to: string | null;
  _sort_by: CustomerSortBy;
  _sort_dir: SortDirection;
  _page: number;
  _page_size: number;
};

type RawCustomerListResponse = {
  total_count?: unknown;
  page?: unknown;
  page_size?: unknown;
  customers?: RawCustomerRow[];
} | null;

type RawCustomerRow = {
  row_number?: unknown;
  id?: unknown;
  customer_code?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  status?: unknown;
  tier_id?: unknown;
  tier_name?: unknown;
  balance?: unknown;
  pending_points?: unknown;
  total_earned?: unknown;
  total_redeemed?: unknown;
  last_transaction_at?: unknown;
  created_at?: unknown;
};

export type CustomerListRow = {
  rowNumber: number;
  id: string;
  customerCode: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  tierId: string | null;
  tierName: string;
  balance: number;
  pendingPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  lastTransactionAt: string | null;
  lastTransactionLabel: string;
  createdAt: string;
  createdAtLabel: string;
};

export type CustomerListData = {
  customers: CustomerListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const sortByValues = new Set<CustomerSortBy>(["name", "balance", "created_at"]);

export function formatCustomerCode(rowNumber: number): string {
  return `CUS-${Math.max(0, rowNumber).toString().padStart(6, "0")}`;
}

export function toggleArrayValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function buildCustomerListRpcArgs(state: CustomerListSearchState = {}): CustomerListRpcArgs {
  const sortBy = sortByValues.has(state.sortBy as CustomerSortBy)
    ? (state.sortBy as CustomerSortBy)
    : "created_at";
  const sortDir = state.sortDir === "asc" ? "asc" : "desc";
  const page = Number.isInteger(state.page) && Number(state.page) > 0 ? Number(state.page) : 1;

  return {
    _query: normalizeText(state.q),
    _statuses: state.statuses ?? [],
    _tier_ids: state.tierIds ?? [],
    _min_points: parseIntegerOrNull(state.minPoints),
    _max_points: parseIntegerOrNull(state.maxPoints),
    _joined_from: normalizeText(state.joinedFrom),
    _joined_to: normalizeText(state.joinedTo),
    _sort_by: sortBy,
    _sort_dir: sortDir,
    _page: page,
    _page_size: CUSTOMER_PAGE_SIZE,
  };
}

export function normalizeCustomerListResponse(raw: RawCustomerListResponse): CustomerListData {
  const totalCount = toNumber(raw?.total_count);
  const pageSize = Math.max(1, toNumber(raw?.page_size) || CUSTOMER_PAGE_SIZE);
  const page = Math.max(1, toNumber(raw?.page) || 1);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    totalCount,
    page,
    pageSize,
    totalPages,
    customers: (raw?.customers ?? []).map((row) => {
      const rowNumber = toNumber(row.row_number);
      const createdAt = toStringValue(row.created_at);
      const lastTransactionAt = toNullableString(row.last_transaction_at);
      const explicitCustomerCode = toNullableString(row.customer_code);
      const email = toStringValue(row.email);
      const name = toStringValue(row.full_name) || email || "-";

      return {
        rowNumber,
        id: toStringValue(row.id),
        customerCode: explicitCustomerCode || formatCustomerCode(rowNumber),
        name,
        email,
        phone: toStringValue(row.phone),
        status: toStringValue(row.status) || "active",
        tierId: toNullableString(row.tier_id),
        tierName: toStringValue(row.tier_name) || "기본",
        balance: toNumber(row.balance),
        pendingPoints: toNumber(row.pending_points),
        totalEarned: toNumber(row.total_earned),
        totalRedeemed: toNumber(row.total_redeemed),
        lastTransactionAt,
        lastTransactionLabel: lastTransactionAt ? formatDate(lastTransactionAt, "admin") : "-",
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "period") : "-",
      };
    }),
  };
}

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseIntegerOrNull(value: string | undefined): number | null {
  if (!value?.trim()) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
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
