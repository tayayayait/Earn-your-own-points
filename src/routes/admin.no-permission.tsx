import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import {
  getAdminPermissionLabel,
  type AdminPermissionKey,
} from "@/features/admin-permissions/permissions";
import { supabase } from "@/integrations/supabase/client";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/admin/no-permission")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    required: typeof search.required === "string" ? search.required : undefined,
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/admin/login" });
  },
  head: () => ({ meta: [{ title: "권한 없음 · 포인트 리워드" }] }),
  component: AdminNoPermissionPage,
});

function AdminNoPermissionPage() {
  const { required } = Route.useSearch();
  const requiredLabel = getAdminPermissionLabel(required as AdminPermissionKey | undefined);

  async function handleSignOut() {
    await signOut();
    window.location.assign("/admin/login");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-slate-50)] px-4 py-10 text-[var(--color-slate-900)]">
      <section className="w-full max-w-lg rounded-lg border border-[var(--color-slate-200)] bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-[var(--color-error-bg)] text-[var(--color-error-text)]">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--color-danger-600)]">403</p>
            <h1 className="mt-1 text-2xl font-bold">권한이 없습니다.</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--color-slate-600)]">
              이 관리자 기능에 접근할 수 없습니다. 필요한 권한:{" "}
              <strong className="text-[var(--color-slate-900)]">{requiredLabel}</strong>
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            to="/admin/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-primary-600)] px-4 text-sm font-bold text-white hover:bg-[var(--color-primary-700)]"
          >
            대시보드로 이동
          </Link>
          <Link
            to="/app/home"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-slate-200)] px-4 text-sm font-bold text-[var(--color-slate-700)] hover:bg-[var(--color-slate-50)]"
          >
            사용자 홈으로 이동
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-bold text-[var(--color-slate-500)] hover:text-[var(--color-slate-900)]"
            onClick={handleSignOut}
          >
            로그아웃
          </button>
        </div>
      </section>
    </main>
  );
}
