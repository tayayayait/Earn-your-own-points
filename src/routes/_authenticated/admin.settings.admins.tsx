import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { Copy, Send, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { AppTable } from "@/components/common/AppTable";
import {
  adminRoleOptions,
  buildInviteAdminRpcArgs,
  buildUpdateAdminRoleRpcArgs,
  defaultAdminInviteForm,
  getAdminRoleLabel,
  normalizeAdminSettingsResponse,
  validateAdminInviteForm,
  type AdminInviteForm,
  type AdminRole,
  type AdminSettingsData,
  type InviteAdminRpcArgs,
  type UpdateAdminRoleRpcArgs,
} from "@/features/admin-settings/settings-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type AdminsRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_admins", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "invite_admin_user", args: InviteAdminRpcArgs): RpcResponse<unknown>;
  rpc(fn: "update_admin_role", args: UpdateAdminRoleRpcArgs): RpcResponse<unknown>;
};

type AdminRow = AdminSettingsData["admins"][number];
type InvitationRow = AdminSettingsData["invitations"][number];
type MutationResult = { data: AdminSettingsData; inviteToken: string | null };

const adminsClient = supabase as unknown as AdminsRpcClient;
const queryKey = ["admin-settings-admins"] as const;
const EMPTY_ADMINS = normalizeAdminSettingsResponse(null);

