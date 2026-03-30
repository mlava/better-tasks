# Better Tasks — Unified Roadmap (Phases 1–10)

This document is the **canonical Better Tasks roadmap**, integrating shipped work, in-progress phases, and planned execution through Phase 10.

---

## Engineering guardrails
- Schema migrations must be reversible
- All new attributes support alias/back-compat
- Performance budgets must remain green before new feature work


## ✅ Phases 1–3 — Core Engine & Inline UX (Complete)

**Mission:** Make tasks first-class citizens in Roam without breaking the graph.

### Delivered
- Recurring tasks (20+ repeat patterns with natural language parsing)
- One-off scheduled tasks (start / defer / due)
- Canonical storage via child blocks with configurable attributes
  - Defaults: `BT_attrRepeat`, `BT_attrStart`, `BT_attrDefer`, `BT_attrDue`, `BT_attrCompleted`
- Inline pills for repeat/start/defer/due state
- Click + modifier interactions (DNP, right sidebar, snooze, date picker)
- Safe, graph-respecting behaviour (no destructive writes)
- Undo support for task operations

---

## ✅ Phase 4 — Dashboard & UI Enhancements (Complete)

**Mission:** Give users a planning surface without sacrificing Roam's feel.

### Delivered
- React-based Better Tasks Dashboard
- Filters, grouping (time/recurrence/project), snooze & complete controls
- Draggable, position-persisted floating panel
- Full-page mode with resizable sidebar
- Mobile-responsive dashboard with drawer filters, swipe gestures, touch-optimized sizing
- Top-bar + command-palette toggles
- Live sync between dashboard and inline pills
- First-day-of-week setting
- Add/remove attributes from dashboard menu
- Saved views (create/update/rename/delete custom filter combinations)
- Preset views (Next Actions, Waiting For, Completed Last 7 Days, Upcoming Next 7 Days, Overdue, Someday/Maybe, All Open)
- AI-assisted quick capture (experimental, BYO OpenAI key)
  - Phase 4 provides AI-assisted capture (optional); Phase 8 introduces local-first parsing so capture works without AI.
- Adaptive light/dark theming
- Full-text search across tasks

### Phase 4.1 - Priority colour coding
- Priority colour coding / visual treatment (theme-safe) (attribute already available)

---

## ✅ Phase 5 — Cleanup, Performance & Hardening (Complete)

**Mission:** Make Better Tasks boringly reliable at scale.

### Delivered
- Virtualized task list (TanStack React Virtual)
- Caching layer (10-minute TTL, 5000 entry limit)
- Throttled widget updates (max 10 per 2 seconds, 15-second cooldown)
- Debounced resize/orientation handling (150ms)
- Pill rendering threshold for large pages (configurable, default 100)
- Observer hygiene with block watching attach/detach
- DST-safe date handling (noon anchoring)
- End-of-month clamping for recurrence
- Depth recursion limits (36 iterations max)
- Schema versioning for filter/view migrations
- Retry logic with exponential backoff for AI calls
- Graceful degradation when AI parsing fails

### Phase 5.1 - Completed user documentation
- User documentation

---

## ✅ Phase 6 — GTD Semantics & Task Meaning (Complete)

**Mission:** Add meaning without rigidity.

### Delivered
- Project attribute (`BT_attrProject`) with picklist
- Context attribute (`BT_attrContext`) with multi-value support
- Waiting-for attribute (`BT_attrWaitingFor`) with picklist
- GTD status attribute (`BT_attrGTD`) with cycling: Next Action → Delegated → Deferred → Someday → cleared
- Priority attribute (`BT_attrPriority`) with cycling: low → medium → high → none
- Energy attribute (`BT_attrEnergy`) with cycling: low → medium → high → none
- Dashboard filters for all metadata attributes
- Inline metadata pills with click-to-cycle
- Configurable attribute names with alias support for backward compatibility
- Picklist exclusion settings (exclude Templates, SmartBlocks, etc.)
- "Project Page" destination option — routes next occurrence to the project's page (falls back to DNP)
- Rich metadata carry-forward on recurrence (project, context, priority, energy, GTD, waiting-for)
- Auto-inherit project from current page when creating a task on a known project page

---

## ✅ Phase 7 — Today & Review Surfaces (Complete)

**Mission:** Make Better Tasks reviewable, not just manageable.

### Delivered

#### Today Widget
- Two layouts: Panel mode (styled) and Inline mode (Roam-native)
- Sections: Starting today, Deferred until today, Due today, Overdue
- Configurable overdue inclusion
- Show/hide completed tasks
- Heading level selection (None, H1, H2, H3)
- Placement option (Top or Bottom of DNP)
- Custom title text
- Sidebar badge with task count and customizable colours

