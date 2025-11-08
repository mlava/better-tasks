# 🌀 Recurring Tasks for Roam Research

Bring true recurring task automation to Roam Research!  
This extension automatically recognizes and manages TODO items that match defined repeat pattern and due date attributes, generating the next instance when a task is completed.

**Note**: this extension is in active development and should be considered an early beta release. Please let me know of any bugs or unexpected behaviours in Slack  - https://app.slack.com/client/TNEAEL9QW/

**Note 2:** for now, I've switched off the Hidden Mode feature to stabilise core functions. Please ignore that section of the README below. 

**Note 3:** the settings pane for the extension allows you to use whatever name for the repeat and due date atttributes you choose. The extension defaults to using 'attrRepeat_RT' and 'attrDue_RT' for the recurrence pattern and due date respectively. If you happen to already use these attributes for other purposes, the extension will recognise and attempt to use them if you don't set alternatives in the settings. Using 'frequency' and 'when' for example, would prevent the extension from acting on anything for which you already use 'attrRepeat_RT' and 'attrDue_RT'.

---

## 📘 Quick Overview

You can record a recurring task in **two styles** — both behave identically.  
Choose your preferred mode under **Settings → Recurring Tasks → “Show repeat/due as”**.

### 🔹 Inline Attribute Style

Use Roam attributes directly within the task block:

```markdown
{{[[TODO]]}} Review project metrics repeat:: every weekday due:: [[2025-11-06]]
```

You can add other metadata such as completion date:

```markdown
{{[[DONE]]}} Send team update
repeat:: every 2 weeks on Friday
due:: [[2025-11-07]]
completed:: [[2025-10-24]]
```

### 🔹 Child Block Style

If you prefer to keep the task text clean, choose “Child” mode. The repeat and due info will appear as sub-blocks:

```markdown
{{[[TODO]]}} Write weekly newsletter
  - repeat:: every Friday
  - due:: [[2025-11-07]]
```

When completed:

```markdown
{{[[DONE]]}} Write weekly newsletter
  - repeat:: every Friday
  - due:: [[2025-11-07]]
  - completed:: [[2025-10-31]]
```

### 🔹 Hidden Attribute (Pill) Style

When set to “Hidden”, repeat/due are stored as hidden block properties.  
You’ll see **visual pills** beside the checkbox for clarity:

```
☑️ Write weekly newsletter  ↻ every Friday · Next: Fri 7 Nov ⋯
```

- Hover a pill for details.
- Click **↻** to **edit** the repeat rule. (**Alt+Click** copies it.)
- Click **Next:** to open that date’s Daily Note Page.  
  **Shift+Click** snoozes by +1 day.  
  **Alt/Ctrl/Meta+Click** opens a date picker to change the due date.
- Click **⋯** for more options (see below).

---

## ⚙️ Settings

### 🗂️ Destination for Next Task
Determines where the next instance of a recurring task appears:
- **Daily Notes Page (DNP)** — Default; next occurrence is created on its due date’s DNP.  
- **Same Page** — Next occurrence appears below the current one.
- **Under a Heading on DNP** — Adds the new task under the heading you specify (default: “Tasks”).

### ⏱️ Calculate Next Due Date From
Controls whether new due dates are based on:
- **Due Date** — Start from the current due date.
- **Completion Date** — Start from when you actually mark it done.

### 🧱 Show Repeat/Due As
Controls how repeat/due metadata appear:
- **Child** — Adds visible sub-blocks under the TODO.
- **Hidden** — Stores them as hidden props and shows pills inline.

### 🗨️ Confirm Before Spawning Next Task
If enabled, shows a confirmation dialog (“Spawn next occurrence?”) when you complete a recurring TODO.

---

## 🧩 Pills and Menus

Each task with hidden attributes shows an inline “pill” next to its checkbox.

**Pill actions:**
- **Repeat pill (↻)** — Click to edit; Alt+Click to copy rule text.
- **Due pill (Next:)** — Click to open DNP; Shift+Click to snooze 1 day; Alt/Ctrl/Meta+Click to edit due date.
- **⋯ (menu)** — Opens the task menu with more options:

| Action | Description |
|--------|--------------|
| Snooze +1 day | Push due date forward 1 day |
| Snooze +3 days | Push due date forward 3 days |
| Snooze to next Monday | Move to the next Monday |
| Snooze (pick date) | Choose a custom snooze date |
| Skip this occurrence | Jump directly to next repeat cycle |
| Generate next now | Immediately create the next task |
| End recurrence | Stop this task from recurring |

All actions support **Undo** via a toast notification.

---

## 🧭 Commands

You can trigger these from Roam’s Command Palette (`Ctrl+P` / `Cmd+P`) or block context menu:

- **Convert TODO to Recurring Task**
- **Create a Recurring TODO**

These commands let you turn an existing task into a recurring one or start a new recurring TODO directly.

---

## 📆 Repeat Field Syntax

The `repeat::` attribute accepts **natural language** patterns — flexible and case-insensitive.

### 🗓️ Daily
| Example | Meaning |
|----------|----------|
| every day | once per day |
| every 2 days | every second day |
| every other day | every 2 days |
| every weekday | Monday–Friday |

### 📅 Weekly
| Example | Meaning |
|----------|----------|
| every monday | every week on Monday |
| every week | once per week |
| every other week | every two weeks |
| weekly on tue, thu | every Tuesday and Thursday |
| every 3 weeks on fri | every third Friday |

### 🗓️ Monthly (by day number)
| Example | Meaning |
|----------|----------|
| monthly | same day each month |
| every month on day 15 | 15th of each month |
| the 1st day of each month | 1st day of month |
| 31st day → clamps to Feb 29/28 | auto-adjusts for shorter months |

### 🗓️ Monthly (by weekday)
| Example | Meaning |
|----------|----------|
| first monday of each month | 1st Monday every month |
| 2nd wed every month | 2nd Wednesday |
| last friday of each month | final Friday each month |

### 📆 Weekends
| Example | Meaning |
|----------|----------|
| every weekend | Saturday & Sunday |

---

## 💡 Tips

- Any TODO with a `repeat::` value automatically becomes a recurring task.
- Completing it will **spawn the next occurrence** (optionally after confirmation).
- Hidden mode keeps your pages tidy with pills; Child mode keeps everything explicit.
- Most actions (skip, snooze, edit) display an **Undo** toast.

---

## 🧰 Example Workflow

1. Create a task:

   ```markdown
   {{[[TODO]]}} Send weekly update repeat:: every Friday due:: [[2025-11-07]]
   ```

2. Mark it done — the extension automatically creates the next task for `[[2025-11-14]]`.

3. If you snooze or skip, the due date updates and pills reflect the change immediately.

---

Enjoy effortless recurring task management directly inside Roam Research!
