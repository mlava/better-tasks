# 🌀 Better Tasks for Roam Research

Bring true task management to Roam Research!

Better Tasks automatically recognises and manages TODO items that match defined repeat patterns and/or date attributes, optionally generating the next instance when a repeating Better Task is completed. 

**Note:** 
Better Tasks is actively maintained. Please let me know of any bugs or unexpected behaviours in Slack  - https://app.slack.com/client/TNEAEL9QW/

**Note 2:**
Some users have reported Roam feels sluggish with Better Tasks installed. Hopefully, that is fixed in this version.
  - If you experience this, please disable Today Widget in settings and see if that resolves the issue. Either way, please contact me via Slack to let me know, and if you can capture any developer console output that would also help.

This video provides an overview of some of the extension's functionality, although many features have been added since it was recorded (see the Changelog below)!

<p align="center">
https://www.loom.com/share/bb6ffd38ff35441ab2ed5138b5c2cb70
</p>

---

## 📜 Changelog (recent highlights)

- Reduced memory usage, especially with Today widgets and inline pills.
  - Some users had reported Roam felt sluggish. These adjustments will hopefully fix that issue.
  - If you experience this, please disable Today Widget in settings and see if that resolves the issue. Either way, please contact me via Slack to let me know, and if you can capture any developer console output that would also help.

- Saved Dashboard Views
  - Save, switch, update, rename, and delete named dashboard views, capturing filters, grouping, and search state.
  - Cross-Graph & Cross-Device Persistence
    - Views are stored via Roam Depot extension settings and sync automatically across graphs and devices.
  - Default (Unsaved) State
    - Selecting “Default” restores your last “unsaved working state” across reloads/devices.
  - Dirty State Awareness
    - The Update action is only enabled when the current dashboard state differs from the saved view.
  - Improved Dashboard Toolbar Layout
    - Clean separation between header actions (Refresh / Close) and view controls for a more stable, predictable layout.
  - Command Palette Support
    - Quickly save or switch dashboard views directly from the command palette.
  - Preset Views (Seeded)
    - First install seeds a small set of GTD review presets when no views exist; a command can reinstall missing presets later (without overwriting user views).
- Weekly Review (guided presets)
  - Step through a fixed sequence of saved review presets with Back/Next navigation.
  - Exit returns you to the exact dashboard state you were in before starting.
- Completed within date range filter
  - Available when filtering to Completed tasks only.
- Project grouping in dashboard
  - group tasks by project (with a “No Project” bucket).
- Full-page dashboard mode
  - Expand the dashboard to fill Roam’s main content area (with a dedicated command palette entry).
  - Full-page layout includes a persistent, collapsible, resizable filters sidebar with grouped sections.

- Added unified pickers and in-memory indexes for Projects, Waiting-for, and Context across inline pills, dashboard menus, and the create/convert prompt; options refresh from your configured attributes and clean up when removed.
- Picklist exclusions (Projects / Context / Waiting-for)
  - Always excludes `roam/*` pages from picklists, with an optional user-defined exclude list available in settings.
- Added a 'Today Widget' - automatically place a block and children or block and React panel in today's DNP
  - option to set your own heading text, and the extension will find and use that for the widget placement
  - alternatively, create the widget at top or bottom of the DNP
  - the Settings section below explains the configuration options
- Added i18n support (en, zh, zhHant) across settings, prompts, dashboard, pills and toasts.
- Optimised performance (caching, throttled renders, diffed updates, pill debounce).
- Localised pill tooltips and metadata labels.
- Dynamic Roam settings panel refresh on language change with compatibility for legacy anchors/values.
- Improved theme handling (localised notices) and observer stability for theme toggles.

---

## 📘 Quick Overview

You can create a Better Task directly or via the Command Palette — both behave identically, store their data in child blocks for reliability, and can include either a repeat rule or just start/defer/due dates for one-off scheduling.

### 🔹 Child Block Style

```markdown
{{[[TODO]]}} Write weekly newsletter
  - BT_attrRepeat:: every Friday
  - BT_attrDue:: [[2025-11-07]]
```

When completed:

```markdown
{{[[DONE]]}} Write weekly newsletter
  - BT_attrRepeat:: every Friday
  - BT_attrDue:: [[2025-11-07]]
  - BT_attrCompleted:: [[2025-10-31]]
```

Optionally include a start attribute `BT_attrStart::` (when the task becomes available) and/or defer attribute `BT_attrDefer::` (when it should resurface). These labels are configurable in settings; defaults are `BT_attrStart` and `BT_attrDefer`. The completion attribute defaults to `BT_attrCompleted::` but can also be configured in Settings.

