import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { CalendarDays, ClipboardCheck, PauseCircle, Play, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppTable } from "@/components/common/AppTable";
import { PointDisplay } from "@/components/common/PointDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSaveEventRpcArgs,
  emptyEventWizardForm,
  eventToForm,
  findOverlappingEvents,
  joinCsvIds,
  normalizeEventResponse,
  parseCsvIds,
  validateEventWizardForm,
  type AdminEvent,
  type AdminEventStatus,
  type EventData,
  type EventWizardForm,
  type SaveEventRpcArgs,
} from "@/features/admin-events/event-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type AdminEventRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_events", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "save_admin_event", args: SaveEventRpcArgs): RpcResponse<unknown>;
  rpc(
    fn: "update_admin_event_status",
    args: { _event_id: string; _status: AdminEventStatus; _reason: string },
  ): RpcResponse<unknown>;
};

const adminEventClient = supabase as unknown as AdminEventRpcClient;
const EMPTY_EVENTS: AdminEvent[] = [];
const wizardSteps = ["기본정보", "대상 설정", "지급 방식", "한도 설정", "검토"] as const;

export const Route = createFileRoute("/_authenticated/admin/events")({
  head: () => ({ meta: [{ title: "이벤트 관리 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EventWizardForm>(emptyEventWizardForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["admin-events"],
    queryFn: fetchEvents,
  });

  const events = eventsQuery.data?.events ?? EMPTY_EVENTS;
  const overlapEvents = useMemo(() => findOverlappingEvents(form, events), [events, form]);

  const saveMutation = useMutation({
    mutationFn: saveEvent,
    onSuccess: () => {
      toast.success("이벤트가 저장되었습니다.");
      setForm(emptyEventWizardForm);
      setStepIndex(0);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (error) => setFormError(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: updateEventStatus,
    onSuccess: () => {
      toast.success("이벤트 상태가 변경되었습니다.");
      void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (error) => setFormError(error.message),
  });

  function updateForm(patch: Partial<EventWizardForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function startCreate() {
    setForm(emptyEventWizardForm);
    setStepIndex(0);
    setFormError(null);
  }

  function editEvent(event: AdminEvent) {
    setForm(eventToForm(event));
    setStepIndex(0);
    setFormError(null);
  }

  function nextStep() {
    setStepIndex((current) => Math.min(wizardSteps.length - 1, current + 1));
  }

  function previousStep() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function submit() {
    const validationError = validateEventWizardForm(form, events);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    saveMutation.mutate(form);
  }

  function changeStatus(event: AdminEvent, status: AdminEventStatus) {
    statusMutation.mutate({
      eventId: event.id,
      status,
      reason: `이벤트 상태 변경: ${event.name}`,
    });
  }

  if (eventsQuery.isLoading) {
    return <Skeleton className="h-[620px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">이벤트 관리</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            기간, 대상, 지급 방식, 한도, 충돌 정책을 검토한 뒤 포인트 이벤트를 운영합니다.
          </p>
        </div>
        <AppButton type="button" onClick={startCreate}>
          <CalendarDays className="size-4" aria-hidden="true" />새 이벤트
        </AppButton>
      </header>

      {eventsQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">이벤트 목록을 불러오지 못했습니다.</div>
          <div className="mt-1">{eventsQuery.error.message}</div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-[var(--color-slate-900)]">이벤트 목록</h2>
          <AppTable
            data={events}
            getRowKey={(row) => row.id}
            emptyMessage="등록된 이벤트가 없습니다."
            columns={[
              {
                key: "name",
                header: "이벤트명",
                render: (row) => (
                  <button
                    type="button"
                    className="font-semibold text-[var(--color-primary-700)] hover:underline"
                    onClick={() => editEvent(row)}
                  >
                    {row.name}
                  </button>
                ),
              },
              {
                key: "status",
                header: "상태",
                render: (row) => <StatusBadge status={row.status} type="policy" />,
              },
              {
                key: "period",
                header: "기간",
                render: (row) => (
                  <div className="text-xs text-[var(--color-slate-500)]">
                    {row.startsAtLabel} ~ {row.endsAtLabel}
                  </div>
                ),
              },
              {
                key: "target",
                header: "대상",
                render: (row) => row.targetSummary,
              },
              {
                key: "reward",
                header: "지급 방식",
                render: (row) => row.rewardLabel,
              },
              {
                key: "limit",
                header: "지급 한도",
                render: (row) => (
                  <div className="text-xs text-[var(--color-slate-500)]">
                    고객당 {row.customerLimit?.toLocaleString("ko-KR") ?? "제한 없음"}
                    <br />
                    예산{" "}
                    {row.totalBudgetPoints
                      ? `${row.totalBudgetPoints.toLocaleString("ko-KR")}P`
                      : "제한 없음"}
                  </div>
                ),
              },
              {
                key: "progress",
                header: "지급 현황",
                align: "right",
                render: (row) => (
                  <div className="space-y-1 text-right">
                    <PointDisplay value={row.spentPoints} type="default" />
                    <div className="text-xs text-[var(--color-slate-500)]">
                      {row.budgetUsageRate}%
                    </div>
                  </div>
                ),
              },
              {
                key: "actions",
                header: "작업",
                align: "right",
                render: (row) => (
                  <div className="flex justify-end gap-1">
                    {row.status === "active" ? (
                      <AppButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-w-0 px-2"
                        disabled={statusMutation.isPending}
                        onClick={() => changeStatus(row, "paused")}
                        aria-label="이벤트 일시중지"
                      >
                        <PauseCircle className="size-4" aria-hidden="true" />
                      </AppButton>
                    ) : (
                      <AppButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-w-0 px-2"
                        disabled={statusMutation.isPending || row.status === "ended"}
                        onClick={() => changeStatus(row, "active")}
                        aria-label="이벤트 재개"
                      >
                        <Play className="size-4" aria-hidden="true" />
                      </AppButton>
                    )}
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={statusMutation.isPending || row.status === "ended"}
                      onClick={() => changeStatus(row, "ended")}
                    >
                      종료
                    </AppButton>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <aside className="space-y-4 rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
          <WizardHeader currentStep={stepIndex} />
          {stepIndex === 0 && <BasicInfoStep form={form} onChange={updateForm} />}
          {stepIndex === 1 && <TargetStep form={form} onChange={updateForm} />}
          {stepIndex === 2 && <RewardStep form={form} onChange={updateForm} />}
          {stepIndex === 3 && <LimitStep form={form} onChange={updateForm} />}
          {stepIndex === 4 && (
            <ReviewStep form={form} overlapEvents={overlapEvents} onChange={updateForm} />
          )}

          {formError && (
            <div className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <AppButton
              type="button"
              variant="secondary"
              disabled={stepIndex === 0}
              onClick={previousStep}
            >
              이전
            </AppButton>
            {stepIndex < wizardSteps.length - 1 ? (
              <AppButton type="button" onClick={nextStep}>
                다음
              </AppButton>
            ) : (
              <AppButton
                type="button"
                onClick={submit}
                loading={saveMutation.isPending}
                loadingLabel="저장 중"
              >
                <Save className="size-4" aria-hidden="true" />
                저장
              </AppButton>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function WizardHeader({ currentStep }: { currentStep: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-slate-900)]">
        <ClipboardCheck className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
        5단계 이벤트 생성 위자드
      </div>
      <div className="grid grid-cols-5 gap-1">
        {wizardSteps.map((step, index) => (
          <div
            key={step}
            className={
              index === currentStep
                ? "rounded-md bg-[var(--color-primary-600)] px-2 py-1 text-center text-[11px] font-bold text-white"
                : "rounded-md bg-[var(--color-slate-100)] px-2 py-1 text-center text-[11px] font-semibold text-[var(--color-slate-500)]"
            }
          >
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function BasicInfoStep({
  form,
  onChange,
}: {
  form: EventWizardForm;
  onChange: (patch: Partial<EventWizardForm>) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--color-slate-900)]">기본정보</h3>
      <AppInput
        label="이벤트명"
        value={form.name}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="VIP 주말 이벤트"
      />
      <div className="space-y-1.5">
        <label
          htmlFor="event-description"
          className="block text-sm font-semibold text-[var(--color-slate-700)]"
        >
          설명
        </label>
        <Textarea
          id="event-description"
          rows={3}
          value={form.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="이벤트 운영 목적과 조건"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        <AppInput
          type="datetime-local"
          label="시작일"
          value={form.startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value })}
        />
        <AppInput
          type="datetime-local"
          label="종료일"
          value={form.endsAt}
          onChange={(event) => onChange({ endsAt: event.target.value })}
        />
      </div>
    </section>
  );
}

function TargetStep({
  form,
  onChange,
}: {
  form: EventWizardForm;
  onChange: (patch: Partial<EventWizardForm>) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--color-slate-900)]">대상 설정</h3>
      <CsvInput
        label="등급"
        value={form.tierIds}
        placeholder="vip, gold"
        onChange={(tierIds) => onChange({ tierIds })}
      />
      <CsvInput
        label="세그먼트"
        value={form.segments}
        placeholder="new_customer, dormant"
        onChange={(segments) => onChange({ segments })}
      />
      <CsvInput
        label="상품"
        value={form.productIds}
        placeholder="SKU-001, SKU-002"
        onChange={(productIds) => onChange({ productIds })}
      />
      <CsvInput
        label="카테고리"
        value={form.categoryIds}
        placeholder="CAT-BEAUTY"
        onChange={(categoryIds) => onChange({ categoryIds })}
      />
    </section>
  );
}

function RewardStep({
  form,
  onChange,
}: {
  form: EventWizardForm;
  onChange: (patch: Partial<EventWizardForm>) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--color-slate-900)]">지급 방식</h3>
      <SelectField
        label="지급 방식"
        value={form.rewardType}
        onChange={(value) => onChange({ rewardType: value as EventWizardForm["rewardType"] })}
        options={[
          ["rate", "추가 적립률"],
          ["fixed", "고정 포인트"],
        ]}
      />
      <AppInput
        type="number"
        min={1}
        step={form.rewardType === "rate" ? "0.01" : "1"}
        label={form.rewardType === "rate" ? "추가 적립률(%)" : "고정 포인트"}
        value={form.rewardValue}
        onChange={(event) => onChange({ rewardValue: event.target.value })}
      />
    </section>
  );
}

function LimitStep({
  form,
  onChange,
}: {
  form: EventWizardForm;
  onChange: (patch: Partial<EventWizardForm>) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--color-slate-900)]">한도 설정</h3>
      <AppInput
        type="number"
        min={1}
        label="고객당 최대"
        value={form.customerLimit}
        onChange={(event) => onChange({ customerLimit: event.target.value })}
        helperText="0 저장 불가"
      />
      <AppInput
        type="number"
        min={0}
        label="전체 예산"
        value={form.totalBudgetPoints}
        onChange={(event) => onChange({ totalBudgetPoints: event.target.value })}
        helperText="비워두면 전체 예산 제한 없음"
      />
      <AppInput
        type="number"
        min={1}
        max={999}
        label="우선순위"
        value={form.priority}
        onChange={(event) => onChange({ priority: event.target.value })}
      />
      <SelectField
        label="상태"
        value={form.status}
        onChange={(value) => onChange({ status: value as EventWizardForm["status"] })}
        options={[
          ["draft", "초안"],
          ["scheduled", "예정"],
          ["active", "진행"],
          ["paused", "일시중지"],
        ]}
      />
    </section>
  );
}

function ReviewStep({
  form,
  overlapEvents,
  onChange,
}: {
  form: EventWizardForm;
  overlapEvents: AdminEvent[];
  onChange: (patch: Partial<EventWizardForm>) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold text-[var(--color-slate-900)]">검토</h3>
      <div className="rounded-lg border border-[var(--color-slate-200)] bg-[var(--color-slate-50)] p-3 text-sm text-[var(--color-slate-700)]">
        <div className="font-bold text-[var(--color-slate-900)]">예상 지급 조건</div>
        <div className="mt-2 space-y-1">
          <div>이벤트: {form.name || "-"}</div>
          <div>
            보상:{" "}
            {form.rewardType === "rate"
              ? `추가 적립률 ${form.rewardValue}%`
              : `${form.rewardValue}P`}
          </div>
          <div>고객당 최대: {form.customerLimit || "제한 없음"}</div>
          <div>전체 예산: {form.totalBudgetPoints || "제한 없음"}</div>
          <div>우선순위: {form.priority}</div>
        </div>
      </div>
      <div
        className={
          overlapEvents.length > 0
            ? "rounded-lg border border-[var(--color-warning-500)]/40 bg-[var(--color-pending-bg)] p-3 text-sm text-[var(--color-pending-text)]"
            : "rounded-lg border border-[var(--color-slate-200)] bg-white p-3 text-sm text-[var(--color-slate-600)]"
        }
      >
        <div className="font-bold">충돌 정책</div>
        <div className="mt-1 font-semibold">기간 중복 경고</div>
        {overlapEvents.length === 0 ? (
          <div className="mt-1">중복되는 진행/예정 이벤트가 없습니다.</div>
        ) : (
          <ul className="mt-2 space-y-1">
            {overlapEvents.map((event) => (
              <li key={event.id}>
                {event.name} · 우선순위 {event.priority}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="event-reason"
          className="block text-sm font-semibold text-[var(--color-slate-700)]"
        >
          감사 사유
        </label>
        <Textarea
          id="event-reason"
          rows={4}
          value={form.reason}
          onChange={(event) => onChange({ reason: event.target.value })}
          placeholder="이벤트 생성/변경 사유를 10자 이상 입력"
        />
      </div>
    </section>
  );
}

function CsvInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  return (
    <AppInput
      label={label}
      value={joinCsvIds(value)}
      onChange={(event) => onChange(parseCsvIds(event.target.value))}
      placeholder={placeholder}
    />
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

async function fetchEvents(): Promise<EventData> {
  const { data, error } = await adminEventClient.rpc("get_admin_events", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeEventResponse(data);
}

async function saveEvent(form: EventWizardForm): Promise<unknown> {
  const { data, error } = await adminEventClient.rpc(
    "save_admin_event",
    buildSaveEventRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}

async function updateEventStatus({
  eventId,
  status,
  reason,
}: {
  eventId: string;
  status: AdminEventStatus;
  reason: string;
}): Promise<unknown> {
  const { data, error } = await adminEventClient.rpc("update_admin_event_status", {
    _event_id: eventId,
    _status: status,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data;
}
