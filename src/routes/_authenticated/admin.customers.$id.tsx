import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Ban,
  FilePenLine,
  MessageSquarePlus,
  Pencil,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { AppTable } from "@/components/common/AppTable";
import { PointDisplay } from "@/components/common/PointDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";
import { customerStatusMap } from "@/lib/enums";
import { formatPhone, formatPoint } from "@/lib/formatters";
import {
  canEditCustomerProfile,
  canProcessCustomerPoints,
  createIdempotencyKey,
  isValidAdminReason,
  normalizeCustomerDetail,
  type CustomerDetail,
  type ManualPointType,
} from "@/features/admin-customer-detail/customer-detail-data";

export const Route = createFileRoute("/_authenticated/admin/customers/$id")({
  head: () => ({ meta: [{ title: "고객 상세 · 관리자" }] }),
  component: Page,
});

type DetailRpcClient = typeof supabase & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
};

type ActiveModal = "profile" | "status" | "points" | "note" | null;

const detailClient = supabase as unknown as DetailRpcClient;

const statusOptions = Object.entries(customerStatusMap).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

function Page() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    birthDate: "",
    reason: "",
  });
  const [statusForm, setStatusForm] = useState({ status: "active", reason: "" });
  const [pointForm, setPointForm] = useState({
    type: "manual_earn" as ManualPointType,
    amount: "",
    memo: "",
    expiresAt: "",
  });
  const [noteBody, setNoteBody] = useState("");

  const detailQuery = useQuery({
    queryKey: ["admin-customer-detail", id],
    queryFn: () => fetchCustomerDetail(id),
  });

  const updateProfileMutation = useDetailMutation(id, queryClient, "update_admin_customer_profile");
  const updateStatusMutation = useDetailMutation(id, queryClient, "update_admin_customer_status");
  const createPointMutation = useDetailMutation(
    id,
    queryClient,
    "create_admin_customer_point_transaction",
  );
  const addNoteMutation = useDetailMutation(id, queryClient, "add_admin_customer_note");

  const detail = detailQuery.data;
  const profile = detail?.profile;
  const canEditProfile = canEditCustomerProfile(profile?.status ?? "active");
  const canProcessPoints = canProcessCustomerPoints(profile?.status ?? "active");

  function openProfileModal() {
    if (!detail) return;
    setProfileForm({
      fullName: detail.profile.name === "-" ? "" : detail.profile.name,
      email: detail.profile.email,
      phone: detail.profile.phone,
      birthDate: detail.profile.birthDate,
      reason: "",
    });
    setActiveModal("profile");
  }

  function openStatusModal() {
    if (!detail) return;
    setStatusForm({ status: detail.profile.status, reason: "" });
    setActiveModal("status");
  }

  function openPointModal(type: ManualPointType) {
    setPointForm({ type, amount: "", memo: "", expiresAt: "" });
    setActiveModal("points");
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    if (!isValidAdminReason(profileForm.reason)) {
      toast.error("수정 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    await updateProfileMutation.mutateAsync({
      _user_id: id,
      _full_name: profileForm.fullName,
      _phone: profileForm.phone,
      _email: profileForm.email,
      _birth_date: profileForm.birthDate || null,
      _reason: profileForm.reason,
    });
    setActiveModal(null);
    toast.success("고객 정보가 수정되었습니다.");
  }

  async function submitStatus(event: FormEvent) {
    event.preventDefault();
    if (!isValidAdminReason(statusForm.reason)) {
      toast.error("상태 변경 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    await updateStatusMutation.mutateAsync({
      _user_id: id,
      _status: statusForm.status,
      _reason: statusForm.reason,
    });
    setActiveModal(null);
    toast.success("고객 상태가 변경되었습니다.");
  }

  async function submitPoints(event: FormEvent) {
    event.preventDefault();
    const amount = Number(pointForm.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error("포인트는 1 이상 정수로 입력해야 합니다.");
      return;
    }
    if (!isValidAdminReason(pointForm.memo)) {
      toast.error("포인트 조정 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    await createPointMutation.mutateAsync({
      _user_id: id,
      _type: pointForm.type,
      _amount: amount,
      _memo: pointForm.memo,
      _idempotency_key: createIdempotencyKey(id, pointForm.type, amount, pointForm.memo),
      _expires_at: pointForm.expiresAt ? new Date(pointForm.expiresAt).toISOString() : null,
    });
    setActiveModal(null);
    toast.success("포인트 조정이 처리되었습니다.");
  }

  async function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!noteBody.trim()) {
      toast.error("관리자 메모를 입력해야 합니다.");
      return;
    }

    await addNoteMutation.mutateAsync({
      _user_id: id,
      _body: noteBody,
    });
    setNoteBody("");
    setActiveModal(null);
    toast.success("관리자 메모가 추가되었습니다.");
  }

  return (
    <div className="space-y-6">
      <Link
        to="/admin/customers"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--color-slate-600)] hover:text-[var(--color-slate-900)]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        목록으로
      </Link>

      {detailQuery.isLoading ? (
        <CustomerDetailSkeleton />
      ) : detail ? (
        <>
          <header className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[var(--color-slate-100)] px-2 py-1 text-xs font-semibold tabular-nums text-[var(--color-slate-600)]">
                    {detail.profile.customerCode}
                  </span>
                  <StatusBadge status={detail.profile.status} type="customer" />
                  <span className="rounded-full bg-[var(--color-primary-50)] px-2 py-1 text-xs font-semibold text-[var(--color-primary-700)]">
                    {detail.profile.tierName}
                  </span>
                </div>
                <h1 className="truncate text-2xl font-bold text-[var(--color-slate-900)]">
                  {detail.profile.name}
                </h1>
                <p className="mt-1 text-sm text-[var(--color-slate-500)]">
                  {detail.profile.email || "-"} ·{" "}
                  {detail.profile.phone ? formatPhone(detail.profile.phone) : "-"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={openProfileModal}
                  disabled={!canEditProfile}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  정보 수정
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={openStatusModal}>
                  <ShieldAlert className="size-4" aria-hidden="true" />
                  상태 변경
                </AppButton>
                <AppButton
                  type="button"
                  variant="success"
                  onClick={() => openPointModal("manual_earn")}
                  disabled={!canProcessPoints}
                >
                  <WalletCards className="size-4" aria-hidden="true" />
                  포인트 지급
                </AppButton>
                <AppButton
                  type="button"
                  variant="danger"
                  onClick={() => openPointModal("manual_deduct")}
                  disabled={!canProcessPoints}
                >
                  <Ban className="size-4" aria-hidden="true" />
                  포인트 차감
                </AppButton>
              </div>
            </div>
            {!canEditProfile && (
              <p className="mt-4 rounded-md bg-[var(--color-cancel-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-cancel-text)]">
                탈퇴 고객은 개인정보를 수정할 수 없습니다.
              </p>
            )}
            {!canProcessPoints && (
              <p className="mt-3 rounded-md bg-[var(--color-use-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-use-text)]">
                차단 또는 탈퇴 고객은 포인트 조정이 비활성화됩니다.
              </p>
            )}
          </header>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="사용 가능" value={detail.summary.availablePoints} tone="default" />
            <SummaryCard label="적립 예정" value={detail.summary.pendingPoints} tone="earn" />
            <SummaryCard
              label="30일 내 만료"
              value={detail.summary.expiringPoints30d}
              tone="warning"
            />
            <SummaryCard label="누적 적립" value={detail.summary.totalEarnedPoints} tone="earn" />
            <SummaryCard label="누적 사용" value={detail.summary.totalRedeemedPoints} tone="use" />
          </section>

          <Tabs defaultValue="profile" className="space-y-4">
            <TabsList className="h-auto flex-wrap justify-start rounded-lg border border-[var(--color-slate-200)] bg-white p-1">
              <TabsTrigger value="profile">기본정보</TabsTrigger>
              <TabsTrigger value="transactions">포인트 이력</TabsTrigger>
              <TabsTrigger value="notes">관리자 메모</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-0">
              <DetailPanel
                title="기본정보"
                action={
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={openProfileModal}
                    disabled={!canEditProfile}
                  >
                    <FilePenLine className="size-4" aria-hidden="true" />
                    수정
                  </AppButton>
                }
              >
                <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoItem label="고객 ID" value={detail.profile.customerCode} />
                  <InfoItem label="이름" value={detail.profile.name} />
                  <InfoItem label="이메일" value={detail.profile.email || "-"} />
                  <InfoItem
                    label="연락처"
                    value={detail.profile.phone ? formatPhone(detail.profile.phone) : "-"}
                  />
                  <InfoItem label="생년월일" value={detail.profile.birthDate || "-"} />
                  <InfoItem label="등급" value={detail.profile.tierName} />
                  <InfoItem label="가입일" value={detail.profile.createdAtLabel} />
                  <InfoItem label="최근 거래일" value={detail.profile.lastTransactionLabel} />
                </dl>
              </DetailPanel>
            </TabsContent>

            <TabsContent value="transactions" className="mt-0">
              <DetailPanel title="포인트 이력" description="최근 50건">
                <AppTable
                  columns={[
                    {
                      key: "createdAt",
                      header: "일시",
                      render: (row) => (
                        <span className="text-[var(--color-slate-500)]">{row.createdAtLabel}</span>
                      ),
                    },
                    {
                      key: "type",
                      header: "유형",
                      render: (row) => row.typeLabel,
                    },
                    {
                      key: "status",
                      header: "상태",
                      render: (row) => <StatusBadge status={row.status} type="transaction" />,
                    },
                    {
                      key: "memo",
                      header: "사유",
                      render: (row) => row.memo || "-",
                    },
                    {
                      key: "amount",
                      header: "포인트",
                      align: "right" as const,
                      render: (row) => (
                        <PointDisplay value={row.amount} type={row.direction} align="right" />
                      ),
                    },
                    {
                      key: "balanceAfter",
                      header: "잔액",
                      align: "right" as const,
                      render: (row) => (
                        <PointDisplay value={row.balanceAfter} type="default" align="right" />
                      ),
                    },
                  ]}
                  data={detail.transactions}
                  getRowKey={(row) => row.id}
                  emptyMessage="포인트 이력이 없습니다."
                />
              </DetailPanel>
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              <DetailPanel
                title="관리자 메모"
                description="삭제 불가 누적 기록"
                action={
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveModal("note")}
                  >
                    <MessageSquarePlus className="size-4" aria-hidden="true" />
                    메모 추가
                  </AppButton>
                }
              >
                <div className="space-y-3">
                  {detail.notes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--color-slate-200)] bg-[var(--color-slate-50)] p-8 text-center text-sm text-[var(--color-slate-500)]">
                      관리자 메모가 없습니다.
                    </div>
                  ) : (
                    detail.notes.map((note) => (
                      <article
                        key={note.id}
                        className="rounded-lg border border-[var(--color-slate-200)] bg-[var(--color-slate-50)] p-4"
                      >
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div className="text-sm font-semibold text-[var(--color-slate-900)]">
                            {note.createdByLabel}
                          </div>
                          <div className="text-xs text-[var(--color-slate-500)]">
                            {note.createdAtLabel}
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-slate-700)]">
                          {note.body}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </DetailPanel>
            </TabsContent>
          </Tabs>

          <ProfileModal
            open={activeModal === "profile"}
            form={profileForm}
            disabled={updateProfileMutation.isPending}
            onOpenChange={(open) => setActiveModal(open ? "profile" : null)}
            onChange={setProfileForm}
            onSubmit={submitProfile}
          />
          <StatusModal
            open={activeModal === "status"}
            form={statusForm}
            disabled={updateStatusMutation.isPending}
            onOpenChange={(open) => setActiveModal(open ? "status" : null)}
            onChange={setStatusForm}
            onSubmit={submitStatus}
          />
          <PointModal
            open={activeModal === "points"}
            form={pointForm}
            disabled={createPointMutation.isPending}
            onOpenChange={(open) => setActiveModal(open ? "points" : null)}
            onChange={setPointForm}
            onSubmit={submitPoints}
          />
          <NoteModal
            open={activeModal === "note"}
            body={noteBody}
            disabled={addNoteMutation.isPending}
            onOpenChange={(open) => setActiveModal(open ? "note" : null)}
            onBodyChange={setNoteBody}
            onSubmit={submitNote}
          />
        </>
      ) : (
        <div className="rounded-lg border border-[var(--color-slate-200)] bg-white p-10 text-center text-sm text-[var(--color-slate-500)]">
          고객 정보를 찾을 수 없습니다.
        </div>
      )}
    </div>
  );
}

