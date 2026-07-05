import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { Ban, Plus, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { AppTable } from "@/components/common/AppTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSaveProductPolicyRpcArgs,
  emptyProductPolicyForm,
  normalizeProductPolicyResponse,
  normalizeProductPolicyTargetOptions,
  productPolicyToForm,
  validateProductPolicyForm,
  type ProductPolicy,
  type ProductPolicyData,
  type ProductPolicyForm,
  type ProductPolicyTargetOption,
  type ProductPolicyTargetType,
  type SaveProductPolicyRpcArgs,
} from "@/features/admin-policies/product-policy-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

const TARGET_SEARCH_DEBOUNCE_MS = 300;
const EMPTY_POLICIES: ProductPolicy[] = [];
const EMPTY_TARGET_OPTIONS: ProductPolicyTargetOption[] = [];

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type AdminProductPolicyRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_product_policies", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "save_admin_product_policy", args: SaveProductPolicyRpcArgs): RpcResponse<unknown>;
  rpc(
    fn: "disable_admin_product_policy",
    args: { _policy_id: string; _reason: string },
  ): RpcResponse<unknown>;
  rpc(
    fn: "search_admin_policy_targets",
    args: { _target_type: ProductPolicyTargetType; _query: string | null; _limit: number },
  ): RpcResponse<unknown>;
};

const adminProductPolicyClient = supabase as unknown as AdminProductPolicyRpcClient;

