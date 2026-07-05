import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Users,
  Receipt,
  PlusCircle,
  SlidersHorizontal,
  CalendarDays,
  BarChart3,
  PlugZap,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { adminLayoutClasses, isAdminNavActive } from "@/components/layout/layout-shell";
import {
  adminNavItems,
  canAccessAdminNavItem,
  hasAdminPermission,
  normalizeAdminRole,
  requiredPermissionForPath,
  type AdminNavIcon,
} from "@/features/admin-permissions/permissions";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/admin/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/admin/no-permission" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("admin_role")
      .eq("id", userData.user.id)
      .maybeSingle();
    const adminRole = normalizeAdminRole(profile?.admin_role);
    const requiredPermission = requiredPermissionForPath(location.pathname);

    if (!hasAdminPermission(adminRole, requiredPermission)) {
      throw redirect({
        to: "/admin/no-permission",
        search: { required: requiredPermission },
      });
    }

    return { adminRole, requiredPermission };
  },
  component: AdminLayout,
});

const navIcons: Record<AdminNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  transactions: Receipt,
  manual: PlusCircle,
  policies: SlidersHorizontal,
  events: CalendarDays,
  reports: BarChart3,
  integrations: PlugZap,
  brand: SlidersHorizontal,
  admins: Users,
  audit: Receipt,
};

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { adminRole } = Route.useRouteContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <div className={adminLayoutClasses.root}>
      <aside className={adminLayoutClasses.sidebar} aria-label="관리자 내비게이션">
        <div className={adminLayoutClasses.sidebarHeader}>
          <div className={adminLayoutClasses.sidebarBrand}>포인트 관리자</div>
          <div className="hidden size-9 items-center justify-center rounded-md bg-white/10 text-sm font-bold text-white md:flex lg:hidden">
            P
          </div>
        </div>
        <nav className={adminLayoutClasses.nav}>
          <AdminNavLinks pathname={location.pathname} adminRole={adminRole} />
        </nav>
        <div className={adminLayoutClasses.sidebarFooter}>
          <button
            onClick={handleSignOut}
            className={cn(
              adminLayoutClasses.navLink,
              "w-full text-[var(--color-slate-300)] hover:bg-white/10 hover:text-white",
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            <span className={adminLayoutClasses.navLabel}>로그아웃</span>
          </button>
        </div>
      </aside>
      {mobileNavOpen && (
        <>
          <button
            type="button"
            className={adminLayoutClasses.overlay}
            aria-label="관리자 메뉴 닫기"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className={adminLayoutClasses.mobileDrawer} aria-label="모바일 관리자 내비게이션">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <div className="font-bold text-white">포인트 관리자</div>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-white hover:bg-white/10"
                aria-label="관리자 메뉴 닫기"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav className={adminLayoutClasses.nav} onClick={() => setMobileNavOpen(false)}>
              <AdminNavLinks pathname={location.pathname} adminRole={adminRole} forceLabels />
            </nav>
            <div className={adminLayoutClasses.sidebarFooter}>
              <button
                onClick={handleSignOut}
                className={cn(
                  adminLayoutClasses.navLink,
                  "w-full text-[var(--color-slate-300)] hover:bg-white/10 hover:text-white",
                )}
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span>로그아웃</span>
              </button>
            </div>
          </aside>
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={adminLayoutClasses.header}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--color-slate-200)] text-[var(--color-slate-700)] md:hidden"
              aria-label="관리자 메뉴 열기"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <div>
              <div className="text-sm font-bold text-[var(--color-slate-900)]">포인트 관리자</div>
              <div className="hidden text-xs text-[var(--color-slate-500)] sm:block">
                운영 현황과 포인트 거래를 관리합니다.
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--color-slate-500)] hover:text-[var(--color-slate-900)]"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </header>
        <main className={adminLayoutClasses.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminNavLinks({
  pathname,
  adminRole,
  forceLabels = false,
}: {
  pathname: string;
  adminRole: ReturnType<typeof normalizeAdminRole>;
  forceLabels?: boolean;
}) {
  return (
    <>
      {adminNavItems
        .filter((item) => canAccessAdminNavItem(adminRole, item))
        .map((item) => {
          const active = isAdminNavActive(pathname, item.to);
          const Icon = navIcons[item.icon];

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                adminLayoutClasses.navLink,
                active
                  ? "bg-white/10 text-white"
                  : "text-[var(--color-slate-300)] hover:bg-white/10 hover:text-white",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className={forceLabels ? undefined : adminLayoutClasses.navLabel}>
                {item.label}
              </span>
            </Link>
          );
        })}
    </>
  );
}
