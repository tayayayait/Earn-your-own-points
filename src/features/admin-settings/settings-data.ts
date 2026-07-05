import { formatDate } from "@/lib/formatters";

export type AdminRole = "owner" | "manager" | "operator" | "viewer";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type BrandSettingsForm = {
  serviceName: string;
  pointLabel: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  homeMessage: string;
  reason: string;
};

export type AdminInviteForm = {
  email: string;
  adminRole: AdminRole;
  reason: string;
};

export type AuditLogFilters = {
  actorId: string | null;
  action: string;
  targetTable: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

export type SaveBrandSettingsRpcArgs = {
  _service_name: string;
  _point_label: string;
  _logo_url: string | null;
  _primary_color: string;
  _secondary_color: string | null;
  _home_message: string | null;
  _reason: string;
};

export type InviteAdminRpcArgs = {
  _email: string;
  _admin_role: AdminRole;
  _reason: string;
};

export type UpdateAdminRoleRpcArgs = {
  _user_id: string;
  _admin_role: AdminRole;
  _reason: string;
};

export type AuditLogRpcArgs = {
  _actor_id: string | null;
  _action: string | null;
  _target_table: string | null;
  _date_from: string | null;
  _date_to: string | null;
  _page: number;
  _page_size: number;
};

type RawAdminSettingsResponse = {
  brand?: RawBrandSettings;
  admins?: RawAdmin[];
  invitations?: RawInvitation[];
  audit_logs?: RawAuditLogResponse;
} | null;

type RawBrandSettings = {
  service_name?: unknown;
  point_label?: unknown;
  logo_url?: unknown;
  primary_color?: unknown;
  secondary_color?: unknown;
  home_message?: unknown;
  updated_at?: unknown;
};

type RawAdmin = {
  id?: unknown;
  full_name?: unknown;
  email?: unknown;
  admin_role?: unknown;
  status?: unknown;
  created_at?: unknown;
};

type RawInvitation = {
  id?: unknown;
  email?: unknown;
  admin_role?: unknown;
  status?: unknown;
  expires_at?: unknown;
  created_at?: unknown;
};

type RawAuditLogResponse = {
  logs?: RawAuditLog[];
  total_count?: unknown;
};

type RawAuditLog = {
  id?: unknown;
  actor_id?: unknown;
  actor_name?: unknown;
  actor_email?: unknown;
  actor_role?: unknown;
  action?: unknown;
  target_table?: unknown;
  target_id?: unknown;
  before_data?: unknown;
  after_data?: unknown;
  reason?: unknown;
  ip_address?: unknown;
  user_agent?: unknown;
  created_at?: unknown;
};

export type AdminSettingsData = {
  brand: {
    serviceName: string;
    pointLabel: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    homeMessage: string;
    updatedAt: string | null;
    updatedAtLabel: string;
  };
  admins: Array<{
    id: string;
    fullName: string;
    email: string;
    adminRole: AdminRole;
    adminRoleLabel: string;
    status: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    adminRole: AdminRole;
    adminRoleLabel: string;
    status: InvitationStatus;
    expiresAt: string;
    expiresAtLabel: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  auditLogs: {
    logs: Array<{
      id: string;
      actorId: string | null;
      actorName: string;
      actorEmail: string;
      actorRole: string;
      action: string;
      targetTable: string;
      targetId: string;
      beforeData: unknown;
      afterData: unknown;
      beforeDataText: string;
      afterDataText: string;
      reason: string;
      ipAddress: string;
      userAgent: string;
      createdAt: string;
      createdAtLabel: string;
    }>;
    totalCount: number;
  };
};

export const adminRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: "owner", label: "OWNER" },
  { value: "manager", label: "MANAGER" },
  { value: "operator", label: "OPERATOR" },
  { value: "viewer", label: "VIEWER" },
];

export const defaultBrandSettingsForm: BrandSettingsForm = {
  serviceName: "",
  pointLabel: "P",
  logoUrl: "",
  primaryColor: "#2563EB",
  secondaryColor: "",
  homeMessage: "",
  reason: "",
};

