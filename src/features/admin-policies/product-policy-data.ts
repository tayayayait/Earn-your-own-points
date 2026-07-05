import { formatDate } from "@/lib/formatters";

export type ProductPolicyTargetType = "product" | "category";
export type ProductPolicyStatus =
  "draft" | "scheduled" | "active" | "paused" | "ended" | "disabled";

type RawProductPolicyResponse = {
  policies?: RawProductPolicy[];
} | null;

type RawProductPolicy = {
  id?: unknown;
  name?: unknown;
  target_type?: unknown;
  target_ids?: unknown;
  earning_rate?: unknown;
  excluded?: unknown;
  priority?: unknown;
  status?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  updated_at?: unknown;
};

type RawProductPolicyTargetResponse = {
  targets?: RawProductPolicyTarget[];
} | null;

type RawProductPolicyTarget = {
  id?: unknown;
  name?: unknown;
  target_type?: unknown;
};

export type ProductPolicy = {
  id: string;
  name: string;
  targetType: ProductPolicyTargetType;
  targetIds: string[];
  targetSummary: string;
  earningRate: number;
  excluded: boolean;
  priority: number;
  status: ProductPolicyStatus;
  startsAt: string | null;
  startsAtLabel: string;
  endsAt: string | null;
  endsAtLabel: string;
  updatedAt: string | null;
  updatedAtLabel: string;
};

export type ProductPolicyForm = {
  id: string | null;
  name: string;
  targetType: ProductPolicyTargetType;
  targetIds: string[];
  earningRate: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  excluded: boolean;
  status: ProductPolicyStatus;
  reason: string;
};

export type ProductPolicyData = {
  policies: ProductPolicy[];
};

export type ProductPolicyTargetOption = {
  id: string;
  name: string;
  targetType: ProductPolicyTargetType;
  label: string;
};

export type SaveProductPolicyRpcArgs = {
  _policy_id: string | null;
  _name: string;
  _target_type: ProductPolicyTargetType;
  _target_ids: string[];
  _earning_rate: number;
  _starts_at: string | null;
  _ends_at: string | null;
  _priority: number;
  _excluded: boolean;
  _status: ProductPolicyStatus;
  _reason: string;
};

export const emptyProductPolicyForm: ProductPolicyForm = {
  id: null,
  name: "",
  targetType: "product",
  targetIds: [],
  earningRate: "0",
  startsAt: "",
  endsAt: "",
  priority: "100",
  excluded: false,
  status: "active",
  reason: "",
};

const targetTypes = new Set<ProductPolicyTargetType>(["product", "category"]);
const policyStatuses = new Set<ProductPolicyStatus>([
  "draft",
  "scheduled",
  "active",
  "paused",
  "ended",
  "disabled",
]);
const conflictStatuses = new Set<ProductPolicyStatus>(["active", "scheduled"]);

export function normalizeProductPolicyResponse(raw: RawProductPolicyResponse): ProductPolicyData {
  return {
    policies: (raw?.policies ?? []).map(normalizeProductPolicy),
  };
}

export function normalizeProductPolicyTargetOptions(
  raw: RawProductPolicyTargetResponse,
): ProductPolicyTargetOption[] {
  return (raw?.targets ?? []).flatMap((target) => {
    const id = toStringValue(target.id);
    const name = toStringValue(target.name);
    const targetType = normalizeTargetType(target.target_type);

    if (!id) return [];

    return [
      {
        id,
        name: name || id,
        targetType,
        label: name && name !== id ? `${name} · ${id}` : id,
      },
    ];
  });
}

export function productPolicyToForm(policy: ProductPolicy): ProductPolicyForm {
  return {
    id: policy.id,
    name: policy.name,
    targetType: policy.targetType,
    targetIds: policy.targetIds,
    earningRate: String(policy.earningRate),
    startsAt: toDatetimeLocal(policy.startsAt),
    endsAt: toDatetimeLocal(policy.endsAt),
    priority: String(policy.priority),
    excluded: policy.excluded,
    status: policy.status,
    reason: "",
  };
}

