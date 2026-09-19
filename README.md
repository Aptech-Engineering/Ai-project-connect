# AI Project Connect — Analytics Dashboard

Frontend for the read-only Analytics dashboard described in the product & technical
specification (v1.1), built with **Next.js 14 (App Router)**, **TypeScript** and
**Tailwind CSS**, following the design system in section 11 exactly (brand tokens,
validated chart palette, Poppins/Lato type pairing).

This build ships all 12 screens (Overview, Traffic, Engagement, Funnels, Revenue,
Projects, Sales pipeline, Clients, Courses, Team, Operations, Realtime), global
controls (date range, compare, URL-persisted state), the sign-in screen, saved-view
and definitions UI, and sortable/exportable tables — wired against a **local mock data
layer** that mirrors the API contract in section 9 (same envelope shape, same KPI/series/
breakdown/funnel-step building blocks), so swapping in the real API is a matter of
replacing `lib/mock/generators.ts` calls with `fetch()` calls to `/api/analytics/*`.

Auth/session wiring was explicitly out of scope for this build (per your note) — there's
a working sign-in screen and a role switcher in the top bar (Admin/Staff) so you can see
how the Revenue and Team screens gate for non-admins, but it's a local mock, not real
session auth.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/analytics`.

- `/analytics` — the dashboard (Overview by default)
- `/analytics?view=<screen>` — any screen, e.g. `?view=revenue`
- `/analytics?view=revenue&from=2026-08-01&to=2026-08-31&compare=previous` — full
  shareable state, exactly as section 3.1 specifies
- `/analytics/sign-in` — the branded sign-in screen

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Project structure

```
app/
  layout.tsx              Root layout, Google Fonts (Poppins/Lato)
  page.tsx                Redirects "/" -> "/analytics"
  analytics/
    page.tsx               Route entry (Suspense wrapper)
    AnalyticsApp.tsx        Shell: sidebar, top bar, screen switch, drawer
    sign-in/page.tsx        Branded sign-in screen (section 11.6)
components/
  Sidebar.tsx, MobileNav.tsx        Nav (collapses below 1024px, section 4)
  GlobalControls.tsx                Date range / compare / export (section 5)
  ScreenHeader.tsx                  Title, tagline, filter chips, save view, footer
  KpiTile.tsx                       KPI tiles with delta coloring by goodDirection
  Card.tsx, ChartFrame.tsx          Card shell + chart/table toggle (accessibility, 13.3)
  DataTable.tsx                     Sortable table + real CSV export
  DefinitionsDrawer.tsx             Metric dictionary side drawer
  StatusPill.tsx                    Good/warning/serious/critical pills (section 11.4)
  charts/                           LineSeries, ColumnSeries, HorizontalBarList,
                                     FunnelStrip, Heatmap, DivergingBars, Share100Bar
  screens/                          One component per screen (section 4.1–4.12)
lib/
  types.ts                 Types mirroring the API envelope (section 9.3–9.4)
  format.ts                Number/currency/percent/duration formatting (section 5)
  palette.ts                Chart palette + slot assignments (section 11.2)
  urlState.ts               Date presets + URL query <-> GlobalQuery parsing
  screens.ts                Screen registry (labels, taglines, admin-only flags)
  mock/
    generators.ts           One function per screen returning data shaped like
                             the real GET /api/analytics/<screen> response
    builders.ts, rng.ts     Seeded random helpers so numbers stay stable per session
    session.ts               Local mock of GET /api/analytics/me
```

## Wiring up the real API

Every screen component calls a function from `lib/mock/generators.ts` inside a
`useMemo`, e.g.:

```ts
const env = useMemo(() => overviewData(query), [query.from, query.to, query.compare]);
```

To connect the real back end, replace that with a `fetch` to the matching endpoint from
section 9.5 (e.g. `GET /api/analytics/overview?from=...&to=...&compare=...`), passing
`credentials: "include"` as the spec requires — the response envelope shape
(`range`, `compare`, `generatedAt`, `meta`, `data`) already matches `lib/types.ts`, so
the screen components themselves shouldn't need to change.

## Notes on this build

- **Design system**: brand tokens, validated 8-slot chart palette (never cycled),
  sequential/ordinal/diverging scales, and status colours all match section 11
  verbatim in `tailwind.config.ts` and `lib/palette.ts`.
- **Charts**: line/column series (Recharts), plus hand-built horizontal ranking bars,
  ordinal-blue funnel strips, a sequential-blue day×hour heatmap, diverging bars and a
  100%-share bar — matching the chart catalogue in section 12. Every chart has a
  "Table" toggle (the screen-reader path, section 13.3).
- **Realtime**: polls every 15s while the tab is visible and pauses on
  `visibilitychange`, per section 4.12.
- **Exports**: every table has a working "Export CSV" button. The top-bar export menu
  triggers a real print-to-PDF via the browser's print stylesheet; wiring Excel/PDF
  exports to the real `/export` endpoint is a drop-in once the back end is connected.
- **Accessibility**: chart containers carry `role="img"` with a descriptive
  `aria-label`; `prefers-reduced-motion` is respected in `globals.css`; focus rings are
  visible everywhere via `.focus-ring`.
- **Money labelling**: every revenue KPI carries its `kind` (`cash` / `booked` /
  `estimate` / `liability` / `pending`) as a small chip on the tile, per section 6.4 —
  cash and booked figures are never added together.