export const defaultAdminInviteForm: AdminInviteForm = {
  email: "",
  adminRole: "viewer",
  reason: "",
};

export const defaultAuditFilters: AuditLogFilters = {
  actorId: null,
  action: "",
  targetTable: "",
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 20,
};

const adminRoles = new Set<AdminRole>(["owner", "manager", "operator", "viewer"]);
const invitationStatuses = new Set<InvitationStatus>(["pending", "accepted", "expired", "revoked"]);

export function normalizeAdminSettingsResponse(raw: RawAdminSettingsResponse): AdminSettingsData {
  const updatedAt = toNullableString(raw?.brand?.updated_at);

  return {
    brand: {
      serviceName: toStringValue(raw?.brand?.service_name) || "포인트 라운지",
      pointLabel: toStringValue(raw?.brand?.point_label) || "P",
      logoUrl: toStringValue(raw?.brand?.logo_url),
      primaryColor: toStringValue(raw?.brand?.primary_color) || "#2563EB",
      secondaryColor: toStringValue(raw?.brand?.secondary_color),
      homeMessage: toStringValue(raw?.brand?.home_message),
      updatedAt,
      updatedAtLabel: updatedAt ? formatDate(updatedAt, "admin") : "-",
    },
    admins: (raw?.admins ?? []).map((item) => {
      const adminRole = normalizeAdminRole(item.admin_role);
      const createdAt = toStringValue(item.created_at);

      return {
        id: toStringValue(item.id),
        fullName: toStringValue(item.full_name) || "-",
        email: toStringValue(item.email),
        adminRole,
        adminRoleLabel: getAdminRoleLabel(adminRole),
        status: toStringValue(item.status) || "active",
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
      };
    }),
    invitations: (raw?.invitations ?? []).map((item) => {
      const adminRole = normalizeAdminRole(item.admin_role);
      const status = normalizeInvitationStatus(item.status);
      const expiresAt = toStringValue(item.expires_at);
      const createdAt = toStringValue(item.created_at);

      return {
        id: toStringValue(item.id),
        email: toStringValue(item.email),
        adminRole,
        adminRoleLabel: getAdminRoleLabel(adminRole),
        status,
        expiresAt,
        expiresAtLabel: expiresAt ? formatDate(expiresAt, "admin") : "-",
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
      };
    }),
    auditLogs: normalizeAuditLogs(raw?.audit_logs),
  };
}

export function brandSettingsToForm(brand: AdminSettingsData["brand"]): BrandSettingsForm {
  return {
    serviceName: brand.serviceName,
    pointLabel: brand.pointLabel,
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    homeMessage: brand.homeMessage,
    reason: "",
  };
}

export function validateBrandSettingsForm(form: BrandSettingsForm): string | null {
  const serviceName = form.serviceName.trim();
  const pointLabel = form.pointLabel.trim();
  const homeMessage = form.homeMessage.trim();

  if (serviceName.length < 2 || serviceName.length > 30) {
    return "서비스명은 2~30자로 입력하세요.";
  }
  if (pointLabel.length < 1 || pointLabel.length > 12) {
    return "포인트 명칭은 1~12자로 입력하세요.";
  }
  if (!isHexColor(form.primaryColor)) return "대표 색상은 HEX 형식으로 입력하세요.";
  if (form.secondaryColor.trim() && !isHexColor(form.secondaryColor)) {
    return "보조 색상은 HEX 형식으로 입력하세요.";
  }
  if (getContrastRatio(form.primaryColor, "#FFFFFF") < 4.5) {
    return "대표 색상은 흰색 텍스트와 WCAG 대비 4.5:1 이상이어야 합니다.";
  }
  if (homeMessage.length > 100) return "사용자 홈 안내문은 100자 이내로 입력하세요.";
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function validateAdminInviteForm(form: AdminInviteForm): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  if (!adminRoles.has(form.adminRole)) return "관리자 역할이 올바르지 않습니다.";
  if (form.reason.trim().length < 10) return "감사 사유는 10자 이상 입력해야 합니다.";

  return null;
}

