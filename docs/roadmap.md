# Better Tasks — Master Roadmap
_Updated 27 Nov 2025_

## ✅ Phases 1–3 — Completed
Core recurring-tasks engine + attributes + inline UI

- Configurable attribute names (`BT_attrRepeat`, `BT_attrStart`, `BT_attrDefer`, `BT_attrDue`, `BT_attrCompleted`)
- Hidden child blocks (non-destructive architecture)
- Natural-language repeat rule parser
- Inline pills for repeat/start/defer/due with click → dashboard sync
- AI task parsing (Phase 1): strict JSON via user OpenAI API key
- React dashboard (v1) with lazy-loading, sync, filters, and grouping
- Settings: next-task destination, first-day-of-week, attribute names, confirmation

# Phase 4 — Dashboard, UI, Attributes
_Status: Mostly complete_

## 4.1 Adaptive Theming — **COMPLETE**
- Supports Roam light/dark, Blueprint, and RoamStudio
- Real-time theme listener + CSS variable sync

## 4.2 Dashboard Enhancements — **IN PROGRESS**
Completed:
- Attribute filters (repeat/start/defer/due + GTD/context/project/priority/energy)
- Grouping modes
- Snooze / complete actions
- Draggable + persisted position
- Block-reference rendering `((uid))`
- Live sync with inline pills

Remaining:
- Sidebar “unread” badge (today-only OR today+overdue)
- Today widget (multiple layout variants)
- UI polish & theme-safe transitions

## 4.3 Attribute Support Expansion — **COMP COMPLETE**
- **Project**, **Context**, **Energy**, **Priority**, **Waiting-for**
- Noise-free minimal indicator pills
- Full dashboard filters + grouping

# Phase 5 — Cleanup & Reliability
_Status: Active_

- Mutation observer hardening (prevent duplicate spawns on older DNP opens)
- Fix collapse toggle freeze regression
- izoToast: single-toast mode
- Remove legacy deletion codepaths
- Performance optimisation for large graphs
- Stress test with 100 messy test tasks

# Phase 6 — AI Task Parsing

## Phase 1 — **COMPLETE**
- Strict JSON schema for task parsing
- Maps: title, repeatRule, dates, project/context/priority/energy
- Uses user’s OpenAI API key

## Phase 2 — PLANNED
- “Help Me Plan” → structured tasks
- Clipboard-to-tasks auto-ingest
- Enriched NL repeat patterns (business days, AU/UK synonyms)
- Intelligent inference of context/energy/priority from language

# Phase 7 — GTD Workflow
_Status: Partially Complete_

Completed:
- GTD attributes: **Next**, **Waiting-for**, **Delegated**, **Someday/Maybe**
- Dashboard filters for all GTD attributes

Remaining:
- Weekly Review module
- GTD Widgets (Next / Waiting / Delegated etc.)

# Phase 8 — Views & Visualisations
_(Later / Maybe)_

- Kanban board
- Timeline / Gantt
- Calendar heatmap
- Week-ahead view
- Streaks / stats
- Backburner / Someday list
- Recurring series history (spawn timeline)

# Phase 9 — Task Dependencies
_(Future, complex)_

- Blocked-by / Blocks relations
- DAG-safe (cycle prevention)
- Visual dependency graph
- Dashboard “unblocked tasks” filter
- Shared-graph safety handling

# Additional / Optional
- Simple reminders (local notifications)
- Recurrence anchored on defer-date
- Optional @mentions integration
- GTD literature review for conceptual alignment

# Newly Added Items (Nov 2025)
- **Dashboard**: Project attribute picker using searchable list of Roam pages
- **Dashboard + inline pills**: Priority-level theme distinctions (safe in all themes)
