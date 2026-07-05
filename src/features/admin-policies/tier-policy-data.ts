import { formatDate } from "@/lib/formatters";

export type TierPolicyStatus = "active" | "paused" | "disabled";
export type TierMoveDirection = "up" | "down";

type RawTierPolicyResponse = {
  tiers?: RawTierPolicy[];
} | null;

type RawTierPolicy = {
  id?: unknown;
  name?: unknown;
  sort_order?: unknown;
  qualification_months?: unknown;
  min_spend?: unknown;
  min_purchase_count?: unknown;
  base_earn_rate?: unknown;
  bonus_earn_rate?: unknown;
  min_keep_spend?: unknown;
  status?: unknown;
  customer_count?: unknown;
  updated_at?: unknown;
};

export type TierPolicy = {
  id: string;
  name: string;
  sortOrder: number;
  qualificationMonths: number;
  minSpend: number;
  minPurchaseCount: number;
  baseEarnRate: number;
  bonusEarnRate: number;
  minKeepSpend: number;
  status: TierPolicyStatus;
  customerCount: number;
  updatedAt: string | null;
  updatedAtLabel: string;
};

export type TierPolicyForm = {
  id: string | null;
  name: string;
  qualificationMonths: string;
  minSpend: string;
  minPurchaseCount: string;
  baseEarnRate: string;
  bonusEarnRate: string;
  minKeepSpend: string;
  status: TierPolicyStatus;
  reason: string;
};

export type TierPolicyData = {
  tiers: TierPolicy[];
};

export type SaveTierPolicyRpcArgs = {
  _tier_id: string | null;
  _name: string;
  _sort_order: number;
  _qualification_months: number;
  _min_spend: number;
  _min_purchase_count: number;
  _base_earn_rate: number;
  _bonus_earn_rate: number;
  _min_keep_spend: number;
  _status: TierPolicyStatus;
  _reason: string;
};

export const emptyTierPolicyForm: TierPolicyForm = {
  id: null,
  name: "",
  qualificationMonths: "12",
  minSpend: "0",
  minPurchaseCount: "0",
  baseEarnRate: "1",
  bonusEarnRate: "0",
  minKeepSpend: "0",
  status: "active",
  reason: "",
};

const statusValues = new Set<TierPolicyStatus>(["active", "paused", "disabled"]);

export function normalizeTierPolicyResponse(raw: RawTierPolicyResponse): TierPolicyData {
  return {
    tiers: (raw?.tiers ?? []).map(normalizeTierPolicy),
  };
}

export function tierPolicyToForm(policy: TierPolicy): TierPolicyForm {
  return {
    id: policy.id,
    name: policy.name,
    qualificationMonths: String(policy.qualificationMonths),
    minSpend: String(policy.minSpend),
    minPurchaseCount: String(policy.minPurchaseCount),
    baseEarnRate: String(policy.baseEarnRate),
    bonusEarnRate: String(policy.bonusEarnRate),
    minKeepSpend: String(policy.minKeepSpend),
    status: policy.status,
    reason: "",
  };
}

export function validateTierPolicyForm(
  form: TierPolicyForm,
  existingNames: string[],
): string | null {
  const name = form.name.trim();
  const qualificationMonths = toInteger(form.qualificationMonths);
  const minSpend = toInteger(form.minSpend);
  const minPurchaseCount = toInteger(form.minPurchaseCount);
  const baseEarnRate = toNumber(form.baseEarnRate);
  const bonusEarnRate = toNumber(form.bonusEarnRate);
  const minKeepSpend = toInteger(form.minKeepSpend);
  const duplicateName = existingNames.some(
    (existing) => existing.trim().toLowerCase() === name.toLowerCase(),
  );

  if (name.length < 2 || name.length > 50) return "등급명은 2~50자로 입력하세요.";
  if (!form.id && duplicateName) return "이미 사용 중인 등급명입니다.";
  if (
    !Number.isInteger(qualificationMonths) ||
    qualificationMonths < 1 ||
    qualificationMonths > 24
  ) {
    return "승급 기준 기간은 1~24개월로 입력하세요.";
  }
  if (!Number.isInteger(minSpend) || minSpend < 0) return "승급 기준 금액은 0 이상이어야 합니다.";
  if (!Number.isInteger(minPurchaseCount) || minPurchaseCount < 0) {
    return "승급 기준 횟수는 0 이상이어야 합니다.";
  }
  if (
    !Number.isFinite(baseEarnRate) ||
    !Number.isFinite(bonusEarnRate) ||
    baseEarnRate < 0 ||
    baseEarnRate > 100 ||
    bonusEarnRate < 0 ||
    bonusEarnRate > 100
  ) {
    return "적립률은 0~100 사이로 입력하세요.";
  }
  if (!Number.isInteger(minKeepSpend) || minKeepSpend < 0) {
    return "최소 유지 조건은 0 이상이어야 합니다.";
  }
  if (!statusValues.has(form.status)) return "등급 상태가 올바르지 않습니다.";
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function buildSaveTierPolicyRpcArgs(
  form: TierPolicyForm,
  sortOrder: number,
): SaveTierPolicyRpcArgs {
  return {
    _tier_id: form.id,
    _name: form.name.trim(),
    _sort_order: sortOrder,
    _qualification_months: toInteger(form.qualificationMonths),
    _min_spend: toInteger(form.minSpend),
    _min_purchase_count: toInteger(form.minPurchaseCount),
    _base_earn_rate: toNumber(form.baseEarnRate),
    _bonus_earn_rate: toNumber(form.bonusEarnRate),
    _min_keep_spend: toInteger(form.minKeepSpend),
    _status: form.status,
    _reason: form.reason.trim(),
  };
}

export function buildTierOrder(
  ids: string[],
  tierId: string,
  direction: TierMoveDirection,
): string[] {
  const next = [...ids];
  const index = next.indexOf(tierId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || targetIndex < 0 || targetIndex >= next.length) {
    return next;
  }

  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function normalizeTierPolicy(raw: RawTierPolicy): TierPolicy {
  const updatedAt = toNullableString(raw.updated_at);
  const status = toStringValue(raw.status);

  return {
    id: toStringValue(raw.id),
    name: toStringValue(raw.name),
    sortOrder: toInteger(raw.sort_order),
    qualificationMonths: toInteger(raw.qualification_months),
    minSpend: toInteger(raw.min_spend),
    minPurchaseCount: toInteger(raw.min_purchase_count),
    baseEarnRate: toNumber(raw.base_earn_rate),
    bonusEarnRate: toNumber(raw.bonus_earn_rate),
    minKeepSpend: toInteger(raw.min_keep_spend),
    status: statusValues.has(status as TierPolicyStatus) ? (status as TierPolicyStatus) : "active",
    customerCount: toInteger(raw.customer_count),
    updatedAt,
    updatedAtLabel: updatedAt ? formatDate(updatedAt, "admin") : "-",
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toInteger(value: unknown): number {
  const parsed = toNumber(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toStringValue(value);
  return normalized || null;
}
