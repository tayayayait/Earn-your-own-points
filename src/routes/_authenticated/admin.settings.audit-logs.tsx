import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppTable } from "@/components/common/AppTable";
import {
  buildAuditLogRpcArgs,
  defaultAuditFilters,
  normalizeAdminSettingsResponse,
  type AdminSettingsData,
  type AuditLogFilters,
  type AuditLogRpcArgs,
} from "@/features/admin-settings/settings-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type AuditRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_audit_logs", args: AuditLogRpcArgs): RpcResponse<unknown>;
};

type AuditLogRow = AdminSettingsData["auditLogs"]["logs"][number];

const auditClient = supabase as unknown as AuditRpcClient;

export const Route = createFileRoute("/_authenticated/admin/settings/audit-logs")({
  head: () => ({ meta: [{ title: "감사 로그 · 관리자" }] }),
  component: Page,
});

function Page() {
  const [filters, setFilters] = useState<AuditLogFilters>(defaultAuditFilters);

  const auditQuery = useQuery({
    queryKey: ["admin-audit-logs", filters],
    queryFn: () => fetchAuditLogs(filters),
  });

  const auditLogs = auditQuery.data?.auditLogs ?? normalizeAdminSettingsResponse(null).auditLogs;

  const columns = useMemo(
    () => [
      {
        key: "id",
        header: "로그 ID",
        render: (row: AuditLogRow) => <code className="text-xs">{row.id}</code>,
      },
      {
        key: "actor",
        header: "관리자",
        render: (row: AuditLogRow) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.actorName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.actorEmail || row.actorRole || "-"}
            </div>
          </div>
        ),
      },
      { key: "action", header: "액션", render: (row: AuditLogRow) => row.action },
      {
        key: "target",
        header: "대상",
        render: (row: AuditLogRow) => (
          <div>
            <div>{row.targetTable}</div>
            <code className="text-xs text-[var(--color-slate-500)]">{row.targetId}</code>
          </div>
        ),
      },
      { key: "reason", header: "사유", render: (row: AuditLogRow) => row.reason || "-" },
      { key: "created", header: "생성일", render: (row: AuditLogRow) => row.createdAtLabel },
    ],
    [],
  );

  function updateFilters(patch: Partial<AuditLogFilters>) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">감사 로그</h1>
        <p className="mt-1 text-sm text-[var(--color-slate-500)]">
          관리자, 액션, 대상, 기간별로 변경 이력을 조회합니다. 삭제 기능 없음, 읽기 전용입니다.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-slate-900)]">
          <Filter className="size-4" aria-hidden="true" />
          필터
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AppInput
            label="관리자 ID"
            value={filters.actorId ?? ""}
            onChange={(event) => updateFilters({ actorId: event.target.value || null })}
          />
          <AppInput
            label="액션"
            value={filters.action}
            onChange={(event) => updateFilters({ action: event.target.value })}
            placeholder="settings.brand.save"
          />
          <AppInput
            label="대상"
            value={filters.targetTable}
            onChange={(event) => updateFilters({ targetTable: event.target.value })}
            placeholder="brand_settings"
          />
          <AppInput
            type="date"
            label="시작일"
            value={filters.dateFrom}
            onChange={(event) => updateFilters({ dateFrom: event.target.value })}
          />
          <AppInput
            type="date"
            label="종료일"
            value={filters.dateTo}
            onChange={(event) => updateFilters({ dateTo: event.target.value })}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <AppButton type="button" variant="secondary" onClick={() => void auditQuery.refetch()}>
            <Search className="size-4" aria-hidden="true" />
            조회
          </AppButton>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white shadow-sm">
        <div className="border-b border-[var(--color-slate-200)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-slate-900)]">로그 테이블</h2>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            IP, User Agent, 변경 전/후 JSON diff를 함께 확인합니다.
          </p>
        </div>
        <div className="p-5">
          {auditQuery.error && (
            <div className="mb-4 rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
              {auditQuery.error.message}
            </div>
          )}
          <AppTable
            data={auditLogs.logs}
            getRowKey={(row) => row.id}
            columns={columns}
            emptyMessage="감사 로그가 없습니다."
          />
          <div className="mt-4 text-sm text-[var(--color-slate-500)]">
            총 {auditLogs.totalCount.toLocaleString("ko-KR")}건
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-[var(--color-slate-900)]">JSON diff</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {(auditLogs.logs.length ? auditLogs.logs.slice(0, 1) : [null]).map((row) => (
            <JsonDiffPreview key={row?.id ?? "empty"} row={row} />
          ))}
        </div>
      </section>
    </div>
  );
}

function JsonDiffPreview({ row }: { row: AuditLogRow | null }) {
  return (
    <>
      <div>
        <div className="mb-2 text-sm font-bold text-[var(--color-slate-700)]">변경 전</div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-[var(--color-slate-950)] p-4 text-xs text-white">
          {row?.beforeDataText ?? "null"}
        </pre>
      </div>
      <div>
        <div className="mb-2 text-sm font-bold text-[var(--color-slate-700)]">변경 후</div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-[var(--color-slate-950)] p-4 text-xs text-white">
          {row?.afterDataText ?? "null"}
        </pre>
      </div>
    </>
  );
}

async function fetchAuditLogs(filters: AuditLogFilters): Promise<AdminSettingsData> {
  const { data, error } = await auditClient.rpc(
    "get_admin_audit_logs",
    buildAuditLogRpcArgs(filters),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeAdminSettingsResponse({ audit_logs: data as Record<string, unknown> });
}