export function validateLogoFileMeta(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  const allowedTypes = new Set(["image/svg+xml", "image/png", "image/webp"]);
  const allowedExtensions = /\.(svg|png|webp)$/i;

  if (!allowedTypes.has(file.type) || !allowedExtensions.test(file.name)) {
    return "로고는 SVG, PNG, WebP 형식만 업로드할 수 있습니다.";
  }
  if (file.size > 2 * 1024 * 1024) {
    return "로고 파일은 최대 2MB까지 업로드할 수 있습니다.";
  }

  return null;
}

export function buildSaveBrandSettingsRpcArgs(form: BrandSettingsForm): SaveBrandSettingsRpcArgs {
  return {
    _service_name: form.serviceName.trim(),
    _point_label: form.pointLabel.trim(),
    _logo_url: toNullableTrimmed(form.logoUrl),
    _primary_color: form.primaryColor.trim().toUpperCase(),
    _secondary_color: toNullableTrimmed(form.secondaryColor)?.toUpperCase() ?? null,
    _home_message: toNullableTrimmed(form.homeMessage),
    _reason: form.reason.trim(),
  };
}

export function buildInviteAdminRpcArgs(form: AdminInviteForm): InviteAdminRpcArgs {
  return {
    _email: form.email.trim().toLowerCase(),
    _admin_role: form.adminRole,
    _reason: form.reason.trim(),
  };
}

export function buildUpdateAdminRoleRpcArgs(
  userId: string,
  adminRole: AdminRole,
  reason: string,
): UpdateAdminRoleRpcArgs {
  return {
    _user_id: userId,
    _admin_role: adminRole,
    _reason: reason.trim(),
  };
}

export function buildAuditLogRpcArgs(filters: AuditLogFilters): AuditLogRpcArgs {
  return {
    _actor_id: filters.actorId || null,
    _action: filters.action.trim() || null,
    _target_table: filters.targetTable.trim() || null,
    _date_from: filters.dateFrom || null,
    _date_to: filters.dateTo || null,
    _page: Math.max(1, filters.page),
    _page_size: Math.min(100, Math.max(1, filters.pageSize)),
  };
}

export function getAdminRoleLabel(role: AdminRole): string {
  return adminRoleOptions.find((option) => option.value === role)?.label ?? role;
}

export function getContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function normalizeAuditLogs(raw: RawAuditLogResponse | undefined): AdminSettingsData["auditLogs"] {
  return {
    logs: (raw?.logs ?? []).map((item) => {
      const createdAt = toStringValue(item.created_at);
      const beforeData = item.before_data ?? null;
      const afterData = item.after_data ?? null;

      return {
        id: toStringValue(item.id),
        actorId: toNullableString(item.actor_id),
        actorName: toStringValue(item.actor_name) || "-",
        actorEmail: toStringValue(item.actor_email),
        actorRole: toStringValue(item.actor_role),
        action: toStringValue(item.action),
        targetTable: toStringValue(item.target_table),
        targetId: toStringValue(item.target_id),
        beforeData,
        afterData,
        beforeDataText: formatJson(beforeData),
        afterDataText: formatJson(afterData),
        reason: toStringValue(item.reason),
        ipAddress: toStringValue(item.ip_address),
        userAgent: toStringValue(item.user_agent),
        createdAt,
        createdAtLabel: createdAt ? formatDate(createdAt, "admin") : "-",
      };
    }),
    totalCount: toNumber(raw?.total_count),
  };
}

function normalizeAdminRole(value: unknown): AdminRole {
  const role = toStringValue(value);
  return adminRoles.has(role as AdminRole) ? (role as AdminRole) : "viewer";
}

function normalizeInvitationStatus(value: unknown): InvitationStatus {
  const status = toStringValue(value);
  return invitationStatuses.has(status as InvitationStatus)
    ? (status as InvitationStatus)
    : "pending";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

function getRelativeLuminance(hex: string): number {
  const color = hex.trim().replace("#", "");
  const channels = [0, 2, 4].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const normalized = toStringValue(value);
  return normalized || null;
}

function toNullableTrimmed(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}
