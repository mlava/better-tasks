# Better Tasks — Roadmap (Updated Dec 2025)

## Near-Term Focus (Ranked)

1. **Phase 8 — Today Widget (Core Release)**
   - Panel and Roam-inline modes unified; heading-aware anchor fallback to Top/Bottom.
   - “Today” logic (start/defer/due + overdue toggle, completed scoped to today only).
   - Snooze parity (panel quick +1d/+7d; defer/due move together when aligned).

2. **Phase 9 — Sidebar Badge**
   - Today badge/link in left sidebar (today-only by default, optional overdue).
   - Badge count driven by the same selection logic as the Today widget.

3. **Phase 7 — GTD Layer**
   - Dashboard filters for Next, Delegated, Deferred, Someday.
   - Weekly Review flow (preconfigured dashboard view / command).

4. **Phase 4.5 — Dashboard UX**
   - Saved dashboard views (“perspectives”) with named filter/sort sets.
   - Quick switching between views (Today, Deep Work, Errands, Waiting For, etc.).

5. **Phase 10 — i18n Launch**
   - Mark en/zh/zh-Hant as stable; refine settings UX for language switching.
   - Move toward locale-aware dates and weekday labels.

6. **Phase 11 — Dependencies (MVP)**
   - Blocked-by attribute and basic blocked/available visual treatment.
   - Optional filter to hide tasks until blockers complete.

## Phase 1 — Core Engine (Completed)
- Parse TODO blocks and detect repeat/start/defer/due attributes
- Spawn next recurring task with correct rollover
- Inline pills with hovercards and date pickers
- Configurable attribute names

## Phase 2 — Stability, Correctness, and Performance (Completed)
- Attribute parsing & canonical storage
- Recurrence engine refactor
- Optimize observers and caches
- Settings for first day of week, DNP heading, destination

## Phase 3 — UI/UX Foundational Enhancements (Completed)
- Full inline pill parity
- Better Tasks menu & slash commands
- Improved click behaviours
- Confirmation toggle for spawn
- GTD pill slots

## Phase 4 — Dashboard & UI Enhancements (In Progress)
### 4.1 Dashboard Core (Completed)
- React dashboard, filters, drag position, sync
- Attribute quick-edit

### 4.2 Performance & Watches (Completed)
- Today Widget throttling & caching
- Dashboard watches auto-cleanup
- Pill rendering stabilization

### 4.3 Attribute Expansion (Completed)
- Waiting-for, Project, Context, Priority, Energy

### 4.4 Theme & Polish (In Progress)
- Priority theme distinction
- Theme refinement

### 4.5 Dashboard UX (Planned / High Priority)
- Project search list
- Saved views / named perspectives

## Phase 5 — Cleanup & Reliability (Completed)
- Remove unused paths
- Improve types

## Phase 6 — AI Enhancements
### 6.1 Task Parsing (Completed)
- OpenAI key, strict JSON

### 6.2 Parsing Phase 2 (Planned)
- Help Me Plan, Clipboard Events

## Phase 7 — GTD Layer (Partially Completed)
- Next Action, Someday/Maybe, Delegated attributes (completed)
- Remaining: Weekly Review view, GTD dashboard modes

## Phase 8 — Today Widget (Core Release In Progress)
- Shows tasks with start/defer/due = today (optionally overdue)
- Panel mode and Roam-inline mode
- Throttled, cached, and synced with pills/dashboard

## Phase 9 — Visual Indicators
- Unread-style sidebar badge for today/overdue (with today-only option)

## Phase 10 — Internationalisation (Updated)
### 10.1 Core i18n Framework (Completed)
- Abstraction layer, replace inline strings

### 10.2 Initial Languages (Completed)
- English, Simplified Chinese, Traditional Chinese

### 10.3 Launch Strategy (In Progress)
- Closed beta with Chinese
- i18n toggle in Settings

### 10.4 Future i18n (Planned)
- Hot switching improvements
- Locale-aware dates & formatting

## Phase 11 — Future Enhancements
- Dependencies, history, AI weekly review
- Kanban, Timeline, Inbox capture
