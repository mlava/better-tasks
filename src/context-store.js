const DEFAULT_CONTEXT_ATTR = "BT_attrContext";
const CACHE_TTL_MS = 8 * 60 * 1000;

import {
  parseExcludedPicklistPages,
  shouldExcludePicklistSourcePage,
} from "./picklist-excludes";

let extensionAPI = null;
let lastRefreshed = 0;
let refreshPromise = null;
let initRetryTimer = null;
let values = [];
const subscribers = new Set();

function sanitizeAttrName(value, fallback) {
  if (value == null) return fallback;
  const trimmed = String(value).trim().replace(/:+$/, "");
  return trimmed || fallback;
}

function escapeForQuery(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeContextValue(raw) {
  if (typeof raw !== "string") return "";
  let v = raw.trim();
  if (!v) return "";
  if (v.startsWith("#") || v.startsWith("@")) v = v.slice(1).trim();
  const pageMatch = v.match(/^\[\[(.*)\]\]$/);
  if (pageMatch) v = pageMatch[1].trim();
  return v;
}

function getContextAttrName() {
  const configured = extensionAPI?.settings?.get?.("bt-attr-context");
  return sanitizeAttrName(configured ?? DEFAULT_CONTEXT_ATTR, DEFAULT_CONTEXT_ATTR);
}

function getPicklistExcludeConfig() {
  const enabledRaw = extensionAPI?.settings?.get?.("bt_excludePicklistPagesEnabled");
  const enabled = enabledRaw === true || enabledRaw === "true" || enabledRaw === "1";
  const raw = extensionAPI?.settings?.get?.("bt_excludePicklistPages") || "";
  return { enabled, excluded: parseExcludedPicklistPages(raw) };
}

function notifySubscribers() {
  const snapshot = values.slice();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn("[BetterTasks] context-store subscriber failed", err);
    }
  });
}