export const Route = createFileRoute("/_authenticated/admin/policies/products")({
  head: () => ({ meta: [{ title: "상품/카테고리 정책 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductPolicyForm>(emptyProductPolicyForm);
  const [targetQuery, setTargetQuery] = useState("");
  const debouncedTargetQuery = useDebouncedValue(targetQuery, TARGET_SEARCH_DEBOUNCE_MS);
  const [formError, setFormError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<ProductPolicy | null>(null);
  const [disableReason, setDisableReason] = useState("");

  const policiesQuery = useQuery({
    queryKey: ["admin-product-policies"],
    queryFn: fetchProductPolicies,
  });

  const policies = policiesQuery.data?.policies ?? EMPTY_POLICIES;

  const targetOptionsQuery = useQuery({
    queryKey: ["admin-policy-targets", form.targetType, debouncedTargetQuery],
    queryFn: () => searchPolicyTargets(form.targetType, debouncedTargetQuery),
    enabled: debouncedTargetQuery.trim().length >= 2,
  });

  const targetOptions = targetOptionsQuery.data ?? EMPTY_TARGET_OPTIONS;

  const saveMutation = useMutation({
    mutationFn: saveProductPolicy,
    onSuccess: () => {
      toast.success("상품/카테고리 정책이 저장되었습니다.");
      setForm(emptyProductPolicyForm);
      setTargetQuery("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-product-policies"] });
    },
    onError: (error) => setFormError(error.message),
  });

  const disableMutation = useMutation({
    mutationFn: disableProductPolicy,
    onSuccess: () => {
      toast.success("상품/카테고리 정책이 비활성화되었습니다.");
      setDisableTarget(null);
      setDisableReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin-product-policies"] });
    },
    onError: (error) => setFormError(error.message),
  });

  function updateForm(patch: Partial<ProductPolicyForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function startCreate() {
    setForm(emptyProductPolicyForm);
    setTargetQuery("");
    setFormError(null);
  }

  function addTarget(targetId: string) {
    const normalized = targetId.trim();
    if (!normalized) return;

    setForm((current) => ({
      ...current,
      targetIds: Array.from(new Set([...current.targetIds, normalized])),
    }));
    setTargetQuery("");
  }

  function removeTarget(targetId: string) {
    setForm((current) => ({
      ...current,
      targetIds: current.targetIds.filter((item) => item !== targetId),
    }));
  }

  function submit() {
    const validationError = validateProductPolicyForm(form, policies);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    saveMutation.mutate(form);
  }

  function confirmDisable() {
    if (!disableTarget) return;
    if (disableReason.trim().length < 10) {
      setFormError("감사 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    disableMutation.mutate({ policyId: disableTarget.id, reason: disableReason });
  }

  if (policiesQuery.isLoading) {
    return <Skeleton className="h-[560px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">상품/카테고리 정책</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            상품 또는 카테고리 단위의 적립률, 적용 기간, 우선순위, 적립 제외 정책을 관리합니다.
          </p>
        </div>
        <AppButton type="button" onClick={startCreate}>
          <Plus className="size-4" aria-hidden="true" />새 정책
        </AppButton>
      </header>

      {policiesQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">상품/카테고리 정책을 불러오지 못했습니다.</div>
          <div className="mt-1">{policiesQuery.error.message}</div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-[var(--color-slate-900)]">정책 목록</h2>
          <AppTable
            data={policies}
            getRowKey={(row) => row.id}
            emptyMessage="등록된 상품/카테고리 정책이 없습니다."
            columns={[
              {
                key: "name",
                header: "정책명",
                render: (row) => (
                  <button
                    type="button"
                    className="font-semibold text-[var(--color-primary-700)] hover:underline"
                    onClick={() => {
                      setForm(productPolicyToForm(row));
                      setTargetQuery("");
                      setFormError(null);
                    }}
                  >
                    {row.name}
                  </button>
                ),
              },
              {
                key: "targetType",
                header: "대상 유형",
                render: (row) => (row.targetType === "product" ? "상품" : "카테고리"),
              },
              {
                key: "targetIds",
                header: "대상 선택",
                render: (row) => row.targetSummary,
              },
              {
                key: "earningRate",
                header: "적립률",
                align: "right",
                render: (row) => (row.excluded ? "적립 제외" : `${row.earningRate}%`),
              },
              {
                key: "priority",
                header: "우선순위",
                align: "right",
                render: (row) => row.priority.toLocaleString("ko-KR"),
              },
              {
                key: "period",
                header: "적용 기간",
                render: (row) => (
                  <div className="text-xs text-[var(--color-slate-500)]">
                    {row.startsAtLabel} ~ {row.endsAtLabel}
                  </div>
                ),
              },
              {
                key: "status",
                header: "상태",
                render: (row) => <StatusBadge status={row.status} type="policy" />,
              },
              {
                key: "actions",
                header: "작업",
                align: "right",
                render: (row) => (
                  <AppButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={row.status === "disabled" || disableMutation.isPending}
                    onClick={() => {
                      setDisableTarget(row);
                      setDisableReason("");
                    }}
                  >
                    비활성화
                  </AppButton>
                ),
              },
            ]}
          />
        </div>

        <aside className="space-y-4 rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
          <div className="text-sm font-bold text-[var(--color-slate-900)]">
            {form.id ? "정책 편집" : "정책 생성"}
          </div>
          <AppInput
            label="정책명"
            value={form.name}
            onChange={(event) => updateForm({ name: event.target.value })}
            placeholder="전자제품 5% 적립"
          />
          <SelectField
            label="대상 유형"
            value={form.targetType}
            onChange={(value) =>
              updateForm({ targetType: value as ProductPolicyTargetType, targetIds: [] })
            }
            options={[
              ["product", "상품"],
              ["category", "카테고리"],
            ]}
          />

          <TargetSelector
            targetQuery={targetQuery}
            targetIds={form.targetIds}
            options={targetOptions}
            loading={targetOptionsQuery.isLoading}
            onQueryChange={setTargetQuery}
            onAddTarget={addTarget}
            onRemoveTarget={removeTarget}
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <AppInput
              type="number"
              step="0.01"
              min={0}
              max={100}
              label="적립률(%)"
              value={form.earningRate}
              onChange={(event) => updateForm({ earningRate: event.target.value })}
              disabled={form.excluded}
            />
            <AppInput
              type="number"
              min={1}
              max={999}
              label="우선순위"
              value={form.priority}
              onChange={(event) => updateForm({ priority: event.target.value })}
              helperText="중복 우선순위는 활성/예약 정책에서 차단됩니다."
            />
          </div>

          <section className="space-y-3">
            <div className="text-sm font-bold text-[var(--color-slate-900)]">적용 기간</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <AppInput
                type="datetime-local"
                label="시작일"
                value={form.startsAt}
                onChange={(event) => updateForm({ startsAt: event.target.value })}
              />
              <AppInput
                type="datetime-local"
                label="종료일"
                value={form.endsAt}
                onChange={(event) => updateForm({ endsAt: event.target.value })}
                placeholder="종료일 없음"
                helperText="종료일 없음 상태를 허용합니다."
              />
            </div>
          </section>

          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--color-slate-200)] px-3 text-sm font-semibold text-[var(--color-slate-700)]">
            <input
              type="checkbox"
              checked={form.excluded}
              onChange={(event) => updateForm({ excluded: event.target.checked })}
              className="size-4"
            />
            적립 제외
          </label>

          <SelectField
            label="상태"
            value={form.status}
            onChange={(value) => updateForm({ status: value as ProductPolicyForm["status"] })}
            options={[
              ["draft", "초안"],
              ["scheduled", "예약"],
              ["active", "활성"],
              ["paused", "일시중지"],
              ["disabled", "비활성"],
            ]}
          />

          <div className="rounded-lg border border-[var(--color-slate-200)] bg-[var(--color-slate-50)] p-3 text-xs text-[var(--color-slate-600)]">
            {"우선순위 체계: 상품 > 카테고리 > 이벤트 > 등급 > 기본"}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="product-policy-reason"
              className="block text-sm font-semibold text-[var(--color-slate-700)]"
            >
              감사 사유
            </label>
            <Textarea
              id="product-policy-reason"
              rows={4}
              value={form.reason}
              onChange={(event) => updateForm({ reason: event.target.value })}
              placeholder="정책 변경 사유를 10자 이상 입력"
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
              {formError}
            </div>
          )}

          <AppButton
            type="button"
            className="w-full"
            onClick={submit}
            loading={saveMutation.isPending}
            loadingLabel="저장 중"
          >
            <Save className="size-4" aria-hidden="true" />
            저장
          </AppButton>
        </aside>
      </section>

      <AppModal
        open={Boolean(disableTarget)}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null);
        }}
        title="상품/카테고리 정책 비활성화"
        description="정책은 삭제하지 않고 비활성화하여 감사 로그를 유지합니다."
        size="md"
        footer={
          <>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setDisableTarget(null)}
              disabled={disableMutation.isPending}
            >
              닫기
            </AppButton>
            <AppButton
              type="button"
              variant="danger"
              onClick={confirmDisable}
              loading={disableMutation.isPending}
              loadingLabel="처리 중"
            >
              <Ban className="size-4" aria-hidden="true" />
              비활성화
            </AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <InfoRow label="정책" value={disableTarget?.name ?? "-"} />
          <div className="space-y-1.5">
            <label
              htmlFor="product-policy-disable-reason"
              className="block text-sm font-semibold text-[var(--color-slate-700)]"
            >
              감사 사유
            </label>
            <Textarea
              id="product-policy-disable-reason"
              rows={4}
              value={disableReason}
              onChange={(event) => setDisableReason(event.target.value)}
              placeholder="비활성화 사유를 10자 이상 입력"
            />
          </div>
        </div>
      </AppModal>
    </div>
  );
}

function TargetSelector({
  targetQuery,
  targetIds,
  options,
  loading,
  onQueryChange,
  onAddTarget,
  onRemoveTarget,
}: {
  targetQuery: string;
  targetIds: string[];
  options: ProductPolicyTargetOption[];
  loading: boolean;
  onQueryChange: (query: string) => void;
  onAddTarget: (targetId: string) => void;
  onRemoveTarget: (targetId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="policy-target-search"
        className="block text-sm font-semibold text-[var(--color-slate-700)]"
      >
        대상 선택
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-3 size-4 text-[var(--color-slate-500)]"
          aria-hidden="true"
        />
        <input
          id="policy-target-search"
          value={targetQuery}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="대상 검색"
          className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
        />
        {targetQuery.trim().length >= 2 && (
          <div className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-lg border border-[var(--color-slate-200)] bg-white shadow-lg">
            {loading && <div className="p-3 text-sm text-[var(--color-slate-500)]">검색 중</div>}
            {!loading &&
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-slate-50)]"
                  onClick={() => onAddTarget(option.id)}
                >
                  <span className="font-semibold text-[var(--color-slate-900)]">
                    {option.label}
                  </span>
                </button>
              ))}
            {!loading && options.length === 0 && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--color-primary-700)] hover:bg-[var(--color-slate-50)]"
                onClick={() => onAddTarget(targetQuery)}
              >
                직접 추가: {targetQuery}
              </button>
            )}
          </div>
        )}
      </div>
      {targetIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {targetIds.map((targetId) => (
            <span
              key={targetId}
              className="inline-flex min-h-8 items-center gap-2 rounded-md bg-[var(--color-slate-100)] px-2 text-xs font-semibold text-[var(--color-slate-700)]"
            >
              {targetId}
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded text-[var(--color-slate-500)] hover:bg-white hover:text-[var(--color-danger-600)]"
                aria-label={`${targetId} 제거`}
                onClick={() => onRemoveTarget(targetId)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-semibold text-[var(--color-slate-700)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-7 items-start justify-between gap-4 text-sm">
      <span className="shrink-0 font-semibold text-[var(--color-slate-500)]">{label}</span>
      <span className="min-w-0 text-right text-[var(--color-slate-900)]">{value}</span>
    </div>
  );
}

async function fetchProductPolicies(): Promise<ProductPolicyData> {
  const { data, error } = await adminProductPolicyClient.rpc("get_admin_product_policies", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeProductPolicyResponse(data);
}

async function saveProductPolicy(form: ProductPolicyForm): Promise<unknown> {
  const { data, error } = await adminProductPolicyClient.rpc(
    "save_admin_product_policy",
    buildSaveProductPolicyRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}

async function disableProductPolicy({
  policyId,
  reason,
}: {
  policyId: string;
  reason: string;
}): Promise<unknown> {
  const { data, error } = await adminProductPolicyClient.rpc("disable_admin_product_policy", {
    _policy_id: policyId,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}

async function searchPolicyTargets(
  targetType: ProductPolicyTargetType,
  query: string,
): Promise<ProductPolicyTargetOption[]> {
  const { data, error } = await adminProductPolicyClient.rpc("search_admin_policy_targets", {
    _target_type: targetType,
    _query: query.trim() || null,
    _limit: 8,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeProductPolicyTargetOptions(data);
}

function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}