async function fetchCustomerDetail(id: string): Promise<CustomerDetail> {
  const { data, error } = await detailClient.rpc("get_admin_customer_detail", { _user_id: id });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeCustomerDetail(data);
}

function useDetailMutation(id: string, queryClient: ReturnType<typeof useQueryClient>, fn: string) {
  return useMutation({
    mutationFn: async (args: Record<string, unknown>) => {
      const { data, error } = await detailClient.rpc(fn, args);

      if (error) {
        throw new Error(error.message || formatApiErrorMessage(error));
      }

      return normalizeCustomerDetail(data);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(["admin-customer-detail", id], detail);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    },
  });
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "earn" | "use" | "warning";
}) {
  const toneClassName = {
    default: "bg-[var(--color-primary-50)] text-[var(--color-primary-700)]",
    earn: "bg-[var(--color-earn-bg)] text-[var(--color-earn-text)]",
    use: "bg-[var(--color-use-bg)] text-[var(--color-use-text)]",
    warning: "bg-[var(--color-pending-bg)] text-[var(--color-pending-text)]",
  }[tone];

  return (
    <article className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-[var(--color-slate-500)]">{label}</div>
      <div
        className={`mt-3 text-2xl font-bold tabular-nums ${toneClassName} inline-flex rounded-md px-2 py-1`}
      >
        {formatPoint(value)}
      </div>
    </article>
  );
}

function DetailPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white shadow-sm">
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--color-slate-200)] px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-slate-200)] bg-[var(--color-slate-50)] p-4">
      <dt className="text-xs font-semibold text-[var(--color-slate-500)]">{label}</dt>
      <dd className="mt-2 break-words text-sm font-semibold text-[var(--color-slate-900)]">
        {value}
      </dd>
    </div>
  );
}

function ProfileModal({
  open,
  form,
  disabled,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: { fullName: string; email: string; phone: string; birthDate: string; reason: string };
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: {
    fullName: string;
    email: string;
    phone: string;
    birthDate: string;
    reason: string;
  }) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="고객 정보 수정"
      description="수정 사유는 감사 로그에 저장됩니다."
      footer={
        <>
          <AppButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            취소
          </AppButton>
          <AppButton type="submit" form="customer-profile-form" loading={disabled}>
            저장
          </AppButton>
        </>
      }
    >
      <form id="customer-profile-form" className="space-y-4" onSubmit={onSubmit}>
        <AppInput
          label="이름"
          value={form.fullName}
          onChange={(event) => onChange({ ...form, fullName: event.target.value })}
        />
        <AppInput
          label="이메일"
          type="email"
          value={form.email}
          onChange={(event) => onChange({ ...form, email: event.target.value })}
        />
        <AppInput
          label="연락처"
          value={form.phone}
          onChange={(event) => onChange({ ...form, phone: event.target.value })}
        />
        <AppInput
          label="생년월일"
          type="date"
          value={form.birthDate}
          onChange={(event) => onChange({ ...form, birthDate: event.target.value })}
        />
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-[var(--color-slate-700)]">
            수정 사유
          </span>
          <Textarea
            value={form.reason}
            onChange={(event) => onChange({ ...form, reason: event.target.value })}
            placeholder="고객 요청에 따른 연락처 수정"
            className="min-h-24"
          />
        </label>
      </form>
    </AppModal>
  );
}

