import { formatDate, formatPoint } from "@/lib/formatters";

export type AdminEventStatus = "draft" | "scheduled" | "active" | "paused" | "ended" | "disabled";
export type AdminEventRewardType = "rate" | "fixed";

export type EventTargetRules = {
  tierIds: string[];
  segments: string[];
  productIds: string[];
  categoryIds: string[];
};

type RawEventResponse = {
  events?: RawEvent[];
  overlap_events?: unknown[];
} | null;

type RawEvent = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  status?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  target_rules?: unknown;
  reward_type?: unknown;
  reward_value?: unknown;
  customer_limit?: unknown;
  total_budget_points?: unknown;
  spent_points?: unknown;
  priority?: unknown;
  updated_at?: unknown;
};

type RawTargetRules = {
  tier_ids?: unknown;
  segments?: unknown;
  product_ids?: unknown;
  category_ids?: unknown;
};

export type AdminEvent = {
  id: string;
  name: string;
  description: string;
  status: AdminEventStatus;
  startsAt: string;
  startsAtLabel: string;
  endsAt: string | null;
  endsAtLabel: string;
  targetRules: EventTargetRules;
  targetSummary: string;
  rewardType: AdminEventRewardType;
  rewardValue: number;
  rewardLabel: string;
  customerLimit: number | null;
  totalBudgetPoints: number | null;
  spentPoints: number;
  budgetUsageRate: number;
  priority: number;
  updatedAt: string | null;
  updatedAtLabel: string;
};

export type EventWizardForm = {
  id: string | null;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  tierIds: string[];
  segments: string[];
  productIds: string[];
  categoryIds: string[];
  rewardType: AdminEventRewardType;
  rewardValue: string;
  customerLimit: string;
  totalBudgetPoints: string;
  priority: string;
  status: AdminEventStatus;
  reason: string;
};

export type EventData = {
  events: AdminEvent[];
  overlapEvents: unknown[];
};

export type SaveEventRpcArgs = {
  _event_id: string | null;
  _name: string;
  _description: string;
  _starts_at: string;
  _ends_at: string | null;
  _target_rules: {
    tier_ids: string[];
    segments: string[];
    product_ids: string[];
    category_ids: string[];
  };
  _reward_type: AdminEventRewardType;
  _reward_value: number;
  _customer_limit: number | null;
  _total_budget_points: number | null;
  _priority: number;
  _status: AdminEventStatus;
  _reason: string;
};

export const emptyEventWizardForm: EventWizardForm = {
  id: null,
  name: "",
  description: "",
  startsAt: "",
  endsAt: "",
  tierIds: [],
  segments: [],
  productIds: [],
  categoryIds: [],
  rewardType: "rate",
  rewardValue: "1",
  customerLimit: "",
  totalBudgetPoints: "",
  priority: "100",
  status: "scheduled",
  reason: "",
};

const statusValues = new Set<AdminEventStatus>([
  "draft",
  "scheduled",
  "active",
  "paused",
  "ended",
  "disabled",
]);
const rewardTypes = new Set<AdminEventRewardType>(["rate", "fixed"]);
const overlapStatuses = new Set<AdminEventStatus>(["scheduled", "active", "paused"]);

export function normalizeEventResponse(raw: RawEventResponse): EventData {
  return {
    events: (raw?.events ?? []).map(normalizeEvent),
    overlapEvents: raw?.overlap_events ?? [],
  };
}

export function eventToForm(event: AdminEvent): EventWizardForm {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    startsAt: toDatetimeLocal(event.startsAt),
    endsAt: toDatetimeLocal(event.endsAt),
    tierIds: event.targetRules.tierIds,
    segments: event.targetRules.segments,
    productIds: event.targetRules.productIds,
    categoryIds: event.targetRules.categoryIds,
    rewardType: event.rewardType,
    rewardValue: String(event.rewardValue),
    customerLimit: event.customerLimit === null ? "" : String(event.customerLimit),
    totalBudgetPoints: event.totalBudgetPoints === null ? "" : String(event.totalBudgetPoints),
    priority: String(event.priority),
    status: event.status,
    reason: "",
  };
}

export function validateEventWizardForm(
  form: EventWizardForm,
  _existingEvents: AdminEvent[],
): string | null {
  const name = form.name.trim();
  const startsAt = form.startsAt ? new Date(form.startsAt) : null;
  const endsAt = form.endsAt ? new Date(form.endsAt) : null;
  const rewardValue = toNumber(form.rewardValue);
  const customerLimit = toOptionalInteger(form.customerLimit);
  const totalBudgetPoints = toOptionalInteger(form.totalBudgetPoints);
  const priority = toInteger(form.priority);

  if (name.length < 2 || name.length > 50) return "이벤트명은 2~50자로 입력하세요.";
  if (!startsAt || Number.isNaN(startsAt.getTime())) return "이벤트 시작일을 입력하세요.";
  if (endsAt && endsAt < startsAt) return "종료일은 시작일 이후여야 합니다.";
  if (!rewardTypes.has(form.rewardType)) return "지급 방식이 올바르지 않습니다.";
  if (!Number.isFinite(rewardValue) || rewardValue <= 0) return "지급 값은 0보다 커야 합니다.";
  if (form.rewardType === "rate" && rewardValue > 100) {
    return "추가 적립률은 100 이하로 입력하세요.";
  }
  if (form.customerLimit && (!Number.isInteger(customerLimit) || customerLimit === null)) {
    return "고객당 한도는 정수로 입력하세요.";
  }
  if (customerLimit !== null && customerLimit <= 0) return "고객당 한도는 1 이상이어야 합니다.";
  if (
    form.totalBudgetPoints &&
    (!Number.isInteger(totalBudgetPoints) || totalBudgetPoints === null)
  ) {
    return "전체 예산은 정수로 입력하세요.";
  }
  if (totalBudgetPoints !== null && totalBudgetPoints < 0) {
    return "전체 예산은 0 이상이어야 합니다.";
  }
  if (!Number.isInteger(priority) || priority < 1 || priority > 999) {
    return "우선순위는 1~999 사이 정수로 입력하세요.";
  }
  if (!statusValues.has(form.status)) return "이벤트 상태가 올바르지 않습니다.";
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function findOverlappingEvents(form: EventWizardForm, events: AdminEvent[]): AdminEvent[] {
  if (!form.startsAt) return [];

  const startsAt = new Date(form.startsAt);
  const endsAt = form.endsAt ? new Date(form.endsAt) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) return [];

  return events.filter((event) => {
    if (event.id === form.id || !overlapStatuses.has(event.status)) return false;
    const eventStartsAt = new Date(event.startsAt);
    const eventEndsAt = event.endsAt ? new Date(event.endsAt) : null;
    return rangesOverlap(startsAt, endsAt, eventStartsAt, eventEndsAt);
  });
}

