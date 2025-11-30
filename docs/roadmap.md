# Better Tasks — Roadmap (Regenerated, 28 Nov 2025)

## Phase 1 — Core Engine & Attributes (✓ Completed)
- Task attribute model
- Repeat engine (daily/weekly/monthly/custom)
- Start / Defer / Due
- Completed state
- Canonical attribute child blocks
- Inline pills (initial version)
- Spawn logic + confirmation

## Phase 2 — Inline Pills Upgrade (✓ Completed)
- Click menus
- Alt/Shift click semantics
- Inline date picker
- Snoozing
- Scheduling mode
- Refined spacing, alignment, hover states
- Keyboard & mouse parity

## Phase 3 — AI Task Input (Phase 1 ✓ Completed, Phase 2 Planned)
### Phase 1 (Completed)
- Strict JSON schema
- GPT-4o-mini backend
- Bring-your-own-OpenAI-key
- Robust parser with error correction

### Phase 2 (Planned)
- “Help Me Plan” interaction
- Clipboard event parser
- Smart suggestions for dates and repeats

## Phase 4 — Dashboard & UI Enhancements (In Progress)

### 4.1 Dashboard Core (✓ Completed)
- Fully React dashboard
- Filters, grouping, snooze/complete actions
- Draggable dashboard with persisted position
- Live sync with inline pills
- Attribute editing (repeat, start, defer, due, waiting-for, project, context, priority, energy)
- First-day-of-week setting
- Project picker from Roam pages
- Theme-distinct priority color system

### 4.2 Adaptive Theming (In Progress)
- Automated dark/light alignment
- Theme-safe priority indicators
- Pill contrast & token tuning

### 4.3 Inline Pill Parity (✓ Completed)
- One-to-one parity between dashboard and inline views
- Attribute editing from pill menus
- Visual consistency improvements

---

## Phase 4 — Performance & Stability Pass (✓ Completed)

### Today Widget Throttling & Caching
- 1.2s minimum render interval
- Idle-scheduled updates
- DNP gating with retry
- Per-render block/page cache
- 5s memo cache (cleared on force refresh)
- Skip completed tasks when hidden
- Watches only attach when dashboard is open
- Background refresh every 90 seconds when widget closed

### Dashboard Watches & Refresh
- Watches cleared 3 minutes after dashboard closes
- Periodic refresh without watchers
- Cached results reused unless forced
- Never attaches watches when hidden

### Pill Rendering Stabilization
- Per-block signature cache — no re-render if unchanged
- Offscreen skipping
- Pass cap to avoid runaway traversal
- Global guard (skip if >1500 blocks)
- 500ms throttle
- Scroll-based refresh
- Debounced pill sync (200ms)

### Attribute Query Optimization
- Unified Datalog query replacing multi-query per attribute

### Theme Observer Simplification
- Single debounced observer (≥250ms) across body/html/head

### UI & Toast Polish
- Reduced flicker on pill interactions
- Consistent bold check icons in menus:
  - Repeat / Due
  - GTD
  - Project / Context / Waiting For
  - Scheduling mode
  - Spawn confirmation

---

## Phase 5 — Cleanup Pass (✓ Completed)
- Consolidated helpers
- Removed unused code paths ✓
- Improved type discipline ✓
- Expanded test harness
- Telemetry toggle scaffold

---

## Phase 6 — GTD Expansion (✓ Completed — Cycling States)

### Unified GTD Attribute
One cycling attribute with four states:
1. Next Action
2. Delegated
3. Deferred
4. Someday / Maybe

Click = forward cycle; shift-click = backward cycle.
Cleared state = no GTD classification.

### UI Integration
- Inline pill icons + theme colors
- Dashboard GTD column with cycle control
- Filters for each GTD type
- Delegated state can include an optional “person” string

### Engine Integration
- Stored via canonical attribute child block
- Integrated with task collection, caching, pill signatures
- Non-conflicting with Start/Defer/Due + repeat logic

---

## Phase 7 — Today Widget (Next Up)
- Daily Today widget showing:
  - Starts today
  - Deferred to today
  - Due today
- Setting to include overdue tasks
- User-selectable variant (1 or 4)
- All items shown as ((block-uid)) references
- Scrollable + theme-safe layout

---

## Future Enhancements
- Recurrence anchored to defer date
- Task dependencies
- Weekly Review module
- Series history & past completions
- Stats & analytics
- Week-ahead planner
- Kanban / Timeline / Calendar views
- Shared-graph-safe features
- Reminder service
- Mobile-optimised views
- Sidebar metrics (unread-style badges)
