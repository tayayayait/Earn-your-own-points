import { describe, expect, it } from "vitest";

import {
  buildCreateApiKeyRpcArgs,
  buildSaveWebhookRpcArgs,
  defaultWebhookForm,
  integrationEventOptions,
  maskSecret,
  normalizeIntegrationResponse,
  validateApiKeyForm,
  validateWebhookForm,
  type ApiKeyForm,
  type WebhookForm,
} from "./integration-data";

describe("admin integration data helpers", () => {
  it("normalizes masked API keys, webhooks, status metrics, and failure logs", () => {
    const data = normalizeIntegrationResponse({
      api_keys: [
        {
          id: "key-1",
          name: "POS 운영 키",
          key_prefix: "ak_live_12",
          key_suffix: "9abc",
          status: "active",
          last_used_at: "2026-07-04T01:00:00+09:00",
          created_at: "2026-07-03T01:00:00+09:00",
        },
      ],
      webhooks: [
        {
          id: "webhook-1",
          name: "결제 Webhook",
          url: "https://example.com/hooks/points",
          event_types: ["point.earned", "point.used"],
          signing_key_prefix: "whsec_12",
          signing_key_suffix: "abcd",
          status: "active",
          last_tested_at: "2026-07-04T02:00:00+09:00",
          created_at: "2026-07-03T02:00:00+09:00",
        },
      ],
      status: {
        total_requests: "20",
        success_count: "18",
        failure_count: "2",
        success_rate: "90",
        avg_response_time_ms: "123",
        recent_failure_at: "2026-07-04T03:00:00+09:00",
      },
      failure_logs: [
        {
          id: "log-1",
          webhook_id: "webhook-1",
          webhook_name: "결제 Webhook",
          request_id: "req-1",
          endpoint: "https://example.com/hooks/points",
          status_code: "500",
          error_code: "HTTP_500",
          error_message: "server error",
          response_time_ms: "900",
          retry_count: "1",
          created_at: "2026-07-04T03:00:00+09:00",
        },
      ],
    });

    expect(data.apiKeys[0]).toMatchObject({
      id: "key-1",
      maskedKey: "ak_live_12••••9abc",
      status: "active",
    });
    expect(data.webhooks[0]).toMatchObject({
      eventLabels: ["포인트 적립", "포인트 사용"],
      maskedSigningKey: "whsec_12••••abcd",
    });
    expect(data.status).toMatchObject({
      totalRequests: 20,
      successRate: 90,
      avgResponseTimeMs: 123,
    });
    expect(data.failureLogs[0]).toMatchObject({
      errorCode: "HTTP_500",
      canRetry: true,
    });
  });

  it("validates API key names and maps create args", () => {
    const invalid: ApiKeyForm = { name: "A", reason: "충분한 감사 사유입니다" };
    expect(validateApiKeyForm(invalid)).toBe("API Key 이름은 2~50자로 입력하세요.");

    const valid: ApiKeyForm = { name: "POS 운영 키", reason: "POS 연동 키 발급 사유입니다" };
    expect(validateApiKeyForm(valid)).toBeNull();
    expect(buildCreateApiKeyRpcArgs(valid)).toEqual({
      _name: "POS 운영 키",
      _reason: "POS 연동 키 발급 사유입니다",
    });
  });

  it("validates webhook URL, events, status, and maps save args", () => {
    const invalid: WebhookForm = {
      ...defaultWebhookForm,
      name: "결제",
      url: "http://example.com/hook",
      eventTypes: ["point.earned"],
      reason: "Webhook 저장 사유입니다",
    };
    expect(validateWebhookForm(invalid)).toBe("Webhook URL은 https://로 시작해야 합니다.");

    const valid: WebhookForm = {
      id: "webhook-1",
      name: "결제 Webhook",
      url: "https://example.com/hook",
      eventTypes: ["point.earned", "point.used"],
      status: "active",
      rotateSigningKey: true,
      reason: "Webhook 설정 변경 사유입니다",
    };

    expect(validateWebhookForm(valid)).toBeNull();
    expect(buildSaveWebhookRpcArgs(valid)).toEqual({
      _webhook_id: "webhook-1",
      _name: "결제 Webhook",
      _url: "https://example.com/hook",
      _event_types: ["point.earned", "point.used"],
      _status: "active",
      _rotate_signing_key: true,
      _reason: "Webhook 설정 변경 사유입니다",
    });
  });

  it("exposes the supported event options and masks short or missing secrets", () => {
    expect(integrationEventOptions.map((option) => option.value)).toEqual([
      "point.earned",
      "point.used",
      "point.canceled",
      "customer.updated",
      "event.rewarded",
    ]);
    expect(maskSecret("ak_live_12", "9abc")).toBe("ak_live_12••••9abc");
    expect(maskSecret("", "")).toBe("-");
  });
});
