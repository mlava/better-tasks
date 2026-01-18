# 🌀 Better Tasks for Roam Research

**The missing task layer for Roam.**  

Turn native TODOs into **scheduled and recurring tasks** with **inline pills**, a **powerful dashboard**, and optional **Today widget/badge** — all stored as plain Roam blocks.
<BR><BR>

> ✅ Roam-native storage (child blocks) • ✅ Recurring + one-off scheduled tasks • ✅ Actively maintained

<BR>
**Support / bugs:** Please message me in the Roam Slack (include repro steps + any console output if relevant):  
https://app.slack.com/client/TNEAEL9QW/

---

## What it looks like (start here)

<p align="center">
  <img src="images/hero-dashboard.png" width="800" alt="Better Tasks dashboard showing Today/Overdue triage"/>
</p>

---

## Why Better Tasks

If you use TODOs in Roam, Better Tasks gives you:

- **Recurring tasks** that spawn the next occurrence when completed
- **Start / Defer / Due** dates for scheduled one-off tasks
- **Inline pills** for fast editing, snoozing, and jumping to DNPs
- A **dashboard** for review & triage, **saved views**, and **weekly review presets**
- Optional **Today widget** (on today’s DNP) and **Today badge** (left sidebar)
- Optional metadata: **Project, Context, Waiting-for, GTD, Priority, Energy**

---

## ✅ Recent updates

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
  <img src="images/pills-closeup.png" width="850" alt="Inline pill showing repeat and dates"/>
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
| Snooze +1 day | Push start date forward 1 day |
| Snooze +3 days | Push start date forward 3 days |
| Snooze to next Monday | Move start to next Monday |
| Snooze (pick date) | Choose a custom date |
| Skip this occurrence | Jump to next repeat |
| Generate next now | Create next task immediately |
| End recurrence | Stop repeating |

All actions support **Undo**.

---

## 📊 Better Tasks dashboard

Open via Command Palette → **Toggle Better Tasks Dashboard**  or the top-bar icon <img src="images/image-2.png" width="22" alt="Dashboard toggle icon">

<p align="center">
  <img src="images/dashboard-floating.png" width="800" alt="Floating dashboard"/>
</p>

Features:
- Filters: recurrence, availability, due buckets, completion
- Quick snooze / complete actions
- Jump back to original blocks
- Draggable floating panel (position remembered)
- Optional **full-page mode** with persistent filter sidebar
- Metadata chips + filtering
- Quick-add input (uses AI parsing if enabled)

### Full-page mode

<p align="center">
  <img src="images/dashboard-fullpage.png" width="800" alt="Full-page dashboard"/>
</p>

---

## 🗓 Today widget & Today badge (optional)

### Today widget (on today’s DNP)

<p align="center">
  <img src="images/today-widget.jpg" width="600" alt="Today widget on DNP"/>
</p>

### Today badge (left sidebar)

<p align="center">
  <img src="images/today-badge.png" width="420" alt="Today badge"/>
</p>

---

## ⚙️ Settings (progressive disclosure)

<p align="center">
  <img src="images/settings-core.png" width="600" alt="Settings panel"/>
</p>

Core settings:
- Language
- Destination for next task
- Confirm before spawning
- First day of week
- Inline pill checkbox threshold (performance guard)

Additional sections appear only when enabled.

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

Enjoy Better Task management directly inside Roam Research!
