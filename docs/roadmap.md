# Better Tasks — Roadmap (Complete & Updated, Dec 2025)

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

### 4.5 Dashboard UX (Planned)
- Project search list
- Saved views

## Phase 5 — Cleanup & Reliability (Pending)
- Remove unused paths (done)
- Improve types (done)

## Phase 6 — AI Enhancements
### 6.1 Task Parsing (Completed)
- OpenAI key, strict JSON

### 6.2 Parsing Phase 2 (Planned)
- Help Me Plan, Clipboard Events

## Phase 7 — GTD Layer (Partially Completed)
- Next Action, Someday/Maybe, Delegated attributes
- Remaining: Weekly Review, GTD modes

## Phase 8 — Today Widget (In Progress)
- Shows start/defer/due today
- Settings: include overdue, placement, completed
- Uses throttled cache

## Phase 9 — Visual Indicators
- Unread-style sidebar badge for today/overdue

## Phase 10 — Internationalisation (Partially Complete)
### 10.1 Core i18n Framework (Partial)
- Abstraction layer, replace inline strings

### 10.2 Initial Languages
- Simplified Chinese (in progress)
- Traditional Chinese (planned)

### 10.3 Launch Strategy
- Closed beta with Chinese
- i18n toggle in Settings

### 10.4 Future i18n
- Hot switching, locale-aware dates

## Phase 11 — Future Enhancements
- Dependencies, history, AI weekly review
- Kanban, Timeline, Inbox capture
