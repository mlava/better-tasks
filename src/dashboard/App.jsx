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
} from "./viewsStore";

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
      range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
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

function useVirtualRows(groups, expandedMap) {
  return useMemo(() => {
    const rows = [];
    for (const group of groups) {
      rows.push({ type: "group", key: `group-${group.id}`, groupId: group.id, group });
      if (expandedMap[group.id] !== false) {
        for (const task of group.items) {
          rows.push({ type: "task", key: `task-${task.uid}`, groupId: group.id, task });
        }
      }
    }
    return rows;
  }, [groups, expandedMap]);
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

function TaskActionsMenu({ task, controller, onOpenChange, strings }) {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (!open) return undefined;
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
        setOpenState(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

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
          {safeActions.map((action) =>
            action.separator ? (
              <div key={action.key} className="bt-task-menu__separator">
                {action.label}
              </div>
            ) : (
              <button
              key={action.key}
              type="button"
              className={`bt-task-menu__item${action.danger ? " bt-task-menu__item--danger" : ""}`}
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
          )
          )}
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

function TaskRow({ task, controller, strings, selectionActive, isSelected, onToggleSelect }) {
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
          {task.title || strings?.untitled || "(Untitled task)"}
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
            <TaskActionsMenu task={task} controller={controller} onOpenChange={handleMenuOpenChange} strings={strings} />
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
  const [viewsStore, setViewsStore] = useState(() => ({ schema: 1, activeViewId: null, views: [] }));
  const [viewsLoaded, setViewsLoaded] = useState(false);
  const [reviewStartRequested, setReviewStartRequested] = useState(false);
  const [reviewState, setReviewState] = useState(() => ({ active: false, index: 0 }));
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
  const effectiveReviewIds = useMemo(() => {
    const ids = Array.isArray(DASHBOARD_REVIEW_PRESET_IDS) ? DASHBOARD_REVIEW_PRESET_IDS : [];
    const existing = new Set((viewsStore?.views || []).map((v) => v.id));
    return ids.filter((id) => existing.has(id) && reviewStepSettings[id] !== false);
  }, [viewsStore, reviewStepSettings]);
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
    }),
    [tt]
  );
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
      contextFilterLabel: tt(["dashboard", "contextFilterLabel"], "Context"),
      contextFilterAny: tt(["dashboard", "contextFilterAny"], "All contexts"),
      waitingFilterLabel: tt(["dashboard", "waitingFilterLabel"], "Waiting for"),
      waitingFilterPlaceholder: tt(["dashboard", "waitingFilterPlaceholder"], "Waiting for"),
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
    }),
    [tt, groupingOptions, groupLabels, metaLabels, taskMenuStrings]
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filteredTasks = useMemo(
    () => applyFilters(snapshot.tasks, filters, query),
    [snapshot.tasks, filters, query]
  );
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

  const rows = useVirtualRows(groups, expandedGroups);
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
    (index) => (rows[index]?.type === "group" ? 40 : 100),
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
      if (req?.type === "start") setReviewStartRequested(true);
    });
    return unsub;
  }, [controller]);

  useEffect(() => {
    if (!reviewStartRequested) return;
    if (!viewsLoaded) return;
    setReviewStartRequested(false);
    startReview();
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
    controller.refreshProjectOptions?.(true);
    controller.refreshWaitingOptions?.(true);
    controller.refreshContextOptions?.(true);
    const unsub = controller.subscribeProjectOptions?.((opts) =>
      setProjectOptions(Array.isArray(opts) ? opts : [])
    );
    const unsubWaiting = controller.subscribeWaitingOptions?.((opts) =>
      setWaitingOptions(Array.isArray(opts) ? opts : [])
    );
    const unsubContext = controller.subscribeContextOptions?.((opts) =>
      setContextOptions(Array.isArray(opts) ? opts : [])
    );
    return () => {
      unsub?.();
      unsubWaiting?.();
      unsubContext?.();
    };
  }, [controller]);

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

  const startReview = useCallback(() => {
    if (!effectiveReviewIds.length) {
      notifyToast(ui.reviewNoPresetsToast);
      return;
    }
    preReviewActiveViewIdRef.current = viewsStore?.activeViewId || null;
    setReviewState({ active: true, index: 0 });
    applySavedViewById(effectiveReviewIds[0]);
  }, [
    effectiveReviewIds,
    notifyToast,
    ui.reviewNoPresetsToast,
    viewsStore?.activeViewId,
    applySavedViewById,
  ]);

  const exitReview = useCallback(() => {
    const priorId = preReviewActiveViewIdRef.current;
    preReviewActiveViewIdRef.current = null;
    setReviewState({ active: false, index: 0 });
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
    if (id) applySavedViewById(id);
  }, [reviewState.active, reviewState.index, effectiveReviewIds, applySavedViewById]);

  const goReviewBack = useCallback(() => {
    if (!reviewState.active) return;
    if (reviewState.index <= 0) return;
    const nextIndex = reviewState.index - 1;
    setReviewState((prev) => ({ ...prev, index: nextIndex }));
    const id = effectiveReviewIds[nextIndex];
    if (id) applySavedViewById(id);
  }, [reviewState.active, reviewState.index, effectiveReviewIds, applySavedViewById]);

  const handleViewSelectChange = useCallback(
    (e) => {
      if (reviewState.active) {
        setReviewState({ active: false, index: 0 });
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
          <select value={filters.projectText || ""} onChange={handleProjectFilterChange}>
            <option value="">{ui.projectFilterAny || ui.projectFilterPlaceholder || "All projects"}</option>
            {projectOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {filters.projectText && !projectOptions.includes(filters.projectText) ? (
              <option value={filters.projectText}>{filters.projectText}</option>
            ) : null}
          </select>
        </label>
        <label className="bt-filter-text">
          <span>{ui.waitingFilterLabel}</span>
          <select value={filters.waitingText || ""} onChange={handleWaitingFilterChange}>
            <option value="">{ui.waitingFilterAny || ui.waitingFilterPlaceholder || "All waiting"}</option>
            {waitingOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {filters.waitingText && !waitingOptions.includes(filters.waitingText) ? (
              <option value={filters.waitingText}>{filters.waitingText}</option>
            ) : null}
          </select>
        </label>
        <label className="bt-filter-text">
          <span>{ui.contextFilterLabel}</span>
          <select value={filters.contextText || ""} onChange={handleContextFilterChange}>
            <option value="">{ui.contextFilterAny || "All contexts"}</option>
            {contextOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {filters.contextText && !contextOptions.includes(filters.contextText) ? (
              <option value={filters.contextText}>{filters.contextText}</option>
            ) : null}
          </select>
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
            <button type="button" className="bp3-button bp3-small" onClick={handleQuickAddSubmit}>
              {ui.quickAddButton}
            </button>
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
            <button
              type="button"
              className={`bp3-button bp3-small bt-weekly-review-button${
                reviewState.active ? " bt-weekly-review-button--inactive" : ""
              }`}
              onClick={startReview}
              disabled={reviewState.active || !effectiveReviewIds.length}
            >
              {ui.reviewButton}
            </button>
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
                    {ui.reviewLabel} · {Math.min(reviewState.index + 1, effectiveReviewIds.length)} {ui.reviewOf}{" "}
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
                  return (
                    <div style={style} key={row.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}>
                      <TaskRow
                        task={row.task}
                        controller={controller}
                        strings={ui}
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
	          <button
	            type="button"
	            className={`bp3-button bp3-small bt-weekly-review-button${
	              reviewState.active ? " bt-weekly-review-button--inactive" : ""
	            }`}
	            onClick={startReview}
	            disabled={reviewState.active || !effectiveReviewIds.length}
	          >
	            {ui.reviewButton}
	          </button>
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
          <button type="button" className="bp3-button bp3-small" onClick={handleQuickAddSubmit}>
            {ui.quickAddButton}
          </button>
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
              <div className="bt-filter-text-row">
                <label className="bt-filter-text">
                  <span>{ui.projectFilterLabel}</span>
                  <select value={filters.projectText || ""} onChange={handleProjectFilterChange}>
                    <option value="">
                      {ui.projectFilterAny || ui.projectFilterPlaceholder || "All projects"}
                    </option>
                    {projectOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {filters.projectText &&
                    !projectOptions.includes(filters.projectText) ? (
                      <option value={filters.projectText}>{filters.projectText}</option>
                    ) : null}
                  </select>
                </label>
                <label className="bt-filter-text">
                  <span>{ui.waitingFilterLabel}</span>
                  <select value={filters.waitingText || ""} onChange={handleWaitingFilterChange}>
                    <option value="">
                      {ui.waitingFilterAny || ui.waitingFilterPlaceholder || "All waiting"}
                    </option>
                    {waitingOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {filters.waitingText &&
                    !waitingOptions.includes(filters.waitingText) ? (
                        <option value={filters.waitingText}>{filters.waitingText}</option>
                      ) : null}
                  </select>
                </label>
                <label className="bt-filter-text">
                  <span>{ui.contextFilterLabel}</span>
                  <select value={filters.contextText || ""} onChange={handleContextFilterChange}>
                    <option value="">
                      {ui.contextFilterAny || "All contexts"}
                    </option>
                    {contextOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {filters.contextText &&
                    !contextOptions.includes(filters.contextText) ? (
                        <option value={filters.contextText}>{filters.contextText}</option>
                    ) : null}
                  </select>
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
	              {ui.reviewLabel} · {Math.min(reviewState.index + 1, effectiveReviewIds.length)} {ui.reviewOf}{" "}
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
    </div>
  );
}
