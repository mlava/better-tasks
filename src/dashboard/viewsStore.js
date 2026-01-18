export const SETTINGS_KEY_VIEWS = "bt_dashViews";
export const SETTINGS_KEY_SEEDS_INSTALLED = "bt_seedsInstalled";

const STORE_SCHEMA = 1;
const VIEW_SCHEMA = 1;

export const DASHBOARD_PRESET_IDS = [
  "bt_preset_next_actions",
  "bt_preset_waiting_for",
  "bt_preset_completed_7d",
  "bt_preset_someday",
  "bt_preset_all_open",
];

function nowMs() {
  return Date.now();
}

function emptyStore() {
  return {
    schema: STORE_SCHEMA,
    activeViewId: null,
    views: [],
    lastDefaultState: null,
    lastDefaultUpdatedAt: null,
  };
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {
      // fall back
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function safeParseStore(raw) {
  if (!raw) return emptyStore();
  if (typeof raw === "object") return normalizeStore(raw);
  if (typeof raw !== "string") return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (_) {
    return emptyStore();
  }
}

function normalizeDashState(state) {
  const filters =
    state && typeof state.filters === "object" && state.filters ? cloneJsonSafe(state.filters) : {};
  const grouping = typeof state?.grouping === "string" ? state.grouping : "time";
  const query = typeof state?.query === "string" ? state.query : "";
  return { filters, grouping, query };
}

function normalizeView(view) {
  if (!view || typeof view !== "object") return null;
  const id = typeof view.id === "string" ? view.id : null;
  const name = typeof view.name === "string" ? view.name.trim() : "";
  if (!id || !name) return null;
  const createdAt = typeof view.createdAt === "number" ? view.createdAt : nowMs();
  const updatedAt = typeof view.updatedAt === "number" ? view.updatedAt : createdAt;
  const state = normalizeDashState(view.state || {});
  return { id, name, createdAt, updatedAt, schema: VIEW_SCHEMA, state };
}

function normalizeStore(store) {
  if (!store || typeof store !== "object") return emptyStore();
  const viewsRaw = Array.isArray(store.views) ? store.views : [];
  const views = viewsRaw.map(normalizeView).filter(Boolean);
  const activeViewId =
    typeof store.activeViewId === "string" && views.some((v) => v.id === store.activeViewId)
      ? store.activeViewId
      : null;
  const lastDefaultStateRaw = store.lastDefaultState;
  const lastDefaultState =
    lastDefaultStateRaw && typeof lastDefaultStateRaw === "object"
      ? normalizeDashState(lastDefaultStateRaw)
      : null;
  const lastDefaultUpdatedAt =
    typeof store.lastDefaultUpdatedAt === "number" ? store.lastDefaultUpdatedAt : null;
  return { schema: STORE_SCHEMA, activeViewId, views, lastDefaultState, lastDefaultUpdatedAt };
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `btv_${hex}`;
  }
  return `btv_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalizeNameForCompare(name) {
  return String(name || "").trim().toLowerCase();
}

export function loadViewsStore(extensionAPI) {
  try {
    const raw = extensionAPI?.settings?.get?.(SETTINGS_KEY_VIEWS);
    return safeParseStore(raw);
  } catch (_) {
    return emptyStore();
  }
}

export function saveViewsStore(extensionAPI, store) {
  const normalized = normalizeStore(store);
  try {
    extensionAPI?.settings?.set?.(SETTINGS_KEY_VIEWS, JSON.stringify(normalized));
  } catch (_) {
    // ignore settings failures
  }
  return normalized;
}

export function setLastDefaultState(store, dashState) {
  const next = normalizeStore(store);
  next.lastDefaultState = normalizeDashState(dashState);
  next.lastDefaultUpdatedAt = nowMs();
  return next;
}

export function buildPresetViews({ getName } = {}) {
  const nameFor = (key, fallback) => {
    try {
      const v = typeof getName === "function" ? getName(key) : null;
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch (_) {
      // ignore
    }
    return fallback;
  };
  const t = nowMs();
  return [
    {
      id: "bt_preset_next_actions",
      name: nameFor("nextActions", "Next Actions"),
      createdAt: t,
      updatedAt: t,
      schema: VIEW_SCHEMA,
      state: {
        filters: { Completion: ["open"], GTD: ["next action"], completedRange: "any" },
        grouping: "time",
        query: "",
      },
    },
    {
      id: "bt_preset_waiting_for",
      name: nameFor("waitingFor", "Waiting For"),
      createdAt: t,
      updatedAt: t,
      schema: VIEW_SCHEMA,
      state: {
        filters: { Completion: ["open"], GTD: ["delegated"], completedRange: "any" },
        grouping: "time",
        query: "",
      },
    },
    {
      id: "bt_preset_completed_7d",
      name: nameFor("completed7d", "Completed (Last 7 Days)"),
      createdAt: t,
      updatedAt: t,
      schema: VIEW_SCHEMA,
      state: {
        filters: { Completion: ["completed"], completedRange: "7d" },
        grouping: "time",
        query: "",
      },
    },
    {
      id: "bt_preset_someday",
      name: nameFor("someday", "Someday / Maybe"),
      createdAt: t,
      updatedAt: t,
      schema: VIEW_SCHEMA,
      state: {
        filters: { Completion: ["open"], GTD: ["someday"], completedRange: "any" },
        grouping: "project",
        query: "",
      },
    },
    {
      id: "bt_preset_all_open",
      name: nameFor("allOpen", "All Open Tasks"),
      createdAt: t,
      updatedAt: t,
      schema: VIEW_SCHEMA,
      state: {
        filters: { Completion: ["open"], completedRange: "any" },
        grouping: "time",
        query: "",
      },
    },
  ];
}

export function installPresetDashboardViews(
  extensionAPI,
  { force = false, getName } = {}
) {
  const store = loadViewsStore(extensionAPI);
  let seedsInstalled = false;
  try {
    const raw = extensionAPI?.settings?.get?.(SETTINGS_KEY_SEEDS_INSTALLED);
    seedsInstalled = raw === true || raw === "1" || raw === "true";
  } catch (_) {
    seedsInstalled = false;
  }

  const shouldSeedInitial = !force && !seedsInstalled && (store.views?.length || 0) === 0;
  const shouldAttempt = force || shouldSeedInitial;
  if (!shouldAttempt) {
    return {
      store,
      installedIds: [],
      skippedNameCollisions: [],
      skippedExistingIds: [],
      didSave: false,
    };
  }

  const presets = buildPresetViews({ getName }).map(normalizeView).filter(Boolean);
  const existingById = new Set((store.views || []).map((v) => v.id));
  const existingNames = new Set((store.views || []).map((v) => normalizeNameForCompare(v.name)));
  const toAdd = [];
  const skippedNameCollisions = [];
  const skippedExistingIds = [];

  for (const preset of presets) {
    if (existingById.has(preset.id)) {
      skippedExistingIds.push(preset.id);
      continue;
    }
    const normalizedName = normalizeNameForCompare(preset.name);
    if (normalizedName && existingNames.has(normalizedName)) {
      skippedNameCollisions.push(preset.name);
      continue;
    }
    toAdd.push(preset);
    existingById.add(preset.id);
    if (normalizedName) existingNames.add(normalizedName);
  }

  if (!toAdd.length) {
    if (shouldSeedInitial && !seedsInstalled) {
      try {
        extensionAPI?.settings?.set?.(SETTINGS_KEY_SEEDS_INSTALLED, "1");
      } catch (_) {
        // ignore
      }
    }
    return {
      store,
      installedIds: [],
      skippedNameCollisions,
      skippedExistingIds,
      didSave: false,
    };
  }

  const next = normalizeStore({
    schema: STORE_SCHEMA,
    activeViewId: store.activeViewId || null,
    lastDefaultState: store.lastDefaultState || null,
    lastDefaultUpdatedAt: store.lastDefaultUpdatedAt || null,
    views: [...toAdd, ...(store.views || [])],
  });
  const saved = saveViewsStore(extensionAPI, next);

  if (shouldSeedInitial && !seedsInstalled) {
    try {
      extensionAPI?.settings?.set?.(SETTINGS_KEY_SEEDS_INSTALLED, "1");
    } catch (_) {
      // ignore
    }
  }

  return {
    store: saved,
    installedIds: toAdd.map((v) => v.id),
    skippedNameCollisions,
    skippedExistingIds,
    didSave: true,
  };
}

export function setActiveView(store, idOrNull) {
  const next = normalizeStore(store);
  const id = typeof idOrNull === "string" ? idOrNull : null;
  next.activeViewId = id && next.views.some((v) => v.id === id) ? id : null;
  return next;
}

export function createView(store, name, dashState) {
  const next = normalizeStore(store);
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) return next;
  const id = generateId();
  const t = nowMs();
  const view = {
    id,
    name: cleanName,
    createdAt: t,
    updatedAt: t,
    schema: VIEW_SCHEMA,
    state: normalizeDashState(dashState),
  };
  next.views = [...next.views, view];
  next.activeViewId = id;
  return next;
}

export function updateView(store, id, dashState) {
  const next = normalizeStore(store);
  const idx = next.views.findIndex((v) => v.id === id);
  if (idx === -1) return next;
  const existing = next.views[idx];
  const updated = {
    ...existing,
    updatedAt: nowMs(),
    schema: VIEW_SCHEMA,
    state: normalizeDashState(dashState),
  };
  next.views = next.views.slice();
  next.views[idx] = updated;
  return next;
}

export function renameView(store, id, name) {
  const next = normalizeStore(store);
  const idx = next.views.findIndex((v) => v.id === id);
  if (idx === -1) return next;
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) return next;
  const existing = next.views[idx];
  const updated = { ...existing, name: cleanName, updatedAt: nowMs() };
  next.views = next.views.slice();
  next.views[idx] = updated;
  return next;
}

export function deleteView(store, id) {
  const next = normalizeStore(store);
  next.views = next.views.filter((v) => v.id !== id);
  if (next.activeViewId === id) next.activeViewId = null;
  if (next.activeViewId && !next.views.some((v) => v.id === next.activeViewId)) {
    next.activeViewId = null;
  }
  return next;
}
