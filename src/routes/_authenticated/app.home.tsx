import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { ChevronRight, Gift, Receipt, Sparkles, TimerReset } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  getPublicAppHomeData,
  normalizeAppHomeResponse,
  type AppHomeData,
} from "@/features/app-user/app-data";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveSession } from "@/lib/auth";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type AppHomeRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_app_home", args?: Record<string, never>): RpcResponse<unknown>;
};

const appHomeClient = supabase as unknown as AppHomeRpcClient;

export const Route = createFileRoute("/_authenticated/app/home")({
  head: () => ({ meta: [{ title: "홈 · 포인트 리워드" }] }),
  component: Home,
});

function Home() {
  const homeQuery = useQuery({
    queryKey: ["app-home"],
    queryFn: fetchHome,
  });

  if (homeQuery.isLoading) {
    return <Skeleton className="h-[680px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  if (homeQuery.error) {
    return (
      <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
        <div className="font-semibold">홈 정보를 불러오지 못했습니다.</div>
        <div className="mt-1">{homeQuery.error.message}</div>
      </section>
    );
  }

  const data = homeQuery.data;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-[var(--color-slate-500)]">
          {data.profile.name}님 · {data.profile.tierName}
        </p>
        <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">
          {data.brand.homeMessage || "사용 가능한 포인트를 확인하세요."}
        </h1>
      </header>

      <section
        className="flex min-h-[180px] flex-col justify-between rounded-lg p-6 text-white shadow-sm md:min-h-[220px]"
        style={{
          background: `linear-gradient(135deg, ${data.brand.primaryColor}, #0f172a)`,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">사용 가능 포인트</p>
            <div className="mt-2 text-[32px] font-bold leading-tight tabular-nums">
              {data.balance.availableLabel}
            </div>
          </div>
          <Sparkles className="size-7 text-white/80" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <SummaryChip label="적립 예정" value={data.balance.pendingLabel} />
          <SummaryChip label="30일 내 만료 예정" value={data.balance.expiringSoonLabel} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <InfoPanel title="적립 예정" icon={TimerReset}>
          {data.pendingEarnings.length === 0 ? (
            <EmptyLine message="확정 대기 중인 포인트가 없습니다." />
          ) : (
            data.pendingEarnings.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-slate-900)]">
                    {item.title}
                  </div>
                  <div className="text-xs text-[var(--color-slate-500)]">
                    확정 예정일 {item.confirmAtLabel}
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums text-[var(--color-earn-text)]">
                  {item.pointLabel}
                </div>
              </div>
            ))
          )}
        </InfoPanel>

        <InfoPanel title="만료 예정" icon={TimerReset}>
          {data.expiringPoints.length === 0 ? (
            <EmptyLine message="30일 내 만료 예정 포인트가 없습니다." />
          ) : (
            data.expiringPoints.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-2">
                <div className="text-sm text-[var(--color-slate-600)]">
                  만료일 {item.expiresAtLabel}
                </div>
                <div className="text-sm font-bold tabular-nums text-[var(--color-use-text)]">
                  {item.pointLabel}
                </div>
              </div>
            ))
          )}
        </InfoPanel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <InfoPanel title="최근 내역" icon={Receipt}>
          {data.recentTransactions.length === 0 ? (
            <EmptyLine message="최근 포인트 내역이 없습니다." />
          ) : (
            data.recentTransactions.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-slate-900)]">
                    {item.title}
                  </div>
                  <div className="text-xs text-[var(--color-slate-500)]">
                    {item.createdAtLabel} · {item.statusLabel}
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums">{item.amountLabel}</div>
              </div>
            ))
          )}
          <PanelLink to="/app/transactions" label="내역 전체보기" />
        </InfoPanel>

        <InfoPanel title="이벤트 혜택" icon={Gift}>
          {data.events.length === 0 ? (
            <EmptyLine message="진행 중인 이벤트가 없습니다." />
          ) : (
            data.events.map((event) => (
              <div key={event.id} className="rounded-lg bg-[var(--color-slate-50)] p-3">
                <div className="text-sm font-bold text-[var(--color-slate-900)]">{event.name}</div>
                <div className="mt-1 text-xs text-[var(--color-slate-500)]">
                  {event.rewardLabel} · {event.endsAtLabel}
                </div>
              </div>
            ))
          )}
          <PanelLink to="/app/benefits" label="사용 조건 확인" />
        </InfoPanel>
      </section>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/15 p-3">
      <div className="text-xs text-white/75">{label}</div>
      <div className="mt-1 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function InfoPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof TimerReset;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
        <h2 className="text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyLine({ message }: { message: string }) {
  return <div className="py-6 text-center text-sm text-[var(--color-slate-500)]">{message}</div>;
}

function PanelLink({ to, label }: { to: "/app/transactions" | "/app/benefits"; label: string }) {
  return (
    <Link
      to={to}
      className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[var(--color-primary-700)]"
    >
      {label}
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

async function fetchHome(): Promise<AppHomeData> {
  if (!(await hasActiveSession())) return getPublicAppHomeData();

  const { data, error } = await appHomeClient.rpc("get_app_home", {});

  if (error) {
    throw new Error(error.message);
  }

  return normalizeAppHomeResponse(data);
}
