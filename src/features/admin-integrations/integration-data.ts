import { formatDate } from "@/lib/formatters";

export type ApiKeyStatus = "active" | "revoked";
export type WebhookStatus = "active" | "paused" | "disabled";
export type IntegrationEventType =
  "point.earned" | "point.used" | "point.canceled" | "customer.updated" | "event.rewarded";

export type ApiKeyForm = {
  name: string;
  reason: string;
};

export type WebhookForm = {
  id: string | null;
  name: string;
  url: string;
  eventTypes: IntegrationEventType[];
  status: WebhookStatus;
  rotateSigningKey: boolean;
  reason: string;
};

export type CreateApiKeyRpcArgs = {
  _name: string;
  _reason: string;
};

export type SaveWebhookRpcArgs = {
  _webhook_id: string | null;
  _name: string;
  _url: string;
  _event_types: IntegrationEventType[];
  _status: WebhookStatus;
  _rotate_signing_key: boolean;
  _reason: string;
};

type RawIntegrationResponse = {
  api_keys?: RawApiKey[];
  webhooks?: RawWebhook[];
  status?: RawIntegrationStatus;
  failure_logs?: RawFailureLog[];
} | null;

type RawApiKey = {
  id?: unknown;
  name?: unknown;
  key_prefix?: unknown;
  key_suffix?: unknown;
  status?: unknown;
  last_used_at?: unknown;
  created_at?: unknown;
};

type RawWebhook = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  event_types?: unknown;
  signing_key_prefix?: unknown;
  signing_key_suffix?: unknown;
  status?: unknown;
  last_tested_at?: unknown;
  created_at?: unknown;
};

type RawIntegrationStatus = {
  total_requests?: unknown;
  success_count?: unknown;
  failure_count?: unknown;
  success_rate?: unknown;
  avg_response_time_ms?: unknown;
  recent_failure_at?: unknown;
};

type RawFailureLog = {
  id?: unknown;
  webhook_id?: unknown;
  webhook_name?: unknown;
  request_id?: unknown;
  endpoint?: unknown;
  status_code?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  response_time_ms?: unknown;
  retry_count?: unknown;
  created_at?: unknown;
};