#### Reviews
- Guided Weekly Review workflow
- Preset views for GTD workflows (Next Actions, Waiting For, Someday/Maybe)
- Additional review presets (Completed Last 7 Days, Upcoming Next 7 Days, Overdue)
- Weekly Review step toggles (fixed order, per-step enable/disable)

---

## 🚀 Phase 8 — Differentiators v1 (✅ Complete)

**Mission:** Permanently differentiate Better Tasks.

### Task Dependencies - Complete ✅
- `BT_attrDepends:: ((task-uid))` attribute (configurable name, supports multiple UIDs)
- Blocked vs Actionable filter states (dashboard, expanded view, Extension Tools API)
- Auto-unblock when dependency completes (one-off and recurring; stale/deleted deps auto-cleaned)
- Circular dependency detection (self-ref, mutual, transitive via DFS; UI picker and computeBlockedState)
- 🔒 Blocked pill indicator, dimmed styling in dashboard and Today widget
- Dependency picker in ⋯ pill menu (add, edit, remove all; search with chip selection)
- Dependencies not carried forward on recurring task spawn
- Dependencies model task sequencing; Waiting-for remains reserved for people or external blockers.

### Subtasks — Complete ✅
- ✅ Parent/child task relationships (structural nesting + explicit `BT_attrParent:: ((uid))`)
- ✅ Progress indicators (📋 0/1 inline pills + dashboard pills)
- ✅ Dashboard expand/collapse for subtask trees (panel + full-page modes)
- ✅ Explicit `BT_attrParent` overrides structural nesting
- ✅ Pull watch on `:block/children` for drag-in/out detection
- ✅ Extension Tools API: `is_subtask`, `parent_task_uid`, `subtask_uids`, `subtask_progress`
- ✅ Project inheritance: subtasks without a project inherit their parent's project (read-only, no graph write)

### Bulk Operations - Complete ✅
- Multi-select in dashboard (checkboxes, shift-click)
- Bulk complete/snooze/edit metadata
- "Select all visible" / "Select all in group"
- Undo for bulk operations

### Local-First NLP Capture — Complete ✅
- ✅ Rule-based date parsing without API key (synchronous, zero-cost)
- ✅ Fuzzy date recognition ("next Tuesday", "in 2 weeks", "end of month", "3 days from now")
- ✅ Inline metadata extraction: `due:`, `start:`, `defer:` prefixes, `!priority`, `~energy`, `p:project`, `@context`
- ✅ Implicit trailing date detection with conservative keyword allowlist
- ✅ Repeat rule extraction (reuses existing `parseRuleText` engine)
- ✅ Runs always-first before AI; no setting needed
- ✅ Offline-safe, works without network

---

## 🧠 Phase 9 — Execution, Recurrence & Review Mastery (In Progress)

**Mission:** Turn planning into flow.

### Recurring Series View — Complete ✅
- ✅ Full history of past completions (timeline with on-time/late badges)
- ✅ Future occurrence projections (5/10/20 count selector)
- ✅ Skip/modify individual occurrences (skip button on future dates)
- ✅ Streak tracking (current streak, best streak, on-time completion rate)
- ✅ Exception handling (add/remove exception dates, carry-forward on completion)

### Focus / Do Mode
- Single-task execution view
- Distraction-free display
- Keyboard-first navigation
- Progress indicator (3 of 12 tasks done)
- Optional Pomodoro timer integration

### Expanded Reviews — Complete ✅
- ✅ Daily review: Due Today → Completed Yesterday → Overdue (3-step flow)
- ✅ Monthly review: Completed 30d → Stalled → Someday/Maybe → Overdue (4-step flow)
- ✅ "Stalled tasks" detection via `:edit/time` with configurable threshold (default 14 days)
- ✅ Stalled/Active filter chips in dashboard sidebar
- ✅ Project sweep: select a project, cycle through Open → Overdue → Stalled → Completed 30d
- ✅ Review menu dropdown (Daily/Weekly/Monthly + Project Sweep) replaces single button
- ✅ Per-type step toggles in settings (independent enable/disable per review type)
- ✅ 4 new preset views: Due Today, Completed Yesterday, Stalled Tasks, Completed (Last 30 Days)
- ✅ Commands: Daily Review, Monthly Review (Weekly unchanged)
- ⏳ Review history and completion stats (deferred — needs storage mechanism)

### Notes & Activity Log
- `notes::` attribute or dedicated child blocks
- Append-only activity history ("Snoozed from Nov 15 to Nov 18")
- Timestamps on all changes
- Visible in task detail view

