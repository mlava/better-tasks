import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import iziToast from "izitoast";
import { useVirtualizer, measureElement } from "@tanstack/react-virtual";
import { i18n as I18N_MAP } from "../i18n";
import {
  createView,
  updateView,
  renameView,
  deleteView,
  setActiveView,
  setLastDefaultState,
  DASHBOARD_PRESET_IDS,
  DASHBOARD_REVIEW_PRESET_IDS,
  DASHBOARD_DAILY_REVIEW_PRESET_IDS,
  DASHBOARD_MONTHLY_REVIEW_PRESET_IDS,
  DASHBOARD_PROJECT_SWEEP_PRESET_IDS,
} from "./viewsStore";

/* ── Keyboard navigation helpers ─────────────────────────────────── */

const DEFAULT_KEYBINDINGS = {
  moveDown: "j",
  moveUp: "k",
  open: "Enter",
  complete: "c",
  snooze: "s",
  focusSearch: "/",
  toggleSelect: "x",
  selectAll: "shift+a",
  snooze7: "shift+s",
  expandSubtasks: "e",
  openMenu: ".",
  fullPage: "f",
  refresh: "r",
  analytics: "shift+g",
  help: "shift+?",
  escape: "Escape",
};

function isTypingInInput() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest?.(".rm-block-input")) return true;
  return false;
}

function normalizeKey(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.metaKey) parts.push("meta");
  if (event.shiftKey) parts.push("shift");
  parts.push(event.key.toLowerCase());
  return parts.join("+");
}

function matchesBinding(normalizedKey, binding) {
  if (!binding) return false;
  return normalizedKey === binding.toLowerCase();
}

function findNextNavigable(rows, currentIndex, direction) {
  const start = (currentIndex ?? (direction > 0 ? -1 : rows.length)) + direction;
  for (let i = start; i >= 0 && i < rows.length; i += direction) {
    if (rows[i].type === "task" || rows[i].type === "subtask") return i;
  }
  return null;
}

function findNavigableByUid(rows, uid) {
  if (!uid) return null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].task?.uid === uid) return i;
  }
  return null;
}

