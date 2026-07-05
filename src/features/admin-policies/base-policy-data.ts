import { formatDate } from "@/lib/formatters";

export type ApplyMode = "immediate" | "scheduled";
export type RoundingMethod = "floor" | "round" | "ceil";

type RawBasePolicyResponse = {
  current_policy?: RawBasePolicy | null;
  history?: RawBasePolicy[];
} | null;

type RawBasePolicy = {
  id?: unknown;
  name?: unknown;
  earning_rate?: unknown;
  earn_unit?: unknown;
  rounding_method?: unknown;
  min_redeem_points?: unknown;
  max_redeem_ratio?: unknown;
  redeem_unit?: unknown;
  valid_months?: unknown;
  pending_days?: unknown;
  excluded_payment_methods?: unknown;
  status?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  updated_at?: unknown;
};

export type BasePolicy = {
  id: string;
  name: string;
  earningRate: number;
  earnUnit: number;
  roundingMethod: RoundingMethod;
  minRedeemPoints: number;
  maxRedeemRatio: number;
  redeemUnit: number;
  validMonths: number;
  pendingDays: number;
  excludedPaymentMethods: string[];
  status: string;
  startsAt: string | null;
  startsAtLabel: string;
  endsAt: string | null;
  updatedAt: string | null;
  updatedAtLabel: string;
};

export type BasePolicyForm = {
  name: string;
  earningRate: string;
  earnUnit: string;
  roundingMethod: RoundingMethod;
  minRedeemPoints: string;
  maxRedeemRatio: string;
  redeemUnit: string;
  validMonths: string;
  pendingDays: string;
  excludedPaymentMethods: string;
  applyMode: ApplyMode;
  scheduledAt: string;
  reason: string;
};

export type BasePolicyData = {
  currentPolicy: BasePolicy | null;
  history: BasePolicy[];
  form: BasePolicyForm;
};

export type BasePolicyDiff = {
  label: string;
  before: string;
  after: string;
};

export type SaveBasePolicyRpcArgs = {
  _name: string;
  _earning_rate: number;
  _earn_unit: number;
  _rounding_method: RoundingMethod;
  _min_redeem_points: number;
  _max_redeem_ratio: number;
  _redeem_unit: number;
  _valid_months: number;
  _pending_days: number;
  _excluded_payment_methods: string[];
  _apply_mode: ApplyMode;
  _scheduled_at: string | null;
  _reason: string;
};

const defaultForm: BasePolicyForm = {
  name: "기본 정책",
  earningRate: "1",
  earnUnit: "1",
  roundingMethod: "floor",
  minRedeemPoints: "0",
  maxRedeemRatio: "100",
  redeemUnit: "1",
  validMonths: "12",
  pendingDays: "0",
  excludedPaymentMethods: "",
  applyMode: "immediate",
  scheduledAt: "",
  reason: "",
};

const unitValues = new Set(["1", "10", "100"]);
const roundingMethods = new Set<RoundingMethod>(["floor", "round", "ceil"]);

const diffLabels: Array<[keyof BasePolicyForm, string]> = [
  ["name", "정책명"],
  ["earningRate", "기본 적립률"],
  ["earnUnit", "적립 단위"],
  ["roundingMethod", "반올림 방식"],
  ["minRedeemPoints", "최소 사용 포인트"],
  ["maxRedeemRatio", "최대 사용 비율"],
  ["redeemUnit", "사용 단위"],
  ["validMonths", "유효기간"],
  ["pendingDays", "확정 대기일"],
  ["excludedPaymentMethods", "적립 제외 결제수단"],
];

export function normalizeBasePolicyResponse(raw: RawBasePolicyResponse): BasePolicyData {
  const currentPolicy = raw?.current_policy ? normalizeBasePolicy(raw.current_policy) : null;

  return {
    currentPolicy,
    history: (raw?.history ?? []).map(normalizeBasePolicy),
    form: currentPolicy ? basePolicyToForm(currentPolicy) : defaultForm,
  };
}

