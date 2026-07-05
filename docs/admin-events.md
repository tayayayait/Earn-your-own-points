# Admin Events

Phase 3-1 adds event list and event creation management.

- Route: `src/routes/_authenticated/admin.events.tsx`
- Data normalizer: `src/features/admin-events/event-data.ts`
- Migration: `supabase/migrations/20260703153934_phase3_admin_events.sql`

RPCs:

- `get_admin_events()`: returns event list rows and overlap warning data for active, scheduled, and paused events.
- `save_admin_event(...)`: creates or updates an event after validating name, period, reward type/value, customer limit, total budget, priority, status, and audit reason.
- `update_admin_event_status(_event_id, _status, _reason)`: changes event status and records an audit log.

UI behavior:

- The table shows event name, status, period, target summary, reward method, payout limits, payout progress, and status actions.
- The right panel is a five-step wizard: basic info, target settings, reward method, limit settings, and review.
- Target rules are stored as JSONB arrays for tiers, segments, products, and categories.
- Period overlaps are warnings, not save blockers. Operators must use priority to resolve overlaps.
- Customer limit cannot be zero. End time cannot be before start time.
- Audit reason is required for save and status changes.

Security and access:

- Every RPC checks `public.has_role((select auth.uid()), 'admin')`.
- Public and anon execution is revoked.
- Authenticated execution is explicitly granted for Supabase Data API access.
- The migration is local-only until pushed to the remote Supabase project.
