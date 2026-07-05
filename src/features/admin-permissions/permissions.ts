export type AdminRole = "owner" | "manager" | "operator" | "viewer";

export type AdminPermissionKey =
  | "dashboard.read"
  | "customers.read"
  | "customers.write"
  | "transactions.read"
  | "points.write"
  | "policies.read"
  | "policies.write"
  | "events.read"
  | "events.write"
  | "reports.read"
  | "integrations.read"
  | "integrations.write"
  | "brand.read"
  | "brand.write"
  | "admins.read"
  | "admins.write"
  | "audit.read";

export type AdminNavIcon =
  | "dashboard"
  | "customers"
  | "transactions"
  | "manual"
  | "policies"
  | "events"
  | "reports"
  | "integrations"
  | "brand"
  | "admins"
  | "audit";

export type AdminNavItem = {
  to:
    | "/admin/dashboard"
    | "/admin/customers"
    | "/admin/transactions"
    | "/admin/transactions/manual"
    | "/admin/policies/base"
    | "/admin/policies/tiers"
    | "/admin/policies/products"
    | "/admin/events"
    | "/admin/reports"
    | "/admin/integrations"
    | "/admin/settings/brand"
    | "/admin/settings/admins"
    | "/admin/settings/audit-logs";
  label: string;
  icon: AdminNavIcon;
  permission: AdminPermissionKey;
};

const adminRoles = new Set<AdminRole>(["owner", "manager", "operator", "viewer"]);

const rolePermissions: Record<AdminRole, ReadonlySet<AdminPermissionKey>> = {
  owner: new Set([
    "dashboard.read",
    "customers.read",
    "customers.write",
    "transactions.read",
    "points.write",
    "policies.read",
    "policies.write",
    "events.read",
    "events.write",
    "reports.read",
    "integrations.read",
    "integrations.write",
    "brand.read",
    "brand.write",
    "admins.read",
    "admins.write",
    "audit.read",
  ]),
  manager: new Set([
    "dashboard.read",
    "customers.read",
    "customers.write",
    "transactions.read",
    "points.write",
    "policies.read",
    "policies.write",
    "events.read",
    "events.write",
    "reports.read",
    "audit.read",
  ]),
  operator: new Set([
    "dashboard.read",
    "customers.read",
    "customers.write",
    "transactions.read",
    "points.write",
    "reports.read",
  ]),
  viewer: new Set([
    "dashboard.read",
    "customers.read",
    "transactions.read",
    "policies.read",
    "events.read",
    "reports.read",
  ]),
};

export const adminNavItems = [
  {
    to: "/admin/dashboard",
    label: "대시보드",
    icon: "dashboard",
    permission: "dashboard.read",
  },
  {
    to: "/admin/customers",
    label: "고객 관리",
    icon: "customers",
    permission: "customers.read",
  },
  {
    to: "/admin/transactions",
    label: "거래 내역",
    icon: "transactions",
    permission: "transactions.read",
  },
  {
    to: "/admin/transactions/manual",
    label: "수동 지급/차감",
    icon: "manual",
    permission: "points.write",
  },
  {
    to: "/admin/policies/base",
    label: "정책 관리",
    icon: "policies",
    permission: "policies.read",
  },
  {
    to: "/admin/policies/tiers",
    label: "등급 정책",
    icon: "customers",
    permission: "policies.read",
  },
  {
    to: "/admin/policies/products",
    label: "상품 정책",
    icon: "policies",
    permission: "policies.read",
  },
  {
    to: "/admin/events",
    label: "이벤트 관리",
    icon: "events",
    permission: "events.read",
  },
  {
    to: "/admin/reports",
    label: "리포트",
    icon: "reports",
    permission: "reports.read",
  },
  {
    to: "/admin/integrations",
    label: "API 연동",
    icon: "integrations",
    permission: "integrations.read",
  },
  {
    to: "/admin/settings/brand",
    label: "브랜드 설정",
    icon: "brand",
    permission: "brand.read",
  },
  {
    to: "/admin/settings/admins",
    label: "관리자 권한",
    icon: "admins",
    permission: "admins.read",
  },
  {
    to: "/admin/settings/audit-logs",
    label: "감사 로그",
    icon: "audit",
    permission: "audit.read",
  },
] as const satisfies readonly AdminNavItem[];

const routePermissions: Array<{ prefix: string; permission: AdminPermissionKey }> = [
  { prefix: "/admin/transactions/manual", permission: "points.write" },
  { prefix: "/admin/settings/audit-logs", permission: "audit.read" },
  { prefix: "/admin/settings/admins", permission: "admins.read" },
  { prefix: "/admin/settings/brand", permission: "brand.read" },
  { prefix: "/admin/integrations", permission: "integrations.read" },
  { prefix: "/admin/policies", permission: "policies.read" },
  { prefix: "/admin/events", permission: "events.read" },
  { prefix: "/admin/reports", permission: "reports.read" },
  { prefix: "/admin/customers", permission: "customers.read" },
  { prefix: "/admin/transactions", permission: "transactions.read" },
  { prefix: "/admin/dashboard", permission: "dashboard.read" },
];

export function normalizeAdminRole(value: unknown): AdminRole {
  return adminRoles.has(value as AdminRole) ? (value as AdminRole) : "viewer";
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermissionKey): boolean {
  return rolePermissions[normalizeAdminRole(role)].has(permission);
}

export function canAccessAdminNavItem(role: AdminRole, item: AdminNavItem): boolean {
  return hasAdminPermission(role, item.permission);
}

export function requiredPermissionForPath(pathname: string): AdminPermissionKey {
  return (
    routePermissions.find(
      (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
    )?.permission ?? "dashboard.read"
  );
}

export function getAdminPermissionLabel(permission: string | undefined): string {
  switch (permission) {
    case "customers.write":
      return "고객 수정";
    case "points.write":
      return "포인트 조정";
    case "policies.write":
      return "정책 수정";
    case "admins.read":
    case "admins.write":
      return "관리자 관리";
    case "audit.read":
      return "감사 로그 조회";
    case "integrations.read":
    case "integrations.write":
      return "API 연동 관리";
    case "brand.read":
    case "brand.write":
      return "브랜드 설정";
    default:
      return "관리자 권한";
  }
}
