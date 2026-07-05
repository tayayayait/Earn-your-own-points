import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { Crown, Gift, Medal, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPublicAppBenefitsData,
  normalizeAppBenefitsResponse,
  type AppBenefitsData,
} from "@/features/app-user/app-data";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveSession } from "@/lib/auth";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type AppBenefitsRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_app_benefits", args?: Record<string, never>): RpcResponse<unknown>;
};

const appBenefitsClient = supabase as unknown as AppBenefitsRpcClient;

export const Route = createFileRoute("/_authenticated/app/benefits")({
  head: () => ({ meta: [{ title: "혜택 · 포인트 리워드" }] }),
  component: BenefitsPage,
});

function BenefitsPage() {
  const benefitsQuery = useQuery({
    queryKey: ["app-benefits"],
    queryFn: fetchBenefits,
  });

  if (benefitsQuery.isLoading) {
    return <Skeleton className="h-[720px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  if (benefitsQuery.error) {
    return (
      <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
        <div className="font-semibold">혜택 정보를 불러오지 못했습니다.</div>
        <div className="mt-1">{benefitsQuery.error.message}</div>
      </section>
    );
  }

  const data = benefitsQuery.data;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">혜택</h1>
      </header>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary-700)]">
              <Crown className="size-4" aria-hidden="true" />내 등급
            </div>
            <h2 className="mt-2 text-2xl font-bold text-[var(--color-slate-900)]">
              {data.currentTier.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-slate-500)]">
              기본 {data.currentTier.baseEarnRate}% · 추가 {data.currentTier.bonusEarnRate}%
            </p>
          </div>
          {data.nextTier && (
            <div className="text-right text-sm text-[var(--color-slate-600)]">
              다음 등급
              <div className="font-bold text-[var(--color-slate-900)]">{data.nextTier.name}</div>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[var(--color-slate-700)]">
              다음 등급까지 필요 금액/횟수
            </span>
            <span className="font-bold text-[var(--color-primary-700)]">
              {data.nextTierProgress.rate}%
            </span>
          </div>
          <Progress value={data.nextTierProgress.rate} aria-label="다음 등급 진행률" />
          <div className="grid gap-2 text-sm text-[var(--color-slate-500)] md:grid-cols-2">
            <div>필요 금액 {data.nextTierProgress.requiredSpend.toLocaleString("ko-KR")}원</div>
            <div>
              필요 횟수 {data.nextTierProgress.requiredPurchaseCount.toLocaleString("ko-KR")}회
            </div>
          </div>
          {data.nextTierProgress.reviewReady && (
            <div className="rounded-md bg-[var(--color-earn-bg)] px-3 py-2 text-sm font-bold text-[var(--color-earn-text)]">
              {data.nextTierProgress.message}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="등급 혜택" icon={Medal}>
          <div className="space-y-3">
            {data.tiers.length === 0 ? (
              <EmptyLine message="등록된 등급 혜택이 없습니다." />
            ) : (
              data.tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between gap-4 rounded-lg bg-[var(--color-slate-50)] p-3"
                >
                  <div>
                    <div className="font-bold text-[var(--color-slate-900)]">{tier.name}</div>
                    <div className="text-xs text-[var(--color-slate-500)]">
                      조건 {tier.minSpendLabel} · {tier.minPurchaseCountLabel}
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold text-[var(--color-primary-700)]">
                    {tier.baseEarnRate + tier.bonusEarnRate}%
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="이벤트" icon={Gift}>
          <div className="space-y-3">
            {data.events.length === 0 ? (
              <EmptyLine message="진행 중인 이벤트가 없습니다." />
            ) : (
              data.events.map((event) => (
                <div key={event.id} className="rounded-lg bg-[var(--color-slate-50)] p-3">
                  <div className="font-bold text-[var(--color-slate-900)]">{event.name}</div>
                  <div className="mt-1 text-sm text-[var(--color-slate-600)]">
                    {event.description || event.rewardLabel}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[var(--color-primary-700)]">
                    {event.rewardLabel} · {event.endsAtLabel}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <Panel title="사용 조건" icon={ShieldCheck}>
        <div className="grid gap-3 md:grid-cols-2">
          <ConditionCard label="최소 사용 포인트" value={data.redeemPolicy.minRedeemPointsLabel} />
          <ConditionCard label="최대 사용 비율" value={data.redeemPolicy.maxRedeemRatioLabel} />
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Gift;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
        <h2 className="text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ConditionCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-slate-50)] p-4">
      <div className="text-sm text-[var(--color-slate-500)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-[var(--color-slate-900)]">
        {value}
      </div>
    </div>
  );
}

function EmptyLine({ message }: { message: string }) {
  return <div className="py-6 text-center text-sm text-[var(--color-slate-500)]">{message}</div>;
}

async function fetchBenefits(): Promise<AppBenefitsData> {
  if (!(await hasActiveSession())) return getPublicAppBenefitsData();

  const { data, error } = await appBenefitsClient.rpc("get_app_benefits", {});

  if (error) {
    throw new Error(error.message);
  }

  return normalizeAppBenefitsResponse(data);
}