export function validateBasePolicyForm(form: BasePolicyForm): string | null {
  const nameLength = form.name.trim().length;
  const earningRate = toNumber(form.earningRate);
  const maxRedeemRatio = toNumber(form.maxRedeemRatio);
  const minRedeemPoints = toInteger(form.minRedeemPoints);
  const validMonths = toInteger(form.validMonths);
  const pendingDays = toInteger(form.pendingDays);

  if (nameLength < 2 || nameLength > 50) return "정책명은 2~50자로 입력하세요.";
  if (!Number.isFinite(earningRate) || earningRate < 0 || earningRate > 100) {
    return "기본 적립률은 0~100 사이로 입력하세요.";
  }
  if (!unitValues.has(form.earnUnit)) return "적립 단위는 1, 10, 100 중 하나여야 합니다.";
  if (!roundingMethods.has(form.roundingMethod)) return "반올림 방식이 올바르지 않습니다.";
  if (!Number.isInteger(minRedeemPoints) || minRedeemPoints < 0) {
    return "최소 사용 포인트는 0 이상 정수여야 합니다.";
  }
  if (!Number.isFinite(maxRedeemRatio) || maxRedeemRatio < 0 || maxRedeemRatio > 100) {
    return "최대 사용 비율은 0~100 사이로 입력하세요.";
  }
  if (!unitValues.has(form.redeemUnit)) return "사용 단위는 1, 10, 100 중 하나여야 합니다.";
  if (!Number.isInteger(validMonths) || validMonths < 1 || validMonths > 60) {
    return "유효기간은 1~60개월로 입력하세요.";
  }
  if (!Number.isInteger(pendingDays) || pendingDays < 0 || pendingDays > 365) {
    return "확정 대기일은 0~365일로 입력하세요.";
  }
  if (form.applyMode === "scheduled") {
    const scheduledAt = new Date(form.scheduledAt);
    if (!form.scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      return "예약 적용 시간은 현재 이후여야 합니다.";
    }
  }
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function buildBasePolicyDiff(
  before: BasePolicyForm,
  after: BasePolicyForm,
): BasePolicyDiff[] {
  return diffLabels.flatMap(([key, label]) =>
    before[key] === after[key] ? [] : [{ label, before: before[key], after: after[key] }],
  );
}

export function buildSaveBasePolicyRpcArgs(form: BasePolicyForm): SaveBasePolicyRpcArgs {
  return {
    _name: form.name.trim(),
    _earning_rate: toNumber(form.earningRate),
    _earn_unit: toInteger(form.earnUnit),
    _rounding_method: form.roundingMethod,
    _min_redeem_points: toInteger(form.minRedeemPoints),
    _max_redeem_ratio: toNumber(form.maxRedeemRatio),
    _redeem_unit: toInteger(form.redeemUnit),
    _valid_months: toInteger(form.validMonths),
    _pending_days: toInteger(form.pendingDays),
    _excluded_payment_methods: parseCsv(form.excludedPaymentMethods),
    _apply_mode: form.applyMode,
    _scheduled_at: form.applyMode === "scheduled" ? form.scheduledAt : null,
    _reason: form.reason.trim(),
  };
}

export function basePolicyToForm(policy: BasePolicy): BasePolicyForm {
  return {
    name: policy.name,
    earningRate: String(policy.earningRate),
    earnUnit: String(policy.earnUnit),
    roundingMethod: policy.roundingMethod,
    minRedeemPoints: String(policy.minRedeemPoints),
    maxRedeemRatio: String(policy.maxRedeemRatio),
    redeemUnit: String(policy.redeemUnit),
    validMonths: String(policy.validMonths),
    pendingDays: String(policy.pendingDays),
    excludedPaymentMethods: policy.excludedPaymentMethods.join(", "),
    applyMode: "immediate",
    scheduledAt: "",
    reason: "",
  };
}

function normalizeBasePolicy(raw: RawBasePolicy): BasePolicy {
  const startsAt = toNullableString(raw.starts_at);
  const endsAt = toNullableString(raw.ends_at);
  const updatedAt = toNullableString(raw.updated_at);
  const roundingMethod = toStringValue(raw.rounding_method);

  return {
    id: toStringValue(raw.id),
    name: toStringValue(raw.name) || "기본 정책",
    earningRate: toNumber(raw.earning_rate),
    earnUnit: toInteger(raw.earn_unit) || 1,
    roundingMethod: roundingMethods.has(roundingMethod as RoundingMethod)
      ? (roundingMethod as RoundingMethod)
      : "floor",
    minRedeemPoints: toInteger(raw.min_redeem_points),
    maxRedeemRatio: toNumber(raw.max_redeem_ratio),
    redeemUnit: toInteger(raw.redeem_unit) || 1,
    validMonths: toInteger(raw.valid_months) || 12,
    pendingDays: toInteger(raw.pending_days),
    excludedPaymentMethods: Array.isArray(raw.excluded_payment_methods)
      ? raw.excluded_payment_methods.filter((item): item is string => typeof item === "string")
      : [],
    status: toStringValue(raw.status) || "draft",
    startsAt,
    startsAtLabel: startsAt ? formatDate(startsAt, "admin") : "-",
    endsAt,
    updatedAt,
    updatedAtLabel: updatedAt ? formatDate(updatedAt, "admin") : "-",
  };
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
