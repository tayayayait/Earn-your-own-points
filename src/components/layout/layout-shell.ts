export const adminLayoutClasses = {
  root: "min-h-screen bg-[var(--color-slate-50)] text-[var(--color-slate-900)] md:flex",
  sidebar:
    "hidden shrink-0 flex-col bg-[var(--color-slate-900)] text-[var(--color-slate-300)] md:flex md:w-[72px] lg:w-[240px]",
  sidebarHeader: "flex h-14 items-center border-b border-white/10 px-4 lg:px-5",
  sidebarBrand:
    "truncate text-sm font-bold text-white md:sr-only lg:not-sr-only lg:whitespace-nowrap",
  nav: "flex-1 space-y-1 p-3",
  navLink:
    "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
  navLabel: "md:sr-only lg:not-sr-only",
  sidebarFooter: "border-t border-white/10 p-3",
  header:
    "sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--color-slate-200)] bg-white px-4 md:px-6",
  mobileDrawer:
    "fixed inset-y-0 left-0 z-50 w-[280px] border-r border-white/10 bg-[var(--color-slate-900)] text-[var(--color-slate-300)] shadow-xl sm:max-md:w-[320px] md:hidden",
  overlay: "fixed inset-0 z-40 bg-slate-950/45 md:hidden",
  main: "min-h-[calc(100vh-56px)] bg-[var(--color-slate-50)] p-4 md:p-6",
} as const;

export const appLayoutClasses = {
  root: "min-h-screen bg-[var(--color-slate-50)] pb-20 md:pb-0",
  header: "sticky top-0 z-30 h-14 border-b border-[var(--color-slate-200)] bg-white md:h-16",
  headerInner: "mx-auto flex h-full max-w-[960px] items-center justify-between px-4 md:px-6",
  desktopNav: "hidden items-center gap-1 md:flex",
  desktopNavLink:
    "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-600)]",
  main: "mx-auto max-w-[960px] px-4 py-5 md:px-6 md:py-6",
  bottomNav:
    "fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-[var(--color-slate-200)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden",
  bottomNavLink:
    "flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary-600)]",
} as const;

export function isAdminNavActive(pathname: string, target: string): boolean {
  if (target === "/admin/transactions") {
    return pathname === target;
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}

export function isAppNavActive(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}