export const Route = createFileRoute("/_authenticated/admin/settings/admins")({
  head: () => ({ meta: [{ title: "관리자 계정 및 권한 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [inviteForm, setInviteForm] = useState<AdminInviteForm>(defaultAdminInviteForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const adminsQuery = useQuery({
    queryKey,
    queryFn: fetchAdmins,
  });

  const data = adminsQuery.data ?? EMPTY_ADMINS;

  const inviteMutation = useMutation({
    mutationFn: inviteAdmin,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result.data);
      setInviteForm(defaultAdminInviteForm);
      setFormError(null);
      setInviteToken(result.inviteToken);
      toast.success("관리자 초대가 생성되었습니다.");
    },
    onError: (error) => setFormError(error.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: updateAdminRole,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result.data);
      toast.success("관리자 권한이 변경되었습니다.");
    },
    onError: (error) => toast.error(error.message),
  });

  const adminColumns = useMemo(
    () => [
      {
        key: "admin",
        header: "관리자",
        render: (row: AdminRow) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.fullName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">{row.email}</div>
          </div>
        ),
      },
      {
        key: "role",
        header: "역할",
        render: (row: AdminRow) => (
          <select
            value={row.adminRole}
            onChange={(event) =>
              updateRoleMutation.mutate({
                userId: row.id,
                adminRole: event.target.value as AdminRole,
                reason: `${row.email} 관리자 권한 변경 감사 사유입니다`,
              })
            }
            className="h-9 rounded-[6px] border border-[var(--color-slate-200)] bg-white px-2 text-sm"
            aria-label={`${row.email} 역할 변경`}
          >
            {adminRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ),
      },
      { key: "status", header: "상태", render: (row: AdminRow) => row.status },
      { key: "created", header: "생성일", render: (row: AdminRow) => row.createdAtLabel },
    ],
    [updateRoleMutation],
  );

  const invitationColumns = useMemo(
    () => [
      { key: "email", header: "이메일", render: (row: InvitationRow) => row.email },
      { key: "role", header: "역할", render: (row: InvitationRow) => row.adminRoleLabel },
      { key: "status", header: "상태", render: (row: InvitationRow) => row.status },
      { key: "expires", header: "만료", render: (row: InvitationRow) => row.expiresAtLabel },
    ],
    [],
  );

  function submitInvite() {
    const validationError = validateAdminInviteForm(inviteForm);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    inviteMutation.mutate(inviteForm);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">관리자 계정 및 권한</h1>
        <p className="mt-1 text-sm text-[var(--color-slate-500)]">
          OWNER, MANAGER, OPERATOR, VIEWER 역할을 관리합니다. OWNER 최소 1명 유지 규칙은 즉시
          적용됩니다.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AdminPanel title="관리자 목록" description="이름, 이메일, 역할, 상태를 확인합니다.">
          <AppTable
            data={data.admins}
            getRowKey={(row) => row.id}
            columns={adminColumns}
            emptyMessage="관리자가 없습니다."
          />
        </AdminPanel>

        <AdminPanel title="관리자 초대" description="초대 토큰은 24시간 만료됩니다.">
          <div className="space-y-4">
            <AppInput
              label="이메일"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="admin@example.com"
            />
            <label className="space-y-1.5">
              <span className="block text-sm font-semibold text-[var(--color-slate-700)]">
                역할
              </span>
              <select
                value={inviteForm.adminRole}
                onChange={(event) =>
                  setInviteForm((current) => ({
                    ...current,
                    adminRole: event.target.value as AdminRole,
                  }))
                }
                className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm"
              >
                {adminRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <AppInput
              label="감사 사유"
              value={inviteForm.reason}
              onChange={(event) =>
                setInviteForm((current) => ({ ...current, reason: event.target.value }))
              }
              placeholder="관리자 초대 사유"
            />
            {formError && (
              <div className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
                {formError}
              </div>
            )}
            <AppButton
              type="button"
              className="w-full"
              onClick={submitInvite}
              loading={inviteMutation.isPending}
              loadingLabel="초대 중"
            >
              <Send className="size-4" aria-hidden="true" />
              관리자 초대
            </AppButton>
          </div>
        </AdminPanel>
      </section>

      <AdminPanel title="초대 이력" description="대기 중이거나 최근 생성된 초대입니다.">
        <AppTable
          data={data.invitations}
          getRowKey={(row) => row.id}
          columns={invitationColumns}
          emptyMessage="초대 이력이 없습니다."
        />
      </AdminPanel>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 text-sm text-[var(--color-slate-600)]">
        <div className="flex items-center gap-2 font-bold text-[var(--color-slate-900)]">
          <ShieldCheck className="size-4" aria-hidden="true" />
          권한 변경 즉시 적용 + 감사 로그
        </div>
        <div className="mt-1">OWNER 최소 1명 유지 규칙을 위반하는 변경은 저장되지 않습니다.</div>
      </section>

      <AppModal
        open={Boolean(inviteToken)}
        onOpenChange={(open) => !open && setInviteToken(null)}
        title="관리자 초대 토큰"
        description="초대 토큰은 1회만 표시되며 24시간 만료됩니다."
        footer={
          <>
            <AppButton type="button" variant="secondary" onClick={() => setInviteToken(null)}>
              닫기
            </AppButton>
            <AppButton type="button" onClick={() => void copyInviteToken(inviteToken ?? "")}>
              <Copy className="size-4" aria-hidden="true" />
              복사
            </AppButton>
          </>
        }
      >
        <code className="block overflow-auto rounded-lg bg-[var(--color-slate-950)] p-4 text-xs text-white">
          {inviteToken}
        </code>
      </AppModal>
    </div>
  );
}

function AdminPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white shadow-sm">
      <div className="border-b border-[var(--color-slate-200)] px-5 py-4">
        <h2 className="text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

async function fetchAdmins(): Promise<AdminSettingsData> {
  const { data, error } = await adminsClient.rpc("get_admin_admins", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeAdminSettingsResponse(data as Record<string, unknown>);
}

async function inviteAdmin(form: AdminInviteForm): Promise<MutationResult> {
  const { data, error } = await adminsClient.rpc(
    "invite_admin_user",
    buildInviteAdminRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeMutationResult(data);
}

async function updateAdminRole({
  userId,
  adminRole,
  reason,
}: {
  userId: string;
  adminRole: AdminRole;
  reason: string;
}): Promise<MutationResult> {
  const { data, error } = await adminsClient.rpc(
    "update_admin_role",
    buildUpdateAdminRoleRpcArgs(userId, adminRole, reason),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return {
    data: normalizeAdminSettingsResponse(data as Record<string, unknown>),
    inviteToken: null,
  };
}

function normalizeMutationResult(data: unknown): MutationResult {
  if (!isRecord(data)) {
    return {
      data: normalizeAdminSettingsResponse(data as Record<string, unknown>),
      inviteToken: null,
    };
  }

  return {
    data: normalizeAdminSettingsResponse(data.admins as Record<string, unknown>),
    inviteToken: typeof data.invite_token === "string" ? data.invite_token : null,
  };
}

async function copyInviteToken(token: string) {
  if (!token) return;
  await navigator.clipboard.writeText(token);
  toast.success("복사되었습니다.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