export function validateProductPolicyForm(
  form: ProductPolicyForm,
  existingPolicies: ProductPolicy[],
): string | null {
  const name = form.name.trim();
  const earningRate = toNumber(form.earningRate);
  const priority = toNumber(form.priority);
  const targetIds = normalizeTargetIds(form.targetIds);

  if (name.length < 2 || name.length > 50) return "정책명은 2~50자로 입력하세요.";
  if (!targetTypes.has(form.targetType)) return "대상 유형은 상품 또는 카테고리만 가능합니다.";
  if (targetIds.length === 0) return "대상을 1개 이상 선택하세요.";
  if (!Number.isFinite(earningRate) || earningRate < 0 || earningRate > 100) {
    return "적립률은 0~100 사이로 입력하세요.";
  }
  if (!Number.isInteger(priority) || priority < 1 || priority > 999) {
    return "우선순위는 1~999 사이 정수로 입력하세요.";
  }
  if (!policyStatuses.has(form.status)) return "정책 상태가 올바르지 않습니다.";
  if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
    return "종료일은 시작일 이후여야 합니다.";
  }
  if (hasPriorityConflict(form, priority, existingPolicies)) {
    return "같은 대상 유형에서 활성/예약 정책 우선순위가 중복됩니다.";
  }
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function buildSaveProductPolicyRpcArgs(form: ProductPolicyForm): SaveProductPolicyRpcArgs {
  return {
    _policy_id: form.id,
    _name: form.name.trim(),
    _target_type: form.targetType,
    _target_ids: normalizeTargetIds(form.targetIds),
    _earning_rate: toNumber(form.earningRate),
    _starts_at: form.startsAt || null,
    _ends_at: form.endsAt || null,
    _priority: toInteger(form.priority),
    _excluded: form.excluded,
    _status: form.status,
    _reason: form.reason.trim(),
  };
}

function normalizeProductPolicy(raw: RawProductPolicy): ProductPolicy {
  const targetIds = Array.isArray(raw.target_ids)
    ? raw.target_ids.filter((item): item is string => typeof item === "string")
    : [];
  const startsAt = toNullableString(raw.starts_at);
  const endsAt = toNullableString(raw.ends_at);
  const updatedAt = toNullableString(raw.updated_at);
  const status = toStringValue(raw.status);

  return {
    id: toStringValue(raw.id),
    name: toStringValue(raw.name),
    targetType: normalizeTargetType(raw.target_type),
    targetIds,
    targetSummary: summarizeTargetIds(targetIds),
    earningRate: toNumber(raw.earning_rate),
    excluded: Boolean(raw.excluded),
    priority: toInteger(raw.priority),
    status: policyStatuses.has(status as ProductPolicyStatus)
      ? (status as ProductPolicyStatus)
      : "draft",
    startsAt,
    startsAtLabel: startsAt ? formatDate(startsAt, "admin") : "-",
    endsAt,
    endsAtLabel: endsAt ? formatDate(endsAt, "admin") : "종료일 없음",
    updatedAt,
    updatedAtLabel: updatedAt ? formatDate(updatedAt, "admin") : "-",
  };
}

function hasPriorityConflict(
  form: ProductPolicyForm,
  priority: number,
  existingPolicies: ProductPolicy[],
): boolean {
  if (!conflictStatuses.has(form.status)) return false;

  return existingPolicies.some(
    (policy) =>
      policy.id !== form.id &&
      policy.targetType === form.targetType &&
      policy.priority === priority &&
      conflictStatuses.has(policy.status),
  );
}

function normalizeTargetType(value: unknown): ProductPolicyTargetType {
  return value === "category" ? "category" : "product";
}

function normalizeTargetIds(value: string[]): string[] {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function summarizeTargetIds(ids: string[]): string {
  if (ids.length === 0) return "-";
  if (ids.length === 1) return ids[0];
  return `${ids[0]} 외 ${ids.length - 1}개`;
}

function toDatetimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
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
