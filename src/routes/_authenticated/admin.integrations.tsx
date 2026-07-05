import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  AlertCircle,
  Activity,
  Copy,
  KeyRound,
  PlugZap,
  RefreshCw,
  RotateCw,
  Send,
  ShieldOff,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { AppTable } from "@/components/common/AppTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildCreateApiKeyRpcArgs,
  buildSaveWebhookRpcArgs,
  defaultApiKeyForm,
  defaultWebhookForm,
  integrationEventOptions,
  normalizeIntegrationResponse,
  validateApiKeyForm,
  validateWebhookForm,
  webhookToForm,
  type AdminIntegrationData,
  type ApiKeyForm,
  type CreateApiKeyRpcArgs,
  type SaveWebhookRpcArgs,
  type WebhookForm,
  type WebhookStatus,
} from "@/features/admin-integrations/integration-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";
import { cn } from "@/lib/utils";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type IntegrationRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_integrations", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "create_admin_api_key", args: CreateApiKeyRpcArgs): RpcResponse<unknown>;
  rpc(
    fn: "regenerate_admin_api_key",
    args: { _api_key_id: string; _reason: string },
  ): RpcResponse<unknown>;
  rpc(
    fn: "revoke_admin_api_key",
    args: { _api_key_id: string; _reason: string },
  ): RpcResponse<unknown>;
  rpc(fn: "save_admin_webhook", args: SaveWebhookRpcArgs): RpcResponse<unknown>;
  rpc(
    fn: "test_admin_webhook",
    args: { _webhook_id: string; _reason: string },
  ): RpcResponse<unknown>;
  rpc(
    fn: "retry_admin_webhook_log",
    args: { _log_id: string; _reason: string },
  ): RpcResponse<unknown>;
};

type MutationResult = {
  integrations: AdminIntegrationData;
  secret: string | null;
  secretKind: "api" | "webhook" | null;
};

type SecretModalState = {
  title: string;
  secret: string;
};

type ApiKey = AdminIntegrationData["apiKeys"][number];
type Webhook = AdminIntegrationData["webhooks"][number];
type FailureLog = AdminIntegrationData["failureLogs"][number];

