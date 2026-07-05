# Admin Settings

Phase 5 adds three administrator settings routes:

- `src/routes/_authenticated/admin.settings.brand.tsx`
- `src/routes/_authenticated/admin.settings.admins.tsx`
- `src/routes/_authenticated/admin.settings.audit-logs.tsx`
- `src/features/admin-settings/settings-data.ts`
- `supabase/migrations/20260703161554_phase5_admin_settings.sql`

## Brand Settings

The brand settings page manages:

- Service name, 2 to 30 characters
- Point label, 1 to 12 characters
- Logo upload metadata, SVG/PNG/WebP up to 2MB
- Primary and secondary HEX colors
- WCAG contrast check for white text on the primary color
- User home message, up to 100 characters

`save_admin_brand_settings` records `settings.brand.save` in `audit_logs`.

## Admin Roles

The admin page lists admins and supports role changes:

- OWNER
- MANAGER
- OPERATOR
- VIEWER

`update_admin_role` preserves the owner minimum rule: at least one OWNER must remain.

`invite_admin_user` creates a pending invitation that expires after 24 hours and returns the invite token only once.

Role-specific access is enforced in both the admin shell and Supabase RPCs:

- OWNER: all administrator menus and write actions.
- MANAGER: customer updates, point adjustment, policy/event write actions, reports, and audit log read.
- OPERATOR: customer updates, point adjustment, transaction/manual point workflows, reports.
- VIEWER: read-only dashboard, customers, transactions, policies, events, and reports.

`/admin/no-permission` is the dedicated 403 page for authenticated users without the required administrator permission.

## Audit Logs

The audit log page is read-only. It filters by:

- Administrator
- Action
- Target table
- Date range

The table shows actor, action, target, reason, IP, User Agent, and creation time. The JSON diff preview displays the before/after payloads.

## Current State

- Migration files exist locally and are applied to remote Supabase.
- Migration content is covered by `src/integrations/supabase/admin-settings.test.ts`.
- Role permission migration content is covered by
  `src/integrations/supabase/admin-permissions.test.ts`.
- Data normalization and validation are covered by `src/features/admin-settings/settings-data.test.ts`.
- Route requirements are covered by `src/features/admin-settings/admin-settings-routes.test.ts`.