function StatusModal({
  open,
  form,
  disabled,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: { status: string; reason: string };
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: { status: string; reason: string }) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="고객 상태 변경"
      description="상태 변경은 즉시 적용되며 감사 로그에 저장됩니다."
      footer={
        <>
          <AppButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            취소
          </AppButton>
          <AppButton type="submit" form="customer-status-form" loading={disabled}>
            변경
          </AppButton>
        </>
      }
    >
      <form id="customer-status-form" className="space-y-4" onSubmit={onSubmit}>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-[var(--color-slate-700)]">상태</span>
          <select
            value={form.status}
            onChange={(event) => onChange({ ...form, status: event.target.value })}
            className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-[var(--color-slate-700)]">
            변경 사유
          </span>
          <Textarea
            value={form.reason}
            onChange={(event) => onChange({ ...form, reason: event.target.value })}
            placeholder="고객 요청 또는 운영 정책에 따른 상태 변경"
            className="min-h-24"
          />
        </label>
      </form>
    </AppModal>
  );
}

function PointModal({
  open,
  form,
  disabled,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: { type: ManualPointType; amount: string; memo: string; expiresAt: string };
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: {
    type: ManualPointType;
    amount: string;
    memo: string;
    expiresAt: string;
  }) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={form.type === "manual_earn" ? "포인트 지급" : "포인트 차감"}
      description="포인트 조정 사유는 10자 이상 필요합니다."
      footer={
        <>
          <AppButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            취소
          </AppButton>
          <AppButton type="submit" form="customer-point-form" loading={disabled}>
            처리
          </AppButton>
        </>
      }
    >
      <form id="customer-point-form" className="space-y-4" onSubmit={onSubmit}>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-[var(--color-slate-700)]">유형</span>
          <select
            value={form.type}
            onChange={(event) => onChange({ ...form, type: event.target.value as ManualPointType })}
            className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
          >
            <option value="manual_earn">지급</option>
            <option value="manual_deduct">차감</option>
          </select>
        </label>
        <AppInput
          label="포인트"
          type="number"
          min={1}
          value={form.amount}
          onChange={(event) => onChange({ ...form, amount: event.target.value })}
        />
        {form.type === "manual_earn" && (
          <AppInput
            label="만료일"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => onChange({ ...form, expiresAt: event.target.value })}
          />
        )}
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-[var(--color-slate-700)]">사유</span>
          <Textarea
            value={form.memo}
            onChange={(event) => onChange({ ...form, memo: event.target.value })}
            placeholder="이벤트 보상 지급 또는 오류 보정 사유"
            className="min-h-24"
          />
        </label>
      </form>
    </AppModal>
  );
}

function NoteModal({
  open,
  body,
  disabled,
  onOpenChange,
  onBodyChange,
  onSubmit,
}: {
  open: boolean;
  body: string;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onBodyChange: (body: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="관리자 메모 추가"
      description="메모는 삭제할 수 없는 누적 기록으로 남습니다."
      footer={
        <>
          <AppButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            취소
          </AppButton>
          <AppButton type="submit" form="customer-note-form" loading={disabled}>
            추가
          </AppButton>
        </>
      }
    >
      <form id="customer-note-form" onSubmit={onSubmit}>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-[var(--color-slate-700)]">메모</span>
          <Textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder="고객 응대 내역 또는 운영상 참고사항"
            className="min-h-32"
          />
        </label>
      </form>
    </AppModal>
  );
}

function CustomerDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 rounded-lg bg-[var(--color-slate-200)]" />
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg bg-[var(--color-slate-200)]" />
        ))}
      </section>
      <Skeleton className="h-96 rounded-lg bg-[var(--color-slate-200)]" />
    </div>
  );
}