const integrationClient = supabase as unknown as IntegrationRpcClient;
const queryKey = ["admin-integrations"] as const;
const EMPTY_INTEGRATIONS = normalizeIntegrationResponse(null);

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({ meta: [{ title: "API 연동 관리 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [apiKeyForm, setApiKeyForm] = useState<ApiKeyForm>(defaultApiKeyForm);
  const [webhookForm, setWebhookForm] = useState<WebhookForm>(defaultWebhookForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [secretModal, setSecretModal] = useState<SecretModalState | null>(null);

  const integrationsQuery = useQuery({
    queryKey,
    queryFn: fetchIntegrations,
  });

  const data = integrationsQuery.data ?? EMPTY_INTEGRATIONS;

  function applyMutationResult(result: MutationResult) {
    queryClient.setQueryData(queryKey, result.integrations);

    if (result.secret) {
      setSecretModal({
        title: result.secretKind === "webhook" ? "서명 검증 키" : "API Key",
        secret: result.secret,
      });
    }
  }

  const createApiKeyMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (result) => {
      applyMutationResult(result);
      setApiKeyForm(defaultApiKeyForm);
      setFormError(null);
      toast.success("API Key가 생성되었습니다.");
    },
    onError: (error) => setFormError(error.message),
  });

  const regenerateApiKeyMutation = useMutation({
    mutationFn: regenerateApiKey,
    onSuccess: (result) => {
      applyMutationResult(result);
      toast.success("API Key가 재발급되었습니다.");
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: (result) => {
      applyMutationResult(result);
      toast.success("API Key가 비활성화되었습니다.");
    },
    onError: (error) => toast.error(error.message),
  });

  const saveWebhookMutation = useMutation({
    mutationFn: saveWebhook,
    onSuccess: (result) => {
      applyMutationResult(result);
      setWebhookForm(defaultWebhookForm);
      setFormError(null);
      toast.success("Webhook 설정이 저장되었습니다.");
    },
    onError: (error) => setFormError(error.message),
  });

  const testWebhookMutation = useMutation({
    mutationFn: testWebhook,
    onSuccess: (result) => {
      applyMutationResult(result);
      toast.success("Webhook 테스트 전송 로그가 기록되었습니다.");
    },
    onError: (error) => toast.error(error.message),
  });

  const retryLogMutation = useMutation({
    mutationFn: retryWebhookLog,
    onSuccess: (result) => {
      applyMutationResult(result);
      toast.success("실패 로그 재시도가 기록되었습니다.");
    },
    onError: (error) => toast.error(error.message),
  });

  const apiKeyColumns = useMemo(
    () => [
      {
        key: "name",
        header: "이름",
        render: (row: ApiKey) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">{row.name}</div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.createdAtLabel}
            </div>
          </div>
        ),
      },
      {
        key: "masked",
        header: "마스킹",
        render: (row: ApiKey) => (
          <code className="rounded bg-[var(--color-slate-100)] px-2 py-1 text-xs">
            {row.maskedKey}
          </code>
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row: ApiKey) => <IntegrationStatusBadge status={row.status} />,
      },
      {
        key: "lastUsed",
        header: "마지막 사용",
        render: (row: ApiKey) => row.lastUsedAtLabel,
      },
      {
        key: "actions",
        header: "작업",
        align: "right" as const,
        render: (row: ApiKey) => (
          <div className="flex justify-end gap-1">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={regenerateApiKeyMutation.isPending}
              onClick={() =>
                regenerateApiKeyMutation.mutate({
                  id: row.id,
                  reason: `${row.name} API Key 재발급 감사 사유입니다`,
                })
              }
            >
              <RotateCw className="size-4" aria-hidden="true" />
              재발급
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={row.status === "revoked" || revokeApiKeyMutation.isPending}
              onClick={() =>
                revokeApiKeyMutation.mutate({
                  id: row.id,
                  reason: `${row.name} API Key 비활성화 감사 사유입니다`,
                })
              }
            >
              <ShieldOff className="size-4" aria-hidden="true" />
              비활성화
            </AppButton>
          </div>
        ),
      },
    ],
    [regenerateApiKeyMutation, revokeApiKeyMutation],
  );

  const webhookColumns = useMemo(
    () => [
      {
        key: "name",
        header: "Webhook",
        render: (row: Webhook) => (
          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => setWebhookForm(webhookToForm(row))}
          >
            <div className="truncate font-semibold text-[var(--color-primary-700)]">{row.name}</div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">{row.url}</div>
          </button>
        ),
      },
      {
        key: "events",
        header: "이벤트 유형",
        render: (row: Webhook) => (
          <div className="flex flex-wrap gap-1">
            {row.eventLabels.map((label) => (
              <span
                key={label}
                className="rounded bg-[var(--color-slate-100)] px-2 py-1 text-xs font-semibold"
              >
                {label}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "signing",
        header: "서명 검증 키",
        render: (row: Webhook) => (
          <code className="rounded bg-[var(--color-slate-100)] px-2 py-1 text-xs">
            {row.maskedSigningKey}
          </code>
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row: Webhook) => <StatusBadge status={row.status} type="policy" />,
      },
      {
        key: "test",
        header: "테스트",
        align: "right" as const,
        render: (row: Webhook) => (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            disabled={testWebhookMutation.isPending}
            onClick={() =>
              testWebhookMutation.mutate({
                id: row.id,
                reason: `${row.name} Webhook 테스트 전송 감사 사유입니다`,
              })
            }
          >
            <Send className="size-4" aria-hidden="true" />
            테스트 전송
          </AppButton>
        ),
      },
    ],
    [testWebhookMutation],
  );

  const failureColumns = useMemo(
    () => [
      {
        key: "request",
        header: "요청 ID",
        render: (row: FailureLog) => (
          <div className="min-w-0">
            <code className="text-xs">{row.requestId}</code>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.createdAtLabel}
            </div>
          </div>
        ),
      },
      {
        key: "webhook",
        header: "Webhook",
        render: (row: FailureLog) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.webhookName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">{row.endpoint}</div>
          </div>
        ),
      },
      {
        key: "error",
        header: "오류 코드",
        render: (row: FailureLog) => (
          <div>
            <div className="font-semibold text-[var(--color-danger-600)]">{row.errorCode}</div>
            <div className="text-xs text-[var(--color-slate-500)]">{row.errorMessage}</div>
          </div>
        ),
      },
      {
        key: "status",
        header: "상태 코드",
        align: "right" as const,
        render: (row: FailureLog) => row.statusCode ?? "-",
      },
      {
        key: "retry",
        header: "재시도",
        align: "right" as const,
        render: (row: FailureLog) => (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            disabled={!row.canRetry || retryLogMutation.isPending}
            onClick={() =>
              retryLogMutation.mutate({
                id: row.id,
                reason: `${row.requestId} Webhook 실패 로그 재시도 감사 사유입니다`,
              })
            }
          >
            <RotateCw className="size-4" aria-hidden="true" />
            재시도 {row.retryCount > 0 ? row.retryCount : ""}
          </AppButton>
        ),
      },
    ],
    [retryLogMutation],
  );

  function submitApiKey() {
    const error = validateApiKeyForm(apiKeyForm);
    if (error) {
      setFormError(error);
      return;
    }

    createApiKeyMutation.mutate(apiKeyForm);
  }

  function submitWebhook() {
    const error = validateWebhookForm(webhookForm);
    if (error) {
      setFormError(error);
      return;
    }

    saveWebhookMutation.mutate(webhookForm);
  }

  if (integrationsQuery.isLoading) {
    return <IntegrationsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">API 연동 관리</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            외부 POS, 결제, 자동화 시스템의 API Key와 Webhook 연동을 관리합니다.
          </p>
        </div>
        <AppButton
          type="button"
          variant="secondary"
          onClick={() => void integrationsQuery.refetch()}
          loading={integrationsQuery.isFetching && !integrationsQuery.isLoading}
          loadingLabel="새로고침"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          새로고침
        </AppButton>
      </header>

      {integrationsQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold">연동 정보를 불러오지 못했습니다.</div>
              <div className="mt-1">{integrationsQuery.error.message}</div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="integration-status-title">
        <h2
          id="integration-status-title"
          className="text-lg font-bold text-[var(--color-slate-900)]"
        >
          연동 상태
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard label="성공률" value={`${data.status.successRate}%`} />
          <StatusCard label="최근 실패" value={data.status.recentFailureAtLabel} />
          <StatusCard label="평균 응답시간" value={`${data.status.avgResponseTimeMs}ms`} />
          <StatusCard label="총 요청" value={data.status.totalRequests.toLocaleString("ko-KR")} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AdminPanel
          icon={<KeyRound className="size-4" aria-hidden="true" />}
          title="API Key 관리"
          description="생성된 키는 한 번만 표시되며 이후 목록에서는 마스킹됩니다."
        >
          <AppTable
            data={data.apiKeys}
            getRowKey={(row) => row.id}
            columns={apiKeyColumns}
            emptyMessage="등록된 API Key가 없습니다."
          />
        </AdminPanel>

        <AdminPanel title="API Key 생성" description="외부 시스템별로 별도 키를 발급하세요.">
          <div className="space-y-4">
            <AppInput
              label="API Key 이름"
              value={apiKeyForm.name}
              onChange={(event) =>
                setApiKeyForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="POS 운영 키"
            />
            <AppInput
              label="감사 사유"
              value={apiKeyForm.reason}
              onChange={(event) =>
                setApiKeyForm((current) => ({ ...current, reason: event.target.value }))
              }
              placeholder="외부 POS 연동 키 발급"
            />
            <AppButton
              type="button"
              className="w-full"
              loading={createApiKeyMutation.isPending}
              loadingLabel="생성 중"
              onClick={submitApiKey}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              API Key 생성
            </AppButton>
          </div>
        </AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <AdminPanel
          icon={<PlugZap className="size-4" aria-hidden="true" />}
          title="Webhook 설정"
          description="URL, 이벤트 유형, 서명 검증 키, 테스트 전송을 관리합니다."
        >
          <AppTable
            data={data.webhooks}
            getRowKey={(row) => row.id}
            columns={webhookColumns}
            emptyMessage="등록된 Webhook이 없습니다."
          />
        </AdminPanel>

        <AdminPanel
          title={webhookForm.id ? "Webhook 수정" : "Webhook 생성"}
          description="테스트 전송은 Webhook 로그에 기록됩니다."
        >
          <WebhookFormFields
            form={webhookForm}
            onChange={(patch) => setWebhookForm((current) => ({ ...current, ...patch }))}
          />
          <div className="mt-4 flex gap-2">
            <AppButton
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setWebhookForm(defaultWebhookForm)}
            >
              초기화
            </AppButton>
            <AppButton
              type="button"
              className="flex-1"
              loading={saveWebhookMutation.isPending}
              loadingLabel="저장 중"
              onClick={submitWebhook}
            >
              저장
            </AppButton>
          </div>
        </AdminPanel>
      </section>

      <AdminPanel
        icon={<Activity className="size-4" aria-hidden="true" />}
        title="실패 로그"
        description="요청 ID, 오류 코드, 재시도 현황을 확인합니다."
      >
        <AppTable
          data={data.failureLogs}
          getRowKey={(row) => row.id}
          columns={failureColumns}
          emptyMessage="실패 로그가 없습니다."
        />
      </AdminPanel>

      {formError && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm font-semibold text-[var(--color-error-text)]">
          {formError}
        </section>
      )}

      <AppModal
        open={Boolean(secretModal)}
        onOpenChange={(open) => !open && setSecretModal(null)}
        title={secretModal?.title ?? "Secret"}
        description="한 번만 표시됩니다. 닫으면 다시 확인할 수 없습니다."
        footer={
          <>
            <AppButton type="button" variant="secondary" onClick={() => setSecretModal(null)}>
              닫기
            </AppButton>
            <AppButton type="button" onClick={() => void copySecret(secretModal?.secret ?? "")}>
              <Copy className="size-4" aria-hidden="true" />
              복사
            </AppButton>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-warning-500)]/40 bg-[var(--color-pending-bg)] p-3 text-sm font-semibold text-[var(--color-pending-text)]">
            이 값은 저장 후 다시 표시되지 않습니다.
          </div>
          <code className="block overflow-auto rounded-lg bg-[var(--color-slate-950)] p-4 text-xs text-white">
            {secretModal?.secret}
          </code>
        </div>
      </AppModal>
    </div>
  );
}

function WebhookFormFields({
  form,
  onChange,
}: {
  form: WebhookForm;
  onChange: (patch: Partial<WebhookForm>) => void;
}) {
  function toggleEvent(value: (typeof integrationEventOptions)[number]["value"]) {
    const hasValue = form.eventTypes.includes(value);
    onChange({
      eventTypes: hasValue
        ? form.eventTypes.filter((eventType) => eventType !== value)
        : [...form.eventTypes, value],
    });
  }

  return (
    <div className="space-y-4">
      <AppInput
        label="Webhook 이름"
        value={form.name}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="결제 Webhook"
      />
      <AppInput
        label="Webhook URL"
        value={form.url}
        onChange={(event) => onChange({ url: event.target.value })}
        placeholder="https://example.com/hooks/points"
      />
      <label className="space-y-1.5">
        <span className="block text-sm font-semibold text-[var(--color-slate-700)]">상태</span>
        <select
          value={form.status}
          onChange={(event) => onChange({ status: event.target.value as WebhookStatus })}
          className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
        >
          <option value="active">활성</option>
          <option value="paused">일시중지</option>
          <option value="disabled">비활성</option>
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[var(--color-slate-700)]">이벤트 유형</legend>
        <div className="grid gap-2">
          {integrationEventOptions.map((option) => (
            <label
              key={option.value}
              className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-slate-200)] px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={form.eventTypes.includes(option.value)}
                onChange={() => toggleEvent(option.value)}
                className="size-4"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      {form.id && (
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-slate-200)] px-3 text-sm font-semibold text-[var(--color-slate-700)]">
          <input
            type="checkbox"
            checked={form.rotateSigningKey}
            onChange={(event) => onChange({ rotateSigningKey: event.target.checked })}
            className="size-4"
          />
          서명 검증 키 재발급
        </label>
      )}
      <AppInput
        label="감사 사유"
        value={form.reason}
        onChange={(event) => onChange({ reason: event.target.value })}
        placeholder="Webhook 설정 변경"
      />
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-[var(--color-slate-500)]">{label}</div>
      <div className="mt-3 text-2xl font-bold tabular-nums text-[var(--color-slate-900)]">
        {value}
      </div>
    </article>
  );
}

function AdminPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white shadow-sm">
      <div className="flex min-h-16 items-center gap-3 border-b border-[var(--color-slate-200)] px-5 py-4">
        {icon && (
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-slate-100)] text-[var(--color-slate-700)]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function IntegrationStatusBadge({ status }: { status: string }) {
  const isActive = status === "active";

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-bold",
        isActive
          ? "bg-[var(--color-earn-bg)] text-[var(--color-earn-text)]"
          : "bg-[var(--color-slate-100)] text-[var(--color-slate-500)]",
      )}
    >
      {isActive ? "활성" : "비활성"}
    </span>
  );
}

function IntegrationsSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg bg-[var(--color-slate-200)]" />
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-[460px] rounded-lg bg-[var(--color-slate-200)]" />
        <Skeleton className="h-[460px] rounded-lg bg-[var(--color-slate-200)]" />
      </section>
    </div>
  );
}

async function fetchIntegrations(): Promise<AdminIntegrationData> {
  const { data, error } = await integrationClient.rpc("get_admin_integrations", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeIntegrationResponse(data);
}

async function createApiKey(form: ApiKeyForm): Promise<MutationResult> {
  const { data, error } = await integrationClient.rpc(
    "create_admin_api_key",
    buildCreateApiKeyRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data, "api");
}

async function regenerateApiKey({
  id,
  reason,
}: {
  id: string;
  reason: string;
}): Promise<MutationResult> {
  const { data, error } = await integrationClient.rpc("regenerate_admin_api_key", {
    _api_key_id: id,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data, "api");
}

async function revokeApiKey({
  id,
  reason,
}: {
  id: string;
  reason: string;
}): Promise<MutationResult> {
  const { data, error } = await integrationClient.rpc("revoke_admin_api_key", {
    _api_key_id: id,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data, null);
}

async function saveWebhook(form: WebhookForm): Promise<MutationResult> {
  const { data, error } = await integrationClient.rpc(
    "save_admin_webhook",
    buildSaveWebhookRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data, "webhook");
}

async function testWebhook({
  id,
  reason,
}: {
  id: string;
  reason: string;
}): Promise<MutationResult> {
  const { data, error } = await integrationClient.rpc("test_admin_webhook", {
    _webhook_id: id,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data, null);
}

async function retryWebhookLog({
  id,
  reason,
}: {
  id: string;
  reason: string;
}): Promise<MutationResult> {
  const { data, error } = await integrationClient.rpc("retry_admin_webhook_log", {
    _log_id: id,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data, null);
}

function normalizeMutationResult(
  data: unknown,
  expectedSecretKind: MutationResult["secretKind"],
): MutationResult {
  if (!isRecord(data)) {
    return { integrations: normalizeIntegrationResponse(data), secret: null, secretKind: null };
  }

  const integrations = normalizeIntegrationResponse(data.integrations ?? data);
  const apiSecret = typeof data.api_key_secret === "string" ? data.api_key_secret : null;
  const webhookSecret = typeof data.webhook_secret === "string" ? data.webhook_secret : null;
  const rawSecret = expectedSecretKind === "webhook" ? webhookSecret : apiSecret;

  return {
    integrations,
    secret: rawSecret,
    secretKind: rawSecret ? expectedSecretKind : null,
  };
}

async function copySecret(secret: string) {
  if (!secret) return;

  await navigator.clipboard.writeText(secret);
  toast.success("복사되었습니다.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