### 🔹 Scheduled (One-Off) Tasks

Leave the repeat field blank while setting any combination of `start::`, `defer::`, or `due::` to create a *scheduled one-off* task. It uses the same child-block storage, pills, snooze controls, and completion logic — just without spawning a follow-up block. Completing it writes `completed:: [[<today>]]` and hides the pill. Tasks with only metadata are supported too (no repeat or dates required).

### 🔹 Optional Metadata

Better Tasks also understands the following optional child-block attributes (names configurable in settings; defaults shown):

```markdown
- BT_attrProject:: [[Website Refresh]]
- BT_attrGTD:: Next Action
- BT_attrWaitingFor:: [[Finance Team]]
- BT_attrContext:: @computer, #office
- BT_attrPriority:: high
- BT_attrEnergy:: medium
```

These lines are purely optional - omit any you don’t need. Whenever a metadata value exists, it appears both in the dashboard and in the inline pill with quick actions:

- Click → opens/creates the referenced page (project, waiting-for, context).
- Shift+Click → opens that page in the right sidebar.
- Cmd/Ctrl+Click → prompts you to edit the value directly.

GTD status cycles through Next Action → Delegated → Deferred → Someday → (cleared) on click. Priority/energy pills cycle through low/medium/high/none on click. You can also add/remove metadata from the “⋯” menu on the pill or the dashboard row. The Convert/Create prompt includes these fields, with dropdowns for GTD/priority/energy.

### 🔹 Inline Pill Indicators

Regardless of how you enter the attributes, the extension emits a compact **pill** next to each Better Task whenever its child blocks are collapsed:

