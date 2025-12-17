# 🌀 Better Tasks — Canonical Roadmap (Dec 2025)

## 🎯 Executive Summary

Better Tasks is now **feature-complete for a v1+ product**.

Completed highlights:
- GTD attribute model
- Today widget
- AI task parsing (Phase 8.1)
- Project support enhancements
- Sidebar badge

Remaining work focuses on **UX polish, performance hardening, and advanced/power-user features**.

---

## ✅ Phases 1–3 — Core Engine & Foundations (Completed)

### Phase 1 — Core Engine
- TODO parsing (repeat / start / defer / due)
- Recurrence engine
- Next-task spawning
- Inline pills, hovercards, date pickers
- User-configurable attribute names

### Phase 2 — Stability, Correctness & Performance
- Canonical task storage
- Recurrence refactor
- Optimised observers & caches
- Settings: first-day-of-week, destination, DNP heading

### Phase 3 — UI/UX Foundations
- Inline pill parity
- Slash commands & Better Tasks menu
- Improved click behaviours
- Spawn confirmation
- GTD pill slots

---

## ✅ Phase 4 — Dashboard & UI Enhancements

### 4.1 Dashboard Core — Completed
- React dashboard
- Filters, grouping, snooze & complete
- Draggable & position-persisted
- Attribute quick-edit
- Live sync with inline pills

### 4.2 Performance & Watches — Completed
- Today widget + dashboard caching
- Minimum re-render interval
- Watch cleanup on dashboard close
- Pill stability (signature cache, throttles)

### 4.3 Attribute Expansion — Completed
- Waiting-for
- Project
- Context
- Priority
- Energy

### 4.4 Theme & Polish — In Progress
- Priority styling across themes
- Adaptive theme refinement

### 4.5 Dashboard UX — Partially Complete
- Project search list (from BT_attrProject values) — Completed
- Saved views / named perspectives — Planned
- Quick switching between perspectives — Planned

---

## ✅ Phase 5 — Cleanup & Reliability (Completed)

- Remove unused code
- Improve internal type discipline
- Internal refactors and cleanup

---

## ✅ Phase 6 — GTD Attribute Model (Completed)

- Next Action
- Waiting-For (person/external factor)
- Delegated
- Deferred
- Someday / Maybe
- Dashboard & inline parity

---

## 🔜 Phase 6.5 — GTD Review UX (Planned)

- Guided Weekly Review flow
- GTD dashboard modes / presets:
  - Projects Review
  - Waiting-For Review
  - Stalled Projects
  - Someday Refresh
  - Full Weekly Review (unguided)

---

## ✅ Phase 7 — Today Widget (Completed)

- Panel + Roam-inline widgets
- Unified “today” logic
- Tasks starting today / deferred to today / due today
- Optional overdue inclusion
- Snooze parity
- Cached, throttled, synced
- Integrated with sidebar badge

---

## ✅ Phase 8 — AI Enhancements

### 8.1 Task Parsing — Completed
- User-supplied OpenAI API key
- Strict JSON → attribute mapping

### 8.2 AI Planning & Capture — Planned
- Help Me Plan
- Clipboard event parsing
- Bulk natural-language capture

---

## ✅ Phase 9 — Project & Sidebar Enhancements (Completed)

### Project Support
- Project attribute support
- Dashboard & inline pills
- Searchable project picker
- Project names derived from BT_attrProject usage

### Sidebar Badge
- Theme-aware badge
- Today-only or Today + Overdue modes

---

## 🌍 Phase 10 — Internationalisation

### 10.1 Core Framework — Completed
- All strings abstracted

### 10.2 Initial Languages — Completed
- English
- Chinese (Simplified)
- Chinese (Traditional)

### 10.3 Launch Polish — In Progress
- Locale beta testing
- Language-switch UX polish

### 10.4 Future Enhancements — Planned
- Faster hot-switching
- Locale-aware dates & weekdays

---

## 🔮 Phase 11 — Advanced & Power-User Features (Planned)

- Task dependencies (blocked-by / blocks)
- Blocked/available visual treatment
- Optional hide-blocked filter
- Task history & series history
- AI-assisted weekly review
- Kanban view
- Timeline view
- Inbox capture
- Week-ahead mode
- Stats & analytics
- Shared-graph-safe features
- Optional Roam Local Launcher integration

---

## 🧭 Near-Term Focus

1. Dashboard UX polish (saved views, fast switching)
2. GTD Weekly Review UX
3. i18n launch polish
4. Dependencies (MVP)
