const DEFAULT_PROJECT_ATTR = "BT_attrProject";
const CACHE_TTL_MS = 8 * 60 * 1000; // long-lived cache; caller can force refresh

let extensionAPI = null;
let lastRefreshed = 0;
let refreshPromise = null;
let projects = [];
const subscribers = new Set();

function sanitizeAttrName(value, fallback) {
  if (value == null) return fallback;
  const trimmed = String(value).trim().replace(/:+$/, "");
  return trimmed || fallback;
}

function escapeForQuery(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeProjectValue(raw) {
  if (typeof raw !== "string") return "";
  let v = raw.trim();
  if (!v) return "";
  if (v.startsWith("#")) v = v.slice(1).trim();
  const pageMatch = v.match(/^\[\[(.*)\]\]$/);
  if (pageMatch) return pageMatch[1].trim();
  return v;
}

function getProjectAttrName() {
  const configured = extensionAPI?.settings?.get?.("bt-attr-project");
  return sanitizeAttrName(configured ?? DEFAULT_PROJECT_ATTR, DEFAULT_PROJECT_ATTR);
}

function notifySubscribers() {
  const snapshot = projects.slice();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn("[BetterTasks] project-store subscriber failed", err);
    }
  });
}

function setProjects(next) {
  projects = Array.from(new Set((next || []).map(normalizeProjectValue).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  notifySubscribers();
}

function getProjectOptions() {
  return projects.slice();
}

function removeProjectOption(name) {
  const normalized = normalizeProjectValue(name);
  if (!normalized) return;
  const next = projects.filter((p) => p !== normalized);
  if (next.length === projects.length) return;
  projects = next;
  notifySubscribers();
}

function addProjectOption(name) {
  const normalized = normalizeProjectValue(name);
  if (!normalized) return;
  if (projects.includes(normalized)) return;
  projects = [...projects, normalized].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  notifySubscribers();
}

async function queryProjectsFromGraph() {
  const attrName = getProjectAttrName();
  if (!attrName || typeof window === "undefined" || !window.roamAlphaAPI?.q) return [];
  const safeAttr = escapeForQuery(attrName);
  const defaultSafe = escapeForQuery(DEFAULT_PROJECT_ATTR);
  const labels = Array.from(new Set([safeAttr, defaultSafe])).filter(Boolean);
  const pull = "[:block/string {:block/refs [:node/title]}]";

  // Query for blocks that reference the attribute page(s)
  const refQuery = `
    [:find (pull ?c ${pull})
     :in $ [?label ...]
     :where
       [?attr :node/title ?label]
       [?c :block/refs ?attr]]`;

  // Fallback regex query for inline attr (case-insensitive), allowing leading whitespace.
  const inlineRegexQuery = `
    [:find ?s
     :in $ ?pattern
     :where
       [?c :block/string ?s]
       [(re-pattern ?pattern) ?rp]
       [(re-find ?rp ?s)]]`;
  try {
    const refRows = await window.roamAlphaAPI.q(refQuery, labels);
    let rows = [...(refRows || [])];

    // Regex scan (case-insensitive) for attr label at start of line (with optional leading spaces)
    const pattern = `(?i)^\\s*(?:${labels.join("|")})\\s*::`;
    try {
    const regexRows = await window.roamAlphaAPI.q(inlineRegexQuery, pattern);
    if (Array.isArray(regexRows)) {
      rows = [
        ...rows,
        ...regexRows.map((r) => ({
          "block/string": typeof r === "string" ? r : r?.[0],
        })),
      ];
    }
      //console.debug?.("[BetterTasks] project-store: regex fallback count", regexRows?.length || 0);
    } catch (err) {
      console.warn("[BetterTasks] project-store regex query failed", err);
    }
    const values = [];
    const getField = (obj, candidates) => {
      for (const key of candidates) {
        if (obj && obj[key] != null) return obj[key];
      }
      return undefined;
    };
    for (const row of rows || []) {
      // roamAlphaAPI.q can return either [entry] or entry directly depending on the query
      const entry = row?.[0] || row;
      if (!entry) continue;
      const stringVal =
        getField(entry, ["block/string", "string", ":block/string"]) || "";
      const refsVal =
        getField(entry, ["block/refs", "refs", ":block/refs"]) || [];
      const refs = Array.isArray(refsVal) ? refsVal : [];
      const refTitles = refs
        .map((ref) => ref?.["node/title"] || ref?.[":node/title"])
        .filter((t) => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean);
      const nonAttrRef = refTitles.find((title) => title !== attrName);
      if (nonAttrRef) {
        values.push(nonAttrRef);
        continue;
      }
      const rawString = typeof entry["block/string"] === "string" ? entry["block/string"] : "";
      const parts = rawString.split("::");
      if (parts.length >= 2) {
        const valuePart = parts.slice(1).join("::");
        const normalized = normalizeProjectValue(valuePart);
        if (normalized) {
          values.push(normalized);
        }
      }
    }
    return values;
  } catch (err) {
    console.warn("[BetterTasks] project-store query failed", err);
    return [];
  }
}

async function refreshProjectOptions(force = false) {
  const now = Date.now();
  if (!force && refreshPromise) return refreshPromise;
  if (!force && now - lastRefreshed < CACHE_TTL_MS && projects.length) {
    return Promise.resolve();
  }
  refreshPromise = queryProjectsFromGraph()
    .then((values) => {
      lastRefreshed = Date.now();
      setProjects(values);
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function subscribeToProjectOptions(cb) {
  if (typeof cb !== "function") return () => {};
  subscribers.add(cb);
  cb(projects.slice());
  return () => subscribers.delete(cb);
}

function initProjectStore(api) {
  extensionAPI = api || null;
  void refreshProjectOptions(true);
  // In some cases settings populate just after onload; a small delayed refresh helps catch them.
  setTimeout(() => void refreshProjectOptions(true), 500);
}

export {
  initProjectStore,
  getProjectAttrName,
  refreshProjectOptions,
  getProjectOptions,
  addProjectOption,
  removeProjectOption,
  subscribeToProjectOptions,
  normalizeProjectValue,
};
