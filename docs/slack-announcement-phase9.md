# Slack announcement draft — Better Tasks: Templates + Focus Mode + Notes & Activity Log

**Status:** DRAFT — not sent
**Target channel:** Roam Research Slack — #extensions or wherever Better Tasks updates are posted
**Trigger:** After the next Roam Depot pull merges
**Covers commits since last Depot pull:**
- `0577563` — hardening & polish (debounced picklist refresh, dashboard refresh timer fix, mutation queue cap, defensive context-menu guards, safer Today widget teardown)
- `ba87248` — Task Templates
- `3f90486` — Focus / Do Mode
- `(pending)` — Notes & Activity Log

---

## 🎉 Headline version (short, for a quick post)

🌀 **Better Tasks update — Templates, Focus Mode, Notes & Activity Log**

Three new features in this release:

**Task Templates** — Save any Better Task as a reusable template (title, metadata, subtask structure). Parameterised titles like `Weekly report for {project}` prompt for values on use. Save from an existing task via right-click, or build from scratch. Instantiate from the Command Palette, the dashboard's Template button, or the Extension Tools API. Date defaults use relative syntax (`+3d`, `next Monday`) and resolve at instantiation.

**Focus / Do Mode** — Distraction-free single-task execution. Takes a frozen snapshot of your currently filtered dashboard, then guides you through one task at a time. Keyboard-first: `j`/`k` navigate, `c` complete (auto-advance), `s`/`Shift+S` snooze, `Enter` open in Roam, `?` help, `Esc` exit. Blocked tasks show 🔒 and prevent accidental completion. Subtasks appear as a checklist on the parent card and also get their own focus turn.

**Notes & Activity Log** — Attach freeform notes to any task (`Add notes` in the ⋯ menu). An append-only activity log records every change — snoozes, completions, attribute edits, recurrence spawns — under each task as timestamped child blocks. View the history from the ⋯ menu → `View activity`. Settings: master on/off toggle, optional entry cap, configurable notes attribute name. Everything is stored as plain Roam blocks and fully removed on deconvert.

Also: quiet bug fixes and hardening (dashboard refresh timer, mutation queue cap, defensive context-menu guards, debounced picklist refresh, safer Today widget teardown).

Full README: [link]
Roadmap: [link]

---

## 📢 Long version (for a more detailed post)

**Better Tasks update — Templates, Focus Mode, Notes & Activity Log**

Three features shipping together, plus a handful of bug fixes.

---

### 📋 Task Templates

Save any task configuration as a reusable template and spin up copies in seconds.

**What a template captures:**
- **Title pattern** with optional `{placeholder}` parameters (e.g. `Weekly report for {project}`)
- **Metadata defaults** — repeat rule, due / start / defer dates, project, context, waiting-for, priority, energy, GTD status
- **Subtask structure** — an ordered list of child tasks, each with their own title pattern and metadata

Date defaults are stored as *relative* expressions, not absolute dates. `due: +5d` resolves to "5 days from now" at instantiation, not when saved. Full natural-language vocabulary supported: `+3d`, `+1w`, `next Monday`, `end of month`, etc.

**Parameters are generic.** `{project}` is just one example — any word works: `{client}`, `{topic}`, `{ticket}`. They aren't limited to the title — they work in subtask titles, project, context, waiting-for, and any other string attribute. Defaults supported: `{priority:high}` pre-fills "high" but lets you override.

**Creating templates:**
1. **Save an existing task** — right-click a Better Task → *Save as Better Task template*. Captures everything including child Better Tasks as subtasks.
2. **Build from scratch** — Command Palette → *Create Better Task template*.

**Using templates:**
- Command Palette → *Create from Better Task template* → pick → fill `{param}` values → done
- Dashboard **Template** button (next to OK in the quick-add bar)
- Extension Tools API: `bt_list_templates`, `bt_create_from_template`, `bt_manage_templates`

**Example templates:**

| Template | Notes |
|---|---|
| `Weekly report for {project}` | Subtasks for gather / draft / review, repeat every Friday |
| `1:1 with {person}` | Repeat every 2 weeks, GTD next action, context @office |
| `Onboard new {client}` | Multi-subtask workflow, all parameterised by client |
| `Investigate {ticket}` | Priority high, subtasks for reproduce / root cause / fix |