export function buildSaveEventRpcArgs(form: EventWizardForm): SaveEventRpcArgs {
  return {
    _event_id: form.id,
    _name: form.name.trim(),
    _description: form.description.trim(),
    _starts_at: form.startsAt,
    _ends_at: form.endsAt || null,
    _target_rules: {
      tier_ids: normalizeIds(form.tierIds),
      segments: normalizeIds(form.segments),
      product_ids: normalizeIds(form.productIds),
      category_ids: normalizeIds(form.categoryIds),
    },
    _reward_type: form.rewardType,
    _reward_value: toNumber(form.rewardValue),
    _customer_limit: toOptionalInteger(form.customerLimit),
    _total_budget_points: toOptionalInteger(form.totalBudgetPoints),
    _priority: toInteger(form.priority),
    _status: form.status,
    _reason: form.reason.trim(),
  };
}

export function parseCsvIds(value: string): string[] {
  return normalizeIds(value.split(","));
}

export function joinCsvIds(value: string[]): string {
  return value.join(", ");
}

function normalizeEvent(raw: RawEvent): AdminEvent {
  const startsAt = toStringValue(raw.starts_at);
  const endsAt = toNullableString(raw.ends_at);
  const updatedAt = toNullableString(raw.updated_at);
  const status = toStringValue(raw.status);
  const rewardType = toStringValue(raw.reward_type);
  const targetRules = normalizeTargetRules(raw.target_rules);
  const totalBudgetPoints = toNullableInteger(raw.total_budget_points);
  const spentPoints = toInteger(raw.spent_points);

  return {
    id: toStringValue(raw.id),
    name: toStringValue(raw.name),
    description: toStringValue(raw.description),
    status: statusValues.has(status as AdminEventStatus) ? (status as AdminEventStatus) : "draft",
    startsAt,
    startsAtLabel: startsAt ? formatDate(startsAt, "admin") : "-",
    endsAt,
    endsAtLabel: endsAt ? formatDate(endsAt, "admin") : "종료일 없음",
    targetRules,
    targetSummary: summarizeTargetRules(targetRules),
    rewardType: rewardTypes.has(rewardType as AdminEventRewardType)
      ? (rewardType as AdminEventRewardType)
      : "rate",
    rewardValue: toNumber(raw.reward_value),
    rewardLabel: formatRewardLabel(rewardType, toNumber(raw.reward_value)),
    customerLimit: toNullableInteger(raw.customer_limit),
    totalBudgetPoints,
    spentPoints,
    budgetUsageRate:
      totalBudgetPoints && totalBudgetPoints > 0
        ? Math.min(100, Math.round((spentPoints / totalBudgetPoints) * 100))
        : 0,
    priority: toInteger(raw.priority),
    updatedAt,
    updatedAtLabel: updatedAt ? formatDate(updatedAt, "admin") : "-",
  };
}

function normalizeTargetRules(value: unknown): EventTargetRules {
  const raw = isRecord(value) ? (value as RawTargetRules) : {};

  return {
    tierIds: normalizeUnknownArray(raw.tier_ids),
    segments: normalizeUnknownArray(raw.segments),
    productIds: normalizeUnknownArray(raw.product_ids),
    categoryIds: normalizeUnknownArray(raw.category_ids),
  };
}

function summarizeTargetRules(rules: EventTargetRules): string {
  const parts = [
    ["등급", rules.tierIds.length],
    ["세그먼트", rules.segments.length],
    ["상품", rules.productIds.length],
    ["카테고리", rules.categoryIds.length],
  ].flatMap(([label, count]) => (count ? [`${label} ${count}개`] : []));

  return parts.length > 0 ? parts.join(" · ") : "전체 고객";
}

function formatRewardLabel(type: string, value: number): string {
  return type === "fixed" ? `고정 ${formatPoint(value)}` : `추가 적립률 ${value}%`;
}

function rangesOverlap(startA: Date, endA: Date | null, startB: Date, endB: Date | null): boolean {
  const endATime = endA?.getTime() ?? Number.POSITIVE_INFINITY;
  const endBTime = endB?.getTime() ?? Number.POSITIVE_INFINITY;
  return startA.getTime() <= endBTime && startB.getTime() <= endATime;
}

function normalizeUnknownArray(value: unknown): string[] {
  return Array.isArray(value)
    ? normalizeIds(value.filter((item): item is string => typeof item === "string"))
    : [];
}

function normalizeIds(value: string[]): string[] {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function toDatetimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function toOptionalInteger(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toInteger(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toStringValue(value);
  return normalized || null;
}