![alt text](https://raw.githubusercontent.com/mlava/better-tasks/main/images/image.png)

- Pills disappear automatically when you expand the task (so you can edit the child blocks directly) and reappear when the block is collapsed.
- Marking the TODO complete hides the pill until the extension spawns the next occurrence, keeping finished items visually quiet.
- Tasks without a repeat rule still show the pill with their start/defer/due dates, just without the ↻ segment.
- Dates within the next 7 days show the weekday name (`Wed`, `Thu`); anything further out shows a short date (`Feb 26`), so you can scan upcoming items quickly.
- **↻ Repeat pill** — Click to edit; **Alt+Click** copies the rule to the clipboard.
- **⏱ Start / ⏳ Defer / 📅 Next** — Click to open the corresponding Daily Note Page.  
  **Shift+Click** opens that page in the right sidebar (matches Roam).  
  **Alt-Cmd/Ctrl+Click** on the due pill snoozes +1 day.  
  **Alt/Ctrl/Meta+Click** on any date pill opens a date picker to change that date.
- **📁 / ⌛ / @ / ! / 🔋 metadata** — Only appear when a project, waiting-for, context, priority, or energy is set. Click to open the page or cycle the value (priority/energy); Shift+Click opens in the sidebar; Cmd/Ctrl+Click prompts you to edit.
- **⋯ Menu** — Opens the full Better Task menu (see below).
  - Metadata-only tasks still show the pill/menu so you can edit or clear attributes.

---

## ⚙️ Settings

Better Tasks settings use **progressive disclosure**: advanced options appear only when relevant (e.g. when you enable a feature or choose a mode).

### Core
- **Language** — Preferred language for Better Tasks UI.
- **Destination for next task** — Where to create the next occurrence (`DNP`, `Same Page`, or `DNP under heading`). When you choose `DNP under heading`, the **DNP heading** field appears.
- **Confirm before spawning next task** — Confirmation prompt when completing a repeating task.
- **First day of the week** — Used for weekly ranges and some weekly interval rules; default is Monday.
- **Inline pill checkbox threshold** — Caps how many checkboxes can be on a page before pill rendering is skipped (performance safeguard).

### Today Badge
- **Enable Today badge** — When enabled, reveals label/overdue/color settings and shows a “Today” link + count badge in the left sidebar.

### Today Widget
- **Enable Today widget** — When enabled, reveals widget configuration (title/placement/heading/layout/overdue/completed) and renders on the DNP.

### AI parsing (experimental)
- **AI parsing mode** — When set to “Use my OpenAI key”, the **OpenAI API key** field appears. See “AI Task Input Parsing” below for details.

### Picklist exclusions (Projects / Context / Waiting-for)
- **Advanced Project/Context/Waiting options** — When enabled, reveals **Exclude pages from picklists** (comma-separated; wrap titles containing commas—like daily note pages—in `[[...]]`). `roam/*` pages are always excluded.

### Customise attribute names (advanced)
- **Customise attribute names (advanced)** — When enabled, reveals attribute name fields (Repeat, Start, Defer, Due, Completed, Project, GTD, Waiting-for, Context, Priority, Energy). Defaults are chosen to reduce accidental matches if you already use similar attributes in your graph.

## 🤖 AI Task Input Parsing (Experimental)
- What it does: optionally sends the raw task text to OpenAI (BYO key, client-side) and maps the returned JSON into Better Task title/repeat/date attributes. If anything fails, the normal “Create a Better Task” flow runs instead.
- How to enable: in Better Tasks settings, set **AI parsing mode** to “Use my OpenAI key” and paste your key into **AI API key**. When mode is Off or the key is blank, AI parsing is skipped automatically.
- Privacy: the key and task text are sent directly from your browser to OpenAI; no extra backend is used. The key is stored in Roam’s extension settings (standard for Roam Depot AI extensions).
- Limitations: early feature; repeat/date parsing may be conservative. Project/context/priority/energy fields are accepted but currently ignored. Ambiguous input may fall back to manual entry.
- Failure behaviour: network/JSON/validation issues show a small toast (“AI parsing unavailable…”) and the normal Better Task prompt runs so task creation never blocks.
- How it flows: use the existing “Create a Better Task” command palette entry or block context menu. If AI is enabled and you have text in the block, it’s sent to OpenAI; otherwise you’ll be prompted for text. A small spinner toast appears while waiting for the API.
- Data safety: only the task text you supply plus your API key are sent directly to OpenAI; no proxy/server is involved. Nothing else from your graph is transmitted. If you hit quota issues, you’ll see a toast pointing you to the provider’s billing/limits page (`https://platform.openai.com/settings/organization/billing/overview`).

### Today Widget
- **Enable Today widget** — Show the widget on the Daily Notes Page.
- **Today widget title** — Text used for the anchor. If a matching block exists anywhere on the DNP (markdown wrappers are ignored), the widget renders under it; otherwise it creates one at the chosen placement (Top/Bottom).
- **Placement** — Top/Bottom when no existing anchor is found.
- **Heading level** — Optional heading styling applied to the anchor the widget uses/creates.
- **Include overdue** — Adds overdue tasks (completed items are excluded from overdue).
- **Show completed** — Shows completed tasks for today buckets (start/defer/due = today); overdue always hides completed.
- Panel mode actions: Complete, Snooze +1d, Snooze +7d. Snoozing moves defer and, when defer and due match, due moves by the same amount.
- Shift+click a task title opens it in the right sidebar (panel mode).

### Today Badge (optional, default off)
- Adds a “Today” link with a badge count just under the Daily Notes button in the left sidebar.
- Settings: enable/disable, label (i18n-aware), include overdue (default off; completed never counted), badge background/text colors (updates immediately when changed).
- Click → if the Today widget is enabled, opens the widget anchor in the main window; if the widget is disabled, opens today’s DNP instead.
- Uses the same today/overdue logic as the widget and hides the badge when count = 0.

---

## 🧩 Pills and Menus

Each task shows an inline “pill” next to its checkbox when the child blocks are collapsed.

**Pill actions:**
- **Repeat pill (↻)** — Click to edit; Alt+Click to copy rule text.
- **Due pill (Next:)** — Click to open DNP; Shift+Click opens in right sidebar; Alt-Cmd/Ctrl+Click snoozes +1 day; Alt/Ctrl/Meta+Click opens the date picker.
- **⋯ (menu)** — Opens the task menu with more options:

| Action | Description |
|--------|--------------|
| Snooze +1 day | Push start date forward 1 day |
| Snooze +3 days | Push start date forward 3 days |
| Snooze to next Monday | Move start to the next Monday |
| Snooze (pick date) | Choose a custom start date |
| Skip this occurrence | Jump directly to next repeat cycle |
| Generate next now | Immediately create the next task |
| End recurrence | Stop this task from repeating |

All actions support **Undo** via a toast notification. If a start date isn't configured the buttons snooze the due date instead. Skip / generate / end only appear for tasks with a repeat rule.

---

## 📊 Better Tasks Dashboard

Open the dashboard from the command palette (`Toggle Better Tasks Dashboard`) or the icon <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/image-2.png" width="22"> that appears in Roam’s top bar. The dashboard lists every Better Task (recurring or scheduled one-off) with:

- Powerful filters for recurrence type, availability (start/defer), due bucket, and completion status.
- Quick snooze actions, completion toggles, and links back to the originating blocks.
- Background refreshes whenever task attributes change so pills and dashboard stay in sync.
- A floating panel you can drag anywhere within the Roam window. The position is remembered, so place it where it works best for your workflow.
- Optional full-page mode that expands to fill Roam’s main content area; in full-page mode filters move into a persistent left sidebar (collapsible groups, hide/show, and resizable width).
- A subtle ⋯ menu beside each task’s pills that lets you add or remove repeat/start/defer/due attributes (or edit them) without leaving the dashboard.
- Optional metadata chips (project, waiting-for, context, priority, energy) with filters plus add/remove buttons that mirror the inline pill behaviour.
- A quick-add input at the top: type a task and hit **OK** or Enter to create it (uses AI parsing when enabled, otherwise the manual Better Task flow with scheduling).
- Clicking the repeat or date pills in the dashboard mirrors the inline pill behaviour: you can open the same pickers, copy repeat text, or jump straight to the target Daily Note without expanding the block in Roam.

Use the dashboard to triage overdue work, snooze tasks, or jump straight to the next daily note page without leaving Roam.

### 🎨 Theme Compatibility (Adaptive)

Better Tasks samples colours from Roam’s active theme and applies a lightweight contrast layer so the dashboard and pills feel native in both light and dark modes. The adaptive styling now works with Roam Studio, CSS Dark Mode Toggle, Roam "Native" Dark and Blueprint light/dark themes; if you spot any illegible text or mismatched backgrounds in your graph, please report the theme so we can fine‑tune it.

<p align="center">
<img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/theming.gif"/>
</p>

---

## 🧭 Commands

You can trigger these from Roam’s Command Palette (`Ctrl+P` / `Cmd+P`) or block context menu:

- **Convert TODO to Better Task**
- **Create a Better Task**
- **Toggle Better Tasks Dashboard**
- **Better Tasks: Switch view…**
- **Better Tasks: Save current view as…**
- **Better Tasks: Reinstall preset dashboard views**
- **Better Tasks: Weekly Review**
- **Toggle Better Tasks Dashboard (Full page)**

These commands let you turn an existing task into a repeating Better Task or start a new scheduled TODO; just leave the repeat field blank to create a one-off with start/defer/due timing.

---
## 📆 Repeat Field Syntax (Current Support)

The `repeat::` attribute accepts **natural-language** patterns. Parsing is **case-insensitive**, tolerates **extra whitespace**, and supports separators like commas, `/`, `&`, and the word **and**.  
**Abbreviations and ranges are supported** (e.g., `Mon`, `Tue`, `Thu`, `MWF`, `TTh`, `Mon–Fri`).  
**Anchor date**: the next occurrence is calculated from `due::` (preferred). If no `due::` is present, the current date is used as the anchor.  
**Week start**: ranges and some weekly rules respect your **First day of the week** setting in the extension.

This video demonstrates some of the recurrence/repeat functions:

<p align="center">
https://www.loom.com/share/f8856114bfd14d40a228292e7bcff9ee
</p>

---

### 🗓️ Daily & Business Days
| Example | Meaning |
|---|---|
| `every day` \| `daily` | once per day |
| `every 2 days` \| `every other day` \| `every second day` | every 2 days |
| `every three days` | every 3 days |
| `every 5 days` | every 5 days |
| `every weekday` \| `business days` \| `workdays` | Monday–Friday |
| `every 2 weekdays` | every 2 business days (Mon–Fri cadence) |

---

### 📅 Weekly — Single Day (any case/abbrev)
| Example | Meaning |
|---|---|
| `every monday` | every week on Monday |
| `every mon` \| `EVERY MON` \| `every MOnDaY` | variants accepted |

---

### 📅 Weekly — Base Keywords & Intervals
| Example | Meaning |
|---|---|
| `weekly` \| `every week` | once per week (no fixed day) |
| `every other week` \| `every second week` \| `biweekly` \| `fortnightly` \| `every fortnight` | every 2 weeks |
| `every 3 weeks` | every third week (no fixed day) |

---

### 📅 Weekly — Multiple Days (lists & separators)
| Example | Meaning |
|---|---|
| `weekly on tue, thu` | Tuesday and Thursday |
| `weekly on tue thu` | same (spaces only) |
| `weekly on tue & thu` | same (`&` supported) |
| `weekly on tue/thu` \| `Tu/Th` \| `t/th` | slash shorthand |
| `every mon, wed, fri` \| `MWF` | Monday, Wednesday, Friday |
| `TTh` | Tuesday and Thursday |
| `weekly on tue, thu and sat & sun` | mixed separators supported |

---

### 📅 Weekly — Ranges (includes wrap-around)
| Example | Meaning |
|---|---|
| `every mon-fri` \| `every mon–fri` \| `every mon—fri` | Monday through Friday |
| `every fri–sun` | Friday → Sunday range |
| `every su–tu` | Sunday → Tuesday (wrap) |

---

### 📅 Weekly — Interval + Specific Day(s)
| Example | Meaning |
|---|---|
| `every 2 weeks on monday` | every 2nd Monday |
| `every 3 weeks on fri` | every 3rd Friday |
| `every 4 weeks on tue, thu` | every 4th week on Tue & Thu |

---

### 🗓️ Monthly — By Day Number (single/multi, clamps, EOM)
| Example | Meaning |
|---|---|
| `monthly` | same calendar day each month (uses `due::` day) |
| `every month on day 15` | 15th of each month |
| `the 1st day of each month` | 1st day every month |
| `day 31 of each month` | clamps to end of shorter months |
| `last day of the month` \| `last day of each month` \| `last day of every month` \| `EOM` | last calendar day each month |
| `on the 1st and 15th of each month` | 1st & 15th |
| `on the 15th and last day of each month` | 15th + EOM |
| `on the 5th, 12th, 20th of each month` \| `on the 5th/12th/20th of each month` \| `on the 5th & 12th & 20th of each month` | multiple specific dates |

### 🗓️ Monthly — Nth Weekday Variants
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

### 🗓️ Every N Months (date or Nth weekday)
- `every 2 months on the 10th`
- `every 3 months on the 2nd tuesday`
- `quarterly`
- `semiannual` / `semi-annually` / `twice a year`

---

### 🎉 Yearly — Fixed Date & Nth Weekday-in-Month
- `every March 10`, `on 10 March every year`
- `annually`, `yearly` (fixed-date anchor)
- `first Monday of May every year`

---

### 📆 Weekends
| Example | Meaning |
|---|---|
| `every weekend` \| `weekends` | Saturday & Sunday |


#### Notes
- **Abbreviations & aliases**: `Mon/Mon./Monday`, `Thu/Thurs/Thursday`, `MWF`, `TTh` are accepted.  
- **Ranges**: `Mon–Fri` (or `Mon-Fri`) expands to all included days.  
- **Clamping**: Day numbers beyond a month’s end **clamp** to the last valid date (e.g., `31st` → Feb 28/29).  
- **“Every N weekdays”** counts **business days** (Mon–Fri) only.  
- **Pluralisation** is flexible: `monday`/`mondays`, `week`/`weeks`, etc.

---

## 💡 Tips

- Any TODO with a `repeat::` value automatically becomes a repeating Better Task.
- Completing it will **spawn the next occurrence** (optionally after confirmation).
- Collapsing a Better Task shows its pill; expanding it reveals the underlying child blocks for editing.
- Most actions (skip, snooze, edit) display an **Undo** toast.

---

## 🧰 Example Workflow

1. Draft the task and then run **Convert TODO to Better Task** (or simply **Create a Better Task** if you’re starting fresh). The toast lets you enter the title, optional repeat rule, and optional start/defer/due dates; it stores the canonical data in child blocks and shows the inline pill.
2. Mark it done — for repeating Better Tasks, the extension automatically creates the next task on its start date (or due date if no start is provided) so it appears on the right Daily Note or page.
3. If you snooze or skip via the pill menu, the defer/due child blocks update and the pill reflects the new dates immediately.

---

## 🌍 Internationalisation (i18n)

Better Tasks is fully locale-aware across the UI:

- Roam Depot settings panel (all labels and options)
- Dynamic settings refresh on language change
- Inline pills and tooltips
- Dashboard UI, filters, saved views, and review presets
- Locale-aware date formatting and first-day-of-week handling

Currently supported languages are:
- English (en)
- Simplified Chinese (zh)
- Traditional Chinese (zhHant)

We welcome contributions from users who wish to add other languages.

### Note on Natural Language Parsing (NLP)

Localised natural-language parsing for recurrence patterns (e.g. “every second Tuesday”, “fortnightly”, or non-English equivalents) is **explicitly out of scope** for the current i18n implementation.

This is recognised as a **future AI/NLP enhancement**, rather than a missing localisation feature. The current recurrence system prioritises correctness, transparency, and explicit user intent over heuristic parsing.

---

Enjoy Better Task management directly inside Roam Research!