function setValues(next) {
  values = Array.from(new Set((next || []).map(normalizeContextValue).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  notifySubscribers();
}

function getContextOptions() {
  return values.slice();
}

function addContextOption(name) {
  const normalized = normalizeContextValue(name);
  if (!normalized || values.includes(normalized)) return;
  values = [...values, normalized].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  notifySubscribers();
}

function removeContextOption(name) {
  const normalized = normalizeContextValue(name);
  if (!normalized) return;
  const next = values.filter((v) => v !== normalized);
  if (next.length === values.length) return;
  values = next;
  notifySubscribers();
}

async function queryContextFromGraph({ includeRegex = true } = {}) {
  const attrName = getContextAttrName();
  if (!attrName || typeof window === "undefined" || !window.roamAlphaAPI?.q) return [];
  const excludeCfg = getPicklistExcludeConfig();
  try {
    const safeAttr = escapeForQuery(attrName);
    const defaultSafe = escapeForQuery(DEFAULT_CONTEXT_ATTR);
    const labels = Array.from(new Set([safeAttr, defaultSafe])).filter(Boolean);
    const pull = "[:block/string {:block/refs [:node/title]} {:block/page [:node/title]}]";

    const refQuery = `
      [:find (pull ?c ${pull}) ?pageTitle
       :in $ [?label ...]
       :where
         [?attr :node/title ?label]
         [?c :block/refs ?attr]
         [?c :block/page ?p]
         [?p :node/title ?pageTitle]]`;

    const inlineRegexQuery = `
      [:find (pull ?c ${pull}) ?pageTitle
       :in $ ?pattern
       :where
         [?c :block/string ?s]
         [(re-pattern ?pattern) ?rp]
         [(re-find ?rp ?s)]
         [?c :block/page ?p]
         [?p :node/title ?pageTitle]]`;

    const refRows = await window.roamAlphaAPI.q(refQuery, labels);
    let rows = [...(refRows || [])];

    if (includeRegex) {
      const pattern = `(?i)^\\s*(?:${labels.join("|")})\\s*::`;
      try {
        const regexRows = await window.roamAlphaAPI.q(inlineRegexQuery, pattern);
        if (Array.isArray(regexRows)) rows = [...rows, ...(regexRows || [])];
      } catch (err) {
        console.warn("[BetterTasks] context-store regex query failed", err);
      }
    }

    const getField = (obj, candidates) => {
      for (const key of candidates) {
        if (obj && obj[key] != null) return obj[key];
      }
      return undefined;
    };
    const getPageTitleFromEntry = (entryObj) => {
      const raw = getField(entryObj, ["block/page", "page", ":block/page"]);
      const pageObj = Array.isArray(raw) ? raw[0] : raw;
      if (!pageObj || typeof pageObj !== "object") return "";
      return pageObj["node/title"] || pageObj[":node/title"] || "";
    };

    const out = [];
    for (const row of rows || []) {
      const entry = row?.[0] || row;
      if (!entry) continue;
      const pageTitleFromQuery =
        Array.isArray(row) && typeof row[1] === "string" ? row[1] : "";
      const pageTitle = pageTitleFromQuery || getPageTitleFromEntry(entry);
      const excluded = shouldExcludePicklistSourcePage(pageTitle, excludeCfg.enabled, excludeCfg.excluded);
      if (excluded) {
        continue;
      }
      const stringVal = getField(entry, ["block/string", "string", ":block/string"]) || "";
    const refsVal = getField(entry, ["block/refs", "refs", ":block/refs"]) || [];
    const refs = Array.isArray(refsVal) ? refsVal : [];
    const refTitles = refs
      .map((ref) => ref?.["node/title"] || ref?.[":node/title"])
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean);
      const attrTitleSet = new Set([attrName, DEFAULT_CONTEXT_ATTR]);
      const nonAttrRef = refTitles.find((title) => !attrTitleSet.has(title));
    if (nonAttrRef) {
      out.push(nonAttrRef);
      continue;
    }
      const parts = stringVal.split("::");
      if (parts.length >= 2) {
        const valuePart = parts.slice(1).join("::");
        const normalized = normalizeContextValue(valuePart);
        if (normalized) out.push(normalized);
      }
    }
    return out;
  } catch (err) {
    console.warn("[BetterTasks] context-store query failed", err);
    return [];
  }
}

async function refreshContextOptions(force = false) {
  const now = Date.now();
  if (!force && refreshPromise) return refreshPromise;
  if (!force && now - lastRefreshed < CACHE_TTL_MS && values.length) {
    return Promise.resolve();
  }
  queryContextFromGraph({ includeRegex: false }).then((list) => {
    if (!list.length) return;
    setValues(list);
  }).catch(() => {});
  refreshPromise = queryContextFromGraph({ includeRegex: true })
    .then((list) => {
      lastRefreshed = Date.now();
      setValues(list);
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function subscribeToContextOptions(cb) {
  if (typeof cb !== "function") return () => {};
  subscribers.add(cb);
  cb(values.slice());
  return () => subscribers.delete(cb);
}

function initContextStore(api) {
  extensionAPI = api || null;
  void refreshContextOptions(true);
  // Skip the retry if the first refresh already completed (lastRefreshed > 0).
  initRetryTimer = setTimeout(() => {
    initRetryTimer = null;
    if (!lastRefreshed) void refreshContextOptions(true);
  }, 500);
}

function resetContextStore() {
  if (initRetryTimer) { clearTimeout(initRetryTimer); initRetryTimer = null; }
  subscribers.clear();
  values = [];
  lastRefreshed = 0;
  refreshPromise = null;
  extensionAPI = null;
}

export {
  initContextStore,
  resetContextStore,
  getContextAttrName,
  refreshContextOptions,
  getContextOptions,
  addContextOption,
  removeContextOption,
  subscribeToContextOptions,
  normalizeContextValue,
};