Storage: templates live in extension settings (IndexedDB) — no graph pollution. Limits: 50 templates, 20 subtasks per template.

---

### 🎯 Focus / Do Mode

A distraction-free, single-task execution surface launched from the **Focus** button in the dashboard header or via Command Palette → *Better Tasks: Enter Focus Mode*.

Takes a frozen snapshot of your currently-visible filtered and sorted task list, then guides you through one task at a time:

- **Progress indicator** — "Task N of M" with progress bar
- **Keyboard-first** — `j`/`k` navigate, `c` complete (auto-advance), `s`/`Shift+S` snooze +1d/+7d, `Enter` open in Roam, `r` refresh, `?` shortcut overlay, `Esc` exit
- **Blocked tasks** — 🔒 indicator with amber hint; `c` disabled (toast) so you can't accidentally complete blocked work
- **Subtasks** — read-only checklist on the parent card; each subtask also gets its own focus turn in the queue
- **Live pills** — metadata refreshes while queue order stays stable
- **Stale-queue banner** — appears if a queued task is renamed/deleted externally, with one-click **Refresh queue**
- **All done!** celebration when the queue is cleared

> **Tip:** set up your filter and sort first (e.g. "Due Today" sorted by priority), then click **Focus** — the queue is built from exactly what you see.

---

### 📝 Notes & Activity Log

Two new affordances for per-task context:

**Freeform notes** — Attach a note to any task via the dashboard ⋯ menu → *Add notes* (or *Edit notes* / *Remove notes*). Stored as a `BT_attrNotes::` child block with full attribute alias/back-compat. Notes appear as a clamped preview under the task title in the dashboard. The attribute name is configurable in Advanced settings.

**Activity log** — An append-only history of every change:
- Events captured: task created, marked complete, reopened, snoozed, rescheduled, attribute changed, notes edited, recurrence spawned
- Every event is timestamped and tagged by source (dashboard / inline / API / bulk)
- Stored as children of an **Activity log** container block under each task — plain Roam blocks, visible in your graph
- Bulk operations tag every per-task event with a shared correlation ID
- Recurring tasks: prior instance gets a "Recurrence spawned" event; new instance starts with a clean log

**View activity** from the ⋯ menu — opens a slide-in panel with reverse-chronological event list and an "Open history in Roam" link to jump to the container in the sidebar.

**Settings:**
- Master enable/disable toggle (on by default)
- Opt-in title-edit logging (off by default — avoids noise from typing)
- Optional maximum entries cap per task (oldest entries pruned when exceeded)

**Trust & Exit:** deconvert removes the activity log and notes alongside all other BT metadata. Your plain TODO remains.

**Why this matters:** the activity log is the data spine for Phase 10's Smart Suggestions ("This task has been snoozed 5 times — consider someday/maybe"). The structured event trail means the system can reason about task behaviour without re-deriving state from Roam's block history.

---

### 🐛 Also in this release

- **Dashboard refresh timer** — fixed an inverted condition that caused auto-refresh to run only when the dashboard was closed.
- **Defensive context-menu guards** — block context menu commands now no-op safely if Roam's context-menu API isn't available.
- **Debounced picklist refresh** — editing the picklist exclude list no longer triggers three refreshes per keystroke (400ms debounce).
- **Mutation queue cap** — the MutationObserver queue is capped at 500 entries to prevent runaway memory usage.
- **Safer Today widget teardown** — removed a fallback path that could blank blocks in rare teardown scenarios.
- **Dashboard completion fix** — completing a recurring task from the dashboard now correctly spawns the next occurrence (previously only worked from the inline Roam checkbox).
- **Deconvert robustness** — deconvert now clears all block props (inline timing + series metadata) and immediately removes pills from the DOM.

---

### Full details

- README → [link]
- Roadmap → [link]
- Support / bugs → DM me in Slack

---

## Pre-send checklist

- [ ] Roam Depot pull merged and live
- [ ] Confirm commit range matches what Roam published (`0577563`..`HEAD`)
- [ ] Swap [link] placeholders for real URLs
- [ ] Decide short vs long version based on channel norms
- [ ] Consider adding a screenshot of Focus Mode in action
- [ ] Consider adding a screenshot of the activity log panel
- [ ] Consider adding a screenshot of the notes preview on a dashboard task row
- [ ] Consider adding a screenshot of the create-template form
