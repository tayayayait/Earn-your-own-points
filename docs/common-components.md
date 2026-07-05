# Common Components

Phase 0-3 adds app-level shared components under `src/components/common`.

- `StatusBadge`: maps customer, transaction, transaction type, and policy status values through `src/lib/enums.ts`.
- `AppButton`: app button wrapper with `primary`, `secondary`, `ghost`, `danger`, and `success` variants plus loading state.
- `AppInput`: labeled input with helper/error text and accessible description wiring.
- `AppModal`: Radix dialog wrapper with fixed modal sizes and scrollable body. `AppModalFrame` is available for static rendering and tests.
- `LoadingState`, `EmptyState`, `ErrorState`: shared Phase 7 loading, empty, and error states with live regions and retry/action support.
- `AppTable`: desktop table plus mobile card layout from the same column definitions.
- `FilterBar`: shared search, period, status, and reset controls.
- `PointDisplay`: tabular point amount display using `formatPoint`.

Root toast rendering is connected in `src/routes/__root.tsx` through `src/components/ui/sonner.tsx`.

The current visual direction is dense and work-focused: restrained borders, stable control heights, token-based colors, and no nested decorative cards. Interactive controls keep a 44px minimum touch target.