export type AdminIntegrationData = {
  apiKeys: Array<{
    id: string;
    name: string;
    maskedKey: string;
    status: ApiKeyStatus;
    lastUsedAt: string | null;
    lastUsedAtLabel: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  webhooks: Array<{
    id: string;
    name: string;
    url: string;
    eventTypes: IntegrationEventType[];
    eventLabels: string[];
    maskedSigningKey: string;
    status: WebhookStatus;
    lastTestedAt: string | null;
    lastTestedAtLabel: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  status: {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseTimeMs: number;
    recentFailureAt: string | null;
    recentFailureAtLabel: string;
  };
  failureLogs: Array<{
    id: string;
    webhookId: string | null;
    webhookName: string;
    requestId: string;
    endpoint: string;
    statusCode: number | null;
    errorCode: string;
    errorMessage: string;
    responseTimeMs: number | null;
    retryCount: number;
    createdAt: string;
    createdAtLabel: string;
    canRetry: boolean;
  }>;
};

export const integrationEventOptions: Array<{ value: IntegrationEventType; label: string }> = [
  { value: "point.earned", label: "포인트 적립" },
  { value: "point.used", label: "포인트 사용" },
  { value: "point.canceled", label: "포인트 취소" },
  { value: "customer.updated", label: "고객 정보 변경" },
  { value: "event.rewarded", label: "이벤트 지급" },
];

export const defaultApiKeyForm: ApiKeyForm = {
  name: "",
  reason: "",
};

export const defaultWebhookForm: WebhookForm = {
  id: null,
  name: "",
  url: "",
  eventTypes: ["point.earned"],
  status: "active",
  rotateSigningKey: false,
  reason: "",
};

const apiKeyStatuses = new Set<ApiKeyStatus>(["active", "revoked"]);
const webhookStatuses = new Set<WebhookStatus>(["active", "paused", "disabled"]);
const integrationEventValues = new Set(integrationEventOptions.map((option) => option.value));

export function normalizeIntegrationResponse(raw: RawIntegrationResponse): AdminIntegrationData {
  return {
    apiKeys: (raw?.api_keys ?? []).map((item) => {
      const status = toStringValue(item.status);
      const lastUsedAt = toNullableString(item.last_used_at);
      const createdAt = toStringValue(item.created_at);

      return {
        id: toStringValue(item.id),
        name: toStringValue(item.name) || "-",
        maskedKey: maskSecret(toStringValue(item.key_prefix), toStringValue(item.key_suffix)),
        status: apiKeyStatuses.has(status as ApiKeyStatus) ? (status as ApiKeyStatus) : "revoked",
        lastUsedAt,
        lastUsedAtLabel: lastUsedAt ? formatDate(lastUsedAt, "admin") : "-",
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
      };
    }),
    webhooks: (raw?.webhooks ?? []).map((item) => {
      const status = toStringValue(item.status);
      const eventTypes = normalizeEventTypes(item.event_types);
      const lastTestedAt = toNullableString(item.last_tested_at);
      const createdAt = toStringValue(item.created_at);

      return {
        id: toStringValue(item.id),
        name: toStringValue(item.name) || "-",
        url: toStringValue(item.url),
        eventTypes,
        eventLabels: eventTypes.map(getIntegrationEventLabel),
        maskedSigningKey: maskSecret(
          toStringValue(item.signing_key_prefix),
          toStringValue(item.signing_key_suffix),
        ),
        status: webhookStatuses.has(status as WebhookStatus)
          ? (status as WebhookStatus)
          : "disabled",
        lastTestedAt,
        lastTestedAtLabel: lastTestedAt ? formatDate(lastTestedAt, "admin") : "-",
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
      };
    }),
    status: normalizeStatus(raw?.status),
    failureLogs: (raw?.failure_logs ?? []).map((item) => {
      const statusCode = toNullableNumber(item.status_code);
      const createdAt = toStringValue(item.created_at);
      const errorCode = toStringValue(item.error_code);
      const errorMessage = toStringValue(item.error_message);

      return {
        id: toStringValue(item.id),
        webhookId: toNullableString(item.webhook_id),
        webhookName: toStringValue(item.webhook_name) || "-",
        requestId: toStringValue(item.request_id),
        endpoint: toStringValue(item.endpoint),
        statusCode,
        errorCode: errorCode || "-",
        errorMessage: errorMessage || "-",
        responseTimeMs: toNullableNumber(item.response_time_ms),
        retryCount: toNumber(item.retry_count),
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
        canRetry: Boolean(errorCode || errorMessage || (statusCode !== null && statusCode >= 400)),
      };
    }),
  };
}

export function apiKeyToForm(): ApiKeyForm {
  return { ...defaultApiKeyForm };
}

export function webhookToForm(webhook: AdminIntegrationData["webhooks"][number]): WebhookForm {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    eventTypes: webhook.eventTypes,
    status: webhook.status,
    rotateSigningKey: false,
    reason: "",
  };
}

export function validateApiKeyForm(form: ApiKeyForm): string | null {
  const name = form.name.trim();

  if (name.length < 2 || name.length > 50) return "API Key 이름은 2~50자로 입력하세요.";
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function validateWebhookForm(form: WebhookForm): string | null {
  const name = form.name.trim();
  const url = form.url.trim();

  if (name.length < 2 || name.length > 50) return "Webhook 이름은 2~50자로 입력하세요.";
  if (!url.startsWith("https://")) return "Webhook URL은 https://로 시작해야 합니다.";
  if (form.eventTypes.length === 0) return "Webhook 이벤트 유형을 1개 이상 선택하세요.";
  if (form.eventTypes.some((eventType) => !integrationEventValues.has(eventType))) {
    return "지원하지 않는 Webhook 이벤트 유형이 포함되어 있습니다.";
  }
  if (!webhookStatuses.has(form.status)) return "Webhook 상태가 올바르지 않습니다.";
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function buildCreateApiKeyRpcArgs(form: ApiKeyForm): CreateApiKeyRpcArgs {
  return {
    _name: form.name.trim(),
    _reason: form.reason.trim(),
  };
}

export function buildSaveWebhookRpcArgs(form: WebhookForm): SaveWebhookRpcArgs {
  return {
    _webhook_id: form.id,
    _name: form.name.trim(),
    _url: form.url.trim(),
    _event_types: normalizeEventTypes(form.eventTypes),
    _status: form.status,
    _rotate_signing_key: form.rotateSigningKey,
    _reason: form.reason.trim(),
  };
}

export function maskSecret(prefix: string, suffix: string): string {
  if (!prefix || !suffix) return "-";
  return `${prefix}••••${suffix}`;
}

export function getIntegrationEventLabel(eventType: string): string {
  return integrationEventOptions.find((option) => option.value === eventType)?.label ?? eventType;
}

function normalizeStatus(value: RawIntegrationStatus | undefined) {
  const recentFailureAt = toNullableString(value?.recent_failure_at);

  return {
    totalRequests: toNumber(value?.total_requests),
    successCount: toNumber(value?.success_count),
    failureCount: toNumber(value?.failure_count),
    successRate: toNumber(value?.success_rate),
    avgResponseTimeMs: toNumber(value?.avg_response_time_ms),
    recentFailureAt,
    recentFailureAtLabel: recentFailureAt ? formatDate(recentFailureAt, "admin") : "-",
  };
}

function normalizeEventTypes(value: unknown): IntegrationEventType[] {
  const values = Array.isArray(value) ? value : [];

  return Array.from(
    new Set(
      values.filter(
        (item): item is IntegrationEventType =>
          typeof item === "string" && integrationEventValues.has(item as IntegrationEventType),
      ),
    ),
  );
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
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toStringValue(value);
  return normalized || null;
}
