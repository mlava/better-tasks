# Better Tasks — Roadmap (Updated Dec 2025)

## Near-Term Focus (Ranked)
1. **Phase 7 — GTD Layer (Remaining Work)**
   - Weekly Review flow (guided dashboard mode + command)
   - GTD dashboard modes / presets

2. **Phase 4.5 — Dashboard UX**
   - Project/Waiting/Context pickers (Completed)
   - Saved views / named perspectives
   - Quick switching between perspectives

3. **Phase 10 — i18n Launch**
   - Stabilise en/zh/zh-Hant
   - Settings-language hot-switch polish
   - Locale-aware date & weekday formatting

4. **Phase 11 — Dependencies (MVP)**
   - Blocked-by attribute
   - Blocked/available visual treatment
   - Optional hide-blocked filter

---

# Phase 1 — Core Engine (Completed)
- TODO parsing (repeat/start/defer/due)
- Recurrence engine
- Next-task spawning
- Inline pills, hovercards, date pickers
- Configurable attribute names

# Phase 2 — Stability, Correctness, Performance (Completed)
- Canonical storage
- Recurrence refactor
- Optimised observers & caches
- Settings: FDOW, destination, DNP heading

# Phase 3 — UI/UX Foundations (Completed)
- Inline pill parity
- Slash commands & BT menu
- Improved click behaviours
- Spawn confirmation
- GTD pill slots

---

# Phase 4 — Dashboard & UI Enhancements

## 4.1 Dashboard Core (Completed)
- React dashboard
- Filters, grouping, snooze, complete
- Draggable/persisted position
- Attribute quick-edit
- Live sync

## 4.2 Performance & Watches (Completed)
- Today widget + dashboard caching
- 1.2s minimum rerender interval
- Watch cleanup on dashboard close
- Pill stability (signature cache, throttles)

## 4.3 Attribute Expansion (Completed)
- Waiting-for
- Project
- Context
- Priority
- Energy

## 4.4 Theme & Polish (In Progress)
- Priority styling across themes
- Theme refinement

## 4.5 Dashboard UX (Planned)
- Project search list (existing Roam pages)
- Saved views
- Quick switching

---

# Phase 5 — Cleanup & Reliability (Completed)
- Remove unused code
- Improve type discipline

---

# Phase 6 — AI Enhancements

## 6.1 Task Parsing (Completed)
- OpenAI key support
- Strict JSON parser

## 6.2 Parsing Phase 2 (Planned)
- Help Me Plan
- Clipboard Events

---

# Phase 7 — GTD Layer (Mostly Completed)
- Completed: Next / Delegated / Deferred / Someday attributes & filters
- Remaining: Weekly Review flow, GTD dashboard modes

---

# Phase 8 — Today Widget (Completed)
- Panel + Roam-inline widgets
- Unified "today" logic
- Snooze parity
- Cached, throttled, synced
- In beta

---

# Phase 9 — Sidebar Badge (Completed)
- Theme-aware badge
- Today-only or today+overdue modes
- Shares logic with Today widget

---

# Phase 10 — Internationalisation

## 10.1 Core Framework (Completed)
- All strings abstracted

## 10.2 Initial Languages (Completed)
- English
- Chinese (Simplified)
- Chinese (Traditional)

## 10.3 Launch Strategy (In Progress)
- Closed beta for zh locales
- Settings toggle improvements

## 10.4 Future Enhancements (Planned)
- Faster hot-switching
- Locale-aware dates

---

# Phase 11 — Future Enhancements (Planned)
- Dependencies (blocked-by)
- Task history
- AI weekly review
- Kanban view
- Timeline view
- Inbox capture
- Week-ahead mode
- Shared-graph-safe features
