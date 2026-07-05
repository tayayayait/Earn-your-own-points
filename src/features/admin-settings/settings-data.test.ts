import { describe, expect, it } from "vitest";

import {
  buildAuditLogRpcArgs,
  buildInviteAdminRpcArgs,
  buildSaveBrandSettingsRpcArgs,
  buildUpdateAdminRoleRpcArgs,
  defaultAuditFilters,
  defaultBrandSettingsForm,
  getContrastRatio,
  normalizeAdminSettingsResponse,
  validateAdminInviteForm,
  validateBrandSettingsForm,
  validateLogoFileMeta,
} from "./settings-data";

describe("admin settings data helpers", () => {
  it("normalizes brand settings, admins, invitations, and audit logs", () => {
    const data = normalizeAdminSettingsResponse({
      brand: {
        service_name: "포인트 라운지",
        point_label: "P",
        logo_url: "https://example.com/logo.webp",
        primary_color: "#2563EB",
        secondary_color: "#10B981",
        home_message: "오늘도 포인트를 확인하세요",
        updated_at: "2026-07-04T00:00:00+09:00",
      },
      admins: [
        {
          id: "admin-1",
          full_name: "관리자",
          email: "admin@example.com",
          admin_role: "owner",
          status: "active",
          created_at: "2026-07-01T00:00:00+09:00",
        },
      ],
      invitations: [
        {
          id: "invite-1",
          email: "manager@example.com",
          admin_role: "manager",
          status: "pending",
          expires_at: "2026-07-05T00:00:00+09:00",
          created_at: "2026-07-04T00:00:00+09:00",
        },
      ],
      audit_logs: {
        logs: [
          {
            id: "log-1",
            actor_name: "관리자",
            actor_email: "admin@example.com",
            actor_role: "owner",
            action: "settings.brand.save",
            target_table: "brand_settings",
            target_id: "brand",
            before_data: { service_name: "Old" },
            after_data: { service_name: "New" },
            reason: "브랜드 변경 감사 사유입니다",
            ip_address: "127.0.0.1",
            user_agent: "Vitest",
            created_at: "2026-07-04T00:00:00+09:00",
          },
        ],
        total_count: "1",
      },
    });

    expect(data.brand).toMatchObject({
      serviceName: "포인트 라운지",
      pointLabel: "P",
      primaryColor: "#2563EB",
    });
    expect(data.admins[0]).toMatchObject({
      adminRole: "owner",
      adminRoleLabel: "OWNER",
    });
    expect(data.invitations[0]).toMatchObject({
      email: "manager@example.com",
      expiresAtLabel: "2026-07-05 00:00",
    });
    expect(data.auditLogs.logs[0]).toMatchObject({
      action: "settings.brand.save",
      beforeDataText: '{\n  "service_name": "Old"\n}',
    });
    expect(data.auditLogs.totalCount).toBe(1);
  });

  it("validates brand settings including contrast and logo metadata", () => {
    expect(
      validateBrandSettingsForm({
        ...defaultBrandSettingsForm,
        serviceName: "A",
        pointLabel: "P",
        primaryColor: "#2563EB",
        reason: "브랜드 변경 감사 사유입니다",
      }),
    ).toBe("서비스명은 2~30자로 입력하세요.");

    expect(
      validateBrandSettingsForm({
        ...defaultBrandSettingsForm,
        serviceName: "포인트 라운지",
        pointLabel: "POINT-LABEL-TOO-LONG",
        primaryColor: "#2563EB",
        reason: "브랜드 변경 감사 사유입니다",
      }),
    ).toBe("포인트 명칭은 1~12자로 입력하세요.");

    expect(getContrastRatio("#2563EB", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(validateLogoFileMeta({ name: "logo.gif", size: 1024, type: "image/gif" })).toBe(
      "로고는 SVG, PNG, WebP 형식만 업로드할 수 있습니다.",
    );
    expect(
      validateLogoFileMeta({ name: "logo.webp", size: 2 * 1024 * 1024 + 1, type: "image/webp" }),
    ).toBe("로고 파일은 최대 2MB까지 업로드할 수 있습니다.");
  });

  it("builds brand save, admin invite, role update, and audit filter RPC args", () => {
    expect(
      buildSaveBrandSettingsRpcArgs({
        ...defaultBrandSettingsForm,
        serviceName: "포인트 라운지",
        pointLabel: "P",
        logoUrl: "https://example.com/logo.webp",
        primaryColor: "#2563EB",
        secondaryColor: "#10B981",
        homeMessage: "오늘도 포인트를 확인하세요",
        reason: "브랜드 변경 감사 사유입니다",
      }),
    ).toEqual({
      _service_name: "포인트 라운지",
      _point_label: "P",
      _logo_url: "https://example.com/logo.webp",
      _primary_color: "#2563EB",
      _secondary_color: "#10B981",
      _home_message: "오늘도 포인트를 확인하세요",
      _reason: "브랜드 변경 감사 사유입니다",
    });

    expect(
      validateAdminInviteForm({
        email: "bad",
        adminRole: "manager",
        reason: "관리자 초대 감사 사유입니다",
      }),
    ).toBe("이메일 형식이 올바르지 않습니다.");
    expect(
      buildInviteAdminRpcArgs({
        email: "manager@example.com",
        adminRole: "manager",
        reason: "관리자 초대 감사 사유입니다",
      }),
    ).toEqual({
      _email: "manager@example.com",
      _admin_role: "manager",
      _reason: "관리자 초대 감사 사유입니다",
    });
    expect(buildUpdateAdminRoleRpcArgs("admin-1", "viewer", "권한 변경 감사 사유입니다")).toEqual({
      _user_id: "admin-1",
      _admin_role: "viewer",
      _reason: "권한 변경 감사 사유입니다",
    });
    expect(buildAuditLogRpcArgs({ ...defaultAuditFilters, action: "settings.brand.save" })).toEqual(
      {
        _actor_id: null,
        _action: "settings.brand.save",
        _target_table: null,
        _date_from: null,
        _date_to: null,
        _page: 1,
        _page_size: 20,
      },
    );
  });
});
