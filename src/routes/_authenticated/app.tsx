import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Gift, Home, LogIn, LogOut, Receipt, User } from "lucide-react";

import { appLayoutClasses, isAppNavActive } from "@/components/layout/layout-shell";
import { signOut, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

const items = [
  { to: "/app/home", label: "홈", icon: Home },
  { to: "/app/transactions", label: "내역", icon: Receipt },
  { to: "/app/benefits", label: "혜택", icon: Gift },
  { to: "/app/profile", label: "프로필", icon: User },
] as const;

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className={appLayoutClasses.root}>
      <header className={appLayoutClasses.header}>
        <div className={appLayoutClasses.headerInner}>
          <Link to="/app/home" className="text-base font-bold text-[var(--color-slate-900)]">
            포인트 리워드
          </Link>
          <nav className={appLayoutClasses.desktopNav} aria-label="사용자 내비게이션">
            {items.map((item) => {
              const active = isAppNavActive(location.pathname, item.to);
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    appLayoutClasses.desktopNavLink,
                    active
                      ? "bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                      : "text-[var(--color-slate-500)] hover:bg-[var(--color-slate-100)] hover:text-[var(--color-slate-900)]",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {session ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-[var(--color-slate-500)] hover:text-[var(--color-slate-900)]"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <Link
              to="/admin/login"
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-[var(--color-slate-500)] hover:text-[var(--color-slate-900)]"
            >
              <LogIn className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">관리자</span>
            </Link>
          )}
        </div>
      </header>
      <main className={appLayoutClasses.main}>
        <Outlet />
      </main>
      <nav className={appLayoutClasses.bottomNav} aria-label="하단 내비게이션">
        {items.map((item) => {
          const active = isAppNavActive(location.pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                appLayoutClasses.bottomNavLink,
                active ? "text-[var(--color-primary-700)]" : "text-[var(--color-slate-500)]",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