function KeyboardHelpOverlay({ keybindings, onClose }) {
  const entries = [
    [keybindings.moveDown, "Move down"],
    [keybindings.moveUp, "Move up"],
    [keybindings.open, "Open task"],
    [keybindings.complete, "Complete / undo"],
    [keybindings.snooze, "Snooze +1d"],
    [keybindings.snooze7, "Snooze +7d"],
    [keybindings.expandSubtasks, "Expand / collapse subtasks"],
    [keybindings.openMenu, "Open task menu"],
    [keybindings.toggleSelect, "Toggle selection"],
    [keybindings.selectAll, "Select all visible"],
    [keybindings.focusSearch, "Focus search"],
    [keybindings.fullPage, "Toggle full page"],
    [keybindings.refresh, "Refresh"],
    [keybindings.analytics, "Graph analytics"],
    [keybindings.help, "Show / hide this help"],
    [keybindings.escape, "Close / clear"],
  ];
  return createPortal(
    <div className="bt-kb-help-overlay" onClick={onClose}>
      <div className="bt-kb-help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bt-kb-help-title">Keyboard Shortcuts</div>
        <div className="bt-kb-help-grid">
          {entries.map(([key, desc]) => (
            <React.Fragment key={key}>
              <kbd className="bt-kb-help-key">{key}</kbd>
              <span className="bt-kb-help-desc">{desc}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="bt-kb-help-footer">
          Press <kbd>Esc</kbd> or <kbd>?</kbd> to close
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── End keyboard navigation helpers ─────────────────────────────── */

function resolvePath(obj, parts = []) {
  return parts.reduce(
    (acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined),
    obj
  );
}

function tPath(path, lang = "en") {
  const parts = Array.isArray(path) ? path : String(path || "").split(".");
  const primary = resolvePath(I18N_MAP?.[lang], parts);
  if (primary !== undefined) return primary;
  if (lang !== "en") {
    const fallback = resolvePath(I18N_MAP?.en, parts);
    if (fallback !== undefined) return fallback;
  }
  return undefined;
}
function formatPriorityEnergyDisplay(value) {
  if (!value || typeof value !== "string") return "";
  const v = value.trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high") {
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  return value;
}

const GTD_STATUS_ORDER = ["next action", "delegated", "deferred", "someday"];

function formatGtdStatusDisplay(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cycleGtdStatus(current) {
  const normalized = current ? String(current).trim().toLowerCase() : null;
  const order = [...GTD_STATUS_ORDER, null];
  const idx = order.indexOf(normalized ?? null);
  return order[(idx + 1) % order.length];
}

const TITLE_TOKEN_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\[\[([^\]]+)\]\]/g;

function resolvePageUid(title) {
  try {
    const result = window.roamAlphaAPI?.data?.pull?.(
      "[:block/uid]", [":node/title", title]
    );
    return result?.[":block/uid"] || null;
  } catch { return null; }
}

function renderTitleWithLinks(title, controller) {
  if (!title) return title;
  const parts = [];
  let lastIndex = 0;
  let match;
  TITLE_TOKEN_RE.lastIndex = 0;
  while ((match = TITLE_TOKEN_RE.exec(title)) !== null) {
    if (match.index > lastIndex) {
      parts.push(title.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Markdown link: [text](url)
      parts.push(
        <a
          key={`ml-${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      // Page ref: [[page name]]
      const pageName = match[3];
      const pageUid = resolvePageUid(pageName);
      if (pageUid && controller?.openPage) {
        parts.push(
          <button
            key={`pr-${match.index}`}
            type="button"
            className="bt-task-row__page-ref"
            onClick={(e) => { e.stopPropagation(); controller.openPage(pageUid, { inSidebar: e.shiftKey }); }}
            title="Open page (Shift+Click \u2192 sidebar)"
          >
            {pageName}
          </button>
        );
      } else {
        parts.push(<span key={`pr-${match.index}`} className="bt-task-row__page-ref--plain">{pageName}</span>);
      }
    }
    lastIndex = TITLE_TOKEN_RE.lastIndex;
  }
  if (parts.length === 0) return title;
  if (lastIndex < title.length) {
    parts.push(title.slice(lastIndex));
  }
  return parts;
}

const DEFAULT_FILTERS = {
  Recurrence: [],
  Start: [],
  Defer: [],
  Due: [],
  Completion: ["open"],
  completedRange: "any",
  upcomingRange: "any",
  Priority: [],
  Energy: [],
  GTD: [],
  Blocked: [],
  Stalled: [],
  projectText: "",
  waitingText: "",
  contextText: "",
};

function normalizeFiltersForCompare(filters) {
  const base = { ...DEFAULT_FILTERS, ...(filters && typeof filters === "object" ? filters : {}) };
  const keys = Object.keys(base);
  keys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const out = {};
  for (const key of keys) {
    const value = base[key];
    if (Array.isArray(value)) {
      out[key] = value
        .slice()
        .filter((v) => v != null)
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
    } else if (typeof value === "string") {
      out[key] = value;
    } else if (value == null) {
      out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch (_) {
        out[key] = value;
      }
    }
  }
  return out;
}

function normalizeDashViewStateForCompare(state) {
  const filters = normalizeFiltersForCompare(state?.filters);
  const grouping = typeof state?.grouping === "string" ? state.grouping : "time";
  const query = typeof state?.query === "string" ? state.query.trim() : "";
  return { filters, grouping, query };
}

const FILTER_STORAGE_KEY = "betterTasks.dashboard.filters";
const FILTER_STORAGE_VERSION = 1;

function migrateStoredFilters(payload) {
  if (!payload || typeof payload !== "object") return null;
  const version = typeof payload.v === "number" ? payload.v : null;
  if (version == null) return payload;
  if (version === FILTER_STORAGE_VERSION) return payload.filters;
  switch (version) {
    default:
      return null;
  }
}

function loadSavedFilters(defaults) {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    const next = migrateStoredFilters(parsed);
    if (!next || typeof next !== "object") return { ...defaults };
    return { ...defaults, ...next };
  } catch (err) {
    console.warn("[BetterTasks] failed to load dashboard filters", err);
    return { ...defaults };
  }
}

function saveFilters(filters) {
  if (typeof window === "undefined") return;
  try {
    const payload = { v: FILTER_STORAGE_VERSION, filters: filters || {} };
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[BetterTasks] failed to save dashboard filters", err);
  }
}

const FILTER_SECTIONS_LEFT = ["Recurrence", "Start", "Defer"];
const FILTER_SECTIONS_RIGHT = ["Completion", "Priority", "Energy"];

const GROUP_LABELS = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No Due Date",
  recurring: "Recurring",
  "one-off": "One-off",
  completed: "Completed",
};

const GROUP_ORDER_TIME = ["overdue", "today", "upcoming", "none"];
const GROUP_ORDER_RECURRENCE = ["recurring", "one-off"];

const INITIAL_SNAPSHOT = {
  tasks: [],
  status: "idle",
  error: null,
  lastUpdated: null,
};

function applyToastA11y(toastEl) {
  if (!toastEl) return;
  toastEl.setAttribute("role", "alert");
  toastEl.setAttribute("aria-live", "polite");
  toastEl.setAttribute("aria-atomic", "true");
}

function filtersReducer(state, action) {
  switch (action.type) {
    case "toggle": {
      const current = new Set(state[action.section] || []);
      if (current.has(action.value)) {
        current.delete(action.value);
      } else {
        current.add(action.value);
      }
      return { ...state, [action.section]: Array.from(current) };
    }
    case "toggleSingle": {
      const current = new Set(state[action.section] || []);
      const isActive = current.has(action.value);
      return { ...state, [action.section]: isActive ? [] : [action.value] };
    }
    case "setText":
      return { ...state, [action.section]: action.value || "" };
    case "reset":
      return { ...DEFAULT_FILTERS };
    case "hydrate": {
      const incoming = action.value && typeof action.value === "object" ? action.value : {};
      return { ...DEFAULT_FILTERS, ...incoming };
    }
    default:
      return state;
  }
}

function useControllerSnapshot(controller) {
  const [snapshot, setSnapshot] = useState(() =>
    controller?.getSnapshot ? controller.getSnapshot() : INITIAL_SNAPSHOT
  );
  useEffect(() => {
    if (!controller) return undefined;
    const unsub = controller.subscribe((next) => setSnapshot({ ...next, tasks: [...next.tasks] }));
    controller.ensureInitialLoad?.();
    return unsub;
  }, [controller]);
  return snapshot;
}

function applyFilters(tasks, filters, query) {
  const queryText = query.trim().toLowerCase();
  const recurrenceFilter = new Set(filters.Recurrence || filters.recurrence || []);
  const startFilter = new Set(filters.Start || filters.start || []);
  const deferFilter = new Set(filters.Defer || filters.defer || []);
  const dueFilter = new Set(filters.Due || filters.due || []);
  const dueArr = Array.from(dueFilter);
  const dueIncludesUpcoming = dueArr.includes("upcoming");
  const completionFilter = new Set(filters.Completion || filters.completion || []);
  const completionArr = Array.from(completionFilter);
  const completedOnly = completionArr.length === 1 && completionArr[0] === "completed";
  const priorityFilter = new Set(filters.Priority || filters.priority || []);
  const energyFilter = new Set(filters.Energy || filters.energy || []);
  const gtdFilter = new Set(filters.GTD || filters.gtd || []);
  const completedRange = typeof filters.completedRange === "string" ? filters.completedRange : "any";
  const upcomingRange = typeof filters.upcomingRange === "string" ? filters.upcomingRange : "any";
  const projectText = (filters.projectText || "").trim();
  const waitingText = (filters.waitingText || "").trim().toLowerCase();
  const contextText = (filters.contextText || "").trim().toLowerCase();

  const isWithinCompletedRange = (date, range) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (range === "any") return true;
    const now = new Date();
    const startOfToday = new Date(now.getTime());
    startOfToday.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const days =
      range === "1d" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
    if (!days) return true;
    const threshold = new Date(startOfToday.getTime() - (days - 1) * dayMs);
    return date >= threshold;
  };
  const isWithinUpcomingRange = (date, range) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (range === "any") return true;
    const now = new Date();
    const startOfToday = new Date(now.getTime());
    startOfToday.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const days =
      range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
    if (!days) return true;
    if (date < startOfToday) return false;
    const end = new Date(startOfToday.getTime() + days * dayMs - 1);
    return date <= end;
  };

  return tasks.filter((task) => {
    if (completionFilter.size) {
      const value = task.isCompleted ? "completed" : "open";
      if (!completionFilter.has(value)) return false;
    }
    if (completedOnly && completedRange !== "any" && task.isCompleted) {
      if (!isWithinCompletedRange(task.completedAt, completedRange)) return false;
    }
    if (recurrenceFilter.size && !recurrenceFilter.has(task.recurrenceBucket)) return false;
    if (startFilter.size && !startFilter.has(task.startBucket)) return false;
    if (deferFilter.size && !deferFilter.has(task.deferBucket)) return false;
    if (dueFilter.size && !dueFilter.has(task.dueBucket)) return false;
    if (dueIncludesUpcoming && upcomingRange !== "any" && task.dueBucket === "upcoming") {
      if (!isWithinUpcomingRange(task.dueAt, upcomingRange)) return false;
    }
    const meta = task.metadata || {};
    if (priorityFilter.size && !priorityFilter.has(meta.priority || "")) return false;
    if (energyFilter.size && !energyFilter.has(meta.energy || "")) return false;
    const gtdValue = (meta.gtd || "").toLowerCase();
    if (gtdFilter.size && !gtdFilter.has(gtdValue)) return false;
    const blockedFilter = new Set(filters.Blocked || filters.blocked || []);
    if (blockedFilter.size) {
      const value = task.isBlocked ? "blocked" : "actionable";
      if (!blockedFilter.has(value)) return false;
    }
    const stalledFilter = new Set(filters.Stalled || []);
    if (stalledFilter.size) {
      const stalledDays = typeof filters.stalledDays === "number" ? filters.stalledDays : 14;
      const now = new Date();
      const startOfTodayStalled = new Date(now.getTime());
      startOfTodayStalled.setHours(0, 0, 0, 0);
      const stalledThreshold = startOfTodayStalled.getTime() - stalledDays * 24 * 60 * 60 * 1000;
      const hasEditTime = typeof task.editedAt === "number" && task.editedAt > 0;
      const isStalled = !task.isCompleted &&
        (!hasEditTime || task.editedAt < stalledThreshold);
      if (stalledFilter.has("stalled") && !isStalled) return false;
      if (stalledFilter.has("active") && isStalled) return false;
    }
    if (projectText) {
      const hay = (meta.project || "").trim();
      if (hay.toLowerCase() !== projectText.toLowerCase()) return false;
    }
    if (waitingText) {
      const hay = (meta.waitingFor || "").toLowerCase();
      if (!hay.includes(waitingText)) return false;
    }
    if (contextText) {
      const ctxs = Array.isArray(meta.context) ? meta.context : [];
      const matches = ctxs.some((c) => typeof c === "string" && c.toLowerCase().includes(contextText));
      if (!matches) return false;
    }
    if (queryText) {
      const haystack = `${task.title} ${task.pageTitle || ""} ${task.text}`.toLowerCase();
      if (!haystack.includes(queryText)) return false;
    }
    return true;
  });
}

function groupTasks(tasks, grouping, options = {}) {
  const completionFilter = options.completion || [];
  const completedOnly = completionFilter.length === 1 && completionFilter[0] === "completed";
  const completedTasks = completedOnly ? tasks.filter((task) => task.isCompleted) : [];
  const workingTasks = completedOnly ? tasks.filter((task) => !task.isCompleted) : tasks;
  const labels = options.groupLabels || GROUP_LABELS;
  const groups = [];
  if (grouping === "project") {
    const buckets = new Map();
    for (const task of workingTasks) {
      const project = (task?.metadata?.project || "").trim();
      const key = project || "__none__";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(task);
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
    });
    for (const key of keys) {
      const items = buckets.get(key) || [];
      const title = key === "__none__" ? labels.noProject || "No Project" : key;
      if (items.length) groups.push({ id: `project-${key}`, title, items });
    }
    if (completedTasks.length) {
      groups.unshift({ id: "completed", title: labels["completed"] || "Completed", items: completedTasks });
    }
    return groups;
  }
  if (grouping === "recurrence") {
    for (const key of GROUP_ORDER_RECURRENCE) {
      const items = workingTasks.filter((task) => task.recurrenceBucket === key);
      if (items.length) {
        groups.push({ id: key, title: labels[key] || GROUP_LABELS[key], items });
      }
    }
    if (completedTasks.length) {
      groups.unshift({ id: "completed", title: labels["completed"] || "Completed", items: completedTasks });
    }
    return groups;
  }
  for (const key of GROUP_ORDER_TIME) {
    const items = workingTasks.filter((task) => task.dueBucket === key);
    if (items.length) {
      groups.push({ id: key, title: labels[key] || GROUP_LABELS[key], items });
    }
  }
  if (completedTasks.length) {
    groups.unshift({ id: "completed", title: labels["completed"] || "Completed", items: completedTasks });
  }
  return groups;
}

function useVirtualRows(groups, expandedMap, expandedParentMap, filteredTaskIndex) {
  return useMemo(() => {
    const rows = [];
    for (const group of groups) {
      rows.push({ type: "group", key: `group-${group.id}`, groupId: group.id, group });
      if (expandedMap[group.id] !== false) {
        for (const task of group.items) {
          // Skip subtasks whose parent IS in the filtered view (they nest under parent)
          if (task.isSubtask && task.parentTaskUid && filteredTaskIndex.has(task.parentTaskUid)) continue;

          rows.push({ type: "task", key: `task-${task.uid}`, groupId: group.id, task });

          // If expanded parent, inject subtask rows
          if (task.subtaskUids?.length && expandedParentMap[task.uid]) {
            for (const subUid of task.subtaskUids) {
              const subTask = filteredTaskIndex.get(subUid);
              if (subTask) {
                rows.push({
                  type: "subtask",
                  key: `subtask-${subUid}`,
                  groupId: group.id,
                  task: subTask,
                  parentUid: task.uid,
                });
              }
            }
          }
        }
      }
    }
    return rows;
  }, [groups, expandedMap, expandedParentMap, filteredTaskIndex]);
}

function Pill({ icon, label, value, muted, onClick }) {
  if (!value) return null;
  return (
    <button
      type="button"
      className={`bt-pill${muted ? " bt-pill--muted" : ""}`}
      title={label || undefined}
      onClick={onClick}
    >
      {icon ? (
        <span className="bt-pill__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="bt-pill__value">{value}</span>
    </button>
  );
}

function FilterChips({ sectionKey, label, chips, activeValues, onToggle, singleChoice = false }) {
  const chipList = Array.isArray(chips) ? chips : [];
  const active = Array.isArray(activeValues) ? activeValues : [];
  return (
    <div className="bt-filter-row">
      <span className="bt-filter-row__label">{label}</span>
      <div className="bt-filter-row__chips">
        {chipList.map((chip) => {
          const isActive = active.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              className={`bt-chip${isActive ? " bt-chip--active" : ""}`}
              onClick={() => onToggle(sectionKey, chip.value, singleChoice)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GroupHeader({
  title,
  count,
  isExpanded,
  onToggle,
  selectionActive,
  selectionState,
  onToggleSelection,
  strings,
}) {
  const checkboxIcon = selectionState === "all" ? "☑" : selectionState === "partial" ? "◪" : "☐";
  const ariaChecked = selectionState === "partial" ? "mixed" : selectionState === "all";
  const selectionLabel = selectionState === "all"
    ? (strings?.bulk?.deselectGroup ? strings.bulk.deselectGroup(title) : `Deselect all in ${title}`)
    : (strings?.bulk?.selectGroup ? strings.bulk.selectGroup(title) : `Select all in ${title}`);
  return (
    <div className="bt-group-header">
      <button
        type="button"
        className="bt-group-header__toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className="bt-group-header__title">
          <span className="bt-group-header__caret" aria-hidden="true">
            {isExpanded ? "▾" : "▸"}
          </span>
          {title}
        </span>
      </button>
      <div className="bt-group-header__actions">
        {selectionActive ? (
          <button
            type="button"
            className="bt-group-header__select"
            onClick={onToggleSelection}
            role="checkbox"
            aria-checked={ariaChecked}
            aria-label={selectionLabel}
            title={selectionLabel}
          >
            {checkboxIcon}
          </button>
        ) : null}
        <span className="bt-group-header__count">{count}</span>
      </div>
    </div>
  );
}

function TaskActionsMenu({ task, controller, onOpenChange, strings, forceOpen, onForceOpenHandled }) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const menuSizeRef = useRef({ width: 240, height: 200 });
  const metadata = task.metadata || {};
  const handleEditText = async (key, currentValue) => {
    if (key === "project") {
      await controller?.refreshProjectOptions?.();
      const selection = controller?.promptProject
        ? await controller.promptProject({ initialValue: currentValue || "" })
        : currentValue || "";
      if (selection == null) return;
      controller.updateMetadata?.(task.uid, { project: selection || null });
      return;
    }
    if (key === "waitingFor") {
      await controller?.refreshWaitingOptions?.();
      const selection = controller?.promptWaiting
        ? await controller.promptWaiting({ initialValue: currentValue || "" })
        : currentValue || "";
      if (selection == null) return;
      controller.updateMetadata?.(task.uid, { waitingFor: selection || null });
      return;
    }
    if (key === "context") {
      await controller?.refreshContextOptions?.();
      const selection = controller?.promptContext
        ? await controller.promptContext({ initialValue: currentValue || [] })
        : [];
      if (selection == null) return;
      const contexts = Array.isArray(selection) ? selection : [];
      controller.updateMetadata?.(task.uid, { context: contexts });
      return;
    }
    const label = key;
    const next = controller.promptValue
      ? await controller.promptValue({
        title: "Better Tasks",
        message: `Set ${label}`,
        placeholder: label,
        initial: currentValue || "",
      })
      : null;
    if (next == null) return;
    const trimmed = String(next).trim();
    controller.updateMetadata?.(task.uid, { [key]: trimmed || null });
  };
  const cycleValue = (key) => {
    const order = [null, "low", "medium", "high"];
    const current = metadata[key] || null;
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    controller.updateMetadata?.(task.uid, { [key]: next });
  };
  const cycleGtd = () => {
    const next = cycleGtdStatus(metadata.gtd || null);
    controller.updateMetadata?.(task.uid, { gtd: next });
  };

  const setOpenState = useCallback((next) => {
    setOpen((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    return () => {
      onOpenChange?.(false);
    };
  }, [onOpenChange]);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spacing = 8;
    const { width = 240, height = 200 } = menuSizeRef.current || {};
    let openAbove = rect.top - spacing - height >= spacing;
    if (!openAbove && rect.bottom + spacing + height <= viewportHeight - spacing) {
      openAbove = false;
    } else if (!openAbove) {
      openAbove = rect.top > viewportHeight / 2;
    }
    let top = openAbove ? rect.top - height - spacing : rect.bottom + spacing;
    if (top < spacing) top = spacing;
    if (top + height + spacing > viewportHeight) {
      top = Math.max(spacing, viewportHeight - height - spacing);
    }
    let left = rect.right - width;
    if (left < spacing) left = spacing;
    if (left + width + spacing > viewportWidth) {
      left = Math.max(spacing, viewportWidth - width - spacing);
    }
    setCoords({ top, left });
  }, []);

  const actions = useMemo(() => {
    if (!task || !controller) return [];
    const list = [];
    const tm = strings?.taskMenu || {};
    const metaLabels = strings?.metaLabels || {};
    const filterDefs = strings?.filterDefs || {};
    const labelFor = (key) => metaLabels[key] || key;
    const valueLabel = (type, value) => {
      if (!value) return "";
      if (type === "priority") {
        const match = (filterDefs.Priority || []).find((f) => f.value === value);
        return match?.label || formatPriorityEnergyDisplay(value);
      }
      if (type === "energy") {
        const match = (filterDefs.Energy || []).find((f) => f.value === value);
        return match?.label || formatPriorityEnergyDisplay(value);
      }
      if (type === "gtd") {
        const match = (filterDefs.GTD || []).find((f) => f.value === value);
        return match?.label || formatGtdStatusDisplay(value);
      }
      return value;
    };
    const labels = {
      repeat: labelFor("repeat") || "repeat",
      start: labelFor("start") || "start date",
      defer: labelFor("defer") || "defer date",
      due: labelFor("due") || "due date",
    };
    const hasRepeat = !!task.repeatText;
    const hasStart = task.startAt instanceof Date;
    const hasDefer = task.deferUntil instanceof Date;
    const hasDue = task.dueAt instanceof Date;

    const pushDateActions = (type, hasValue) => {
      if (hasValue) {
        list.push({
          key: `edit-${type}`,
          label: `${tm[`edit${type[0].toUpperCase()}${type.slice(1)}`] || `Edit ${labels[type]}`}`,
          handler: () =>
            controller.editDate(task.uid, type, { intent: "menu-edit" }),
        });
        list.push({
          key: `remove-${type}`,
          label: `${tm[`remove${type[0].toUpperCase()}${type.slice(1)}`] || `Remove ${labels[type]}`}`,
          handler: () => controller.removeTaskAttribute(task.uid, type),
          danger: true,
        });
      } else {
        list.push({
          key: `add-${type}`,
          label: `${tm[`add${type[0].toUpperCase()}${type.slice(1)}`] || `Add ${labels[type]}`}`,
          handler: () =>
            controller.editDate(task.uid, type, { intent: "menu-add" }),
        });
      }
    };

    if (hasRepeat) {
      list.push({
        key: "edit-repeat",
        label: tm.editRepeat || "Edit repeat",
        handler: () => controller.editRepeat(task.uid),
      });
      list.push({
        key: "remove-repeat",
        label: tm.removeRepeat || "Remove repeat",
        handler: () => controller.removeTaskAttribute(task.uid, "repeat"),
        danger: true,
      });
    } else {
      list.push({
        key: "add-repeat",
        label: tm.addRepeat || "Add repeat",
        handler: () => controller.editRepeat(task.uid),
      });
    }

    // View recurring series — only for recurring tasks with series linking
    if (task.isRecurring && (task.rtId || task.rtParent)) {
      list.push({
        key: "view-series",
        label: tm.viewSeries || "View series",
        handler: () => {
          setOpenState(false);
          controller._onSeriesViewRequest?.(task);
        },
      });
    }

    pushDateActions("start", hasStart);
    pushDateActions("defer", hasDefer);
    pushDateActions("due", hasDue);

    const meta = task.metadata || {};
    list.push({ key: "meta-separator", label: tm.metaHeading || "Metadata", separator: true });
    list.push({
      key: "meta-gtd",
      label: `${labelFor("gtd")}: ${meta.gtd ? valueLabel("gtd", meta.gtd) : ""} (${tm.cycleGtd || "Click to cycle"})`,
      handler: () => cycleGtd(),
    });

    if (meta.project) {
      list.push({
        key: "meta-project-edit",
        label: `${tm.editProject || "Edit project"} (${meta.project})`,
        handler: () => handleEditText("project", meta.project),
      });
      list.push({
        key: "meta-project-remove",
        label: tm.removeProject || "Remove project",
        handler: () => controller.updateMetadata?.(task.uid, { project: null }),
        danger: true,
      });
    } else {
      list.push({
        key: "meta-project-add",
        label: tm.setProject || "Set project",
        handler: () => handleEditText("project", meta.project),
      });
    }

    if (meta.context && meta.context.length) {
      list.push({
        key: "meta-context-edit",
        label: `${tm.editContext || "Edit context"} (${meta.context.join(", ")})`,
        handler: () => handleEditText("context", (meta.context || []).join(", ")),
      });
      list.push({
        key: "meta-context-remove",
        label: tm.removeContext || "Remove context",
        handler: () => controller.updateMetadata?.(task.uid, { context: [] }),
        danger: true,
      });
    } else {
      list.push({
        key: "meta-context-add",
        label: tm.setContext || "Set context",
        handler: () => handleEditText("context", (meta.context || []).join(", ")),
      });
    }

    if (meta.waitingFor) {
      list.push({
        key: "meta-waiting-edit",
        label: `${tm.editWaiting || "Edit waiting-for"} (${meta.waitingFor})`,
        handler: () => handleEditText("waitingFor", meta.waitingFor),
      });
      list.push({
        key: "meta-waiting-remove",
        label: tm.removeWaiting || "Remove waiting-for",
        handler: () => controller.updateMetadata?.(task.uid, { waitingFor: null }),
        danger: true,
      });
    } else {
      list.push({
        key: "meta-waiting-add",
        label: tm.setWaiting || "Set waiting-for",
        handler: () => handleEditText("waitingFor", meta.waitingFor),
      });
    }
    list.push({
      key: "meta-priority",
      label: `${tm.priorityCycle || "Priority (click to cycle)"}${
        meta.priority ? `: ${valueLabel("priority", meta.priority)}` : ""
      }`,
      handler: () => cycleValue("priority"),
    });
    list.push({
      key: "meta-energy",
      label: `${tm.energyCycle || "Energy (click to cycle)"}${
        meta.energy ? `: ${valueLabel("energy", meta.energy)}` : ""
      }`,
      handler: () => cycleValue("energy"),
    });

    return list;
  }, [controller, task, handleEditText, strings]);

  const safeActions = Array.isArray(actions) ? actions : [];

  const menuRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    const root = document.createElement("div");
    root.className = "bt-task-menu-portal";
    root.setAttribute("data-bt-portal", "task-menu");
    root.style.position = "relative";
    root.style.zIndex = "1000";
    return root;
  }, []);

  useEffect(() => {
    if (!menuRoot || typeof document === "undefined") return undefined;
    if (!safeActions.length) return undefined;
    const host = document.querySelector(".bt-dashboard-host") || document.body;
    host.appendChild(menuRoot);
    return () => {
      menuRoot.remove();
    };
  }, [menuRoot, safeActions.length]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const menuEl = menuRef.current;
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      menuSizeRef.current = { width: rect.width, height: rect.height };
      updatePosition();
    }
  }, [open, updatePosition, safeActions.length]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  // Respond to forceOpen from keyboard navigation
  useEffect(() => {
    if (forceOpen && !open) {
      setOpenState(true);
      setHighlightIndex(0);
      onForceOpenHandled?.();
    }
  }, [forceOpen]);

  // Reset highlight when menu closes
  useEffect(() => {
    if (!open) setHighlightIndex(-1);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const actionableItems = safeActions.filter((a) => !a.separator);
    const handleClick = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        buttonRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpenState(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenState(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        event.stopPropagation();
        setHighlightIndex((prev) => Math.min(prev + 1, actionableItems.length - 1));
        return;
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        event.stopPropagation();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const item = actionableItems[highlightIndex];
        if (item?.handler) {
          item.handler();
          setOpenState(false);
        }
        return;
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [open, highlightIndex, safeActions]);

  if (!safeActions.length) return null;

  const menu = open && menuRoot
    ? createPortal(
        <div
          className="bt-task-menu__popover"
          role="menu"
          ref={menuRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
          }}
        >
          {(() => {
            let actionIdx = 0;
            return safeActions.map((action) => {
              if (action.separator) {
                return (
                  <div key={action.key} className="bt-task-menu__separator">
                    {action.label}
                  </div>
                );
              }
              const idx = actionIdx++;
              const isHighlighted = idx === highlightIndex;
              return (
                <button
                  key={action.key}
                  type="button"
                  className={[
                    "bt-task-menu__item",
                    action.danger ? "bt-task-menu__item--danger" : "",
                    isHighlighted ? "bt-task-menu__item--highlight" : "",
                  ].filter(Boolean).join(" ")}
                  role="menuitem"
                  ref={isHighlighted ? (el) => el?.scrollIntoView?.({ block: "nearest" }) : undefined}
                  onClick={async () => {
                    if (typeof action.handler === "function") {
                      await action.handler();
                    }
                    setOpenState(false);
                  }}
                  onMouseEnter={() => setHighlightIndex(idx)}
                >
                  {action.label}
                </button>
              );
            });
          })()}
        </div>,
        menuRoot
      )
    : null;

  return (
    <div className={`bt-task-menu${open ? " bt-task-menu--open" : ""}`}>
      <button
        type="button"
        className="bt-task-menu__trigger"
        onClick={() => setOpenState((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={strings?.taskOptions || "Task options"}
        ref={buttonRef}
      >
        ⋯
      </button>
      {menu}
    </div>
  );
}

function SimpleActionsMenu({ actions, title, disabled = false }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const menuSizeRef = useRef({ width: 240, height: 200 });
  const safeActions = Array.isArray(actions) ? actions : [];

  const setOpenState = useCallback((next) => {
    setOpen((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spacing = 8;
    const { width = 240, height = 200 } = menuSizeRef.current || {};
    let openAbove = rect.top - spacing - height >= spacing;
    if (!openAbove && rect.bottom + spacing + height <= viewportHeight - spacing) {
      openAbove = false;
    } else if (!openAbove) {
      openAbove = rect.top > viewportHeight / 2;
    }
    let top = openAbove ? rect.top - height - spacing : rect.bottom + spacing;
    if (top < spacing) top = spacing;
    if (top + height + spacing > viewportHeight) {
      top = Math.max(spacing, viewportHeight - height - spacing);
    }
    let left = rect.right - width;
    if (left < spacing) left = spacing;
    if (left + width + spacing > viewportWidth) {
      left = Math.max(spacing, viewportWidth - width - spacing);
    }
    setCoords({ top, left });
  }, []);

  const menuRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    const root = document.createElement("div");
    root.className = "bt-task-menu-portal";
    root.setAttribute("data-bt-portal", "simple-menu");
    root.style.position = "relative";
    root.style.zIndex = "1000";
    return root;
  }, []);

  useEffect(() => {
    if (!menuRoot || typeof document === "undefined") return undefined;
    if (!safeActions.length) return undefined;
    const host = document.querySelector(".bt-dashboard-host") || document.body;
    host.appendChild(menuRoot);
    return () => {
      menuRoot.remove();
    };
  }, [menuRoot, safeActions.length]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const menuEl = menuRef.current;
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      menuSizeRef.current = { width: rect.width, height: rect.height };
      updatePosition();
    }
  }, [open, updatePosition, safeActions.length]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) {
        return;
      }
      setOpenState(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpenState(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, setOpenState]);

  if (!safeActions.length) return null;

  const menu =
    open && menuRoot
      ? createPortal(
          <div
            className="bt-task-menu__popover"
            role="menu"
            ref={menuRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
            }}
          >
            {safeActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={`bt-task-menu__item${
                  action.danger ? " bt-task-menu__item--danger" : ""
                }`}
                role="menuitem"
                onClick={async () => {
                  if (typeof action.handler === "function") {
                    await action.handler();
                  }
                  setOpenState(false);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          menuRoot
        )
      : null;

  return (
    <div className={`bt-task-menu${open ? " bt-task-menu--open" : ""}`}>
      <button
        type="button"
        className="bt-task-menu__trigger"
        onClick={() => {
          if (disabled) return;
          setOpenState((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title || undefined}
        ref={buttonRef}
        disabled={disabled}
      >
        ⋯
      </button>
      {menu}
    </div>
  );
}

function TaskRow({ task, controller, strings, selectionActive, isSelected, onToggleSelect, isSubtask, hasSubtasks, isExpanded, onToggleExpand, isFocused, menuOpenForUid, onMenuOpenHandled }) {
  const checkboxLabel = task.isCompleted
    ? strings?.markOpen || "Mark as open"
    : strings?.markDone || "Mark as done";
  const completedLabel = strings?.completedLabel || "Completed";
  const selectLabel = isSelected
    ? strings?.bulk?.deselectTask || "Deselect"
    : strings?.bulk?.selectTask || "Select";
  const metaDescriptionId = useMemo(
    () => `bt-task-meta-${task.uid}`,
    [task.uid]
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const handleMenuOpenChange = useCallback((value) => {
    setMenuOpen(value);
  }, []);
  const metadata = task.metadata || {};
  const contextBits = [];
  if (task.pageTitle) {
    contextBits.push({
      key: "page",
      type: "page",
      text: task.pageTitle,
      pageUid: task.pageUid,
    });
  }
  if (task.isCompleted) contextBits.push({ key: "completed", type: "text", text: completedLabel });
  else if (task.availabilityLabel) contextBits.push({ key: "availability", type: "text", text: task.availabilityLabel });
  const showSnooze = !task.isCompleted;
  const handlePillClick = (event, pill, taskRow, ctrl) => {
    const type = pill.type;
    if (type === "repeat") {
      ctrl.editRepeat(taskRow.uid, event);
    } else if (type === "start" || type === "defer" || type === "due") {
      ctrl.editDate(taskRow.uid, type, { event });
    } else if (type === "priority" || type === "energy") {
      ctrl.updateMetadata?.(taskRow.uid, { [type]: pill.nextValue });
    } else if (type === "gtd") {
      ctrl.updateMetadata?.(taskRow.uid, { gtd: pill.nextValue });
    } else if (type === "project") {
      ctrl.handleMetadataClick?.(taskRow.uid, "project", { value: pill.raw || pill.value }, event, ctrl);
    } else if (type === "waitingFor") {
      ctrl.handleMetadataClick?.(taskRow.uid, "waitingFor", { value: pill.raw || pill.value }, event, ctrl);
    } else if (type === "context") {
      ctrl.handleMetadataClick?.(
        taskRow.uid,
        "context",
        { value: pill.rawList?.[0] || pill.raw || pill.value, list: pill.rawList },
        event,
        ctrl
      );
    }
  };
  // When in selection mode, clicking checkbox toggles selection instead of completion
  const handleCheckboxClick = (event) => {
    if (selectionActive) {
      event.stopPropagation();
      onToggleSelect?.(task.uid, event);
    } else {
      controller.toggleTask(task.uid, task.isCompleted ? "undo" : "complete");
    }
  };
  const rowClasses = [
    "bt-task-row",
    menuOpen ? "bt-task-row--menu-open" : "",
    isSelected ? "bt-task-row--selected" : "",
    isFocused ? "bt-task-row--focused" : "",
    task.isBlocked ? "bt-task-row--blocked" : "",
    isSubtask ? "bt-task-row--subtask" : "",
  ].filter(Boolean).join(" ");
  // In selection mode: show selection state; otherwise show completion state
  const checkboxIcon = selectionActive
    ? (isSelected ? "☑" : "☐")
    : (task.isCompleted ? "☑" : "☐");
  const checkboxAriaLabel = selectionActive ? selectLabel : checkboxLabel;
  const checkboxAriaChecked = selectionActive ? isSelected : task.isCompleted;
  const checkboxClasses = selectionActive
    ? `bt-task-row__checkbox${isSelected ? " bt-task-row__checkbox--selected" : ""}`
    : `bt-task-row__checkbox${task.isCompleted ? " bt-task-row__checkbox--done" : ""}`;
  return (
    <div className={rowClasses}>
      <button
        className={checkboxClasses}
        onClick={handleCheckboxClick}
        title={checkboxAriaLabel}
        aria-label={checkboxAriaLabel}
        role="checkbox"
        aria-checked={checkboxAriaChecked}
      >
        {checkboxIcon}
      </button>
      <div className="bt-task-row__body">
        <div className="bt-task-row__title" aria-describedby={metaDescriptionId}>
          {hasSubtasks ? (
            <button
              className="bt-task-row__subtask-toggle"
              onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
              aria-expanded={!!isExpanded}
              aria-label={isExpanded ? (strings?.collapseSubtasks || "Collapse subtasks") : (strings?.expandSubtasks || "Expand subtasks")}
            >
              {isExpanded ? "\u25BE" : "\u25B8"}
            </button>
          ) : null}
          {task.isBlocked ? "🔒 " : ""}{renderTitleWithLinks(task.title, controller) || strings?.untitled || "(Untitled task)"}
        </div>
        <span id={metaDescriptionId} className="bt-sr-only">
          {contextBits.map((bit) => bit.text).filter(Boolean).join(", ")}
        </span>
          <div className="bt-task-row__meta">
            <div className="bt-task-row__meta-pills">
              {(task.metaPills || []).map((pill) => (
                <div key={`${task.uid}-${pill.type}`} className="bt-pill-wrap">
                  <Pill
                    icon={pill.icon}
                    label={pill.label}
                    value={pill.value}
                    muted={!pill.value}
                    onClick={(e) => handlePillClick(e, pill, task, controller)}
                  />
                </div>
              ))}
            </div>
          {!selectionActive && (
            <TaskActionsMenu task={task} controller={controller} onOpenChange={handleMenuOpenChange} strings={strings} forceOpen={menuOpenForUid === task.uid} onForceOpenHandled={onMenuOpenHandled} />
          )}
        </div>
        <div className="bt-task-row__context">
          {contextBits.map((bit, idx) => {
            const prefix = idx > 0 ? (
              <span key={`sep-${task.uid}-${idx}`} className="bt-task-row__context-sep">
                &middot;
              </span>
            ) : null;
            const key = `${task.uid}-${bit.key || idx}`;
            if (bit.type === "page" && bit.pageUid) {
              return (
                <React.Fragment key={key}>
                  {prefix}
                  <button
                    type="button"
                    className="bt-task-row__context-link"
                    onClick={(event) => controller.openPage(bit.pageUid, { inSidebar: event.shiftKey })}
                    title="Open page (Shift+Click → sidebar)"
                  >
                    [[{bit.text}]]
                  </button>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={key}>
                {prefix}
                <span>{bit.text}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {!selectionActive && (
        <div className="bt-task-row__actions">
          <button
            type="button"
            className="bp3-button bp3-small"
            onClick={() =>
              controller.openBlock(task.uid, { skipCompletionToast: task.isCompleted })
            }
          >
            {strings?.view || "View"}
          </button>
          {showSnooze ? (
            <div className="bt-task-row__snooze">
              <button
                type="button"
                className="bp3-button bp3-small"
                onClick={() => controller.snoozeTask(task.uid, 1)}
              >
                {strings?.snoozePlus1 || "+1d"}
              </button>
              <button
                type="button"
                className="bp3-button bp3-small"
                onClick={() => controller.snoozeTask(task.uid, 7)}
              >
                {strings?.snoozePlus7 || "+7d"}
              </button>
              <button
                type="button"
                className="bp3-button bp3-small"
                onClick={() => controller.snoozeTask(task.uid, "pick")}
              >
                {strings?.snoozePick || "Pick"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ========================= Analytics Panel =========================

function AnalyticsPanel({ controller, language, onClose }) {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);
  const lang = language || "en";
  const s = (key, fallback) => tPath(["analytics", key], lang) ?? fallback;

  // Week start from settings (e.g. "Monday", "Sunday")
  const weekStartName = controller?.getWeekStart?.() || "Monday";
  const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weekStartIdx = Math.max(0, ALL_DAYS.indexOf(weekStartName));
  const orderedDays = [...ALL_DAYS.slice(weekStartIdx), ...ALL_DAYS.slice(0, weekStartIdx)];
  const dayLabels = orderedDays.map((d) => d.charAt(0));
  // JS getDay(): 0=Sun, 1=Mon, ... 6=Sat → convert to our ordered index
  const JS_DAY_TO_ISO = [7, 1, 2, 3, 4, 5, 6]; // Sun=7, Mon=1, ..., Sat=6
  const weekStartISO = weekStartIdx + 1; // Monday=1 ... Sunday=7

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    controller?.computeAnalytics?.(period).then((result) => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, controller]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClick); };
  }, [onClose]);

  const portalRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.className = "bt-analytics-portal";
    el.setAttribute("data-bt-portal", "analytics");
    return el;
  }, []);

  useEffect(() => {
    if (!portalRoot) return undefined;
    const host = document.querySelector(".bt-dashboard-host") || document.body;
    host.appendChild(portalRoot);
    return () => portalRoot.remove();
  }, [portalRoot]);

  if (!portalRoot) return null;

  const periods = [
    { key: "7d", label: s("period7d", "7 days") },
    { key: "30d", label: s("period30d", "30 days") },
    { key: "90d", label: s("period90d", "90 days") },
    { key: "all", label: s("periodAll", "All time") },
  ];

  const maxBarCount = data?.completionOverTime?.length
    ? Math.max(1, ...data.completionOverTime.map((d) => d.count))
    : 1;

  const ttcTotal = data?.timeToCompletion?.distribution
    ? Object.values(data.timeToCompletion.distribution).reduce((a, b) => a + b, 0)
    : 0;

  // Heatmap quantization
  const heatmapMax = data?.heatmap?.byDate?.length
    ? Math.max(1, ...data.heatmap.byDate.map((d) => d.count))
    : 1;
  const heatmapLevel = (count) => {
    if (count === 0) return 0;
    const ratio = count / heatmapMax;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  // Pad heatmap to align with configured week start
  const heatmapCells = data?.heatmap?.byDate || [];
  const firstDate = heatmapCells[0]?.date ? new Date(heatmapCells[0].date + "T00:00:00") : null;
  const padDays = firstDate ? ((JS_DAY_TO_ISO[firstDate.getDay()] - weekStartISO + 7) % 7) : 0;

  const maxProjectOpen = data?.projectBreakdown?.byOpenCount?.length
    ? Math.max(1, ...data.projectBreakdown.byOpenCount.map((p) => p.count))
    : 1;
  const maxProjectVelocity = data?.projectBreakdown?.byVelocity?.length
    ? Math.max(1, ...data.projectBreakdown.byVelocity.map((p) => p.count))
    : 1;

  return createPortal(
    <div className="bt-analytics-overlay" role="dialog" aria-label={s("title", "Analytics")}>
      <div className="bt-analytics-overlay__backdrop" onClick={onClose} />
      <div className="bt-analytics-overlay__panel" ref={panelRef}>
        {/* Header */}
        <div className="bt-analytics-header">
          <h3 className="bt-analytics-header__title">{s("title", "Analytics")}</h3>
          <button type="button" className="bp3-button bp3-minimal bp3-small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Period selector */}
        <div className="bt-analytics-periods">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`bt-analytics-period-btn${period === p.key ? " bt-analytics-period-btn--active" : ""}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="bt-analytics-content">
          {loading ? (
            <div className="bt-analytics-empty">{s("loading", "Computing analytics...")}</div>
          ) : !data || data.summary.completed === 0 ? (
            <div className="bt-analytics-empty">{s("noData", "No completed tasks in this period.")}</div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="bt-analytics-summary">
                <div className="bt-analytics-card">
                  <span className="bt-analytics-card__value">{data.summary.totalOpen}</span>
                  <span className="bt-analytics-card__label">{s("totalOpen", "Open")}</span>
                </div>
                <div className="bt-analytics-card">
                  <span className="bt-analytics-card__value">{data.summary.completed}</span>
                  <span className="bt-analytics-card__label">{s("completed", "Completed")}</span>
                </div>
                <div className="bt-analytics-card">
                  <span className="bt-analytics-card__value">{data.summary.overdue}</span>
                  <span className="bt-analytics-card__label">{s("overdue", "Overdue")}</span>
                </div>
                <div className="bt-analytics-card">
                  <span className="bt-analytics-card__value">{Math.round(data.summary.completionRate * 100)}%</span>
                  <span className="bt-analytics-card__label">{s("completionRate", "Completion rate")}</span>
                </div>
              </div>

              {/* Completion over time */}
              <div className="bt-analytics-section">
                <h4 className="bt-analytics-section__title">{s("completionOverTime", "Completions over time")}</h4>
                <div className="bt-analytics-bars">
                  {data.completionOverTime.map((d) => (
                    <div
                      key={d.date}
                      className="bt-analytics-bar"
                      style={{ height: `${Math.max(2, (d.count / maxBarCount) * 100)}%` }}
                      title={`${d.date}: ${d.count}`}
                    />
                  ))}
                </div>
              </div>

              {/* Time to completion */}
              <div className="bt-analytics-section">
                <h4 className="bt-analytics-section__title">
                  {s("timeToCompletion", "Time to completion")}
                  {data.timeToCompletion.averageDays > 0 && (
                    <span className="bt-analytics-section__badge">
                      {s("avgDays", "Avg")}: {data.timeToCompletion.averageDays}d
                    </span>
                  )}
                </h4>
                {ttcTotal > 0 && (
                  <div className="bt-analytics-distro">
                    {[
                      ["sameDay", s("sameDay", "Same day"), data.timeToCompletion.distribution.sameDay],
                      ["d1to3", s("days1to3", "1-3 days"), data.timeToCompletion.distribution.d1to3],
                      ["d4to7", s("days4to7", "4-7 days"), data.timeToCompletion.distribution.d4to7],
                      ["w1to2", s("weeks1to2", "1-2 wks"), data.timeToCompletion.distribution.w1to2],
                      ["w2plus", s("weeks2plus", "2+ wks"), data.timeToCompletion.distribution.w2plus],
                    ].map(([key, label, count]) => (
                      <div key={key} className="bt-analytics-distro__row">
                        <span className="bt-analytics-distro__label">{label}</span>
                        <div className="bt-analytics-distro__track">
                          <div className="bt-analytics-distro__fill" style={{ width: `${(count / ttcTotal) * 100}%` }} />
                        </div>
                        <span className="bt-analytics-distro__count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overdue frequency */}
              {data.overdueFrequency.totalWithDue > 0 && (
                <div className="bt-analytics-section">
                  <h4 className="bt-analytics-section__title">{s("overdueFrequency", "Overdue frequency")}</h4>
                  <div className="bt-analytics-stats-row">
                    <div className="bt-analytics-stat">
                      <span className="bt-analytics-stat__value">{data.overdueFrequency.overdueRate}%</span>
                      <span className="bt-analytics-stat__label">{s("overdueRate", "Late rate")}</span>
                    </div>
                    <div className="bt-analytics-stat">
                      <span className="bt-analytics-stat__value">{data.overdueFrequency.avgDaysOverdue}d</span>
                      <span className="bt-analytics-stat__label">{s("avgDaysOverdue", "Avg days late")}</span>
                    </div>
                    <div className="bt-analytics-stat">
                      <span className="bt-analytics-stat__value">{data.overdueFrequency.lateCount}/{data.overdueFrequency.totalWithDue}</span>
                      <span className="bt-analytics-stat__label">Late / with due</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Project breakdown */}
              {data.projectBreakdown.byOpenCount.length > 0 && (
                <div className="bt-analytics-section">
                  <h4 className="bt-analytics-section__title">{s("projectBreakdown", "By project")}</h4>
                  <div className="bt-analytics-subsection">
                    <span className="bt-analytics-subsection__label">{s("openTasks", "Open tasks")}</span>
                    <div className="bt-analytics-distro">
                      {data.projectBreakdown.byOpenCount.map((p) => (
                        <div key={p.name} className="bt-analytics-distro__row">
                          <span className="bt-analytics-distro__label bt-analytics-distro__label--wide">{p.name}</span>
                          <div className="bt-analytics-distro__track">
                            <div className="bt-analytics-distro__fill" style={{ width: `${(p.count / maxProjectOpen) * 100}%` }} />
                          </div>
                          <span className="bt-analytics-distro__count">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {data.projectBreakdown.byVelocity.length > 0 && (
                    <div className="bt-analytics-subsection">
                      <span className="bt-analytics-subsection__label">{s("completedTasks", "Completed")}</span>
                      <div className="bt-analytics-distro">
                        {data.projectBreakdown.byVelocity.map((p) => (
                          <div key={p.name} className="bt-analytics-distro__row">
                            <span className="bt-analytics-distro__label bt-analytics-distro__label--wide">{p.name}</span>
                            <div className="bt-analytics-distro__track">
                              <div className="bt-analytics-distro__fill" style={{ width: `${(p.count / maxProjectVelocity) * 100}%` }} />
                            </div>
                            <span className="bt-analytics-distro__count">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recurring adherence */}
              {data.recurringAdherence.totalSeries > 0 && (
                <div className="bt-analytics-section">
                  <h4 className="bt-analytics-section__title">{s("recurringAdherence", "Recurring adherence")}</h4>
                  <div className="bt-analytics-stats-row">
                    <div className="bt-analytics-stat">
                      <span className="bt-analytics-stat__value">{data.recurringAdherence.avgOnTimeRate}%</span>
                      <span className="bt-analytics-stat__label">{s("avgOnTimeRate", "Avg on-time")}</span>
                    </div>
                    <div className="bt-analytics-stat">
                      <span className="bt-analytics-stat__value">{data.recurringAdherence.totalSeries}</span>
                      <span className="bt-analytics-stat__label">Series</span>
                    </div>
                  </div>
                  {data.recurringAdherence.topPerformers.length > 0 && (
                    <div className="bt-analytics-subsection">
                      <span className="bt-analytics-subsection__label">{s("topPerformers", "Most consistent")}</span>
                      <div className="bt-analytics-list">
                        {data.recurringAdherence.topPerformers.map((p, i) => (
                          <div key={i} className="bt-analytics-list__item">
                            <span className="bt-analytics-list__name">{p.title}</span>
                            <span className="bt-analytics-list__value">{p.rate}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.recurringAdherence.bottomPerformers.length > 0 && (
                    <div className="bt-analytics-subsection">
                      <span className="bt-analytics-subsection__label">{s("bottomPerformers", "Least consistent")}</span>
                      <div className="bt-analytics-list">
                        {data.recurringAdherence.bottomPerformers.map((p, i) => (
                          <div key={i} className="bt-analytics-list__item">
                            <span className="bt-analytics-list__name">{p.title}</span>
                            <span className="bt-analytics-list__value">{p.rate}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Busiest days heatmap */}
              <div className="bt-analytics-section">
                <h4 className="bt-analytics-section__title">{s("busiestDays", "Busiest days")}</h4>
                <div className="bt-analytics-heatmap-labels">
                  {dayLabels.map((d, i) => (
                    <span key={i} className="bt-analytics-heatmap-label">{d}</span>
                  ))}
                </div>
                <div className="bt-analytics-heatmap">
                  {Array.from({ length: padDays }).map((_, i) => (
                    <div key={`pad-${i}`} className="bt-analytics-heatmap__cell bt-analytics-heatmap__cell--empty" />
                  ))}
                  {heatmapCells.map((d) => (
                    <div
                      key={d.date}
                      className={`bt-analytics-heatmap__cell bt-analytics-heatmap__cell--${heatmapLevel(d.count)}`}
                      title={`${d.date}: ${d.count}`}
                    />
                  ))}
                </div>
                <div className="bt-analytics-heatmap-legend">
                  <span className="bt-analytics-heatmap-legend__label">Less</span>
                  <div className="bt-analytics-heatmap__cell bt-analytics-heatmap__cell--0" />
                  <div className="bt-analytics-heatmap__cell bt-analytics-heatmap__cell--1" />
                  <div className="bt-analytics-heatmap__cell bt-analytics-heatmap__cell--2" />
                  <div className="bt-analytics-heatmap__cell bt-analytics-heatmap__cell--3" />
                  <div className="bt-analytics-heatmap__cell bt-analytics-heatmap__cell--4" />
                  <span className="bt-analytics-heatmap-legend__label">More</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    portalRoot
  );
}

// ========================= Focus Mode Panel =========================

function FocusModePanel({ queue, controller, language, liveSnapshot, strings, onExit, onRefreshQueue }) {
  const [index, setIndex] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [helpCollapsed, setHelpCollapsed] = useState(false);
  const panelRef = useRef(null);
  const s = strings || {};

  // Build a uid → live task map for staleness diff and subtask lookup
  const liveByUid = useMemo(() => {
    const map = new Map();
    for (const t of liveSnapshot?.tasks || []) map.set(t.uid, t);
    return map;
  }, [liveSnapshot]);

  // Staleness detection: title or blocked-state changes, or task disappeared
  useEffect(() => {
    if (!queue || !liveByUid) return;
    let stale = false;
    for (const q of queue) {
      const live = liveByUid.get(q.uid);
      if (!live) { stale = true; break; }
      if (live.title !== q.title || live.isBlocked !== q.isBlocked) { stale = true; break; }
    }
    setIsStale(stale);
  }, [queue, liveByUid]);

  // All-done state: index past end OR every queue item is now completed in live snapshot
  const allRemainingCompleted = useMemo(() => {
    if (!queue?.length) return true;
    return queue.every((q) => {
      const live = liveByUid.get(q.uid);
      return live ? live.isCompleted : false;
    });
  }, [queue, liveByUid]);

  const isAllDone = index >= (queue?.length || 0) || allRemainingCompleted;

  // Current task — prefer live version so completion/metadata reflect updates
  const currentTask = useMemo(() => {
    if (isAllDone || !queue || index < 0 || index >= queue.length) return null;
    const frozen = queue[index];
    const live = liveByUid.get(frozen.uid);
    return live || frozen;
  }, [queue, index, liveByUid, isAllDone]);

  const advance = useCallback((delta) => {
    setIndex((prev) => {
      const next = prev + delta;
      if (!queue?.length) return prev;
      if (next < 0) return 0;
      if (next >= queue.length) return queue.length - 1;
      return next;
    });
  }, [queue]);

  // Capture-phase keydown handler — runs before the dashboard handler thanks to {capture: true}
  useEffect(() => {
    if (isAllDone) {
      const handler = (e) => {
        if (isTypingInInput()) return;
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onExit();
        }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }
    if (!currentTask) return undefined;
    const handler = (e) => {
      if (isTypingInInput()) return;
      const key = normalizeKey(e);
      const stop = () => { e.preventDefault(); e.stopPropagation(); };

      if (key === "escape") { stop(); onExit(); return; }
      if (key === "shift+?") { stop(); setHelpCollapsed((c) => !c); return; }
      if (key === "j" || key === "n" || key === "arrowright" || key === "arrowdown") {
        stop();
        advance(+1);
        return;
      }
      if (key === "k" || key === "p" || key === "arrowleft" || key === "arrowup") {
        stop();
        advance(-1);
        return;
      }
      if (key === "enter") {
        stop();
        controller?.openBlock?.(currentTask.uid, { skipCompletionToast: !!currentTask.isCompleted });
        return;
      }
      if (key === "c") {
        stop();
        if (currentTask.isBlocked) {
          iziToast.info({ message: s.blockedHint || "This task is blocked and can't be completed from here." });
          return;
        }
        controller?.toggleTask?.(currentTask.uid, "complete");
        // Auto-advance: index++; if past end, isAllDone will trigger on next render
        setIndex((i) => Math.min(i + 1, (queue?.length || 0)));
        return;
      }
      if (key === "shift+s") {
        stop();
        controller?.snoozeTask?.(currentTask.uid, 7);
        return;
      }
      if (key === "s") {
        stop();
        controller?.snoozeTask?.(currentTask.uid, 1);
        return;
      }
      if (key === "r") {
        stop();
        controller?.refresh?.({ reason: "focus-mode-manual" });
        return;
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [advance, controller, currentTask, isAllDone, onExit, queue, s.blockedHint]);

  // Click outside the panel exits Focus Mode (50ms delay mirrors AnalyticsPanel pattern)
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onExit();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClick); };
  }, [onExit]);

  // Portal root — created once, removed on unmount (no leak risk)
  const portalRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.className = "bt-focus-mode-portal";
    el.setAttribute("data-bt-portal", "focus-mode");
    return el;
  }, []);

  useEffect(() => {
    if (!portalRoot) return undefined;
    const host = document.querySelector(".bt-dashboard-host") || document.body;
    host.appendChild(portalRoot);
    return () => portalRoot.remove();
  }, [portalRoot]);

  if (!portalRoot) return null;

  const total = queue?.length || 0;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const progressPct = total > 0 ? Math.min(100, Math.max(0, ((safeIndex + 1) / total) * 100)) : 0;

  // ── All-done screen ──
  if (isAllDone) {
    return createPortal(
      <div className="bt-focus-mode-overlay" role="dialog" aria-label={s.title || "Focus Mode"}>
        <div className="bt-focus-mode-overlay__backdrop" onClick={onExit} />
        <div className="bt-focus-mode__panel bt-focus-mode__panel--all-done" ref={panelRef}>
          <div className="bt-focus-mode__all-done">
            <h2>{s.allDoneTitle || "All done!"}</h2>
            <p>{s.allDoneSubtitle || "You've cleared the queue."}</p>
            <button type="button" className="bp3-button bp3-intent-primary" onClick={onExit}>
              {s.allDoneReturn || "Return to dashboard"}
            </button>
          </div>
        </div>
      </div>,
      portalRoot
    );
  }

  if (!currentTask) return null;

  const progressLabel = (s.progressLabel || "Task {{current}} of {{total}}")
    .replace("{{current}}", String(safeIndex + 1))
    .replace("{{total}}", String(total));

  const subtaskUids = Array.isArray(currentTask.subtaskUids) ? currentTask.subtaskUids : [];
  const subtasks = subtaskUids.map((uid) => liveByUid.get(uid)).filter(Boolean);

  return createPortal(
    <div className="bt-focus-mode-overlay" role="dialog" aria-label={s.title || "Focus Mode"}>
      <div className="bt-focus-mode-overlay__backdrop" onClick={onExit} />
      <div className="bt-focus-mode__panel" ref={panelRef}>
        {/* Header: progress + close */}
        <div className="bt-focus-mode__header">
          <div className="bt-focus-mode__progress-block">
            <div className="bt-focus-mode__progress-text">{progressLabel}</div>
            <div className="bt-focus-mode__progress-bar" aria-hidden="true">
              <div className="bt-focus-mode__progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <button
            type="button"
            className="bp3-button bp3-minimal bp3-small bt-focus-mode__close"
            onClick={onExit}
            aria-label={s.exitButton || "Exit"}
            title={s.exitButton || "Exit"}
          >
            ✕
          </button>
        </div>

        {/* Stale-queue banner */}
        {isStale && (
          <div className="bt-focus-mode__stale-banner" role="alert">
            <div className="bt-focus-mode__stale-banner-text">
              <strong>{s.staleBannerTitle || "Queue is out of sync"}</strong>
              <div>{s.staleBannerBody || "Some tasks have changed since you entered Focus Mode."}</div>
            </div>
            <div className="bt-focus-mode__stale-banner-actions">
              {onRefreshQueue && (
                <button type="button" className="bp3-button bp3-small" onClick={onRefreshQueue}>
                  {s.staleBannerRefresh || "Refresh queue"}
                </button>
              )}
              <button
                type="button"
                className="bp3-button bp3-small bp3-minimal"
                onClick={() => setIsStale(false)}
              >
                {s.staleBannerDismiss || "Dismiss"}
              </button>
            </div>
          </div>
        )}

        {/* Title */}
        <div className="bt-focus-mode__title">
          {currentTask.isBlocked ? (
            <span className="bt-focus-mode__lock" aria-hidden="true">🔒 </span>
          ) : null}
          {currentTask.title || "(Untitled)"}
        </div>

        {/* Blocked hint */}
        {currentTask.isBlocked && (
          <div className="bt-focus-mode__blocked-hint">
            {s.blockedHint || "This task is blocked and can't be completed from here."}
          </div>
        )}

        {/* Pills */}
        {Array.isArray(currentTask.metaPills) && currentTask.metaPills.length > 0 && (
          <div className="bt-focus-mode__pills">
            {currentTask.metaPills.map((pill) => (
              <div key={`${currentTask.uid}-fm-${pill.type}`} className="bt-pill-wrap">
                <Pill icon={pill.icon} label={pill.label} value={pill.value} muted={!pill.value} />
              </div>
            ))}
          </div>
        )}

        {/* Subtasks (read-only) */}
        {subtasks.length > 0 && (
          <div className="bt-focus-mode__subtasks">
            <div className="bt-focus-mode__subtasks-heading">{s.subtasksHeading || "Subtasks"}</div>
            <ul>
              {subtasks.map((sub) => (
                <li
                  key={sub.uid}
                  className={`bt-focus-mode__subtask${sub.isCompleted ? " bt-focus-mode__subtask--done" : ""}`}
                >
                  <span className="bt-focus-mode__subtask-checkbox" aria-hidden="true">
                    {sub.isCompleted ? "☑" : "☐"}
                  </span>
                  <span className="bt-focus-mode__subtask-title">{sub.title || "(Untitled)"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Shortcuts overlay */}
        <div
          className={`bt-focus-mode__shortcut-help${
            helpCollapsed ? " bt-focus-mode__shortcut-help--collapsed" : ""
          }`}
        >
          <button
            type="button"
            className="bp3-button bp3-minimal bp3-small bt-focus-mode__shortcut-toggle"
            onClick={() => setHelpCollapsed((c) => !c)}
          >
            {helpCollapsed ? (s.shortcutsShow || "Show shortcuts") : (s.shortcutsHide || "Hide shortcuts")}
          </button>
          {!helpCollapsed && (
            <div className="bt-focus-mode__shortcut-list">
              <div className="bt-focus-mode__shortcut-title">{s.shortcutsTitle || "Shortcuts"}</div>
              <dl>
                <div><dt>j / n / →</dt><dd>{s.shortcutNext || "Next task"}</dd></div>
                <div><dt>k / p / ←</dt><dd>{s.shortcutPrev || "Previous task"}</dd></div>
                <div><dt>c</dt><dd>{s.shortcutComplete || "Complete (auto-advance)"}</dd></div>
                <div><dt>s</dt><dd>{s.shortcutSnooze1 || "Snooze +1 day"}</dd></div>
                <div><dt>Shift+S</dt><dd>{s.shortcutSnooze7 || "Snooze +7 days"}</dd></div>
                <div><dt>Enter</dt><dd>{s.shortcutOpen || "Open task in Roam"}</dd></div>
                <div><dt>r</dt><dd>{s.shortcutRefresh || "Refresh task data"}</dd></div>
                <div><dt>Esc</dt><dd>{s.shortcutExit || "Exit Focus Mode"}</dd></div>
                <div><dt>?</dt><dd>{s.shortcutHelp || "Toggle shortcuts overlay"}</dd></div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>,
    portalRoot
  );
}

// ========================= Recurring Series View Panel =========================

function SeriesViewPanel({ task, controller, language, onClose }) {
  const [projections, setProjections] = useState([]);
  const [projectionCount, setProjectionCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [showAllPast, setShowAllPast] = useState(false);
  const [exceptions, setExceptions] = useState([]);
  const [exceptionInput, setExceptionInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const panelRef = useRef(null);

  const lang = I18N_MAP[language] ? language : "en";
  const s = useMemo(() => {
    const base = tPath(["series"], lang) || {};
    const en = tPath(["series"], "en") || {};
    return { ...en, ...base };
  }, [lang]);

  const seriesId = task.rtParent || task.rtId;
  const seriesData = useMemo(
    () => controller?.getSeriesData?.(seriesId) || { members: [], currentTask: null },
    [controller, seriesId]
  );

  const pastMembers = useMemo(
    () => seriesData.members.filter((m) => m.isCompleted).sort((a, b) => ((a.dueAt || 0) - (b.dueAt || 0))),
    [seriesData.members]
  );
  const currentMember = useMemo(
    () => seriesData.members.find((m) => !m.isCompleted) || task,
    [seriesData.members, task]
  );
  const streaks = useMemo(
    () => controller?.computeSeriesStreaks?.(seriesData.members) || { currentStreak: 0, longestStreak: 0, onTimeRate: 0, totalCompleted: 0, totalWithDue: 0 },
    [controller, seriesData.members]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const uid = currentMember?.uid || task.uid;
    controller?.getSeriesFutureProjections?.(uid, projectionCount)
      ?.then((dates) => { if (!cancelled) setProjections(dates || []); })
      ?.catch(() => { if (!cancelled) setProjections([]); })
      ?.finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [controller, currentMember?.uid, task.uid, projectionCount, refreshKey]);

  // Load exceptions via controller (handles Clojure key normalisation)
  useEffect(() => {
    let cancelled = false;
    const uid = currentMember?.uid || task.uid;
    controller?.getSeriesExceptions?.(uid)
      ?.then((ex) => { if (!cancelled) setExceptions(ex || []); })
      ?.catch(() => { if (!cancelled) setExceptions([]); });
    return () => { cancelled = true; };
  }, [controller, currentMember?.uid, task.uid, refreshKey]);

  const handleAddException = async () => {
    const trimmed = exceptionInput.trim();
    if (!trimmed) return;
    // Accept YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return;
    const uid = currentMember?.uid || task.uid;
    await controller?.addSeriesException?.(uid, trimmed);
    setExceptionInput("");
    setRefreshKey((k) => k + 1);
  };

  const handleRemoveException = async (dateStr) => {
    const uid = currentMember?.uid || task.uid;
    await controller?.removeSeriesException?.(uid, dateStr);
    setRefreshKey((k) => k + 1);
  };

  const handleSkipDate = async (date) => {
    if (!(date instanceof Date)) return;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const uid = currentMember?.uid || task.uid;
    await controller?.addSeriesException?.(uid, iso);
    setRefreshKey((k) => k + 1);
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on click outside panel
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    // Delay to avoid catching the click that opened the panel
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClick); };
  }, [onClose]);

  const INITIAL_PAST_LIMIT = 50;
  const visiblePast = showAllPast ? pastMembers : pastMembers.slice(-INITIAL_PAST_LIMIT);
  const hasHiddenPast = pastMembers.length > INITIAL_PAST_LIMIT && !showAllPast;

  const formatDateSafe = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(lang !== "en" ? lang : undefined, {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
      }).format(d);
    } catch { return d.toLocaleDateString(); }
  };

  const portalRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.className = "bt-series-portal";
    el.setAttribute("data-bt-portal", "series-view");
    return el;
  }, []);

  useEffect(() => {
    if (!portalRoot) return undefined;
    const host = document.querySelector(".bt-dashboard-host") || document.body;
    host.appendChild(portalRoot);
    return () => portalRoot.remove();
  }, [portalRoot]);

  if (!portalRoot) return null;

  return createPortal(
    <div className="bt-series-overlay" role="dialog" aria-label={s.title || "Recurring Series"}>
      <div className="bt-series-overlay__backdrop" onClick={onClose} />
      <div className="bt-series-overlay__panel" ref={panelRef}>
        {/* Header */}
        <div className="bt-series-header">
          <div className="bt-series-header__info">
            <h3 className="bt-series-header__title">{renderTitleWithLinks(task.title, controller) || tPath(["dashboard", "untitled"], lang) || "(Untitled task)"}</h3>
            {task.repeatText && (
              <span className="bt-series-header__rule">↻ {task.repeatText}</span>
            )}
          </div>
          <button
            type="button"
            className="bt-series-header__close bp3-button bp3-minimal bp3-small"
            onClick={onClose}
            aria-label={s.close || "Close"}
          >
            ✕
          </button>
        </div>

        {/* Streak Banner */}
        {streaks.totalCompleted > 0 && (
          <div className="bt-series-streak">
            <div className="bt-series-streak__item">
              <span className="bt-series-streak__value">{streaks.currentStreak}</span>
              <span className="bt-series-streak__label">{s.streak || "Current streak"}</span>
            </div>
            <div className="bt-series-streak__item">
              <span className="bt-series-streak__value">{streaks.longestStreak}</span>
              <span className="bt-series-streak__label">{s.longestStreak || "Best streak"}</span>
            </div>
            <div className="bt-series-streak__item">
              <span className="bt-series-streak__value">{streaks.onTimeRate}%</span>
              <span className="bt-series-streak__label">{s.onTimeRate || "On-time rate"}</span>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bt-series-timeline">
          {/* Past completions */}
          {pastMembers.length === 0 && (
            <div className="bt-series-timeline__empty">{s.noHistory || "No past completions yet."}</div>
          )}
          {hasHiddenPast && (
            <button
              type="button"
              className="bt-series-timeline__show-more"
              onClick={() => setShowAllPast(true)}
            >
              {s.showOlder || `Show ${pastMembers.length - INITIAL_PAST_LIMIT} older…`}
            </button>
          )}
          {visiblePast.map((m) => {
            const isOnTime = m.dueAt && m.completedAt && m.completedAt <= m.dueAt;
            const isLate = m.dueAt && m.completedAt && m.completedAt > m.dueAt;
            return (
              <div key={m.uid} className="bt-series-timeline-item bt-series-timeline-item--past">
                <div className="bt-series-timeline-item__dot bt-series-timeline-item__dot--completed" />
                <div className="bt-series-timeline-item__content">
                  <span className="bt-series-timeline-item__date">
                    {formatDateSafe(m.dueAt || m.completedAt)}
                  </span>
                  {isOnTime && (
                    <span className="bt-series-timeline-item__badge bt-series-timeline-item__badge--ontime">
                      {s.onTime || "On time"}
                    </span>
                  )}
                  {isLate && (
                    <span className="bt-series-timeline-item__badge bt-series-timeline-item__badge--late">
                      {s.late || "Late"}
                    </span>
                  )}
                  {m.completedAt && m.dueAt && m.completedAt !== m.dueAt && (
                    <span className="bt-series-timeline-item__completed-date">
                      {s.completed || "Completed"}: {formatDateSafe(m.completedAt)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Current occurrence */}
          <div className="bt-series-timeline-item bt-series-timeline-item--current">
            <div className="bt-series-timeline-item__dot bt-series-timeline-item__dot--current" />
            <div className="bt-series-timeline-item__content">
              <span className="bt-series-timeline-item__date">
                {currentMember?.dueAt ? formatDateSafe(currentMember.dueAt) : "—"}
              </span>
              <span className="bt-series-timeline-item__badge bt-series-timeline-item__badge--current">
                {s.current || "Current"}
              </span>
            </div>
          </div>

          {/* Future projections */}
          {loading && projections.length === 0 && (
            <div className="bt-series-timeline__loading">…</div>
          )}
          {projections.map((d, i) => (
            <div key={`future-${i}`} className="bt-series-timeline-item bt-series-timeline-item--future">
              <div className="bt-series-timeline-item__dot bt-series-timeline-item__dot--future" />
              <div className="bt-series-timeline-item__content">
                <span className="bt-series-timeline-item__date">{formatDateSafe(d)}</span>
                <span className="bt-series-timeline-item__badge bt-series-timeline-item__badge--upcoming">
                  {s.upcoming || "Upcoming"}
                </span>
                <button
                  type="button"
                  className="bt-series-timeline-item__skip"
                  onClick={() => handleSkipDate(d)}
                  title={s.skipNext || "Skip this occurrence"}
                >
                  {s.skipped ? `${s.skipped.charAt(0).toUpperCase()}${s.skipped.slice(1, 4)}…` : "Skip"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Exceptions */}
        {exceptions.length > 0 && (
          <div className="bt-series-exceptions">
            <span className="bt-series-exceptions__label">{s.exceptions || "Exceptions"}</span>
            <div className="bt-series-exceptions__list">
              {exceptions.map((dateStr) => (
                <div key={dateStr} className="bt-series-exceptions__item">
                  <span>{dateStr}</span>
                  <button
                    type="button"
                    className="bt-series-exceptions__remove"
                    onClick={() => handleRemoveException(dateStr)}
                    title={s.removeException || "Remove"}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add exception */}
        <div className="bt-series-exceptions-add">
          <input
            type="date"
            className="bt-series-exceptions-add__input"
            value={exceptionInput}
            onChange={(e) => setExceptionInput(e.target.value || "")}
            placeholder="YYYY-MM-DD"
          />
          <button
            type="button"
            className="bt-series-exceptions-add__btn bp3-button bp3-small"
            onClick={handleAddException}
            disabled={!exceptionInput.trim()}
          >
            {s.addException || "Add exception"}
          </button>
        </div>

        {/* Projection count control */}
        <div className="bt-series-projections">
          <span className="bt-series-projections__label">{s.projectionCount || "Show next"}</span>
          {[5, 10, 20].map((n) => (
            <button
              key={n}
              type="button"
              className={`bt-series-projections__chip${projectionCount === n ? " bt-series-projections__chip--active" : ""}`}
              onClick={() => setProjectionCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>,
    portalRoot
  );
}

function BulkActionBar({ selectedUids, tasks, controller, strings, onClearSelection, onCancel, isMobileLayout }) {
  const [metaMenuOpen, setMetaMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState(null); // "priority" | "energy" | "gtd" | null
  const metaMenuRef = useRef(null);

  // Close menu when clicking outside - must be before any early returns
  useEffect(() => {
    if (!metaMenuOpen) return undefined;
    const handleClick = (e) => {
      if (metaMenuRef.current && !metaMenuRef.current.contains(e.target)) {
        setMetaMenuOpen(false);
        setActiveSubmenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [metaMenuOpen]);

  if (selectedUids.size === 0) return null;
  const count = selectedUids.size;
  const uids = Array.from(selectedUids);
  const bulk = strings?.bulk || {};
  const fieldLabels = bulk.fieldLabels || {};
  const metaValues = bulk.metaValues || {};

  // Determine completion state of selected tasks
  const selectedTasks = tasks.filter((t) => selectedUids.has(t.uid));
  const allCompleted = selectedTasks.length > 0 && selectedTasks.every((t) => t.isCompleted);
  const allOpen = selectedTasks.length > 0 && selectedTasks.every((t) => !t.isCompleted);

  const handleBulkComplete = () => {
    controller.bulkToggleTask?.(uids, "complete");
    onClearSelection();
  };

  const handleBulkReopen = () => {
    controller.bulkToggleTask?.(uids, "undo");
    onClearSelection();
  };

  const handleBulkSnooze = (days) => {
    controller.bulkSnoozeTask?.(uids, days);
    onClearSelection();
  };

  const handleMetaAction = async (field) => {
    setMetaMenuOpen(false);
    setActiveSubmenu(null);
    if (!controller.bulkUpdateMetadata) return;

    let value = null;
    if (field === "project") {
      const result = await controller.promptProject?.({ initialValue: "" });
      if (result === undefined || result === null) return;
      value = result;
    } else if (field === "waitingFor") {
      const result = await controller.promptWaiting?.({ initialValue: "" });
      if (result === undefined || result === null) return;
      value = result;
    } else if (field === "context") {
      const result = await controller.promptContext?.({ initialValue: "" });
      if (result === undefined || result === null) return;
      value = Array.isArray(result) ? result : result ? [result] : [];
    }

    controller.bulkUpdateMetadata(uids, { [field]: value });
    onClearSelection();
  };

  const handleMetaValueAction = (field, value) => {
    setMetaMenuOpen(false);
    setActiveSubmenu(null);
    if (!controller.bulkUpdateMetadata) return;
    controller.bulkUpdateMetadata(uids, { [field]: value });
    onClearSelection();
  };

  const toggleSubmenu = (submenu) => {
    setActiveSubmenu((prev) => (prev === submenu ? null : submenu));
  };

  // Submenu options
  const priorityOptions = [
    { value: "high", label: metaValues.priorityHigh || "High" },
    { value: "medium", label: metaValues.priorityMedium || "Medium" },
    { value: "low", label: metaValues.priorityLow || "Low" },
    { value: null, label: metaValues.clear || "Clear" },
  ];
  const energyOptions = [
    { value: "high", label: metaValues.energyHigh || "High" },
    { value: "medium", label: metaValues.energyMedium || "Medium" },
    { value: "low", label: metaValues.energyLow || "Low" },
    { value: null, label: metaValues.clear || "Clear" },
  ];
  const gtdOptions = [
    { value: "next", label: metaValues.gtdNext || "Next action" },
    { value: "waiting", label: metaValues.gtdDelegated || "Delegated" },
    { value: "deferred", label: metaValues.gtdDeferred || "Deferred" },
    { value: "someday", label: metaValues.gtdSomeday || "Someday" },
    { value: null, label: metaValues.clear || "Clear" },
  ];

  return createPortal(
    <div className={`bt-bulk-action-bar${isMobileLayout ? " bt-bulk-action-bar--mobile" : ""}`}>
      <span className="bt-bulk-action-bar__count">
        {typeof bulk.selected === "function" ? bulk.selected(count) : `${count} selected`}
      </span>
      {!allCompleted && (
        <button
          type="button"
          className="bp3-button bp3-small"
          onClick={handleBulkComplete}
        >
          {bulk.complete || "Complete"}
        </button>
      )}
      {!allOpen && (
        <button
          type="button"
          className="bp3-button bp3-small"
          onClick={handleBulkReopen}
        >
          {bulk.reopen || "Reopen"}
        </button>
      )}
      {!allCompleted && (
        <>
          <button
            type="button"
            className="bp3-button bp3-small"
            onClick={() => handleBulkSnooze(1)}
          >
            {bulk.snooze1d || "+1d"}
          </button>
          <button
            type="button"
            className="bp3-button bp3-small"
            onClick={() => handleBulkSnooze(7)}
          >
            {bulk.snooze7d || "+7d"}
          </button>
        </>
      )}
      <div className="bt-bulk-action-bar__meta-wrapper" ref={metaMenuRef}>
        <button
          type="button"
          className="bp3-button bp3-small"
          onClick={() => {
            setMetaMenuOpen((prev) => !prev);
            setActiveSubmenu(null);
          }}
          aria-expanded={metaMenuOpen}
          aria-haspopup="menu"
        >
          {bulk.setMetadata || "Set..."}
        </button>
        {metaMenuOpen && (
          <div className="bt-bulk-meta-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => handleMetaAction("project")}>
              {fieldLabels.project || "Project"}
            </button>
            <button type="button" role="menuitem" onClick={() => handleMetaAction("waitingFor")}>
              {fieldLabels.waitingFor || "Waiting for"}
            </button>
            <button type="button" role="menuitem" onClick={() => handleMetaAction("context")}>
              {fieldLabels.context || "Context"}
            </button>
            <div className="bt-bulk-meta-menu__item-with-submenu">
              <button
                type="button"
                role="menuitem"
                aria-expanded={activeSubmenu === "priority"}
                aria-haspopup="menu"
                onClick={() => toggleSubmenu("priority")}
              >
                {fieldLabels.priority || "Priority"}
                <span className="bt-bulk-meta-menu__arrow">›</span>
              </button>
              {activeSubmenu === "priority" && (
                <div className="bt-bulk-meta-submenu" role="menu">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value ?? "clear"}
                      type="button"
                      role="menuitem"
                      onClick={() => handleMetaValueAction("priority", opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bt-bulk-meta-menu__item-with-submenu">
              <button
                type="button"
                role="menuitem"
                aria-expanded={activeSubmenu === "energy"}
                aria-haspopup="menu"
                onClick={() => toggleSubmenu("energy")}
              >
                {fieldLabels.energy || "Energy"}
                <span className="bt-bulk-meta-menu__arrow">›</span>
              </button>
              {activeSubmenu === "energy" && (
                <div className="bt-bulk-meta-submenu" role="menu">
                  {energyOptions.map((opt) => (
                    <button
                      key={opt.value ?? "clear"}
                      type="button"
                      role="menuitem"
                      onClick={() => handleMetaValueAction("energy", opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bt-bulk-meta-menu__item-with-submenu">
              <button
                type="button"
                role="menuitem"
                aria-expanded={activeSubmenu === "gtd"}
                aria-haspopup="menu"
                onClick={() => toggleSubmenu("gtd")}
              >
                {fieldLabels.gtd || "GTD"}
                <span className="bt-bulk-meta-menu__arrow">›</span>
              </button>
              {activeSubmenu === "gtd" && (
                <div className="bt-bulk-meta-submenu" role="menu">
                  {gtdOptions.map((opt) => (
                    <button
                      key={opt.value ?? "clear"}
                      type="button"
                      role="menuitem"
                      onClick={() => handleMetaValueAction("gtd", opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        className="bp3-button bp3-small bp3-minimal"
        onClick={onCancel}
        aria-label={bulk.cancel || "Cancel"}
        title={bulk.cancel || "Cancel"}
      >
        ✕
      </button>
    </div>,
    document.body
  );
}

function EmptyState({ status, onRefresh, strings }) {
  const copy = strings || {};
  if (status === "loading") {
    return <div className="bt-empty">{copy.loading || "Loading tasks…"}</div>;
  }
  if (status === "error") {
    return (
      <div className="bt-empty">
        <p>{copy.error || "Couldn’t load tasks."}</p>
        <button type="button" onClick={onRefresh}>
          {copy.retry || "Try again"}
        </button>
      </div>
    );
  }
  return <div className="bt-empty">{copy.noMatch || "No tasks match the selected filters."}</div>;
}

export default function DashboardApp({ controller, onRequestClose, onHeaderReady, language = "en" }) {
  const snapshot = useControllerSnapshot(controller);
  const [filters, dispatchFilters] = useReducer(filtersReducer, DEFAULT_FILTERS, loadSavedFilters);
  const [grouping, setGrouping] = useState("time");
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedParentTasks, setExpandedParentTasks] = useState({});
  const [viewsStore, setViewsStore] = useState(() => ({ schema: 1, activeViewId: null, views: [] }));
  const [viewsLoaded, setViewsLoaded] = useState(false);
  const [reviewStartRequested, setReviewStartRequested] = useState(null);
  const [reviewState, setReviewState] = useState(() => ({ active: false, type: "weekly", index: 0, projectFilter: null }));
  const [reviewMenuOpen, setReviewMenuOpen] = useState(false);
  const preReviewActiveViewIdRef = useRef(null);
  // NOTE: We only store activeViewId here.
  // If null, exiting review relies on existing Default → lastDefaultState restore logic.
  const [projectOptions, setProjectOptions] = useState(() =>
    controller?.getProjectOptions?.() || []
  );
  const [waitingOptions, setWaitingOptions] = useState(() =>
    controller?.getWaitingOptions?.() || []
  );
  const [contextOptions, setContextOptions] = useState(() =>
    controller?.getContextOptions?.() || []
  );
  const [archivedProjectNames, setArchivedProjectNames] = useState(() =>
    new Set(controller?.getArchivedProjects?.() || [])
  );
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [archivedWaitingNames, setArchivedWaitingNames] = useState(() =>
    new Set(controller?.getArchivedWaiting?.() || [])
  );
  const [showArchivedWaiting, setShowArchivedWaiting] = useState(false);
  const [archivedContextNames, setArchivedContextNames] = useState(() =>
    new Set(controller?.getArchivedContexts?.() || [])
  );
  const [showArchivedContexts, setShowArchivedContexts] = useState(false);
  const [seriesViewTask, setSeriesViewTask] = useState(null);
  const initialViewAppliedRef = useRef(false);
  const defaultStatePersistTimerRef = useRef(null);
  const lastDefaultStateSigRef = useRef(null);
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 639px)").matches;
  });
  const isTouchDevice = !!window?.roamAlphaAPI?.platform?.isTouchDevice;
  const isMobileApp = !!window?.roamAlphaAPI?.platform?.isMobileApp;
  const isMobileLayout = isMobileApp || isNarrowLayout;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const layoutChangeTimerRef = useRef(null);
  const sidebarSwipeRef = useRef(null);
  // Bulk selection state
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const lastSelectedUidRef = useRef(null);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(null);
  const focusedUidRef = useRef(null);
  const [menuOpenForUid, setMenuOpenForUid] = useState(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [focusQueue, setFocusQueue] = useState(null);

  const sortedViews = useMemo(() => {
    const views = Array.isArray(viewsStore?.views) ? viewsStore.views : [];
    const presetOrder = new Map(DASHBOARD_PRESET_IDS.map((id, idx) => [id, idx]));
    return views
      .slice()
      .sort(
        (a, b) => {
          const aPreset = presetOrder.has(a?.id);
          const bPreset = presetOrder.has(b?.id);
          if (aPreset && bPreset) return presetOrder.get(a.id) - presetOrder.get(b.id);
          if (aPreset) return -1;
          if (bPreset) return 1;
          return (
            String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
              sensitivity: "base",
            }) || (Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))
          );
        }
      );
  }, [viewsStore]);
  const activeView = useMemo(() => {
    const id = viewsStore?.activeViewId;
    if (!id) return null;
    return (viewsStore?.views || []).find((v) => v.id === id) || null;
  }, [viewsStore]);
  const [reviewStepSettings, setReviewStepSettings] = useState(() => {
    const settings = controller?.getReviewStepSettings?.();
    return settings && typeof settings === "object" ? settings : {};
  });
  useEffect(() => {
    if (!controller?.subscribeReviewStepSettings) return undefined;
    const sync = () => {
      const next = controller?.getReviewStepSettings?.();
      setReviewStepSettings(next && typeof next === "object" ? next : {});
    };
    const unsub = controller.subscribeReviewStepSettings(sync);
    sync();
    return unsub;
  }, [controller]);
  const REVIEW_TYPE_PRESETS = useMemo(() => ({
    daily: DASHBOARD_DAILY_REVIEW_PRESET_IDS,
    weekly: DASHBOARD_REVIEW_PRESET_IDS,
    monthly: DASHBOARD_MONTHLY_REVIEW_PRESET_IDS,
    "project-sweep": DASHBOARD_PROJECT_SWEEP_PRESET_IDS,
  }), []);
  const effectiveReviewIds = useMemo(() => {
    const type = reviewState.type || "weekly";
    const settingsType = type === "project-sweep" ? "monthly" : type;
    const ids = REVIEW_TYPE_PRESETS[type] || DASHBOARD_REVIEW_PRESET_IDS;
    const safeIds = Array.isArray(ids) ? ids : [];
    const existing = new Set((viewsStore?.views || []).map((v) => v.id));
    return safeIds.filter((id) => existing.has(id) && reviewStepSettings[`${settingsType}:${id}`] !== false);
  }, [viewsStore, reviewStepSettings, reviewState.type, REVIEW_TYPE_PRESETS]);
  const activeReviewView = useMemo(() => {
    if (!reviewState.active) return null;
    const id = effectiveReviewIds[reviewState.index] || null;
    if (!id) return null;
    return (viewsStore?.views || []).find((v) => v.id === id) || null;
  }, [reviewState.active, reviewState.index, effectiveReviewIds, viewsStore]);
  useEffect(() => {
    if (!reviewState.active) return;
    if (!effectiveReviewIds.length) {
      const message = ui?.reviewNoPresetsToast || "No review presets found.";
      notifyToast(message);
      exitReview();
      return;
    }
    let nextIndex = Math.min(reviewState.index, effectiveReviewIds.length - 1);
    const currentId = effectiveReviewIds[reviewState.index];
    if (!currentId || reviewStepSettings[currentId] === false) {
      const forwardIndex = effectiveReviewIds.findIndex((_, idx) => idx > reviewState.index);
      if (forwardIndex !== -1) {
        nextIndex = forwardIndex;
      } else {
        const backwardIndex = [...effectiveReviewIds]
          .reverse()
          .findIndex((_, idx) => effectiveReviewIds.length - 1 - idx < reviewState.index);
        nextIndex = backwardIndex !== -1 ? effectiveReviewIds.length - 1 - backwardIndex : nextIndex;
      }
    }
    if (nextIndex !== reviewState.index) {
      setReviewState((prev) => ({ ...prev, index: nextIndex }));
    }
    const nextId = effectiveReviewIds[nextIndex];
    if (nextId && viewsStore?.activeViewId !== nextId) {
      applySavedViewById(nextId);
    }
  }, [
    reviewState.active,
    reviewState.index,
    effectiveReviewIds,
    viewsStore?.activeViewId,
    applySavedViewById,
    exitReview,
    notifyToast,
    ui,
    reviewStepSettings,
  ]);
  const lang = I18N_MAP[language] ? language : "en";
  const tt = useCallback(
    (path, fallback) => {
      const val = tPath(path, lang);
      if (typeof val === "string") return val;
      if (typeof val === "function") return val;
      return fallback;
    },
    [lang]
  );
  const fallbackCapitalize = useCallback(
    (value) => (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : ""),
    []
  );
  const filterDefs = useMemo(() => {
    const fv = (key) => tt(["dashboard", "filterValues", key], fallbackCapitalize(key));
    return {
      Recurrence: [
        { value: "recurring", label: fv("recurring") },
        { value: "one-off", label: fv("one-off") },
      ],
      Start: [
        { value: "not-started", label: fv("not-started") },
        { value: "started", label: fv("started") },
      ],
      Defer: [
        { value: "deferred", label: fv("deferred") },
        { value: "available", label: fv("available") },
      ],
      Due: [
        { value: "overdue", label: fv("overdue") },
        { value: "today", label: fv("today") },
        { value: "upcoming", label: fv("upcoming") },
        { value: "none", label: fv("none") },
      ],
      Completion: [
        { value: "open", label: fv("open") },
        { value: "completed", label: fv("completed") },
      ],
      Priority: [
        { value: "high", label: fv("high") },
        { value: "medium", label: fv("medium") },
        { value: "low", label: fv("low") },
      ],
      Energy: [
        { value: "high", label: fv("high") },
        { value: "medium", label: fv("medium") },
        { value: "low", label: fv("low") },
      ],
      GTD: [
        { value: "next action", label: fv("next action") },
        { value: "delegated", label: fv("delegated") },
        { value: "deferred", label: fv("deferred") },
        { value: "someday", label: fv("someday") },
      ],
      Blocked: [
        { value: "actionable", label: fv("actionable") },
        { value: "blocked", label: fv("blocked") },
      ],
      Stalled: [
        { value: "stalled", label: fv("stalled") },
        { value: "active", label: fv("active") },
      ],
    };
  }, [tt, fallbackCapitalize]);
  const filterSectionLabels = useMemo(
    () => ({
      Recurrence: tt(["dashboard", "filterSections", "Recurrence"], "Recurrence"),
      Start: tt(["dashboard", "filterSections", "Start"], "Start"),
      Defer: tt(["dashboard", "filterSections", "Defer"], "Defer"),
      Due: tt(["dashboard", "filterSections", "Due"], "Due"),
      Completion: tt(["dashboard", "filterSections", "Completion"], "Completion"),
      Priority: tt(["dashboard", "filterSections", "Priority"], "Priority"),
      Energy: tt(["dashboard", "filterSections", "Energy"], "Energy"),
      GTD: tt(["dashboard", "filterSections", "GTD"], "GTD"),
      Blocked: tt(["dashboard", "filterSections", "Blocked"], "Blocked"),
      Stalled: tt(["dashboard", "filterSections", "Stalled"], "Stalled"),
    }),
    [tt]
  );
  const visibleProjectOptions = useMemo(() => {
    if (showArchivedProjects) return projectOptions;
    return projectOptions.filter((name) => !archivedProjectNames.has(name));
  }, [projectOptions, archivedProjectNames, showArchivedProjects]);
  const visibleWaitingOptions = useMemo(() => {
    if (showArchivedWaiting) return waitingOptions;
    return waitingOptions.filter((name) => !archivedWaitingNames.has(name));
  }, [waitingOptions, archivedWaitingNames, showArchivedWaiting]);
  const visibleContextOptions = useMemo(() => {
    if (showArchivedContexts) return contextOptions;
    return contextOptions.filter((name) => !archivedContextNames.has(name));
  }, [contextOptions, archivedContextNames, showArchivedContexts]);
  const groupingOptions = useMemo(
    () => [
      { value: "time", label: tt(["dashboard", "groupingLabels", "time"], "Time") },
      { value: "recurrence", label: tt(["dashboard", "groupingLabels", "recurrence"], "Recurrence") },
      { value: "project", label: tt(["dashboard", "groupingLabels", "project"], "Project") },
    ],
    [tt]
  );
  const groupLabels = useMemo(
    () => ({
      overdue: tt(["dashboard", "groupLabels", "overdue"], "Overdue"),
      today: tt(["dashboard", "groupLabels", "today"], "Today"),
      upcoming: tt(["dashboard", "groupLabels", "upcoming"], "Upcoming"),
      none: tt(["dashboard", "groupLabels", "none"], "No Due Date"),
      recurring: tt(["dashboard", "groupLabels", "recurring"], "Recurring"),
      "one-off": tt(["dashboard", "groupLabels", "one-off"], "One-off"),
      completed: tt(["dashboard", "groupLabels", "completed"], "Completed"),
      noProject: tt(["dashboard", "groupLabels", "noProject"], "No Project"),
    }),
    [tt]
  );
  const metaLabels = useMemo(
    () => ({
      priority: tt(["dashboard", "metaPills", "priority"], "Priority"),
      energy: tt(["dashboard", "metaPills", "energy"], "Energy"),
      gtd: tt(["dashboard", "metaPills", "gtd"], "GTD"),
      project: tt(["dashboard", "metaPills", "project"], "Project"),
      waitingFor: tt(["dashboard", "metaPills", "waitingFor"], "Waiting for"),
      context: tt(["dashboard", "metaPills", "context"], "Context"),
    }),
    [tt]
  );
  const taskMenuStrings = useMemo(() => tPath(["taskMenu"], lang) || {}, [lang]);
  const focusModeStrings = useMemo(() => tPath(["focusMode"], lang) || {}, [lang]);
  const ui = useMemo(
    () => ({
      taskMenu: taskMenuStrings,
      filterDefs,
      metaLabels,
      headerTitle: tt(["dashboard", "title"], "Better Tasks"),
      headerSubtitle:
        tt(["dashboard", "subtitle"], "Manage start, defer, due, and recurring tasks without leaving Roam."),
      refresh: tt(["dashboard", "refresh"], "Refresh"),
      close: tt(["dashboard", "close"], "Close"),
      fullPageEnter: tt(["dashboard", "fullPage", "enter"], "Expand"),
      fullPageExit: tt(["dashboard", "fullPage", "exit"], "Exit full page"),
      savedViewsLabel: tt(["dashboard", "views", "label"], "Saved Views"),
      viewsDefault: tt(["dashboard", "views", "default"], "Default"),
      viewsSaveAs: tt(["dashboard", "views", "saveAs"], "Save as…"),
      viewsUpdate: tt(["dashboard", "views", "update"], "Update"),
      viewsOptions: tt(["dashboard", "views", "options"], "View options"),
      viewsRename: tt(["dashboard", "views", "rename"], "Rename…"),
      viewsDelete: tt(["dashboard", "views", "delete"], "Delete"),
      viewsSaveAsMessage: tt(["dashboard", "views", "prompts", "saveAsMessage"], "Save current view as"),
      viewsRenameMessage: tt(["dashboard", "views", "prompts", "renameMessage"], "Rename view"),
      viewsNamePlaceholder: tt(["dashboard", "views", "prompts", "namePlaceholder"], "View name"),
      viewsConfirmOverwrite: tt(
        ["dashboard", "views", "confirms", "overwrite"],
        (name) => `Overwrite view "${name}"?`
      ),
      viewsConfirmDelete: tt(
        ["dashboard", "views", "confirms", "delete"],
        (name) => `Delete view "${name}"?`
      ),
      quickAddPlaceholder: tt(["dashboard", "quickAddPlaceholder"], "Add a Better Task"),
      quickAddButton: tt(["dashboard", "quickAddButton"], "OK"),
      templateButton: tt(["templates", "templateButton"], "Template"),
      searchPlaceholder: tt(["dashboard", "searchPlaceholder"], "Search Better Tasks"),
      filtersLabel: tt(["dashboard", "filtersLabel"], "Filters"),
      filtersShow: tt(["dashboard", "filters", "show"], "Show filters"),
      filtersHide: tt(["dashboard", "filters", "hide"], "Hide filters"),
      tagsLabel: tt(["dashboard", "filters", "tagsLabel"], "Tags"),
      filtersGroups: {
        status: tt(["dashboard", "filters", "groups", "status"], "Status"),
        dates: tt(["dashboard", "filters", "groups", "dates"], "Dates"),
        gtd: tt(["dashboard", "filters", "groups", "gtd"], "GTD"),
        meta: tt(["dashboard", "filters", "groups", "meta"], "Meta"),
      },
      groupByLabel: tt(["dashboard", "groupByLabel"], "Group by"),
      projectFilterLabel: tt(["dashboard", "projectFilterLabel"], "Project"),
      projectFilterPlaceholder: tt(["dashboard", "projectFilterPlaceholder"], "Project name"),
      projectFilterAny: tt(["dashboard", "projectFilterAny"], "All projects"),
      showArchivedProjects: tt(["dashboard", "showArchivedProjects"], "Show archived"),
      archiveProject: tt(["dashboard", "archiveProject"], "Archive project"),
      unarchiveProject: tt(["dashboard", "unarchiveProject"], "Unarchive project"),
      projectArchivedSuffix: tt(["dashboard", "projectArchivedSuffix"], " (archived)"),
      contextFilterLabel: tt(["dashboard", "contextFilterLabel"], "Context"),
      contextFilterAny: tt(["dashboard", "contextFilterAny"], "All contexts"),
      showArchivedContexts: tt(["dashboard", "showArchivedContexts"], "Show archived"),
      archiveContext: tt(["dashboard", "archiveContext"], "Archive"),
      unarchiveContext: tt(["dashboard", "unarchiveContext"], "Unarchive"),
      contextArchivedSuffix: tt(["dashboard", "contextArchivedSuffix"], " (archived)"),
      waitingFilterLabel: tt(["dashboard", "waitingFilterLabel"], "Waiting for"),
      waitingFilterPlaceholder: tt(["dashboard", "waitingFilterPlaceholder"], "Waiting for"),
      waitingFilterAny: tt(["dashboard", "waitingFilterAny"], "All waiting-for"),
      showArchivedWaiting: tt(["dashboard", "showArchivedWaiting"], "Show archived"),
      archiveWaiting: tt(["dashboard", "archiveWaiting"], "Archive"),
      unarchiveWaiting: tt(["dashboard", "unarchiveWaiting"], "Unarchive"),
      waitingArchivedSuffix: tt(["dashboard", "waitingArchivedSuffix"], " (archived)"),
      completedWithinLabel: tt(["dashboard", "completedWithinLabel"], "Completed within"),
      completedWithinAny: tt(["dashboard", "completedWithinOptions", "any"], "Any time"),
      completedWithin7d: tt(["dashboard", "completedWithinOptions", "7d"], "Last 7 days"),
      completedWithin30d: tt(["dashboard", "completedWithinOptions", "30d"], "Last 30 days"),
      completedWithin90d: tt(["dashboard", "completedWithinOptions", "90d"], "Last 90 days"),
      upcomingWithinLabel: tt(["dashboard", "upcomingWithinLabel"], "Upcoming within"),
      upcomingWithinAny: tt(["dashboard", "upcomingWithinOptions", "any"], "Any time"),
      upcomingWithin7d: tt(["dashboard", "upcomingWithinOptions", "7d"], "Next 7 days"),
      upcomingWithin30d: tt(["dashboard", "upcomingWithinOptions", "30d"], "Next 30 days"),
      upcomingWithin90d: tt(["dashboard", "upcomingWithinOptions", "90d"], "Next 90 days"),
      reviewButton: tt(["dashboard", "review", "button"], "Weekly Review"),
      reviewLabel: tt(["dashboard", "review", "label"], "Weekly Review"),
      dailyReviewButton: tt(["dashboard", "review", "dailyButton"], "Daily"),
      dailyReviewLabel: tt(["dashboard", "review", "dailyLabel"], "Daily Review"),
      weeklyReviewButton: tt(["dashboard", "review", "weeklyButton"], "Weekly"),
      monthlyReviewButton: tt(["dashboard", "review", "monthlyButton"], "Monthly"),
      monthlyReviewLabel: tt(["dashboard", "review", "monthlyLabel"], "Monthly Review"),
      projectSweepButton: tt(["dashboard", "review", "projectSweepButton"], "Project Sweep"),
      projectSweepLabel: tt(["dashboard", "review", "projectSweepLabel"], "Project Sweep"),
      reviewSelectProject: tt(["dashboard", "review", "selectProject"], "Select project…"),
      reviewMenuAriaLabel: tt(["dashboard", "review", "menuAriaLabel"], "Review options"),
      reviewOf: tt(["dashboard", "review", "of"], "of"),
      reviewBack: tt(["dashboard", "review", "back"], "← Back"),
      reviewNext: tt(["dashboard", "review", "next"], "Next →"),
      reviewExit: tt(["dashboard", "review", "exit"], "Exit"),
      reviewNoPresetsToast: tt(["toasts", "dashReviewNoPresets"], "No review presets found."),
      groupingOptions,
      groupLabels,
      metaLabels,
      taskOptions: tt(["dashboard", "taskOptions"], "Task options"),
      markDone: tt(["dashboard", "markDone"], "Mark as done"),
      markOpen: tt(["dashboard", "markOpen"], "Mark as open"),
      view: tt(["dashboard", "view"], "View"),
      snoozePick: tt(["dashboard", "snoozePick"], "Pick"),
      snoozePlus1: tt(["dashboard", "snoozePlus1"], "+1d"),
      snoozePlus7: tt(["dashboard", "snoozePlus7"], "+7d"),
      untitled: tt(["dashboard", "untitled"], "(Untitled task)"),
      completedLabel: tt(["dashboard", "filterValues", "completed"], "Completed"),
      empty: {
        loading: tt(["dashboard", "empty", "loading"], "Loading tasks…"),
        error: tt(["dashboard", "empty", "error"], "Couldn’t load tasks."),
        retry: tt(["dashboard", "empty", "retry"], "Try again"),
        noMatch: tt(["dashboard", "empty", "noMatch"], "No tasks match the selected filters."),
      },
      focusMode: focusModeStrings,
    }),
    [tt, groupingOptions, groupLabels, metaLabels, taskMenuStrings, focusModeStrings]
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const stalledDays = controller?.getStalledDays?.() || 14;
  const effectiveFilters = useMemo(() => {
    if (typeof stalledDays === "number" && stalledDays !== 14) {
      return { ...filters, stalledDays };
    }
    return filters;
  }, [filters, stalledDays]);
  const filteredTasks = useMemo(
    () => applyFilters(snapshot.tasks, effectiveFilters, query),
    [snapshot.tasks, effectiveFilters, query]
  );
  const filteredTaskIndex = useMemo(() => {
    const map = new Map();
    for (const task of filteredTasks) map.set(task.uid, task);
    return map;
  }, [filteredTasks]);
  const groups = useMemo(
    () =>
      groupTasks(filteredTasks, grouping, {
        completion: filters.Completion || filters.completion,
        groupLabels,
      }),
    [filteredTasks, grouping, filters.Completion, filters.completion, groupLabels]
  );
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      const ids = new Set(groups.map((group) => group.id));
      groups.forEach((group) => {
        if (!(group.id in next)) {
          next[group.id] = true;
          changed = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groups]);

  const rows = useVirtualRows(groups, expandedGroups, expandedParentTasks, filteredTaskIndex);
  const parentRef = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(max-width: 639px)");
    const handleChange = (event) => {
      if (layoutChangeTimerRef.current) {
        clearTimeout(layoutChangeTimerRef.current);
      }
      layoutChangeTimerRef.current = setTimeout(() => {
        layoutChangeTimerRef.current = null;
        setIsNarrowLayout(!!event.matches);
      }, 150);
    };
    setIsNarrowLayout(!!mq.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handleChange);
      return () => mq.removeEventListener("change", handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);
  useEffect(() => {
    if (!layoutChangeTimerRef.current) return undefined;
    return () => {
      if (layoutChangeTimerRef.current) {
        clearTimeout(layoutChangeTimerRef.current);
        layoutChangeTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!isMobileLayout) {
      setSidebarOpen(false);
      return;
    }
    if (!snapshot?.isFullPage) {
      controller?.setDashboardFullPage?.(true);
    }
  }, [isMobileLayout, snapshot?.isFullPage, controller]);
  useEffect(() => {
    if (!isMobileLayout || !sidebarOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isMobileLayout, sidebarOpen]);
  const estimateRowSize = useCallback(
    (index) => {
      const row = rows[index];
      if (row?.type === "group") return 40;
      if (row?.type === "subtask") return 80;
      return 100;
    },
    [rows]
  );
  const getRowKey = useCallback((index) => rows[index]?.key ?? index, [rows]);
  const getScrollElement = useCallback(() => parentRef.current, []);
  const virtualizerOptions = useMemo(
    () => ({
      count: rows.length,
      estimateSize: estimateRowSize,
      getItemKey: getRowKey,
      getScrollElement,
      overscan: isMobileApp ? 4 : isTouchDevice ? 6 : 8,
      measureElement,
    }),
    [rows.length, estimateRowSize, getRowKey, getScrollElement, isMobileApp, isTouchDevice]
  );
  const rowVirtualizer = useVirtualizer(virtualizerOptions);

  // Bulk selection helpers
  const selectionActive = selectionMode || selectedUids.size > 0;
  const toggleSelection = useCallback((uid) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);
  const handleToggleSelect = useCallback(
    (uid, event) => {
      if (event?.shiftKey && lastSelectedUidRef.current) {
        const taskUids = rows.filter((r) => r.type === "task").map((r) => r.task.uid);
        const startIdx = taskUids.indexOf(lastSelectedUidRef.current);
        const endIdx = taskUids.indexOf(uid);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const rangeUids = taskUids.slice(from, to + 1);
          setSelectedUids((prev) => {
            const next = new Set(prev);
            rangeUids.forEach((u) => next.add(u));
            return next;
          });
        }
      } else {
        toggleSelection(uid);
      }
      lastSelectedUidRef.current = uid;
    },
    [rows, toggleSelection]
  );
  const selectAllVisible = useCallback(() => {
    const visibleUids = rows.filter((r) => r.type === "task").map((r) => r.task.uid);
    setSelectedUids(new Set(visibleUids));
  }, [rows]);
  const selectNone = useCallback(() => {
    setSelectedUids(new Set());
    // Keep selection mode active - user can continue selecting
  }, []);
  const cancelSelection = useCallback(() => {
    setSelectedUids(new Set());
    setSelectionMode(false);
  }, []);
  const selectGroup = useCallback((groupTasks) => {
    if (!Array.isArray(groupTasks) || !groupTasks.length) return;
    setSelectedUids((prev) => {
      const next = new Set(prev);
      const allSelected = groupTasks.every((task) => next.has(task.uid));
      if (allSelected) {
        groupTasks.forEach((task) => next.delete(task.uid));
      } else {
        groupTasks.forEach((task) => next.add(task.uid));
      }
      return next;
    });
  }, []);
  // Clear selection when filters, grouping, query, or view changes
  useEffect(() => {
    setSelectedUids(new Set());
    lastSelectedUidRef.current = null;
  }, [filters, grouping, query, viewsStore?.activeViewId]);

  /* ── Keyboard navigation ───────────────────────────────────────── */

  // Sync focusedUidRef when focusedIndex or rows change
  useEffect(() => {
    const row = focusedIndex != null ? rows[focusedIndex] : null;
    focusedUidRef.current = row?.task?.uid ?? null;
  }, [focusedIndex, rows]);

  // Reconcile focusedIndex when rows mutate (filter, collapse, search)
  useEffect(() => {
    if (focusedUidRef.current == null) return;
    const newIndex = findNavigableByUid(rows, focusedUidRef.current);
    if (newIndex != null) {
      setFocusedIndex(newIndex);
    } else {
      setFocusedIndex((prev) => {
        if (prev == null) return null;
        const clamped = Math.min(prev, rows.length - 1);
        return findNextNavigable(rows, clamped - 1, 1)
            ?? findNextNavigable(rows, clamped + 1, -1)
            ?? null;
      });
    }
  }, [rows]);

  // Refs so the keydown handler never goes stale
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const selectionActiveRef = useRef(selectionActive);
  selectionActiveRef.current = selectionActive;
  const selectedUidsRef = useRef(selectedUids);
  selectedUidsRef.current = selectedUids;
  const seriesViewTaskRef = useRef(seriesViewTask);
  seriesViewTaskRef.current = seriesViewTask;
  const showKeyboardHelpRef = useRef(showKeyboardHelp);
  showKeyboardHelpRef.current = showKeyboardHelp;
  const focusModeActiveRef = useRef(focusModeOpen);
  focusModeActiveRef.current = focusModeOpen;

  // Single-registration keydown handler
  useEffect(() => {
    const handler = (event) => {
      // Don't capture keystrokes when typing in inputs
      if (isTypingInInput()) {
        if (event.key === "Escape") document.activeElement?.blur?.();
        return;
      }
      // Don't capture when a modal overlay is open
      if (seriesViewTaskRef.current) return;
      if (focusModeActiveRef.current) return;

      const keybindings = { ...DEFAULT_KEYBINDINGS, ...(controller?.getKeyboardBindings?.() || {}) };
      const key = normalizeKey(event);

      // / — focus search (always, even without focused row)
      if (matchesBinding(key, keybindings.focusSearch)) {
        event.preventDefault();
        document.querySelector(".bt-dashboard .bt-search")?.focus();
        return;
      }

      // f — toggle full-page mode
      if (matchesBinding(key, keybindings.fullPage)) {
        event.preventDefault();
        controller.toggleDashboardFullPage?.();
        return;
      }

      // r — refresh
      if (matchesBinding(key, keybindings.refresh)) {
        event.preventDefault();
        controller.refresh?.({ reason: "manual" });
        return;
      }

      // Shift+G — toggle analytics panel
      if (matchesBinding(key, keybindings.analytics)) {
        event.preventDefault();
        setShowAnalytics((v) => !v);
        return;
      }

      // ? — show keyboard shortcut help
      if (matchesBinding(key, keybindings.help)) {
        event.preventDefault();
        setShowKeyboardHelp((v) => !v);
        return;
      }

      // Escape — close help, clear selection, then clear focus
      if (matchesBinding(key, keybindings.escape)) {
        if (showKeyboardHelpRef.current) { setShowKeyboardHelp(false); return; }
        if (selectionActiveRef.current) { cancelSelection(); return; }
        if (focusedIndexRef.current != null) {
          setFocusedIndex(null);
          focusedUidRef.current = null;
        }
        return;
      }

      // j — move down
      if (matchesBinding(key, keybindings.moveDown)) {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const next = findNextNavigable(rowsRef.current, prev ?? -1, 1);
          if (next != null) rowVirtualizer.scrollToIndex(next, { align: "auto" });
          return next ?? prev;
        });
        return;
      }

      // k — move up
      if (matchesBinding(key, keybindings.moveUp)) {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev == null) return null;
          const next = findNextNavigable(rowsRef.current, prev, -1);
          if (next != null) rowVirtualizer.scrollToIndex(next, { align: "auto" });
          return next ?? prev;
        });
        return;
      }

      // Shift+A — select all visible
      if (matchesBinding(key, keybindings.selectAll)) {
        event.preventDefault();
        selectAllVisible();
        return;
      }

      // --- Actions below require a focused row ---
      const idx = focusedIndexRef.current;
      if (idx == null) return;
      const row = rowsRef.current[idx];
      if (!row?.task) return;

      // Enter — open task
      if (matchesBinding(key, keybindings.open)) {
        event.preventDefault();
        controller.openBlock(row.task.uid, { skipCompletionToast: row.task.isCompleted });
        return;
      }

      // c — complete (bulk if selection active)
      if (matchesBinding(key, keybindings.complete)) {
        event.preventDefault();
        if (selectionActiveRef.current && selectedUidsRef.current.size > 0) {
          controller.bulkToggleTask?.(Array.from(selectedUidsRef.current), "complete");
          cancelSelection();
        } else {
          controller.toggleTask(row.task.uid, row.task.isCompleted ? "undo" : "complete");
        }
        return;
      }

      // s — snooze +1d (bulk if selection active)
      if (matchesBinding(key, keybindings.snooze)) {
        event.preventDefault();
        if (selectionActiveRef.current && selectedUidsRef.current.size > 0) {
          controller.bulkSnoozeTask?.(Array.from(selectedUidsRef.current), 1);
          cancelSelection();
        } else {
          controller.snoozeTask(row.task.uid, 1);
        }
        return;
      }

      // x — toggle selection on focused row
      if (matchesBinding(key, keybindings.toggleSelect)) {
        event.preventDefault();
        handleToggleSelect(row.task.uid, event);
        return;
      }

      // Shift+S — snooze +7d (bulk if selection active)
      if (matchesBinding(key, keybindings.snooze7)) {
        event.preventDefault();
        if (selectionActiveRef.current && selectedUidsRef.current.size > 0) {
          controller.bulkSnoozeTask?.(Array.from(selectedUidsRef.current), 7);
          cancelSelection();
        } else {
          controller.snoozeTask(row.task.uid, 7);
        }
        return;
      }

      // e — expand/collapse subtasks
      if (matchesBinding(key, keybindings.expandSubtasks)) {
        if (row.task.subtaskUids?.length) {
          event.preventDefault();
          setExpandedParentTasks((prev) => ({
            ...prev,
            [row.task.uid]: !prev[row.task.uid],
          }));
        }
        return;
      }

      // . — open three-dot menu
      if (matchesBinding(key, keybindings.openMenu)) {
        event.preventDefault();
        setMenuOpenForUid(row.task.uid);
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [rowVirtualizer, controller, cancelSelection, handleToggleSelect, selectAllVisible]);

  const handleMenuOpenHandled = useCallback(() => setMenuOpenForUid(null), []);

  /* ── End keyboard navigation ───────────────────────────────────── */

  const handleFilterToggle = (section, value, singleChoice = false) => {
    dispatchFilters({ type: singleChoice ? "toggleSingle" : "toggle", section, value });
  };

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  useEffect(() => {
    if (!controller?.loadViewsStore) return;
    const store = controller.loadViewsStore();
    setViewsStore(store);
    setViewsLoaded(true);
  }, [controller]);

  // Set up series view request callback on controller
  useEffect(() => {
    if (!controller) return undefined;
    controller._onSeriesViewRequest = (task) => setSeriesViewTask(task);
    return () => { delete controller._onSeriesViewRequest; };
  }, [controller]);

  useEffect(() => {
    if (!controller?.subscribeDashViewsStore || !controller?.loadViewsStore) return undefined;
    const unsub = controller.subscribeDashViewsStore((nextStore) => {
      if (nextStore && typeof nextStore === "object") {
        setViewsStore(nextStore);
        setViewsLoaded(true);
        return;
      }
      const store = controller.loadViewsStore();
      setViewsStore(store);
      setViewsLoaded(true);
    });
    return unsub;
  }, [controller]);

  useEffect(() => {
    if (!controller?.subscribeDashViewRequests) return undefined;
    const unsub = controller.subscribeDashViewRequests((nextState) => {
      if (!nextState || typeof nextState !== "object") return;
      dispatchFilters({ type: "hydrate", value: nextState.filters });
      setGrouping(typeof nextState.grouping === "string" ? nextState.grouping : "time");
      setQuery(typeof nextState.query === "string" ? nextState.query : "");
    });
    return unsub;
  }, [controller]);

  useEffect(() => {
    if (!controller?.subscribeDashReviewRequests) return undefined;
    const unsub = controller.subscribeDashReviewRequests((req) => {
      if (req?.type === "start") setReviewStartRequested(req.reviewType || "weekly");
    });
    return unsub;
  }, [controller]);

  useEffect(() => {
    if (!controller?.subscribeDashFocusModeRequests) return undefined;
    const unsub = controller.subscribeDashFocusModeRequests((req) => {
      if (req?.type === "start") handleEnterFocusMode();
    });
    return unsub;
  }, [controller, handleEnterFocusMode]);

  useEffect(() => {
    if (!reviewStartRequested) return;
    if (!viewsLoaded) return;
    const reqType = typeof reviewStartRequested === "string" ? reviewStartRequested : "weekly";
    setReviewStartRequested(null);
    startReview(reqType);
  }, [reviewStartRequested, viewsLoaded, startReview]);

  useEffect(() => {
    controller?.reportDashViewState?.({ filters, grouping, query });
  }, [controller, filters, grouping, query]);

  useEffect(() => {
    if (viewsStore?.activeViewId) return undefined;
    if (!controller?.saveViewsStore) return undefined;
    const dashState = { filters, grouping, query };
    let sig = null;
    try {
      sig = JSON.stringify(normalizeDashViewStateForCompare(dashState));
    } catch (_) {
      sig = null;
    }
    if (sig && lastDefaultStateSigRef.current === sig) return undefined;
    if (defaultStatePersistTimerRef.current && typeof window !== "undefined") {
      clearTimeout(defaultStatePersistTimerRef.current);
    }
    if (typeof window !== "undefined") {
      defaultStatePersistTimerRef.current = window.setTimeout(() => {
        defaultStatePersistTimerRef.current = null;
        const latest = controller?.loadViewsStore ? controller.loadViewsStore() : viewsStore;
        const next = setLastDefaultState(latest, dashState);
        const saved = controller.saveViewsStore(next);
        setViewsStore(saved);
        controller?.notifyDashViewsStoreChanged?.(saved);
        if (sig) lastDefaultStateSigRef.current = sig;
      }, 500);
    }
    return () => {
      if (defaultStatePersistTimerRef.current && typeof window !== "undefined") {
        clearTimeout(defaultStatePersistTimerRef.current);
        defaultStatePersistTimerRef.current = null;
      }
    };
  }, [viewsStore?.activeViewId, controller, filters, grouping, query, viewsStore]);

  useEffect(() => {
    if (initialViewAppliedRef.current) return;
    const id = viewsStore?.activeViewId;
    if (!id) {
      initialViewAppliedRef.current = true;
      const fallbackDefault = viewsStore?.lastDefaultState;
      if (fallbackDefault) {
        dispatchFilters({ type: "hydrate", value: fallbackDefault.filters });
        setGrouping(typeof fallbackDefault.grouping === "string" ? fallbackDefault.grouping : "time");
        setQuery(typeof fallbackDefault.query === "string" ? fallbackDefault.query : "");
      }
      return;
    }
    const view = (viewsStore?.views || []).find((v) => v.id === id);
    if (!view) {
      initialViewAppliedRef.current = true;
      return;
    }
    initialViewAppliedRef.current = true;
    dispatchFilters({ type: "hydrate", value: view.state?.filters });
    setGrouping(typeof view.state?.grouping === "string" ? view.state.grouping : "time");
    setQuery(typeof view.state?.query === "string" ? view.state.query : "");
  }, [viewsStore]);

  useEffect(() => {
    if (!controller) return undefined;
    controller.refreshProjectOptions?.(false);
    controller.refreshWaitingOptions?.(false);
    controller.refreshContextOptions?.(false);
    const unsub = controller.subscribeProjectOptions?.((opts) =>
      setProjectOptions(Array.isArray(opts) ? opts : [])
    );
    const unsubWaiting = controller.subscribeWaitingOptions?.((opts) =>
      setWaitingOptions(Array.isArray(opts) ? opts : [])
    );
    const unsubContext = controller.subscribeContextOptions?.((opts) =>
      setContextOptions(Array.isArray(opts) ? opts : [])
    );
    const unsubArchived = controller.subscribeArchivedProjects?.((names) =>
      setArchivedProjectNames(new Set(Array.isArray(names) ? names : []))
    );
    const unsubArchivedWaiting = controller.subscribeArchivedWaiting?.((names) =>
      setArchivedWaitingNames(new Set(Array.isArray(names) ? names : []))
    );
    const unsubArchivedContext = controller.subscribeArchivedContexts?.((names) =>
      setArchivedContextNames(new Set(Array.isArray(names) ? names : []))
    );
    return () => {
      unsub?.();
      unsubWaiting?.();
      unsubContext?.();
      unsubArchived?.();
      unsubArchivedWaiting?.();
      unsubArchivedContext?.();
    };
  }, [controller]);

  // Auto-clear filter when the selected value becomes archived (and "show archived" is off)
  useEffect(() => {
    if (filters.projectText && !showArchivedProjects && archivedProjectNames.has(filters.projectText)) {
      dispatchFilters({ type: "setText", section: "projectText", value: "" });
    }
  }, [archivedProjectNames, filters.projectText, showArchivedProjects]);

  useEffect(() => {
    if (filters.waitingText && !showArchivedWaiting && archivedWaitingNames.has(filters.waitingText)) {
      dispatchFilters({ type: "setText", section: "waitingText", value: "" });
    }
  }, [archivedWaitingNames, filters.waitingText, showArchivedWaiting]);

  useEffect(() => {
    if (filters.contextText && !showArchivedContexts && archivedContextNames.has(filters.contextText)) {
      dispatchFilters({ type: "setText", section: "contextText", value: "" });
    }
  }, [archivedContextNames, filters.contextText, showArchivedContexts]);

  const [quickText, setQuickText] = useState("");

  const handleQuickAddSubmit = async () => {
    const value = quickText.trim();
    if (!value) return;
    try {
      await controller.quickAdd?.(value);
      setQuickText("");
    } catch (err) {
      console.error("[BetterTasks] quick add failed", err);
    }
  };

  const handleQuickAddKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleQuickAddSubmit();
    }
  };

  const handleProjectFilterChange = (e) =>
    dispatchFilters({ type: "setText", section: "projectText", value: e.target.value });
  const handleContextFilterChange = (e) =>
    dispatchFilters({ type: "setText", section: "contextText", value: e.target.value });
  const handleWaitingFilterChange = (e) =>
    dispatchFilters({ type: "setText", section: "waitingText", value: e.target.value });

  const completionOnlyIsCompleted = useMemo(() => {
    const list = Array.isArray(filters?.Completion) ? filters.Completion : [];
    return list.length === 1 && list[0] === "completed";
  }, [filters]);
  const dueIncludesUpcomingMemo = useMemo(() => {
    const list = Array.isArray(filters?.Due) ? filters.Due : [];
    return list.includes("upcoming");
  }, [filters]);

  useEffect(() => {
    if (completionOnlyIsCompleted) return;
    if ((filters?.completedRange || "any") === "any") return;
    dispatchFilters({ type: "setText", section: "completedRange", value: "any" });
  }, [completionOnlyIsCompleted, filters?.completedRange]);
  useEffect(() => {
    if (dueIncludesUpcomingMemo) return;
    if ((filters?.upcomingRange || "any") === "any") return;
    dispatchFilters({ type: "setText", section: "upcomingRange", value: "any" });
  }, [dueIncludesUpcomingMemo, filters?.upcomingRange]);

  const handleRefresh = () => controller.refresh?.({ reason: "manual" });
  const isFullPage = !!snapshot?.isFullPage || isMobileLayout;
  const handleToggleFullPage = useCallback(() => {
    if (isMobileLayout) return;
    controller.toggleDashboardFullPage?.();
  }, [controller, isMobileLayout]);

  const handleEnterFocusMode = useCallback(() => {
    // Use the ref (synced every render) instead of the state value to avoid
    // stale-closure issues when this callback is invoked from a controller subscriber.
    if (focusModeActiveRef.current) {
      iziToast.info({ message: ui.focusMode?.alreadyOpenToast || "Focus Mode is already open." });
      return;
    }
    if (showAnalytics || seriesViewTask || showKeyboardHelp || menuOpenForUid) {
      iziToast.info({
        message: ui.focusMode?.modalBlockedToast || "Close other panels before entering Focus Mode.",
      });
      return;
    }
    // Include every visible, non-completed task — subtasks get their own focus turn
    // even when their parent is also in the queue (the parent card still shows them
    // as a read-only checklist for context).
    const candidates = (filteredTasks || []).filter((t) => !t.isCompleted);
    if (!candidates.length) {
      iziToast.info({ message: ui.focusMode?.emptyToast || "No tasks to focus on." });
      return;
    }
    setFocusQueue(candidates);
    setFocusModeOpen(true);
  }, [
    filteredTasks,
    showAnalytics,
    seriesViewTask,
    showKeyboardHelp,
    menuOpenForUid,
    ui.focusMode,
  ]);

  const handleExitFocusMode = useCallback(() => {
    try {
      if (typeof document !== "undefined" && document.activeElement?.blur) {
        document.activeElement.blur();
      }
    } catch (_) {
      // ignore
    }
    setFocusModeOpen(false);
    setFocusQueue(null);
  }, []);

  const handleRefreshFocusQueue = useCallback(() => {
    handleExitFocusMode();
    // Defer one tick so React/snapshot state has flushed before re-entering
    setTimeout(() => handleEnterFocusMode(), 0);
  }, [handleEnterFocusMode, handleExitFocusMode]);
  const rootClasses = [
    "bt-dashboard",
    isTouchDevice ? "bt-touch" : "",
    isMobileApp ? "bt-mobile-app" : "",
    isMobileLayout ? "bt-mobile-layout" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const fullPageUiKey = useMemo(() => {
    let graphName = "default";
    try {
      graphName = window?.roamAlphaAPI?.graph?.name?.() || "default";
    } catch (_) {
      // ignore
    }
    return `betterTasks.dashboard.fullPage.uiState.${encodeURIComponent(String(graphName))}`;
  }, []);

  const readFullPageUiState = useCallback(() => {
    const defaultSidebarWidth = 310;
    const defaults = {
      sidebarCollapsed: false,
      groupsCollapsed: {
        status: false,
        dates: false,
        gtd: false,
        meta: false,
      },
      sidebarWidth: defaultSidebarWidth,
    };
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage?.getItem(fullPageUiKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaults;
      const groups =
        parsed.groupsCollapsed && typeof parsed.groupsCollapsed === "object"
          ? parsed.groupsCollapsed
          : {};
      const sidebarWidthRaw = parsed.sidebarWidth;
      const sidebarWidthNum =
        typeof sidebarWidthRaw === "number"
          ? sidebarWidthRaw
          : typeof sidebarWidthRaw === "string"
            ? parseFloat(sidebarWidthRaw)
            : NaN;
      const sidebarWidth = Number.isFinite(sidebarWidthNum)
        ? Math.min(480, Math.max(240, Math.round(sidebarWidthNum)))
        : defaultSidebarWidth;
      return {
        sidebarCollapsed: !!parsed.sidebarCollapsed,
        groupsCollapsed: {
          status: !!groups.status,
          dates: !!(groups.dates ?? groups.flow),
          gtd: !!(groups.gtd ?? groups.structure),
          meta: !!(groups.meta ?? groups.effort),
        },
        sidebarWidth,
      };
    } catch (_) {
      return defaults;
    }
  }, [fullPageUiKey]);

  const [fullPageUiState, setFullPageUiState] = useState(() => readFullPageUiState());

  useEffect(() => {
    if (!isFullPage) return;
    setFullPageUiState(readFullPageUiState());
  }, [isFullPage, readFullPageUiState]);

  const persistFullPageUiState = useCallback(
    (next) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage?.setItem(fullPageUiKey, JSON.stringify(next));
      } catch (_) {
        // ignore
      }
    },
    [fullPageUiKey]
  );

  const updateFullPageUiState = useCallback(
    (updater) => {
      setFullPageUiState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : prev;
        persistFullPageUiState(next);
        return next;
      });
    },
    [persistFullPageUiState]
  );

  const sidebarCollapsed = !!fullPageUiState.sidebarCollapsed;
  const groupsCollapsed = fullPageUiState.groupsCollapsed || {};
  const sidebarWidth =
    typeof fullPageUiState.sidebarWidth === "number" && Number.isFinite(fullPageUiState.sidebarWidth)
      ? fullPageUiState.sidebarWidth
      : 310;
  const isResizingSidebarRef = useRef(false);
  const sidebarResizeStartRef = useRef({ x: 0, width: sidebarWidth });
  const sidebarResizeRafRef = useRef(null);

  const toggleSidebarCollapsed = useCallback(() => {
    updateFullPageUiState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, [updateFullPageUiState]);

  const toggleGroupCollapsed = useCallback(
    (key) => {
      updateFullPageUiState((prev) => ({
        ...prev,
        groupsCollapsed: { ...(prev.groupsCollapsed || {}), [key]: !prev.groupsCollapsed?.[key] },
      }));
    },
    [updateFullPageUiState]
  );

  const setSidebarWidth = useCallback(
    (nextWidth) => {
      const width =
        typeof nextWidth === "number" && Number.isFinite(nextWidth)
          ? Math.min(480, Math.max(240, Math.round(nextWidth)))
          : sidebarWidth;
      updateFullPageUiState((prev) => ({ ...prev, sidebarWidth: width }));
    },
    [sidebarWidth, updateFullPageUiState]
  );

  useEffect(() => {
    return () => {
      if (sidebarResizeRafRef.current) {
        cancelAnimationFrame(sidebarResizeRafRef.current);
        sidebarResizeRafRef.current = null;
      }
      isResizingSidebarRef.current = false;
    };
  }, []);

  const handleSidebarResizerPointerDown = useCallback(
    (event) => {
      if (!isFullPage) return;
      if (sidebarCollapsed) return;
      if (!event || typeof event.clientX !== "number") return;
      isResizingSidebarRef.current = true;
      sidebarResizeStartRef.current = { x: event.clientX, width: sidebarWidth };
      try {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      } catch (_) {
        // ignore
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [isFullPage, sidebarCollapsed, sidebarWidth]
  );

  const handleSidebarResizerPointerMove = useCallback(
    (event) => {
      if (!isResizingSidebarRef.current) return;
      if (!event || typeof event.clientX !== "number") return;
      const { x, width } = sidebarResizeStartRef.current || { x: 0, width: sidebarWidth };
      const delta = event.clientX - x;
      const next = width + delta;
      if (sidebarResizeRafRef.current) return;
      sidebarResizeRafRef.current = requestAnimationFrame(() => {
        sidebarResizeRafRef.current = null;
        setSidebarWidth(next);
      });
      event.preventDefault();
    },
    [setSidebarWidth, sidebarWidth]
  );

  const handleSidebarResizerPointerUp = useCallback((event) => {
    if (!isResizingSidebarRef.current) return;
    isResizingSidebarRef.current = false;
    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch (_) {
      // ignore
    }
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const getDashViewState = useCallback(
    () => ({ filters, grouping, query }),
    [filters, grouping, query]
  );

  const notifyToast = useCallback(
    (message) => {
      if (!message) return;
      try {
        iziToast.show({
          theme: "light",
          color: "black",
          class: "betterTasks bt-toast-strong-icon",
          position: "center",
          message: String(message),
          timeout: 2400,
          close: true,
          closeOnEscape: true,
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
        });
      } catch (_) {
        // best effort
      }
    },
    []
  );

  const persistViewsStore = useCallback(
    (nextStore) => {
      if (!controller?.saveViewsStore) {
        setViewsStore(nextStore);
        return nextStore;
      }
      const saved = controller.saveViewsStore(nextStore);
      setViewsStore(saved);
      controller?.notifyDashViewsStoreChanged?.(saved);
      return saved;
    },
    [controller]
  );

  const persistDefaultState = useCallback(
    (dashState) => {
      if (!controller?.saveViewsStore) return;
      const latest = controller?.loadViewsStore ? controller.loadViewsStore() : viewsStore;
      const next = setLastDefaultState(latest, dashState);
      const saved = controller.saveViewsStore(next);
      setViewsStore(saved);
      controller?.notifyDashViewsStoreChanged?.(saved);
    },
    [controller, viewsStore]
  );

  const applyDashViewState = useCallback((state) => {
    if (!state || typeof state !== "object") return;
    dispatchFilters({ type: "hydrate", value: state.filters });
    setGrouping(typeof state.grouping === "string" ? state.grouping : "time");
    setQuery(typeof state.query === "string" ? state.query : "");
  }, []);

  const applyDefaultView = useCallback(() => {
    const storeNow = controller?.loadViewsStore ? controller.loadViewsStore() : viewsStore;
    const savedStore = persistViewsStore(setActiveView(storeNow, null));
    const defaultState = savedStore?.lastDefaultState || storeNow?.lastDefaultState || null;
    if (defaultState) applyDashViewState(defaultState);
  }, [controller, viewsStore, persistViewsStore, applyDashViewState]);

  const applySavedViewById = useCallback(
    (id) => {
      const view = (viewsStore?.views || []).find((v) => v.id === id);
      if (!view) return false;
      if (!viewsStore?.activeViewId) {
        persistDefaultState(getDashViewState());
      }
      applyDashViewState(view.state);
      persistViewsStore(setActiveView(viewsStore, id));
      return true;
    },
    [viewsStore, persistDefaultState, getDashViewState, applyDashViewState, persistViewsStore]
  );

  const startReview = useCallback((type = "weekly", options = {}) => {
    const ids = REVIEW_TYPE_PRESETS[type] || DASHBOARD_REVIEW_PRESET_IDS;
    const safeIds = Array.isArray(ids) ? ids : [];
    const existing = new Set((viewsStore?.views || []).map((v) => v.id));
    const settingsType = type === "project-sweep" ? "monthly" : type;
    const effective = safeIds.filter((id) => existing.has(id) && reviewStepSettings[`${settingsType}:${id}`] !== false);
    if (!effective.length) {
      notifyToast(ui.reviewNoPresetsToast);
      return;
    }
    preReviewActiveViewIdRef.current = viewsStore?.activeViewId || null;
    setReviewState({ active: true, type, index: 0, projectFilter: options.projectFilter || null });
    setReviewMenuOpen(false);
    applySavedViewById(effective[0]);
    if (options.projectFilter) {
      setTimeout(() => dispatchFilters({ type: "setText", section: "projectText", value: options.projectFilter }), 50);
    }
  }, [
    REVIEW_TYPE_PRESETS,
    reviewStepSettings,
    notifyToast,
    ui.reviewNoPresetsToast,
    viewsStore,
    applySavedViewById,
    dispatchFilters,
  ]);

  const exitReview = useCallback(() => {
    const priorId = preReviewActiveViewIdRef.current;
    preReviewActiveViewIdRef.current = null;
    setReviewState({ active: false, type: "weekly", index: 0, projectFilter: null });
    setReviewMenuOpen(false);
    if (priorId) {
      applySavedViewById(priorId);
      return;
    }
    applyDefaultView();
  }, [applyDefaultView, applySavedViewById]);

  const goReviewNext = useCallback(() => {
    if (!reviewState.active) return;
    const max = effectiveReviewIds.length - 1;
    if (reviewState.index >= max) return;
    const nextIndex = reviewState.index + 1;
    setReviewState((prev) => ({ ...prev, index: nextIndex }));
    const id = effectiveReviewIds[nextIndex];
    if (id) {
      applySavedViewById(id);
      if (reviewState.projectFilter) {
        setTimeout(() => dispatchFilters({ type: "setText", section: "projectText", value: reviewState.projectFilter }), 50);
      }
    }
  }, [reviewState.active, reviewState.index, reviewState.projectFilter, effectiveReviewIds, applySavedViewById, dispatchFilters]);

  const goReviewBack = useCallback(() => {
    if (!reviewState.active) return;
    if (reviewState.index <= 0) return;
    const nextIndex = reviewState.index - 1;
    setReviewState((prev) => ({ ...prev, index: nextIndex }));
    const id = effectiveReviewIds[nextIndex];
    if (id) {
      applySavedViewById(id);
      if (reviewState.projectFilter) {
        setTimeout(() => dispatchFilters({ type: "setText", section: "projectText", value: reviewState.projectFilter }), 50);
      }
    }
  }, [reviewState.active, reviewState.index, reviewState.projectFilter, effectiveReviewIds, applySavedViewById, dispatchFilters]);

  const handleViewSelectChange = useCallback(
    (e) => {
      if (reviewState.active) {
        setReviewState({ active: false, type: "weekly", index: 0, projectFilter: null });
        preReviewActiveViewIdRef.current = null;
      }
      const id = e?.target?.value || null;
      if (!id) {
        applyDefaultView();
        return;
      }
      applySavedViewById(id);
    },
    [reviewState.active, applyDefaultView, applySavedViewById]
  );

  const handleSaveViewAs = useCallback(async () => {
    if (!controller?.promptValue) return;
    const name = await controller.promptValue({
      title: "Better Tasks",
      message: ui.viewsSaveAsMessage,
      placeholder: ui.viewsNamePlaceholder,
      initial: "",
    });
    if (!name) return;
    persistViewsStore(createView(viewsStore, name, getDashViewState()));
  }, [controller, viewsStore, getDashViewState, persistViewsStore, ui.viewsSaveAsMessage, ui.viewsNamePlaceholder]);

  const handleUpdateActiveView = useCallback(() => {
    if (!activeView?.id) return;
    const confirmText =
      typeof ui.viewsConfirmOverwrite === "function"
        ? ui.viewsConfirmOverwrite(activeView.name)
        : `Overwrite view "${activeView.name}"?`;
    const ok = typeof window !== "undefined" ? window.confirm(confirmText) : true;
    if (!ok) return;
    persistViewsStore(updateView(viewsStore, activeView.id, getDashViewState()));
  }, [activeView, viewsStore, getDashViewState, persistViewsStore, ui.viewsConfirmOverwrite]);

  const handleRenameActiveView = useCallback(async () => {
    if (!activeView?.id || !controller?.promptValue) return;
    const name = await controller.promptValue({
      title: "Better Tasks",
      message: ui.viewsRenameMessage,
      placeholder: ui.viewsNamePlaceholder,
      initial: activeView.name || "",
    });
    if (!name) return;
    persistViewsStore(renameView(viewsStore, activeView.id, name));
  }, [controller, activeView, viewsStore, persistViewsStore, ui.viewsRenameMessage, ui.viewsNamePlaceholder]);

  const handleDeleteActiveView = useCallback(() => {
    if (!activeView?.id) return;
    const confirmText =
      typeof ui.viewsConfirmDelete === "function"
        ? ui.viewsConfirmDelete(activeView.name)
        : `Delete view "${activeView.name}"?`;
    const ok = typeof window !== "undefined" ? window.confirm(confirmText) : true;
    if (!ok) return;
    persistViewsStore(deleteView(viewsStore, activeView.id));
  }, [activeView, viewsStore, persistViewsStore, ui.viewsConfirmDelete]);

  const isActiveViewDirty = useMemo(() => {
    if (!activeView?.id) return false;
    try {
      const current = normalizeDashViewStateForCompare({ filters, grouping, query });
      const saved = normalizeDashViewStateForCompare(activeView.state || {});
      return JSON.stringify(current) !== JSON.stringify(saved);
    } catch (_) {
      return true;
    }
  }, [activeView, filters, grouping, query]);

  const viewMenuActions = useMemo(() => {
    if (!activeView?.id) return [];
    return [
      { key: "rename", label: ui.viewsRename, handler: () => handleRenameActiveView() },
      { key: "delete", label: ui.viewsDelete, danger: true, handler: () => handleDeleteActiveView() },
    ];
  }, [activeView, handleRenameActiveView, handleDeleteActiveView, ui.viewsRename, ui.viewsDelete]);

  const headerRef = useCallback(
    (node) => {
      if (typeof onHeaderReady === "function") {
        onHeaderReady(node);
      }
    },
    [onHeaderReady]
  );

  function FullPageFilterGroup({ groupKey, title, children }) {
    const isCollapsed = !!groupsCollapsed?.[groupKey];
    return (
      <section className="bt-filter-group" data-group={groupKey}>
        <button
          type="button"
          className="bt-filter-group__header"
          onClick={() => toggleGroupCollapsed(groupKey)}
          aria-expanded={!isCollapsed}
        >
          <span className="bt-filter-group__title">{title}</span>
          <span className="bt-filter-group__caret" aria-hidden="true">
            {isCollapsed ? "▸" : "▾"}
          </span>
        </button>
        {!isCollapsed ? <div className="bt-filter-group__body">{children}</div> : null}
      </section>
    );
  }

  const showFullPageSidebar = isMobileLayout ? sidebarOpen : !sidebarCollapsed;
  const sidebarStyle = isMobileLayout ? undefined : { width: `${sidebarWidth}px` };
  const handleSidebarTouchStart = (event) => {
    if (!isMobileLayout) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    sidebarSwipeRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleSidebarTouchEnd = (event) => {
    if (!isMobileLayout || !sidebarSwipeRef.current) return;
    const touch = event.changedTouches?.[0];
    const start = sidebarSwipeRef.current;
    sidebarSwipeRef.current = null;
    if (!touch || !start) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (deltaX < -60 && Math.abs(deltaY) < 80) {
      setSidebarOpen(false);
    }
  };
  const fullPageFiltersSidebar = showFullPageSidebar ? (
    <aside
      className={`bt-dashboard__sidebar${sidebarOpen ? " bt-dashboard__sidebar--open" : ""}`}
      aria-label={ui.filtersLabel}
      style={sidebarStyle}
      onTouchStart={isMobileLayout ? handleSidebarTouchStart : undefined}
      onTouchEnd={isMobileLayout ? handleSidebarTouchEnd : undefined}
    >
      <div className="bt-sidebar__header">
        <span className="bt-sidebar__title">{ui.filtersLabel}</span>
        {isMobileLayout ? (
          <button
            type="button"
            className="bt-sidebar__close"
            onClick={() => setSidebarOpen(false)}
            aria-label={ui.close}
          >
            ✕
          </button>
        ) : null}
      </div>

      <FullPageFilterGroup groupKey="status" title={ui.filtersGroups.status}>
        <FilterChips
          sectionKey="Completion"
          label={filterSectionLabels["Completion"] || "Completion"}
          chips={filterDefs["Completion"]}
          activeValues={filters["Completion"]}
          onToggle={handleFilterToggle}
        />
        {completionOnlyIsCompleted ? (
          <label className="bt-filter-text">
            <span>{ui.completedWithinLabel}</span>
            <select
              value={filters.completedRange || "any"}
              onChange={(e) =>
                dispatchFilters({
                  type: "setText",
                  section: "completedRange",
                  value: e.target.value,
                })
              }
            >
              <option value="any">{ui.completedWithinAny}</option>
              <option value="7d">{ui.completedWithin7d}</option>
              <option value="30d">{ui.completedWithin30d}</option>
              <option value="90d">{ui.completedWithin90d}</option>
            </select>
          </label>
        ) : null}
        <FilterChips
          sectionKey="Recurrence"
          label={filterSectionLabels["Recurrence"] || "Recurrence"}
          chips={filterDefs["Recurrence"]}
          activeValues={filters["Recurrence"]}
          onToggle={handleFilterToggle}
        />
        <FilterChips
          sectionKey="Blocked"
          label={filterSectionLabels["Blocked"] || "Blocked"}
          chips={filterDefs["Blocked"]}
          activeValues={filters["Blocked"]}
          onToggle={handleFilterToggle}
        />
        <FilterChips
          sectionKey="Stalled"
          label={filterSectionLabels["Stalled"] || "Stalled"}
          chips={filterDefs["Stalled"]}
          activeValues={filters["Stalled"]}
          onToggle={handleFilterToggle}
        />
      </FullPageFilterGroup>

      <FullPageFilterGroup groupKey="dates" title={ui.filtersGroups.dates}>
        <FilterChips
          sectionKey="Start"
          label={filterSectionLabels["Start"] || "Start"}
          chips={filterDefs["Start"]}
          activeValues={filters["Start"]}
          onToggle={handleFilterToggle}
        />
        <FilterChips
          sectionKey="Defer"
          label={filterSectionLabels["Defer"] || "Defer"}
          chips={filterDefs["Defer"]}
          activeValues={filters["Defer"]}
          onToggle={handleFilterToggle}
        />
        <FilterChips
          sectionKey="Due"
          label={filterSectionLabels["Due"] || "Due"}
          chips={filterDefs["Due"]}
          activeValues={filters["Due"]}
          onToggle={handleFilterToggle}
        />
        {dueIncludesUpcomingMemo ? (
          <label className="bt-filter-text">
            <span>{ui.upcomingWithinLabel}</span>
            <select
              value={filters.upcomingRange || "any"}
              onChange={(e) =>
                dispatchFilters({
                  type: "setText",
                  section: "upcomingRange",
                  value: e.target.value,
                })
              }
            >
              <option value="any">{ui.upcomingWithinAny}</option>
              <option value="7d">{ui.upcomingWithin7d}</option>
              <option value="30d">{ui.upcomingWithin30d}</option>
              <option value="90d">{ui.upcomingWithin90d}</option>
            </select>
          </label>
        ) : null}
      </FullPageFilterGroup>

      <FullPageFilterGroup groupKey="gtd" title={ui.filtersGroups.gtd}>
        <FilterChips
          sectionKey="GTD"
          label={ui.tagsLabel}
          chips={filterDefs["GTD"]}
          activeValues={filters["GTD"]}
          onToggle={handleFilterToggle}
        />
        <label className="bt-filter-text">
          <span>{ui.projectFilterLabel}</span>
          <span className="bt-project-filter-row">
            <select value={filters.projectText || ""} onChange={handleProjectFilterChange}>
              <option value="">{ui.projectFilterAny || ui.projectFilterPlaceholder || "All projects"}</option>
              {visibleProjectOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}{showArchivedProjects && archivedProjectNames.has(opt) ? ui.projectArchivedSuffix : ""}
                </option>
              ))}
              {filters.projectText && !visibleProjectOptions.includes(filters.projectText) ? (
                <option value={filters.projectText}>{filters.projectText}</option>
              ) : null}
            </select>
            {filters.projectText ? (
              <button
                type="button"
                className="bt-archive-project-btn"
                title={archivedProjectNames.has(filters.projectText) ? ui.unarchiveProject : ui.archiveProject}
                onClick={() => {
                  if (archivedProjectNames.has(filters.projectText)) {
                    controller?.unarchiveProject?.(filters.projectText);
                  } else {
                    controller?.archiveProject?.(filters.projectText);
                  }
                }}
              >
                {archivedProjectNames.has(filters.projectText) ? "\u{1F4E4}" : "\u{1F4E5}"}
              </button>
            ) : null}
          </span>
          {archivedProjectNames.size > 0 ? (
            <label className="bt-show-archived-toggle">
              <input
                type="checkbox"
                checked={showArchivedProjects}
                onChange={(e) => setShowArchivedProjects(e.target.checked)}
              />
              <span>{ui.showArchivedProjects}</span>
            </label>
          ) : null}
        </label>
        <label className="bt-filter-text">
          <span>{ui.waitingFilterLabel}</span>
          <span className="bt-project-filter-row">
            <select value={filters.waitingText || ""} onChange={handleWaitingFilterChange}>
              <option value="">{ui.waitingFilterAny || ui.waitingFilterPlaceholder || "All waiting-for"}</option>
              {visibleWaitingOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}{showArchivedWaiting && archivedWaitingNames.has(opt) ? ui.waitingArchivedSuffix : ""}
                </option>
              ))}
              {filters.waitingText && !visibleWaitingOptions.includes(filters.waitingText) ? (
                <option value={filters.waitingText}>{filters.waitingText}</option>
              ) : null}
            </select>
            {filters.waitingText ? (
              <button
                type="button"
                className="bt-archive-project-btn"
                title={archivedWaitingNames.has(filters.waitingText) ? ui.unarchiveWaiting : ui.archiveWaiting}
                onClick={() => {
                  if (archivedWaitingNames.has(filters.waitingText)) {
                    controller?.unarchiveWaiting?.(filters.waitingText);
                  } else {
                    controller?.archiveWaiting?.(filters.waitingText);
                  }
                }}
              >
                {archivedWaitingNames.has(filters.waitingText) ? "\u{1F4E4}" : "\u{1F4E5}"}
              </button>
            ) : null}
          </span>
          {archivedWaitingNames.size > 0 ? (
            <label className="bt-show-archived-toggle">
              <input
                type="checkbox"
                checked={showArchivedWaiting}
                onChange={(e) => setShowArchivedWaiting(e.target.checked)}
              />
              <span>{ui.showArchivedWaiting}</span>
            </label>
          ) : null}
        </label>
        <label className="bt-filter-text">
          <span>{ui.contextFilterLabel}</span>
          <span className="bt-project-filter-row">
            <select value={filters.contextText || ""} onChange={handleContextFilterChange}>
              <option value="">{ui.contextFilterAny || "All contexts"}</option>
              {visibleContextOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}{showArchivedContexts && archivedContextNames.has(opt) ? ui.contextArchivedSuffix : ""}
                </option>
              ))}
              {filters.contextText && !visibleContextOptions.includes(filters.contextText) ? (
                <option value={filters.contextText}>{filters.contextText}</option>
              ) : null}
            </select>
            {filters.contextText ? (
              <button
                type="button"
                className="bt-archive-project-btn"
                title={archivedContextNames.has(filters.contextText) ? ui.unarchiveContext : ui.archiveContext}
                onClick={() => {
                  if (archivedContextNames.has(filters.contextText)) {
                    controller?.unarchiveContext?.(filters.contextText);
                  } else {
                    controller?.archiveContext?.(filters.contextText);
                  }
                }}
              >
                {archivedContextNames.has(filters.contextText) ? "\u{1F4E4}" : "\u{1F4E5}"}
              </button>
            ) : null}
          </span>
          {archivedContextNames.size > 0 ? (
            <label className="bt-show-archived-toggle">
              <input
                type="checkbox"
                checked={showArchivedContexts}
                onChange={(e) => setShowArchivedContexts(e.target.checked)}
              />
              <span>{ui.showArchivedContexts}</span>
            </label>
          ) : null}
        </label>
      </FullPageFilterGroup>

      <FullPageFilterGroup groupKey="meta" title={ui.filtersGroups.meta}>
        <FilterChips
          sectionKey="Priority"
          label={filterSectionLabels["Priority"] || "Priority"}
          chips={filterDefs["Priority"]}
          activeValues={filters["Priority"]}
          onToggle={handleFilterToggle}
        />
        <FilterChips
          sectionKey="Energy"
          label={filterSectionLabels["Energy"] || "Energy"}
          chips={filterDefs["Energy"]}
          activeValues={filters["Energy"]}
          onToggle={handleFilterToggle}
        />
      </FullPageFilterGroup>
    </aside>
  ) : null;

  if (isFullPage) {
    return (
      <div className={rootClasses}>
        <header className="bt-dashboard__header" ref={headerRef}>
          <div>
            <h2>{ui.headerTitle}</h2>
            <p>{ui.headerSubtitle}</p>
          </div>
          <div className="bt-dashboard__header-actions">
            <button
              type="button"
              className="bp3-button bp3-small bt-focus-mode-btn"
              onClick={handleEnterFocusMode}
              disabled={!filteredTasks || filteredTasks.length === 0}
              title={ui.focusMode?.enterTooltip || "Enter distraction-free Focus Mode"}
            >
              {ui.focusMode?.enterButton || "Focus"}
            </button>
            <button type="button" className="bp3-button bp3-small" onClick={() => setShowAnalytics(true)}>
              {tPath(["analytics", "title"], lang) || "Analytics"}
            </button>
            {!isMobileLayout ? (
              <button type="button" className="bp3-button bp3-small" onClick={handleToggleFullPage}>
                {snapshot?.isFullPage ? ui.fullPageExit : ui.fullPageEnter}
              </button>
            ) : null}
            <button type="button" className="bp3-button bp3-small" onClick={handleRefresh}>
              {ui.refresh}
            </button>
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={onRequestClose}
              aria-label={ui.close}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="bt-dashboard__quick-add">
          <div className="bt-quick-add">
            <input
              type="text"
              className="bt-quick-add__input"
              placeholder={ui.quickAddPlaceholder}
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={handleQuickAddKeyDown}
            />
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <button type="button" className="bp3-button bp3-small" onClick={handleQuickAddSubmit}>
                {ui.quickAddButton}
              </button>
              <button type="button" className="bp3-button bp3-small bp3-minimal" title={ui.templateButton} onClick={async () => { await controller.createFromTemplate?.(); setQuickText(""); }}>
                {ui.templateButton}
              </button>
            </div>
          </div>
        </div>

        <div className="bt-dashboard__toolbar">
          <div className="bt-toolbar__left">
            <span className="bt-filter-row__label">{ui.savedViewsLabel}</span>
            <div className="bp3-select bp3-small bt-views-select">
              <select
                value={viewsStore?.activeViewId || ""}
                onChange={handleViewSelectChange}
                aria-label={ui.savedViewsLabel}
              >
                <option value="">{ui.viewsDefault}</option>
                {sortedViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="bp3-button bp3-small" onClick={handleSaveViewAs}>
              {ui.viewsSaveAs}
            </button>
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={handleUpdateActiveView}
              disabled={!activeView || !isActiveViewDirty}
            >
              {ui.viewsUpdate}
            </button>
            <SimpleActionsMenu actions={viewMenuActions} title={ui.viewsOptions} disabled={!activeView} />
          </div>
          <div className="bt-toolbar__right">
            <div className="bt-review-menu" style={{ position: "relative" }}>
              <button
                type="button"
                className={`bp3-button bp3-small bt-weekly-review-button${
                  reviewState.active ? " bt-weekly-review-button--inactive" : ""
                }`}
                onClick={() => startReview("weekly")}
                disabled={reviewState.active}
              >
                {ui.weeklyReviewButton || ui.reviewButton}
              </button>
              <button
                type="button"
                className="bp3-button bp3-small bt-review-menu__caret"
                onClick={() => setReviewMenuOpen((p) => !p)}
                disabled={reviewState.active}
                aria-label={ui.reviewMenuAriaLabel}
              >
                ▾
              </button>
              {reviewMenuOpen && (
                <div className="bt-review-menu__popover">
                  <button onClick={() => startReview("daily")}>{ui.dailyReviewButton}</button>
                  <button onClick={() => startReview("weekly")}>{ui.weeklyReviewButton || ui.reviewButton}</button>
                  <button onClick={() => startReview("monthly")}>{ui.monthlyReviewButton}</button>
                  <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--bt-border-subtle, rgba(0,0,0,0.1))" }} />
                  <div style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 600, color: "var(--bt-muted)", textTransform: "uppercase" }}>
                    {ui.projectSweepButton}
                  </div>
                  <select
                    style={{ width: "calc(100% - 16px)", margin: "2px 8px 4px", fontSize: "12px" }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) startReview("project-sweep", { projectFilter: e.target.value });
                    }}
                  >
                    <option value="">{ui.reviewSelectProject}</option>
                    {visibleProjectOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bt-dashboard__main">
          {isMobileLayout && sidebarOpen ? (
            <div
              className="bt-dashboard__sidebar-backdrop"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setSidebarOpen(false);
              }}
              aria-hidden="true"
            />
          ) : null}
          {fullPageFiltersSidebar}
          {!isMobileLayout && !sidebarCollapsed ? (
            <div
              className="bt-dashboard__sidebar-resizer"
              role="separator"
              aria-orientation="vertical"
              onPointerDown={handleSidebarResizerPointerDown}
              onPointerMove={handleSidebarResizerPointerMove}
              onPointerUp={handleSidebarResizerPointerUp}
              onPointerCancel={handleSidebarResizerPointerUp}
            />
          ) : null}
          <div className="bt-dashboard__mainpane">
            <div className="bt-dashboard__controls">
              <div className="bt-search-row">
                <input
                  type="text"
                  className="bt-search"
                  placeholder={ui.searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="bt-grouping">
                  <span className="bt-grouping__label">{ui.groupByLabel}</span>
                  {ui.groupingOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`bt-chip${grouping === option.value ? " bt-chip--active" : ""}`}
                      onClick={() => setGrouping(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="bt-chip bt-chip--filters-toggle"
                    onClick={() => {
                      if (isMobileLayout) {
                        setSidebarOpen((prev) => !prev);
                        return;
                      }
                      toggleSidebarCollapsed();
                    }}
                    aria-label={ui.filtersLabel}
                    aria-expanded={isMobileLayout ? sidebarOpen : !sidebarCollapsed}
                  >
                    {isMobileLayout ? ui.filtersLabel : sidebarCollapsed ? ui.filtersShow : ui.filtersHide}
                  </button>
                  <span className="bt-toolbar-divider" aria-hidden="true" />
                  <button
                    type="button"
                    className={`bt-chip${selectionMode ? " bt-chip--active" : ""}`}
                    onClick={() => {
                      if (selectionMode) {
                        setSelectionMode(false);
                        setSelectedUids(new Set());
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                    aria-pressed={selectionMode}
                  >
                    {ui.bulk?.select || "Bulk"}
                  </button>
                  {selectionActive ? (
                    <>
                      <button type="button" className="bt-chip" onClick={selectAllVisible}>
                        {ui.bulk?.selectAll || "All"}
                      </button>
                      <button type="button" className="bt-chip" onClick={selectNone}>
                        {ui.bulk?.selectNone || "Clear"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {reviewState.active ? (
              <div className="bt-dashboard__reviewbar">
                <div className="bt-reviewbar__left">
                  <span className="bt-reviewbar__title">
                    {reviewState.type === "daily" ? ui.dailyReviewLabel : reviewState.type === "monthly" ? ui.monthlyReviewLabel : reviewState.type === "project-sweep" ? `${ui.projectSweepLabel} · ${reviewState.projectFilter || ""}` : ui.reviewLabel} · {Math.min(reviewState.index + 1, effectiveReviewIds.length)} {ui.reviewOf}{" "}
                    {effectiveReviewIds.length}
                  </span>
                  {activeReviewView?.name ? <span className="bt-reviewbar__current">{activeReviewView.name}</span> : null}
                </div>
                <div className="bt-reviewbar__right">
                  <button
                    type="button"
                    className="bp3-button bp3-small"
                    onClick={goReviewBack}
                    disabled={reviewState.index <= 0}
                  >
                    {ui.reviewBack}
                  </button>
                  <button
                    type="button"
                    className="bp3-button bp3-small"
                    onClick={goReviewNext}
                    disabled={reviewState.index >= effectiveReviewIds.length - 1}
                  >
                    {ui.reviewNext}
                  </button>
                  <button type="button" className="bp3-button bp3-small" onClick={exitReview}>
                    {ui.reviewExit}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="bt-dashboard__content" ref={parentRef}>
              <div className="bt-virtualizer" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const style = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  };
                  if (row.type === "group") {
                    const expanded = expandedGroups[row.group.id] !== false;
                    const groupTasks = row.group.items || [];
                    const selectedCount = groupTasks.reduce(
                      (acc, task) => (selectedUids.has(task.uid) ? acc + 1 : acc),
                      0
                    );
                    const selectionState = selectedCount === 0
                      ? "none"
                      : selectedCount === groupTasks.length
                        ? "all"
                        : "partial";
                    return (
                      <div style={style} key={row.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}>
                        <GroupHeader
                          title={row.group.title}
                          count={row.group.items.length}
                          isExpanded={expanded}
                          onToggle={() =>
                            setExpandedGroups((prev) => ({
                              ...prev,
                              [row.group.id]: !expanded,
                            }))
                          }
                          selectionActive={selectionActive}
                          selectionState={selectionState}
                          onToggleSelection={() => selectGroup(groupTasks)}
                          strings={ui}
                        />
                      </div>
                    );
                  }
                  if (row.type === "subtask") {
                    return (
                      <div style={style} key={row.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}>
                        <TaskRow
                          task={row.task}
                          controller={controller}
                          strings={ui}
                          isSubtask={true}
                          isFocused={focusedIndex === virtualRow.index}
                          menuOpenForUid={menuOpenForUid}
                          onMenuOpenHandled={handleMenuOpenHandled}
                          selectionActive={selectionActive}
                          isSelected={selectedUids.has(row.task.uid)}
                          onToggleSelect={handleToggleSelect}
                        />
                      </div>
                    );
                  }
                  return (
                    <div style={style} key={row.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}>
                      <TaskRow
                        task={row.task}
                        controller={controller}
                        strings={ui}
                        hasSubtasks={!!(row.task.subtaskUids?.length)}
                        isExpanded={!!expandedParentTasks[row.task.uid]}
                        onToggleExpand={() =>
                          setExpandedParentTasks((prev) => ({
                            ...prev,
                            [row.task.uid]: !prev[row.task.uid],
                          }))
                        }
                        isFocused={focusedIndex === virtualRow.index}
                          menuOpenForUid={menuOpenForUid}
                          onMenuOpenHandled={handleMenuOpenHandled}
                        selectionActive={selectionActive}
                        isSelected={selectedUids.has(row.task.uid)}
                        onToggleSelect={handleToggleSelect}
                      />
                    </div>
                  );
                })}
              </div>
              {!rows.length ? (
                <div className="bt-content-empty">
                  <EmptyState status={snapshot.status} onRefresh={handleRefresh} strings={ui.empty} />
                </div>
              ) : null}
            </div>

            <footer className="bt-dashboard__footer"></footer>
          </div>
        </div>
        <BulkActionBar
          selectedUids={selectedUids}
          tasks={snapshot.tasks}
          controller={controller}
          strings={ui}
          onClearSelection={selectNone}
          onCancel={cancelSelection}
          isMobileLayout={isMobileLayout}
        />
        {seriesViewTask && (
          <SeriesViewPanel
            task={seriesViewTask}
            controller={controller}
            language={language}
            onClose={() => setSeriesViewTask(null)}
          />
        )}
        {showKeyboardHelp && (
          <KeyboardHelpOverlay
            keybindings={{ ...DEFAULT_KEYBINDINGS, ...(controller?.getKeyboardBindings?.() || {}) }}
            onClose={() => setShowKeyboardHelp(false)}
          />
        )}
        {showAnalytics && (
          <AnalyticsPanel controller={controller} language={language} onClose={() => setShowAnalytics(false)} />
        )}
        {focusModeOpen && focusQueue && (
          <FocusModePanel
            queue={focusQueue}
            controller={controller}
            language={language}
            liveSnapshot={snapshot}
            strings={ui.focusMode}
            onExit={handleExitFocusMode}
            onRefreshQueue={handleRefreshFocusQueue}
          />
        )}
      </div>
    );
  }

  return (
    <div className={rootClasses}>
      <header className="bt-dashboard__header" ref={headerRef}>
        <div>
          <h2>{ui.headerTitle}</h2>
          <p>{ui.headerSubtitle}</p>
        </div>
        <div className="bt-dashboard__header-actions">
          <button
            type="button"
            className="bp3-button bp3-small bt-focus-mode-btn"
            onClick={handleEnterFocusMode}
            disabled={!filteredTasks || filteredTasks.length === 0}
            title={ui.focusMode?.enterTooltip || "Enter distraction-free Focus Mode"}
          >
            {ui.focusMode?.enterButton || "Focus"}
          </button>
          <button type="button" className="bp3-button bp3-small" onClick={() => setShowAnalytics(true)}>
            {tPath(["analytics", "title"], lang) || "Analytics"}
          </button>
          {!isMobileLayout ? (
            <button type="button" className="bp3-button bp3-small" onClick={handleToggleFullPage}>
              {snapshot?.isFullPage ? ui.fullPageExit : ui.fullPageEnter}
            </button>
          ) : null}
          <button type="button" className="bp3-button bp3-small" onClick={handleRefresh}>
            {ui.refresh}
          </button>
          <button
            type="button"
            className="bp3-button bp3-small"
            onClick={onRequestClose}
            aria-label={ui.close}
          >
            ✕
          </button>
        </div>
      </header>

	      <div className="bt-dashboard__toolbar">
	        <div className="bt-toolbar__left">
	          <span className="bt-filter-row__label">{ui.savedViewsLabel}</span>
	          <div className="bp3-select bp3-small bt-views-select">
            <select
              value={viewsStore?.activeViewId || ""}
              onChange={handleViewSelectChange}
              aria-label={ui.savedViewsLabel}
            >
              <option value="">{ui.viewsDefault}</option>
              {sortedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="bp3-button bp3-small" onClick={handleSaveViewAs}>
            {ui.viewsSaveAs}
          </button>
          <button
            type="button"
            className="bp3-button bp3-small"
            onClick={handleUpdateActiveView}
            disabled={!activeView || !isActiveViewDirty}
          >
            {ui.viewsUpdate}
          </button>
	          <SimpleActionsMenu
	            actions={viewMenuActions}
	            title={ui.viewsOptions}
	            disabled={!activeView}
	          />
	        </div>
	        <div className="bt-toolbar__right">
            <div className="bt-review-menu" style={{ position: "relative" }}>
              <button
                type="button"
                className={`bp3-button bp3-small bt-weekly-review-button${
                  reviewState.active ? " bt-weekly-review-button--inactive" : ""
                }`}
                onClick={() => startReview("weekly")}
                disabled={reviewState.active}
              >
                {ui.weeklyReviewButton || ui.reviewButton}
              </button>
              <button
                type="button"
                className="bp3-button bp3-small bt-review-menu__caret"
                onClick={() => setReviewMenuOpen((p) => !p)}
                disabled={reviewState.active}
                aria-label={ui.reviewMenuAriaLabel}
              >
                ▾
              </button>
              {reviewMenuOpen && (
                <div className="bt-review-menu__popover">
                  <button onClick={() => startReview("daily")}>{ui.dailyReviewButton}</button>
                  <button onClick={() => startReview("weekly")}>{ui.weeklyReviewButton || ui.reviewButton}</button>
                  <button onClick={() => startReview("monthly")}>{ui.monthlyReviewButton}</button>
                  <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--bt-border-subtle, rgba(0,0,0,0.1))" }} />
                  <div style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 600, color: "var(--bt-muted)", textTransform: "uppercase" }}>
                    {ui.projectSweepButton}
                  </div>
                  <select
                    style={{ width: "calc(100% - 16px)", margin: "2px 8px 4px", fontSize: "12px" }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) startReview("project-sweep", { projectFilter: e.target.value });
                    }}
                  >
                    <option value="">{ui.reviewSelectProject}</option>
                    {visibleProjectOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
	        </div>
	      </div>

      <div className="bt-dashboard__quick-add">
        <div className="bt-quick-add">
          <input
            type="text"
            className="bt-quick-add__input"
            placeholder={ui.quickAddPlaceholder}
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={handleQuickAddKeyDown}
          />
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <button type="button" className="bp3-button bp3-small" onClick={handleQuickAddSubmit}>
              {ui.quickAddButton}
            </button>
            <button type="button" className="bp3-button bp3-small bp3-minimal" title={ui.templateButton} onClick={async () => { await controller.createFromTemplate?.(); setQuickText(""); }}>
              {ui.templateButton}
            </button>
          </div>
        </div>
      </div>

      <div className="bt-dashboard__controls">
        <div className="bt-search-row">
          <input
            type="text"
            className="bt-search"
            placeholder={ui.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="bt-grouping">
            {!selectionActive && (
              <>
                <span className="bt-grouping__label">{ui.groupByLabel}</span>
                {ui.groupingOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`bt-chip${grouping === option.value ? " bt-chip--active" : ""}`}
                    onClick={() => setGrouping(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </>
            )}
            <button
              type="button"
              className={`bt-chip${filtersOpen ? " bt-chip--active" : ""}`}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label={ui.filtersLabel}
            >
              <span className="bp3-icon bp3-icon-filter" aria-hidden="true" />
            </button>
            <span className="bt-toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className={`bt-chip${selectionMode ? " bt-chip--active" : ""}`}
              onClick={() => {
                if (selectionMode) {
                  setSelectionMode(false);
                  setSelectedUids(new Set());
                } else {
                  setSelectionMode(true);
                }
              }}
              aria-pressed={selectionMode}
            >
              {ui.bulk?.select || "Bulk"}
            </button>
            {selectionActive ? (
              <>
                <button type="button" className="bt-chip" onClick={selectAllVisible}>
                  {ui.bulk?.selectAll || "All"}
                </button>
                <button type="button" className="bt-chip" onClick={selectNone}>
                  {ui.bulk?.selectNone || "Clear"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {filtersOpen ? (
        <div className="bt-dashboard__filters">
          <div className="bt-filters-grid-cols">
            <div className="bt-filters-col">
              {FILTER_SECTIONS_LEFT.map((sectionKey) => (
                <FilterChips
                  key={sectionKey}
                  sectionKey={sectionKey}
                  label={filterSectionLabels[sectionKey] || sectionKey}
                  chips={filterDefs[sectionKey]}
                  activeValues={filters[sectionKey]}
                  onToggle={handleFilterToggle}
                />
              ))}
            </div>
            <div className="bt-filters-col">
              {FILTER_SECTIONS_RIGHT.map((sectionKey) => (
                <FilterChips
                  key={sectionKey}
                  sectionKey={sectionKey}
                  label={filterSectionLabels[sectionKey] || sectionKey}
                  chips={filterDefs[sectionKey]}
                  activeValues={filters[sectionKey]}
                  onToggle={handleFilterToggle}
                />
              ))}
            </div>
            <div className="bt-filters-col bt-filters-col--full">
              <FilterChips
                key="Due"
                sectionKey="Due"
                label={filterSectionLabels["Due"] || "Due"}
                chips={filterDefs["Due"]}
                activeValues={filters["Due"]}
                onToggle={handleFilterToggle}
              />
              <FilterChips
                key="GTD"
                sectionKey="GTD"
                label={filterSectionLabels["GTD"] || "GTD"}
                chips={filterDefs["GTD"]}
                activeValues={filters["GTD"]}
                onToggle={handleFilterToggle}
              />
              <FilterChips
                key="Blocked"
                sectionKey="Blocked"
                label={filterSectionLabels["Blocked"] || "Blocked"}
                chips={filterDefs["Blocked"]}
                activeValues={filters["Blocked"]}
                onToggle={handleFilterToggle}
              />
              <FilterChips
                key="Stalled"
                sectionKey="Stalled"
                label={filterSectionLabels["Stalled"] || "Stalled"}
                chips={filterDefs["Stalled"]}
                activeValues={filters["Stalled"]}
                onToggle={handleFilterToggle}
              />
              <div className="bt-filter-text-row">
                <label className="bt-filter-text">
                  <span>{ui.projectFilterLabel}</span>
                  <span className="bt-project-filter-row">
                    <select value={filters.projectText || ""} onChange={handleProjectFilterChange}>
                      <option value="">
                        {ui.projectFilterAny || ui.projectFilterPlaceholder || "All projects"}
                      </option>
                      {visibleProjectOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}{showArchivedProjects && archivedProjectNames.has(opt) ? ui.projectArchivedSuffix : ""}
                        </option>
                      ))}
                      {filters.projectText &&
                      !visibleProjectOptions.includes(filters.projectText) ? (
                        <option value={filters.projectText}>{filters.projectText}</option>
                      ) : null}
                    </select>
                    {filters.projectText ? (
                      <button
                        type="button"
                        className="bt-archive-project-btn"
                        title={archivedProjectNames.has(filters.projectText) ? ui.unarchiveProject : ui.archiveProject}
                        onClick={() => {
                          if (archivedProjectNames.has(filters.projectText)) {
                            controller?.unarchiveProject?.(filters.projectText);
                          } else {
                            controller?.archiveProject?.(filters.projectText);
                          }
                        }}
                      >
                        {archivedProjectNames.has(filters.projectText) ? "\u{1F4E4}" : "\u{1F4E5}"}
                      </button>
                    ) : null}
                  </span>
                  {archivedProjectNames.size > 0 ? (
                    <label className="bt-show-archived-toggle">
                      <input
                        type="checkbox"
                        checked={showArchivedProjects}
                        onChange={(e) => setShowArchivedProjects(e.target.checked)}
                      />
                      <span>{ui.showArchivedProjects}</span>
                    </label>
                  ) : null}
                </label>
                <label className="bt-filter-text">
                  <span>{ui.waitingFilterLabel}</span>
                  <span className="bt-project-filter-row">
                    <select value={filters.waitingText || ""} onChange={handleWaitingFilterChange}>
                      <option value="">
                        {ui.waitingFilterAny || ui.waitingFilterPlaceholder || "All waiting-for"}
                      </option>
                      {visibleWaitingOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}{showArchivedWaiting && archivedWaitingNames.has(opt) ? ui.waitingArchivedSuffix : ""}
                        </option>
                      ))}
                      {filters.waitingText &&
                      !visibleWaitingOptions.includes(filters.waitingText) ? (
                          <option value={filters.waitingText}>{filters.waitingText}</option>
                        ) : null}
                    </select>
                    {filters.waitingText ? (
                      <button
                        type="button"
                        className="bt-archive-project-btn"
                        title={archivedWaitingNames.has(filters.waitingText) ? ui.unarchiveWaiting : ui.archiveWaiting}
                        onClick={() => {
                          if (archivedWaitingNames.has(filters.waitingText)) {
                            controller?.unarchiveWaiting?.(filters.waitingText);
                          } else {
                            controller?.archiveWaiting?.(filters.waitingText);
                          }
                        }}
                      >
                        {archivedWaitingNames.has(filters.waitingText) ? "\u{1F4E4}" : "\u{1F4E5}"}
                      </button>
                    ) : null}
                  </span>
                  {archivedWaitingNames.size > 0 ? (
                    <label className="bt-show-archived-toggle">
                      <input
                        type="checkbox"
                        checked={showArchivedWaiting}
                        onChange={(e) => setShowArchivedWaiting(e.target.checked)}
                      />
                      <span>{ui.showArchivedWaiting}</span>
                    </label>
                  ) : null}
                </label>
                <label className="bt-filter-text">
                  <span>{ui.contextFilterLabel}</span>
                  <span className="bt-project-filter-row">
                    <select value={filters.contextText || ""} onChange={handleContextFilterChange}>
                      <option value="">
                        {ui.contextFilterAny || "All contexts"}
                      </option>
                      {visibleContextOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}{showArchivedContexts && archivedContextNames.has(opt) ? ui.contextArchivedSuffix : ""}
                        </option>
                      ))}
                      {filters.contextText &&
                      !visibleContextOptions.includes(filters.contextText) ? (
                          <option value={filters.contextText}>{filters.contextText}</option>
                      ) : null}
                    </select>
                    {filters.contextText ? (
                      <button
                        type="button"
                        className="bt-archive-project-btn"
                        title={archivedContextNames.has(filters.contextText) ? ui.unarchiveContext : ui.archiveContext}
                        onClick={() => {
                          if (archivedContextNames.has(filters.contextText)) {
                            controller?.unarchiveContext?.(filters.contextText);
                          } else {
                            controller?.archiveContext?.(filters.contextText);
                          }
                        }}
                      >
                        {archivedContextNames.has(filters.contextText) ? "\u{1F4E4}" : "\u{1F4E5}"}
                      </button>
                    ) : null}
                  </span>
                  {archivedContextNames.size > 0 ? (
                    <label className="bt-show-archived-toggle">
                      <input
                        type="checkbox"
                        checked={showArchivedContexts}
                        onChange={(e) => setShowArchivedContexts(e.target.checked)}
                      />
                      <span>{ui.showArchivedContexts}</span>
                    </label>
                  ) : null}
                </label>
        {dueIncludesUpcomingMemo ? (
          <label className="bt-filter-text">
            <span>{ui.upcomingWithinLabel}</span>
            <select
                      value={filters.upcomingRange || "any"}
                      onChange={(e) =>
                        dispatchFilters({
                          type: "setText",
                          section: "upcomingRange",
                          value: e.target.value,
                        })
                      }
                    >
                      <option value="any">{ui.upcomingWithinAny}</option>
                      <option value="7d">{ui.upcomingWithin7d}</option>
                      <option value="30d">{ui.upcomingWithin30d}</option>
                      <option value="90d">{ui.upcomingWithin90d}</option>
                    </select>
                  </label>
                ) : null}
                {completionOnlyIsCompleted ? (
                  <label className="bt-filter-text">
                    <span>{ui.completedWithinLabel}</span>
                    <select
                      value={filters.completedRange || "any"}
                      onChange={(e) =>
                        dispatchFilters({
                          type: "setText",
                          section: "completedRange",
                          value: e.target.value,
                        })
                      }
                    >
                      <option value="any">{ui.completedWithinAny}</option>
                      <option value="7d">{ui.completedWithin7d}</option>
                      <option value="30d">{ui.completedWithin30d}</option>
                      <option value="90d">{ui.completedWithin90d}</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

	      {reviewState.active ? (
	        <div className="bt-dashboard__reviewbar">
	          <div className="bt-reviewbar__left">
	            <span className="bt-reviewbar__title">
	              {reviewState.type === "daily" ? ui.dailyReviewLabel : reviewState.type === "monthly" ? ui.monthlyReviewLabel : reviewState.type === "project-sweep" ? `${ui.projectSweepLabel} · ${reviewState.projectFilter || ""}` : ui.reviewLabel} · {Math.min(reviewState.index + 1, effectiveReviewIds.length)} {ui.reviewOf}{" "}
	              {effectiveReviewIds.length}
	            </span>
	            {activeReviewView?.name ? (
	              <span className="bt-reviewbar__current">{activeReviewView.name}</span>
	            ) : null}
          </div>
          <div className="bt-reviewbar__right">
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={goReviewBack}
              disabled={reviewState.index <= 0}
            >
              {ui.reviewBack}
            </button>
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={goReviewNext}
              disabled={reviewState.index >= effectiveReviewIds.length - 1}
            >
              {ui.reviewNext}
            </button>
            <button type="button" className="bp3-button bp3-small" onClick={exitReview}>
              {ui.reviewExit}
            </button>
          </div>
        </div>
      ) : null}

      <div className="bt-dashboard__content" ref={parentRef}>
        <div
          className="bt-virtualizer"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const style = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            };
            if (row.type === "group") {
              const expanded = expandedGroups[row.group.id] !== false;
              const groupTasks = row.group.items || [];
              const selectedCount = groupTasks.reduce(
                (acc, task) => (selectedUids.has(task.uid) ? acc + 1 : acc),
                0
              );
              const selectionState = selectedCount === 0
                ? "none"
                : selectedCount === groupTasks.length
                  ? "all"
                  : "partial";
              return (
                <div
                  style={style}
                  key={row.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                >
                  <GroupHeader
                    title={row.group.title}
                    count={row.group.items.length}
                    isExpanded={expanded}
                    onToggle={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [row.group.id]: !expanded,
                      }))
                    }
                    selectionActive={selectionActive}
                    selectionState={selectionState}
                    onToggleSelection={() => selectGroup(groupTasks)}
                    strings={ui}
                  />
                </div>
              );
            }
            if (row.type === "subtask") {
              return (
                <div style={style} key={row.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}>
                  <TaskRow
                    task={row.task}
                    controller={controller}
                    strings={ui}
                    isSubtask={true}
                    isFocused={focusedIndex === virtualRow.index}
                          menuOpenForUid={menuOpenForUid}
                          onMenuOpenHandled={handleMenuOpenHandled}
                    selectionActive={selectionActive}
                    isSelected={selectedUids.has(row.task.uid)}
                    onToggleSelect={handleToggleSelect}
                  />
                </div>
              );
            }
            return (
              <div
                style={style}
                key={row.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
              >
                <TaskRow
                  task={row.task}
                  controller={controller}
                  strings={ui}
                  hasSubtasks={!!(row.task.subtaskUids?.length)}
                  isExpanded={!!expandedParentTasks[row.task.uid]}
                  onToggleExpand={() =>
                    setExpandedParentTasks((prev) => ({
                      ...prev,
                      [row.task.uid]: !prev[row.task.uid],
                    }))
                  }
                  isFocused={focusedIndex === virtualRow.index}
                          menuOpenForUid={menuOpenForUid}
                          onMenuOpenHandled={handleMenuOpenHandled}
                  selectionActive={selectionActive}
                  isSelected={selectedUids.has(row.task.uid)}
                  onToggleSelect={handleToggleSelect}
                />
              </div>
            );
          })}
        </div>
        {!rows.length ? (
          <div className="bt-content-empty">
            <EmptyState status={snapshot.status} onRefresh={handleRefresh} strings={ui.empty} />
          </div>
        ) : null}
      </div>

      <footer className="bt-dashboard__footer">

      </footer>
      <BulkActionBar
        selectedUids={selectedUids}
        tasks={snapshot.tasks}
        controller={controller}
        strings={ui}
        onClearSelection={selectNone}
        onCancel={cancelSelection}
        isMobileLayout={isMobileLayout}
      />
      {seriesViewTask && (
        <SeriesViewPanel
          task={seriesViewTask}
          controller={controller}
          language={language}
          onClose={() => setSeriesViewTask(null)}
        />
      )}
      {showKeyboardHelp && (
        <KeyboardHelpOverlay
          keybindings={{ ...DEFAULT_KEYBINDINGS, ...(controller?.getKeyboardBindings?.() || {}) }}
          onClose={() => setShowKeyboardHelp(false)}
        />
      )}
      {showAnalytics && (
        <AnalyticsPanel controller={controller} language={language} onClose={() => setShowAnalytics(false)} />
      )}
      {focusModeOpen && focusQueue && (
        <FocusModePanel
          queue={focusQueue}
          controller={controller}
          language={language}
          liveSnapshot={snapshot}
          strings={ui.focusMode}
          onExit={handleExitFocusMode}
          onRefreshQueue={handleRefreshFocusQueue}
        />
      )}
    </div>
  );
}
