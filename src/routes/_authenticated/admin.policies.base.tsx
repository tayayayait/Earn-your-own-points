import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { Save, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppTable } from "@/components/common/AppTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildBasePolicyDiff,
  buildSaveBasePolicyRpcArgs,
  normalizeBasePolicyResponse,
  validateBasePolicyForm,
  type BasePolicy,
  type BasePolicyData,
  type BasePolicyForm,
  type SaveBasePolicyRpcArgs,
} from "@/features/admin-policies/base-policy-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type AdminBasePolicyRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_base_policy", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "save_admin_base_policy", args: SaveBasePolicyRpcArgs): RpcResponse<unknown>;
  rpc(
    fn: "disable_admin_base_policy",
    args: { _policy_id: string; _reason: string },
  ): RpcResponse<unknown>;
};

const adminBasePolicyClient = supabase as unknown as AdminBasePolicyRpcClient;

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

export const Route = createFileRoute("/_authenticated/admin/policies/base")({
  head: () => ({ meta: [{ title: "기본 정책 관리 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BasePolicyForm>(defaultForm);
  const [baselineForm, setBaselineForm] = useState<BasePolicyForm>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ["admin-base-policy"],
    queryFn: fetchBasePolicy,
  });

  const saveMutation = useMutation({
    mutationFn: saveBasePolicy,
    onSuccess: (data) => {
      const normalized = normalizeBasePolicyResponse(data);
      const nextForm = normalized.form;
      setForm(nextForm);
      setBaselineForm(nextForm);
      setFormError(null);
      toast.success("기본 정책이 저장되었습니다.");
      void queryClient.invalidateQueries({ queryKey: ["admin-base-policy"] });
    },
    onError: (error) => setFormError(error.message),
  });

  const disableMutation = useMutation({
    mutationFn: disableBasePolicy,
    onSuccess: () => {
      toast.success("정책이 비활성화되었습니다.");
      void queryClient.invalidateQueries({ queryKey: ["admin-base-policy"] });
    },
    onError: (error) => setFormError(error.message),
  });

  useEffect(() => {
    if (policyQuery.data?.form) {
      setForm(policyQuery.data.form);
      setBaselineForm(policyQuery.data.form);
    }
  }, [policyQuery.data]);

  const diff = useMemo(() => buildBasePolicyDiff(baselineForm, form), [baselineForm, form]);
  const history = policyQuery.data?.history ?? [];

  function updateForm(patch: Partial<BasePolicyForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function submit() {
    const validationError = validateBasePolicyForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    saveMutation.mutate(form);
  }

  function disablePolicy(policy: BasePolicy) {
    const validationReason = form.reason.trim();
    if (validationReason.length < 10) {
      setFormError("감사 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    disableMutation.mutate({ policyId: policy.id, reason: validationReason });
  }

  if (policyQuery.isLoading) {
    return <Skeleton className="h-[560px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">기본 정책 관리</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            포인트 적립, 사용, 만료/확정 기준을 변경하고 감사 로그로 추적합니다.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-slate-200)] bg-white px-3 py-2 text-sm text-[var(--color-slate-600)]">
          <SlidersHorizontal
            className="size-4 text-[var(--color-primary-600)]"
            aria-hidden="true"
          />
          {policyQuery.data?.currentPolicy?.name ?? "정책 없음"}
        </div>
      </header>

      {policyQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">기본 정책을 불러오지 못했습니다.</div>
          <div className="mt-1">{policyQuery.error.message}</div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <PolicySection title="적립 기준">
            <div className="grid gap-4 md:grid-cols-3">
              <AppInput
                label="정책명"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="기본 적립 정책"
              />
              <AppInput
                type="number"
                step="0.01"
                min={0}
                max={100}
                label="기본 적립률(%)"
                value={form.earningRate}
                onChange={(event) => updateForm({ earningRate: event.target.value })}
              />
              <SelectField
                label="적립 단위"
                value={form.earnUnit}
                onChange={(value) => updateForm({ earnUnit: value })}
                options={[
                  ["1", "1P"],
                  ["10", "10P"],
                  ["100", "100P"],
                ]}
              />
              <SelectField
                label="반올림 방식"
                value={form.roundingMethod}
                onChange={(value) =>
                  updateForm({ roundingMethod: value as BasePolicyForm["roundingMethod"] })
                }
                options={[
                  ["floor", "내림"],
                  ["round", "반올림"],
                  ["ceil", "올림"],
                ]}
              />
            </div>
          </PolicySection>

          <PolicySection title="사용 조건">
            <div className="grid gap-4 md:grid-cols-3">
              <AppInput
                type="number"
                min={0}
                label="최소 사용 포인트"
                value={form.minRedeemPoints}
                onChange={(event) => updateForm({ minRedeemPoints: event.target.value })}
              />
              <AppInput
                type="number"
                step="0.01"
                min={0}
                max={100}
                label="최대 사용 비율(%)"
                value={form.maxRedeemRatio}
                onChange={(event) => updateForm({ maxRedeemRatio: event.target.value })}
              />
              <SelectField
                label="사용 단위"
                value={form.redeemUnit}
                onChange={(value) => updateForm({ redeemUnit: value })}
                options={[
                  ["1", "1P"],
                  ["10", "10P"],
                  ["100", "100P"],
                ]}
              />
            </div>
          </PolicySection>

          <PolicySection title="만료/확정">
            <div className="grid gap-4 md:grid-cols-3">
              <AppInput
                type="number"
                min={1}
                max={60}
                label="유효기간(개월)"
                value={form.validMonths}
                onChange={(event) => updateForm({ validMonths: event.target.value })}
              />
              <AppInput
                type="number"
                min={0}
                max={365}
                label="확정 대기일"
                value={form.pendingDays}
                onChange={(event) => updateForm({ pendingDays: event.target.value })}
              />
              <AppInput
                label="적립 제외 결제수단"
                value={form.excludedPaymentMethods}
                onChange={(event) => updateForm({ excludedPaymentMethods: event.target.value })}
                placeholder="gift_card, voucher"
              />
            </div>
          </PolicySection>

          <PolicySection title="적용 방식">
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="적용 모드"
                value={form.applyMode}
                onChange={(value) =>
                  updateForm({ applyMode: value as BasePolicyForm["applyMode"] })
                }
                options={[
                  ["immediate", "즉시 적용"],
                  ["scheduled", "예약 적용"],
                ]}
              />
              {form.applyMode === "scheduled" && (
                <AppInput
                  type="datetime-local"
                  label="예약 적용 시간"
                  value={form.scheduledAt}
                  onChange={(event) => updateForm({ scheduledAt: event.target.value })}
                />
              )}
            </div>
            <div className="mt-4 space-y-1.5">
              <label
                htmlFor="policy-reason"
                className="block text-sm font-semibold text-[var(--color-slate-700)]"
              >
                감사 사유
              </label>
              <Textarea
                id="policy-reason"
                rows={4}
                value={form.reason}
                onChange={(event) => updateForm({ reason: event.target.value })}
                placeholder="정책 변경 사유를 10자 이상 입력"
              />
            </div>
          </PolicySection>

          {formError && (
            <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm font-semibold text-[var(--color-error-text)]">
              {formError}
            </section>
          )}

          <div className="flex justify-end">
            <AppButton
              type="button"
              onClick={submit}
              loading={saveMutation.isPending}
              loadingLabel="저장 중"
            >
              <Save className="size-4" aria-hidden="true" />
              저장
            </AppButton>
          </div>
        </div>

        <aside className="space-y-4">
          <PolicySection title="변경 미리보기">
            {diff.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-slate-200)] p-4 text-sm text-[var(--color-slate-500)]">
                변경된 항목이 없습니다.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--color-slate-200)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-slate-50)] text-xs font-semibold text-[var(--color-slate-500)]">
                    <tr>
                      <th className="px-3 py-2 text-left">항목</th>
                      <th className="px-3 py-2 text-left">변경 전</th>
                      <th className="px-3 py-2 text-left">변경 후</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((item) => (
                      <tr key={item.label} className="border-t border-[var(--color-slate-200)]">
                        <td className="px-3 py-2 font-semibold">{item.label}</td>
                        <td className="px-3 py-2 text-[var(--color-slate-500)]">{item.before}</td>
                        <td className="px-3 py-2 text-[var(--color-slate-900)]">{item.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PolicySection>

          <PolicySection title="운영 규칙">
            <ul className="space-y-2 text-sm text-[var(--color-slate-600)]">
              <li>활성 정책은 삭제할 수 없습니다.</li>
              <li>즉시 적용은 기존 활성 정책을 종료하고 새 정책을 활성화합니다.</li>
              <li>예약 적용 시간은 현재 이후여야 합니다.</li>
            </ul>
          </PolicySection>
        </aside>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--color-slate-900)]">정책 이력</h2>
        <AppTable
          data={history}
          getRowKey={(row) => row.id}
          emptyMessage="정책 이력이 없습니다."
          columns={[
            {
              key: "name",
              header: "정책명",
              render: (row) => <span className="font-semibold">{row.name}</span>,
            },
            {
              key: "status",
              header: "상태",
              render: (row) => <StatusBadge status={row.status} type="policy" />,
            },
            {
              key: "earningRate",
              header: "적립률",
              align: "right",
              render: (row) => `${row.earningRate}%`,
            },
            {
              key: "validMonths",
              header: "유효기간",
              align: "right",
              render: (row) => `${row.validMonths}개월`,
            },
            {
              key: "updatedAt",
              header: "수정일",
              render: (row) => row.updatedAtLabel,
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
                  disabled={row.status === "active" || disableMutation.isPending}
                  onClick={() => disablePolicy(row)}
                >
                  비활성화
                </AppButton>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-[var(--color-slate-900)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
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

async function fetchBasePolicy(): Promise<BasePolicyData> {
  const { data, error } = await adminBasePolicyClient.rpc("get_admin_base_policy", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeBasePolicyResponse(data);
}

async function saveBasePolicy(form: BasePolicyForm): Promise<unknown> {
  const { data, error } = await adminBasePolicyClient.rpc(
    "save_admin_base_policy",
    buildSaveBasePolicyRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}

async function disableBasePolicy({
  policyId,
  reason,
}: {
  policyId: string;
  reason: string;
}): Promise<unknown> {
  const { data, error } = await adminBasePolicyClient.rpc("disable_admin_base_policy", {
    _policy_id: policyId,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}
