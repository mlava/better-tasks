# 🌀 Better Tasks for Roam Research

**The missing task layer for Roam**  

Turn native TODOs into **scheduled and recurring tasks** with **inline pills**, a **powerful dashboard**, and optional **Today widget/badge** — all stored as plain Roam blocks.
<BR><BR>

> ✅ Roam-native storage (child blocks) • ✅ Recurring + one-off scheduled tasks • ✅ Actively maintained

<BR>
**Support / bugs:** Please message me in the Roam Slack (include repro steps + any console output if relevant):  
https://app.slack.com/client/TNEAEL9QW/

---

## What it looks like (start here)

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/hero-dashboard.png" width="800" alt="Better Tasks dashboard showing Today/Overdue triage"/>
</p>

---

## Why Better Tasks

If you use TODOs in Roam, Better Tasks gives you:

- **Recurring tasks** that spawn the next occurrence when completed
- **Start / Defer / Due** dates for scheduled one-off tasks
- **Inline pills** for fast editing, snoozing, and jumping to DNPs
- A **dashboard** for review & triage, **saved views**, and **weekly review presets**
- **Bulk operations** to complete, snooze, or update metadata across multiple tasks
- Optional **Today widget** (on today's DNP) and **Today badge** (left sidebar)
- Optional metadata: **Project, Context, Waiting-for, GTD, Priority, Energy**

---

## ✅ Recent updates

- **Bulk operations:** multi-select tasks in the dashboard for batch complete, snooze, and metadata updates
- Faster and safer rendering: pill throttling, block caching, and picklist refresh optimisations
- More resilient storage: filter versioning, cache TTLs, and attribute alias fallbacks
- Better UX: improved focus styles, ARIA labels, and toast announcements
- Reliability improvements: OpenAI retry/backoff and stronger view IDs

---

## Quick start (2 minutes)

1. **Convert an existing TODO**  
   Cursor on a TODO → Command Palette → **Convert TODO to Better Task**

2. **Or create one from scratch**  
   Command Palette → **Create a Better Task**

3. **Add scheduling / recurrence**  
   Add a **repeat rule** (e.g. `every Friday`) and/or **start / defer / due** dates.

---

## 📘 Roam-native storage (reliable & reversible)

Better Tasks stores canonical data in **child blocks** (attribute names configurable; defaults shown).

### Recurring task (child block style)

    {{[[TODO]]}} Write weekly newsletter
      - BT_attrRepeat:: every Friday
      - BT_attrDue:: [[2025-11-07]]

When completed:

    {{[[DONE]]}} Write weekly newsletter
      - BT_attrRepeat:: every Friday
      - BT_attrDue:: [[2025-11-07]]
      - BT_attrCompleted:: [[2025-10-31]]

Optional attributes:
- `BT_attrStart::` — when the task becomes available
- `BT_attrDefer::` — when it should resurface
- `BT_attrCompleted::` — written on completion

✅ Disable Better Tasks anytime — your tasks remain plain Roam blocks.

---

## Scheduled (one-off) tasks

Leave the repeat field blank while setting any combination of `start::`, `defer::`, or `due::`.

- Same pills, snooze controls, and dashboard support
- No follow-up task is spawned
- Completion writes `completed:: [[<today>]]` and hides the pill

---

## Optional metadata

    - BT_attrProject:: [[Website Refresh]]
    - BT_attrGTD:: Next Action
    - BT_attrWaitingFor:: [[Finance Team]]
    - BT_attrContext:: @computer, #office
    - BT_attrPriority:: high
    - BT_attrEnergy:: medium

Metadata appears both inline (pill) and in the dashboard.

Interactions:
- Click → open page
- Shift+Click → open in right sidebar
- Cmd/Ctrl+Click → edit value

GTD cycles: **Next → Delegated → Deferred → Someday → cleared**  
Priority / Energy cycles: **low → medium → high → none**

---

## 💊 Inline pills

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/pills-closeup.png" width="850" alt="Inline pill showing repeat and dates"/>
</p>

- Pills hide when the task is expanded; reappear when collapsed
- Completed tasks stay visually quiet until the next recurrence
- Non-recurring tasks still show date pills

Common actions:
- **↻ Repeat** — click to edit; Alt+Click to copy
- **⏱ Start / ⏳ Defer / 📅 Due** — click to open DNP  
  Shift+Click opens in sidebar
- **Alt/Ctrl/Meta+Click** opens date picker
- **⋯ Menu** opens the full task menu

---

## 🧩 Pill menu actions

| Action | Description |
|------|-------------|
| Snooze +1 day | Shift all existing dates (start/defer/due) forward 1 day |
| Snooze +3 days | Shift all existing dates (start/defer/due) forward 3 days |
| Snooze to next Monday | Shift all existing dates to align with next Monday |
| Snooze (pick date) | Shift all existing dates to align with the picked date |
| Skip this occurrence | Jump to next repeat |
| Generate next now | Create next task immediately |
| End recurrence | Stop repeating |

All actions support **Undo**.

Snooze logic details:
- If a task has any of `start::`, `defer::`, or `due::`, snooze shifts only the dates that exist and preserves spacing between them.
- If a task has no dates, snooze creates `defer::` at today + N.
- To avoid “still overdue” results, each shifted date is clamped to at least today + N.

---

## 📊 Better Tasks dashboard

Open via Command Palette → **Toggle Better Tasks Dashboard**  or the top-bar icon <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/image-2.png" width="22" alt="Dashboard toggle icon">

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/dashboard-floating.png" width="800" alt="Floating dashboard"/>
</p>

Features:
- Filters: recurrence, availability, due buckets, completion
- Quick snooze / complete actions
- Jump back to original blocks
- Draggable floating panel (position remembered)
- Optional **full-page mode** with persistent filter sidebar
- Metadata chips + filtering
- Quick-add input (uses AI parsing if enabled)
- Mobile-friendly layout (full-page with slide-in filters and sticky quick-add)

Preset views (seeded, in order):
- Next Actions
- Waiting For
- Completed (Last 7 Days)
- Upcoming (Next 7 Days)
- Overdue
- Someday / Maybe
- All Open Tasks

Weekly Review order:
- Next Actions
- Waiting For
- Completed (Last 7 Days)
- Upcoming (Next 7 Days)
- Overdue
- Someday / Maybe

### Full-page mode

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/dashboard-fullpage.png" width="800" alt="Full-page dashboard"/>
</p>

Mobile note:
- On small screens, the dashboard uses full-page layout by default
- Filters live in a slide-in drawer (tap Filters to open)
- Quick-add sticks to the bottom for easier reach

### Bulk operations

Apply changes to multiple tasks at once from the dashboard.

**Entering bulk mode:**
- Click the **Bulk** button in the toolbar to enter selection mode
- Individual task action buttons hide to provide a focused selection experience
- In floating mode, grouping controls temporarily hide to save toolbar space

**Selecting tasks:**
- Click checkboxes to select individual tasks
- **Shift+Click** to select a range (click one task, then Shift+Click another to select all between)
- Use the group header checkbox to select or clear all tasks in that group
- Use **Select All** to select all visible tasks, or **Clear** to deselect

**Available actions:**
| Action | Description |
|------|-------------|
| Complete | Mark all selected tasks as done |
| Reopen | Revert completed tasks to open |
| Snooze +1d | Defer task 1 day |
| Snooze +7d | Defer task 7 days |
| Project | Set project from picklist |
| Waiting For | Set waiting-for from picklist |
| Context | Set context from picklist |
| Priority | Set to low / medium / high / clear |
| Energy | Set to low / medium / high / clear |
| GTD | Set to Next Action / Delegated / Deferred / Someday / clear |

All bulk actions support **Undo** via the toast notification.

**Tip:** Set up your view first (filters, grouping) before entering bulk mode — this lets you target exactly the tasks you want to update.

---

## 🗓 Today widget & Today badge (optional)

### Today widget (on today’s DNP)

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/today-widget.jpg" width="600" alt="Today widget on DNP"/>
</p>

### Today badge (left sidebar)

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/today-badge.png" width="420" alt="Today badge"/>
</p>

---

## ⚙️ Settings (progressive disclosure)

<p align="center">
  <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/settings-core.png" width="600" alt="Settings panel"/>
</p>

Core settings:
- Language
- Destination for next task
- Confirm before spawning
- First day of week
- Inline pill checkbox threshold (performance guard)

Additional sections appear only when enabled.
- **Advanced Dashboard options** unlock the Weekly Review step toggles (on/off per step; order is fixed).
- **Advanced Project/Context/Waiting options** let you exclude specific pages from picklists.
- **Customise attribute names (advanced)** exposes settings to rename Better Tasks attribute labels/keys.

---

## 🤖 AI task input parsing (experimental)

- Optional BYO OpenAI key (client-side only)
- Maps natural language into repeat/dates
- Falls back safely if parsing fails
- No backend, no graph data sent
- Note: OpenAI keys are stored in Roam graph settings and may be included in some exports.

---

## 🧭 Commands

- Convert TODO to Better Task
- Create a Better Task
- Toggle Better Tasks Dashboard
- Toggle Dashboard (Full page)
- Switch / Save views
- Reinstall preset views
- Weekly Review

---

## 📆 Repeat Field Syntax (Current Support)

The `repeat::` attribute accepts natural-language patterns. Parsing is case-insensitive, tolerates extra whitespace, and supports separators like commas, `/`, `&`, and the word "and".
Abbreviations and ranges are supported (e.g., `Mon`, `Tue`, `Thu`, `MWF`, `TTh`, `Mon-Fri`).
Anchor date: the next occurrence is calculated from `due::` (preferred). If no `due::` is present, the current date is used as the anchor.
Week start: ranges and some weekly rules respect your **First day of the week** setting in the extension.

### Daily and Business Days
| Example | Meaning |
|---|---|
| `every day` \| `daily` | once per day |
| `every 2 days` \| `every other day` \| `every second day` | every 2 days |
| `every three days` | every 3 days |
| `every 5 days` | every 5 days |
| `every weekday` \| `business days` \| `workdays` | Monday-Friday |
| `every 2 weekdays` | every 2 business days (Mon-Fri cadence) |

### Weekly - Single Day (any case/abbrev)
| Example | Meaning |
|---|---|
| `every monday` | every week on Monday |
| `every mon` \| `EVERY MON` \| `every MOnDaY` | variants accepted |

### Weekly - Base Keywords and Intervals
| Example | Meaning |
|---|---|
| `weekly` \| `every week` | once per week (no fixed day) |
| `every other week` \| `every second week` \| `biweekly` \| `fortnightly` \| `every fortnight` | every 2 weeks |
| `every 3 weeks` | every third week (no fixed day) |

### Weekly - Multiple Days (lists and separators)
| Example | Meaning |
|---|---|
| `weekly on tue, thu` | Tuesday and Thursday |
| `weekly on tue thu` | same (spaces only) |
| `weekly on tue & thu` | same (`&` supported) |
| `weekly on tue/thu` \| `Tu/Th` \| `t/th` | slash shorthand |
| `every mon, wed, fri` \| `MWF` | Monday, Wednesday, Friday |
| `TTh` | Tuesday and Thursday |
| `weekly on tue, thu and sat & sun` | mixed separators supported |

### Weekly - Ranges (includes wrap-around)
| Example | Meaning |
|---|---|
| `every mon-fri` | Monday through Friday |
| `every fri-sun` | Friday to Sunday range |
| `every su-tu` | Sunday to Tuesday (wrap) |

### Weekly - Interval + Specific Day(s)
| Example | Meaning |
|---|---|
| `every 2 weeks on monday` | every 2nd Monday |
| `every 3 weeks on fri` | every 3rd Friday |
| `every 4 weeks on tue, thu` | every 4th week on Tue & Thu |

### Monthly - By Day Number (single/multi, clamps, EOM)
| Example | Meaning |
|---|---|
| `monthly` | same calendar day each month (uses `due::` day) |
| `every month on day 15` | 15th of each month |
| `the 1st day of each month` | 1st day every month |
| `day 31 of each month` | clamps to end of shorter months |
| `last day of the month` \| `last day of each month` \| `last day of every month` \| `EOM` | last calendar day each month |
| `on the 1st and 15th of each month` | 1st and 15th |
| `on the 15th and last day of each month` | 15th + EOM |
| `on the 5th, 12th, 20th of each month` \| `on the 5th/12th/20th of each month` \| `on the 5th & 12th & 20th of each month` | multiple specific dates |

### Monthly - Nth Weekday Variants
- `first monday of each month`
- `2nd wed every month`
- `last friday of each month`
- `1st and 3rd monday of each month`
- `penultimate friday of each month` / `second last friday ...`
- `first weekday of each month`
- `last weekday of each month`
- `every month on the second tuesday`
- `2nd Tue each month`
- `the last thu each month`

### Every N Months (date or Nth weekday)
- `every 2 months on the 10th`
- `every 3 months on the 2nd tuesday`
- `quarterly`
- `semiannual` / `semi-annually` / `twice a year`

### Yearly - Fixed Date and Nth Weekday-in-Month
- `every March 10`, `on 10 March every year`
- `annually`, `yearly` (fixed-date anchor)
- `first Monday of May every year`

### Weekends
| Example | Meaning |
|---|---|
| `every weekend` \| `weekends` | Saturday & Sunday |

Notes:
- Abbreviations and aliases: `Mon/Mon./Monday`, `Thu/Thurs/Thursday`, `MWF`, `TTh` are accepted.
- Ranges: `Mon-Fri` expands to all included days.
- Clamping: day numbers beyond a month’s end clamp to the last valid date (e.g., `31st` -> Feb 28/29).
- "Every N weekdays" counts business days (Mon-Fri) only.
- Pluralisation is flexible: `monday`/`mondays`, `week`/`weeks`, etc.

---

## ⚡ Performance notes

Recent versions include memory and render optimisations.

If Roam feels slow:
1. Disable **Today Widget**
2. Disable **Today Badge**
3. Message me in Slack with task count + details

---

## 🌍 Internationalisation

Supported:
- English (en)
- Simplified Chinese (zh)
- Traditional Chinese (zhHant)

UI is fully locale-aware.  
Natural-language recurrence parsing is intentionally English-only for now.

---

## Extension Tools API

Better Tasks registers tools on `window.RoamExtensionTools["better-tasks"]` so other extensions (e.g. Chief of Staff) can query and manage tasks programmatically.

### Available tools

| Tool | Description |
|------|-------------|
| `bt_get_projects` | List projects with derived status and optional task counts |
| `bt_get_waiting_for` | List waiting-for values with optional counts |
| `bt_get_context` | List context values with optional counts |
| `bt_get_attributes` | Get configured attribute schema (names, types, allowed values) |
| `bt_search` | Search tasks by status, due, project, assignee, or free text |
| `bt_create` | Create a new task (defaults to today's daily page) |
| `bt_modify` | Update an existing task's status, text, or attributes |

### `bt_search` due filter values

| Value | Meaning |
|-------|---------|
| `overdue` | TODO tasks past their due date |
| `today` | Tasks due today |
| `this-week` | Tasks due **after today** through 7 days from now (use `today` for today's tasks) |
| `upcoming` | Tasks due in the future (not overdue or today) |
| `none` | Tasks with no due date |
| ISO date (e.g. `2026-02-20`) | Tasks due on that specific date |

### Project status derivation

`bt_get_projects` derives status from task counts rather than a stored field:
- **active** — has at least one TODO task, or has no tasks at all
- **completed** — has tasks and all are DONE

---

Enjoy Better Task management directly inside Roam Research!
