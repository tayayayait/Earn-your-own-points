import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, Plus, Save, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { AppTable } from "@/components/common/AppTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSaveTierPolicyRpcArgs,
  buildTierOrder,
  emptyTierPolicyForm,
  normalizeTierPolicyResponse,
  tierPolicyToForm,
  validateTierPolicyForm,
  type SaveTierPolicyRpcArgs,
  type TierMoveDirection,
  type TierPolicy,
  type TierPolicyData,
  type TierPolicyForm,
} from "@/features/admin-policies/tier-policy-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type AdminTierPolicyRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_tier_policies", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "save_admin_tier_policy", args: SaveTierPolicyRpcArgs): RpcResponse<unknown>;
  rpc(
    fn: "reorder_admin_tier_policies",
    args: { _tier_ids: string[]; _reason: string },
  ): RpcResponse<unknown>;
  rpc(
    fn: "disable_admin_tier_policy",
    args: { _tier_id: string; _replacement_tier_id: string | null; _reason: string },
  ): RpcResponse<unknown>;
};

const adminTierPolicyClient = supabase as unknown as AdminTierPolicyRpcClient;
const EMPTY_TIERS: TierPolicy[] = [];

export const Route = createFileRoute("/_authenticated/admin/policies/tiers")({
  head: () => ({ meta: [{ title: "등급 정책 관리 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TierPolicyForm>(emptyTierPolicyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<TierPolicy | null>(null);
  const [replacementTierId, setReplacementTierId] = useState<string>("default");
  const [disableReason, setDisableReason] = useState("");

  const tiersQuery = useQuery({
    queryKey: ["admin-tier-policies"],
    queryFn: fetchTierPolicies,
  });

  const tiers = tiersQuery.data?.tiers ?? EMPTY_TIERS;
  const existingNames = useMemo(
    () => tiers.filter((tier) => tier.id !== form.id).map((tier) => tier.name),
    [form.id, tiers],
  );

  const saveMutation = useMutation({
    mutationFn: saveTierPolicy,
    onSuccess: () => {
      toast.success("등급 정책이 저장되었습니다.");
      setForm(emptyTierPolicyForm);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-tier-policies"] });
    },
    onError: (error) => setFormError(error.message),
  });

  const reorderMutation = useMutation({
    mutationFn: reorderTierPolicies,
    onSuccess: () => {
      toast.success("등급 순서가 변경되었습니다.");
      void queryClient.invalidateQueries({ queryKey: ["admin-tier-policies"] });
    },
    onError: (error) => setFormError(error.message),
  });

  const disableMutation = useMutation({
    mutationFn: disableTierPolicy,
    onSuccess: () => {
      toast.success("등급이 비활성화되었습니다.");
      setDisableTarget(null);
      setDisableReason("");
      setReplacementTierId("default");
      void queryClient.invalidateQueries({ queryKey: ["admin-tier-policies"] });
    },
    onError: (error) => setFormError(error.message),
  });

  function updateForm(patch: Partial<TierPolicyForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function startCreate() {
    setForm(emptyTierPolicyForm);
    setFormError(null);
  }

  function submit() {
    const validationError = validateTierPolicyForm(form, existingNames);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const sortOrder = form.id
      ? (tiers.find((tier) => tier.id === form.id)?.sortOrder ?? tiers.length + 1)
      : tiers.length + 1;

    setFormError(null);
    saveMutation.mutate({ form, sortOrder });
  }

  function moveTier(tier: TierPolicy, direction: TierMoveDirection) {
    const nextOrder = buildTierOrder(
      tiers.map((item) => item.id),
      tier.id,
      direction,
    );

    reorderMutation.mutate({
      tierIds: nextOrder,
      reason: `등급 순서 변경: ${tier.name}`,
    });
  }

  function openDisableModal(tier: TierPolicy) {
    const fallbackTier = tiers.find(
      (item) =>
        item.id !== tier.id && item.status !== "disabled" && item.sortOrder > tier.sortOrder,
    );
    setDisableTarget(tier);
    setReplacementTierId(fallbackTier?.id ?? "default");
    setDisableReason("");
  }

  function confirmDisable() {
    if (!disableTarget) return;
    if (disableReason.trim().length < 10) {
      setFormError("감사 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    disableMutation.mutate({
      tierId: disableTarget.id,
      replacementTierId: replacementTierId === "default" ? null : replacementTierId,
      reason: disableReason,
    });
  }

  if (tiersQuery.isLoading) {
    return <Skeleton className="h-[560px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">등급 정책 관리</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            등급별 승급 기준, 적립률, 유지 조건, 순서를 관리합니다.
          </p>
        </div>
        <AppButton type="button" onClick={startCreate}>
          <Plus className="size-4" aria-hidden="true" />새 등급
        </AppButton>
      </header>

      {tiersQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">등급 정책을 불러오지 못했습니다.</div>
          <div className="mt-1">{tiersQuery.error.message}</div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-[var(--color-slate-900)]">등급 목록</h2>
          <AppTable
            data={tiers}
            getRowKey={(row) => row.id}
            emptyMessage="등록된 등급이 없습니다."
            columns={[
              {
                key: "name",
                header: "등급명",
                render: (row) => (
                  <button
                    type="button"
                    className="font-semibold text-[var(--color-primary-700)] hover:underline"
                    onClick={() => {
                      setForm(tierPolicyToForm(row));
                      setFormError(null);
                    }}
                  >
                    {row.name}
                  </button>
                ),
              },
              {
                key: "criteria",
                header: "승급 기준",
                render: (row) => (
                  <div className="text-xs text-[var(--color-slate-500)]">
                    최근 {row.qualificationMonths}개월 · {row.minSpend.toLocaleString("ko-KR")}원 ·{" "}
                    {row.minPurchaseCount.toLocaleString("ko-KR")}회
                  </div>
                ),
              },
              {
                key: "baseEarnRate",
                header: "기본 적립률",
                align: "right",
                render: (row) => `${row.baseEarnRate}%`,
              },
              {
                key: "bonusEarnRate",
                header: "추가 적립률",
                align: "right",
                render: (row) => `${row.bonusEarnRate}%`,
              },
              {
                key: "minKeepSpend",
                header: "최소 유지 조건",
                align: "right",
                render: (row) => `${row.minKeepSpend.toLocaleString("ko-KR")}원`,
              },
              {
                key: "status",
                header: "상태",
                render: (row) => <StatusBadge status={row.status} type="policy" />,
              },
              {
                key: "customers",
                header: "고객",
                align: "right",
                render: (row) => `${row.customerCount.toLocaleString("ko-KR")}명`,
              },
              {
                key: "order",
                header: "순서 변경",
                align: "right",
                render: (row) => (
                  <div className="flex justify-end gap-1">
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-w-0 px-2"
                      disabled={row.sortOrder <= 1 || reorderMutation.isPending}
                      onClick={() => moveTier(row, "up")}
                      aria-label="위로 이동"
                    >
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-w-0 px-2"
                      disabled={row.sortOrder >= tiers.length || reorderMutation.isPending}
                      onClick={() => moveTier(row, "down")}
                      aria-label="아래로 이동"
                    >
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </AppButton>
                  </div>
                ),
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
                    onClick={() => openDisableModal(row)}
                  >
                    비활성화
                  </AppButton>
                ),
              },
            ]}
          />
        </div>

        <TierPolicyFormPanel
          form={form}
          formError={formError}
          saving={saveMutation.isPending}
          onChange={updateForm}
          onSubmit={submit}
        />
      </section>

      <AppModal
        open={Boolean(disableTarget)}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null);
        }}
        title="등급 비활성화"
        description="등급 삭제 시 고객 처리 방식 선택 후 비활성화합니다."
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
              비활성화
            </AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <InfoRow label="대상 등급" value={disableTarget?.name ?? "-"} />
          <label className="space-y-1.5">
            <span className="block text-sm font-semibold text-[var(--color-slate-700)]">
              고객 처리 방식
            </span>
            <select
              value={replacementTierId}
              onChange={(event) => setReplacementTierId(event.target.value)}
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            >
              <option value="default">기본 등급</option>
              {tiers
                .filter((tier) => tier.id !== disableTarget?.id && tier.status !== "disabled")
                .map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    하위 등급: {tier.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="space-y-1.5">
            <label
              htmlFor="tier-disable-reason"
              className="block text-sm font-semibold text-[var(--color-slate-700)]"
            >
              감사 사유
            </label>
            <Textarea
              id="tier-disable-reason"
              rows={4}
              value={disableReason}
              onChange={(event) => setDisableReason(event.target.value)}
              placeholder="등급 비활성화 사유를 10자 이상 입력"
            />
          </div>
        </div>
      </AppModal>
    </div>
  );
}

function TierPolicyFormPanel({
  form,
  formError,
  saving,
  onChange,
  onSubmit,
}: {
  form: TierPolicyForm;
  formError: string | null;
  saving: boolean;
  onChange: (patch: Partial<TierPolicyForm>) => void;
  onSubmit: () => void;
}) {
  return (
    <aside className="space-y-4 rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-slate-900)]">
        <Users className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
        {form.id ? "등급 편집" : "등급 생성"}
      </div>
      <AppInput
        label="등급명"
        value={form.name}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="VIP"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        <AppInput
          type="number"
          min={1}
          max={24}
          label="승급 기준 기간(개월)"
          value={form.qualificationMonths}
          onChange={(event) => onChange({ qualificationMonths: event.target.value })}
        />
        <AppInput
          type="number"
          min={0}
          label="승급 기준 금액"
          value={form.minSpend}
          onChange={(event) => onChange({ minSpend: event.target.value })}
        />
        <AppInput
          type="number"
          min={0}
          label="승급 기준 횟수"
          value={form.minPurchaseCount}
          onChange={(event) => onChange({ minPurchaseCount: event.target.value })}
        />
        <AppInput
          type="number"
          min={0}
          max={100}
          step="0.01"
          label="기본 적립률"
          value={form.baseEarnRate}
          onChange={(event) => onChange({ baseEarnRate: event.target.value })}
        />
        <AppInput
          type="number"
          min={0}
          max={100}
          step="0.01"
          label="추가 적립률"
          value={form.bonusEarnRate}
          onChange={(event) => onChange({ bonusEarnRate: event.target.value })}
        />
        <AppInput
          type="number"
          min={0}
          label="최소 유지 조건"
          value={form.minKeepSpend}
          onChange={(event) => onChange({ minKeepSpend: event.target.value })}
        />
      </div>
      <label className="space-y-1.5">
        <span className="block text-sm font-semibold text-[var(--color-slate-700)]">상태</span>
        <select
          value={form.status}
          onChange={(event) => onChange({ status: event.target.value as TierPolicyForm["status"] })}
          className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
        >
          <option value="active">활성</option>
          <option value="paused">일시중지</option>
          <option value="disabled">비활성</option>
        </select>
      </label>
      <div className="space-y-1.5">
        <label
          htmlFor="tier-reason"
          className="block text-sm font-semibold text-[var(--color-slate-700)]"
        >
          감사 사유
        </label>
        <Textarea
          id="tier-reason"
          rows={4}
          value={form.reason}
          onChange={(event) => onChange({ reason: event.target.value })}
          placeholder="등급 정책 변경 사유를 10자 이상 입력"
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
        onClick={onSubmit}
        loading={saving}
        loadingLabel="저장 중"
      >
        <Save className="size-4" aria-hidden="true" />
        저장
      </AppButton>
    </aside>
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

async function fetchTierPolicies(): Promise<TierPolicyData> {
  const { data, error } = await adminTierPolicyClient.rpc("get_admin_tier_policies", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeTierPolicyResponse(data);
}

async function saveTierPolicy({
  form,
  sortOrder,
}: {
  form: TierPolicyForm;
  sortOrder: number;
}): Promise<unknown> {
  const { data, error } = await adminTierPolicyClient.rpc(
    "save_admin_tier_policy",
    buildSaveTierPolicyRpcArgs(form, sortOrder),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}

async function reorderTierPolicies({
  tierIds,
  reason,
}: {
  tierIds: string[];
  reason: string;
}): Promise<unknown> {
  const { data, error } = await adminTierPolicyClient.rpc("reorder_admin_tier_policies", {
    _tier_ids: tierIds,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}

async function disableTierPolicy({
  tierId,
  replacementTierId,
  reason,
}: {
  tierId: string;
  replacementTierId: string | null;
  reason: string;
}): Promise<unknown> {
  const { data, error } = await adminTierPolicyClient.rpc("disable_admin_tier_policy", {
    _tier_id: tierId,
    _replacement_tier_id: replacementTierId,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}
