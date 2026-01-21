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

## 🚀 Phase 8 — Differentiators v1 (Next)

**Mission:** Permanently differentiate Better Tasks.

### Task Dependencies
- `depends-on:: [[task-uid]]` attribute
- Blocked vs Actionable filter states
- Auto-unblock when dependency completes
- Circular dependency detection
- Visual indicator showing blocking task
- Dependencies model task sequencing; Waiting-for remains reserved for people or external blockers.

### Subtasks
- Parent/child task relationships
- Progress indicators (3/5 subtasks done)
- Metadata inheritance from parent
- Optional auto-complete parent when all children done
- Dashboard expand/collapse for subtask trees

### Bulk Operations - Complete
- Multi-select in dashboard (checkboxes, shift-click)
- Bulk complete/snooze/edit metadata
- "Select all visible" / "Select all in group"
- Undo for bulk operations

### Local-First NLP Capture
- Rule-based date parsing without API key
- Fuzzy date recognition ("next Tuesday", "in 2 weeks", "end of month")
- Inline metadata extraction from hashtags/mentions
- Offline-safe, works without network

---

## 🧠 Phase 9 — Execution, Recurrence & Review Mastery

**Mission:** Turn planning into flow.

### Recurring Series View
- Full history of past completions
- Future occurrence projections
- Skip/modify individual occurrences
- Streak tracking (consecutive on-time completions)
- Exception handling (skip specific dates like holidays)

### Focus / Do Mode
- Single-task execution view
- Distraction-free display
- Keyboard-first navigation
- Progress indicator (3 of 12 tasks done)
- Optional Pomodoro timer integration

### Expanded Reviews
- Daily review: What's due today? Yesterday's completions
- Monthly review: Archive completed, review someday/maybe
- Review history and completion stats
- "Stalled tasks" detection and preset view
- Project sweep (per-project review flow)

### Notes & Activity Log
- `notes::` attribute or dedicated child blocks
- Append-only activity history ("Snoozed from Nov 15 to Nov 18")
- Timestamps on all changes
- Visible in task detail view

### Keyboard Navigation
- j/k to move between tasks
- Enter to open task
- c to complete, s to snooze
- / to search
- Customizable bindings
- Bulk action bar/menu navigation (including metadata submenus)

### Task Templates
- Save task configurations as templates
- Template includes: title pattern, metadata defaults, subtask structure
- Quick-create from template
- Parameterized templates: "Weekly report for {project}"

---

## 🌐 Phase 10 — Ecosystem & Insights

**Mission:** Expand outward without betraying core values.

### Roam Query Integration
- Expose BT attributes as queryable
- Task-rendering query blocks
- Custom query templates for common filters

### Time-of-Day Scheduling (Optional)
- Optional time support in dates
- Time-bucketed Today view (morning/afternoon/evening)
- Read-only calendar view

### Quick Rescheduling
- Relative shortcuts: `+3` for 3 days from now
- Natural language date input: type "fri" → next Friday
- "Tomorrow", "Next Week", "Next Month" quick buttons
- Drag task to calendar day

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

### Graph Analytics
- Completion rate over time
- Average time from creation to completion
- Overdue frequency analysis
- Tasks by project/context breakdown
- Recurring task adherence (streak stats)
- "Busiest days" heatmap

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

*Last updated: January 2026*