### Keyboard Navigation — Complete ✅
- ✅ j/k to move between tasks (skips group headers, scrolls into view)
- ✅ Enter to open task
- ✅ c to complete, s to snooze (+1d), Shift+S to snooze (+7d)
- ✅ e to expand/collapse subtasks
- ✅ . to open task menu (j/k/arrows + Enter to navigate items)
- ✅ / to search
- ✅ x to toggle selection, Shift+A to select all visible
- ✅ f to toggle full-page mode, r to refresh
- ✅ ? to show keyboard shortcut legend
- ✅ Escape cascade: close help → clear selection → clear focus
- ✅ Customisable bindings via JSON in Advanced Dashboard settings
- ✅ Bulk-aware: c/s operate on selection when active

### Task Templates
- Save task configurations as templates
- Template includes: title pattern, metadata defaults, subtask structure
- Quick-create from template
- Parameterized templates: "Weekly report for {project}"

---

## 🌐 Phase 10 — Ecosystem & Insights

**Mission:** Expand outward without betraying core values.

### Roam Query Integration
- **Enhanced native query results:** MutationObserver on `{{query}}` result blocks to detect BT tasks and inject pill badges (due, project, status) — zero learning curve, users keep existing queries
- **Page-ref consistency:** ensure all BT attributes that reference pages use `[[page refs]]` so native `{{query}}` naturally discovers BT tasks
- **`{{bt-query}}` block renderer (optional):** simpler syntax (`{{bt-query: project="X" status="TODO"}}`) for users who don't know Datalog, with interactive task rows powered by the existing `bt_search` engine
- **Datalog helpers:** documented query snippets for common BT filters (overdue, by project, stalled, waiting-for)

### Time-of-Day Scheduling (Optional)
- Optional time support in dates
- Time-bucketed Today view (morning/afternoon/evening)
- Read-only calendar view

### Quick Rescheduling — Complete ✅
- ✅ Relative shortcuts: `+3` for 3 days from now (in date picker text input)
- ✅ Natural language date input: type "fri", "in 2 weeks", "end of month" with live parse feedback
- ✅ Quick buttons: Today, Tomorrow, +3d, Next Mon, +1w, +1m
- ✅ Enter in text input saves immediately

### Smart Suggestions
- Advisory AI nudges only (never automatic)
- "This task has been snoozed 5 times" → suggest someday/maybe
- "You usually do this on Mondays" → suggest reschedule
- "No tasks scheduled for Thursday" → suggest load balancing

### Trust & Exit
- Deconvert BT → plain TODO (moved from Phase 8 for completion)
- Batch deconvert for full migration away
- CSV / JSON export for backup
- Optional ICS calendar export

### Graph Analytics — Complete ✅
- ✅ Slide-in analytics panel (480px, full-width mobile) with period selector (7d / 30d / 90d / all time)
- ✅ Summary cards: open, completed, overdue, completion rate
- ✅ Completion over time: CSS bar chart (daily ≤30d, weekly buckets for 90d, monthly for all time)
- ✅ Time to completion: average days + distribution bars (same day, 1-3d, 4-7d, 1-2w, 2+w)
- ✅ Overdue frequency: late completion rate, avg days overdue
- ✅ Project breakdown: top 10 by open count + by velocity (horizontal bars)
- ✅ Recurring task adherence: avg on-time rate, top/bottom 5 performers
- ✅ Busiest days heatmap: 365-day calendar grid with 5 intensity levels + legend
- ✅ Respects first-day-of-week setting
- ✅ Keyboard shortcut: Shift+G; also accessible via header button
- ✅ Lazy computation with 30s cache; no background cost

### Multi-Language NLP
- Recurrence rule parsing beyond English
- Localized date parsing

---

## 🚫 Explicitly Deferred (Post–Phase 10)

- Fully custom field systems (arbitrary user-defined attributes)
- Two-way calendar sync (Google Calendar, Apple Calendar)
- Heavy external task sync (Todoist, Things, Notion)
- Real-time collaboration features
- Native mobile app (beyond responsive web)

---

## Strategic Framing

| Phases | Theme | Goal |
|--------|-------|------|
| 1–5 | Stability & Trust | Rock-solid foundation |
| 6–7 | Meaning & Review | GTD semantics, daily workflow |
| 8 | Structural Differentiation | Dependencies, subtasks — unique value |
| 9 | Human Flow | Execution mode, keyboard-first |
| 10 | Confidence & Reach | Ecosystem, analytics, graceful exit |

---

*Last updated: 2026-03-30*
