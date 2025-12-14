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
import { useVirtualizer, measureElement } from "@tanstack/react-virtual";
import { i18n as I18N_MAP } from "../i18n";

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
  Priority: [],
  Energy: [],
  GTD: [],
  projectText: "",
  waitingText: "",
  contextText: "",
};

const FILTER_STORAGE_KEY = "betterTasks.dashboard.filters";

function loadSavedFilters(defaults) {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    return { ...defaults, ...parsed };
  } catch (err) {
    console.warn("[BetterTasks] failed to load dashboard filters", err);
    return { ...defaults };
  }
}

function saveFilters(filters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters || {}));
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
  const completionFilter = new Set(filters.Completion || filters.completion || []);
  const priorityFilter = new Set(filters.Priority || filters.priority || []);
  const energyFilter = new Set(filters.Energy || filters.energy || []);
  const gtdFilter = new Set(filters.GTD || filters.gtd || []);
  const projectText = (filters.projectText || "").trim();
  const waitingText = (filters.waitingText || "").trim().toLowerCase();
  const contextText = (filters.contextText || "").trim().toLowerCase();
  return tasks.filter((task) => {
    if (completionFilter.size) {
      const value = task.isCompleted ? "completed" : "open";
      if (!completionFilter.has(value)) return false;
    }
    if (recurrenceFilter.size && !recurrenceFilter.has(task.recurrenceBucket)) return false;
    if (startFilter.size && !startFilter.has(task.startBucket)) return false;
    if (deferFilter.size && !deferFilter.has(task.deferBucket)) return false;
    if (dueFilter.size && !dueFilter.has(task.dueBucket)) return false;
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

function GroupHeader({ title, count, isExpanded, onToggle }) {
  return (
    <button
      type="button"
      className="bt-group-header"
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <span className="bt-group-header__title">
        <span className="bt-group-header__caret" aria-hidden="true">
          {isExpanded ? "▾" : "▸"}
        </span>
        {title}
      </span>
      <span className="bt-group-header__count">{count}</span>
    </button>
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
        aria-haspopup="true"
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

function TaskRow({ task, controller, strings }) {
  const checkboxLabel = task.isCompleted
    ? strings?.markOpen || "Mark as open"
    : strings?.markDone || "Mark as done";
  const completedLabel = strings?.completedLabel || "Completed";
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
  return (
    <div className={`bt-task-row${menuOpen ? " bt-task-row--menu-open" : ""}`}>
      <button
        className={`bt-task-row__checkbox${task.isCompleted ? " bt-task-row__checkbox--done" : ""}`}
        onClick={() =>
          controller.toggleTask(task.uid, task.isCompleted ? "undo" : "complete")
        }
        title={checkboxLabel}
        aria-label={checkboxLabel}
      >
        {task.isCompleted ? "☑" : "☐"}
      </button>
      <div className="bt-task-row__body">
        <div className="bt-task-row__title">{task.title || strings?.untitled || "(Untitled task)"}</div>
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
          <TaskActionsMenu task={task} controller={controller} onOpenChange={handleMenuOpenChange} strings={strings} />
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
    </div>
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
  const [projectOptions, setProjectOptions] = useState(() =>
    controller?.getProjectOptions?.() || []
  );
  const [waitingOptions, setWaitingOptions] = useState(() =>
    controller?.getWaitingOptions?.() || []
  );
  const [contextOptions, setContextOptions] = useState(() =>
    controller?.getContextOptions?.() || []
  );
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
      { value: "time", label: tt(["dashboard", "groupingLabels", "time"], "By Time") },
      { value: "recurrence", label: tt(["dashboard", "groupingLabels", "recurrence"], "By Recurrence") },
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
      quickAddPlaceholder: tt(["dashboard", "quickAddPlaceholder"], "Add a Better Task"),
      quickAddButton: tt(["dashboard", "quickAddButton"], "OK"),
      searchPlaceholder: tt(["dashboard", "searchPlaceholder"], "Search Better Tasks"),
      filtersLabel: tt(["dashboard", "filtersLabel"], "Filters"),
      projectFilterLabel: tt(["dashboard", "projectFilterLabel"], "Project"),
      projectFilterPlaceholder: tt(["dashboard", "projectFilterPlaceholder"], "Project name"),
      projectFilterAny: tt(["dashboard", "projectFilterAny"], "All projects"),
      contextFilterLabel: tt(["dashboard", "contextFilterLabel"], "Context"),
      contextFilterAny: tt(["dashboard", "contextFilterAny"], "All contexts"),
      waitingFilterLabel: tt(["dashboard", "waitingFilterLabel"], "Waiting for"),
      waitingFilterPlaceholder: tt(["dashboard", "waitingFilterPlaceholder"], "Waiting for"),
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
      overscan: 8,
      measureElement,
    }),
    [rows.length, estimateRowSize, getRowKey, getScrollElement]
  );
  const rowVirtualizer = useVirtualizer(virtualizerOptions);

  const handleFilterToggle = (section, value, singleChoice = false) => {
    dispatchFilters({ type: singleChoice ? "toggleSingle" : "toggle", section, value });
  };

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

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

  const handleRefresh = () => controller.refresh?.({ reason: "manual" });

  const headerRef = useCallback(
    (node) => {
      if (typeof onHeaderReady === "function") {
        onHeaderReady(node);
      }
    },
    [onHeaderReady]
  );

  return (
    <div className="bt-dashboard">
      <header className="bt-dashboard__header" ref={headerRef}>
        <div>
          <h2>{ui.headerTitle}</h2>
          <p>{ui.headerSubtitle}</p>
        </div>
        <div className="bt-dashboard__header-actions">
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
              className={`bt-chip${filtersOpen ? " bt-chip--active" : ""}`}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label={ui.filtersLabel}
            >
              <span className="bp3-icon bp3-icon-filter" aria-hidden="true" />
            </button>
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
              </div>
            </div>
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
                <TaskRow task={row.task} controller={controller} strings={ui} />
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
    </div>
  );
}
