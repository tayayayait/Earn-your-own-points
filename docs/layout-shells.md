# Layout Shells

Phase 0-4 refactors the authenticated app shells.

- Shared layout class rules live in `src/components/layout/layout-shell.ts`.
- Admin layout is implemented in `src/routes/_authenticated/admin.tsx`.
  - Desktop sidebar expands to 240px at `lg`.
  - Tablet sidebar collapses to 72px at `md`.
  - Mobile uses a drawer-style navigation with 44px minimum touch targets.
  - Header height is 56px and main content uses `calc(100vh - 56px)`.
  - Admin navigation is filtered by `profiles.admin_role` using
    `src/features/admin-permissions/permissions.ts`.
  - Unauthorized admin paths redirect to `/admin/no-permission`.
- User layout is implemented in `src/routes/_authenticated/app.tsx`.
  - Mobile header is 56px.
  - Desktop header is 64px.
  - Main content max width is 960px.
  - Mobile bottom navigation is 64px with safe-area padding.
  - Phase 6 replaces placeholder/mojibake labels with readable Korean navigation labels:
    `홈`, `내역`, `혜택`, `프로필`.

Tests for layout class contracts live in `src/components/layout/layout-shell.test.ts`.
