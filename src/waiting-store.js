const DEFAULT_WAITING_ATTR = "BT_attrWaitingFor";
const CACHE_TTL_MS = 8 * 60 * 1000;

let extensionAPI = null;
let lastRefreshed = 0;
let refreshPromise = null;
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

function normalizeWaitingValue(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function getWaitingAttrName() {
  const configured = extensionAPI?.settings?.get?.("bt-attr-waitingFor");
  return sanitizeAttrName(configured ?? DEFAULT_WAITING_ATTR, DEFAULT_WAITING_ATTR);
}

function notifySubscribers() {
  const snapshot = values.slice();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (_) { }
  });
}

function setValues(next) {
  values = Array.from(new Set((next || []).map(normalizeWaitingValue).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  notifySubscribers();
}

function getWaitingOptions() {
  return values.slice();
}

function addWaitingOption(name) {
  const normalized = normalizeWaitingValue(name);
  if (!normalized || values.includes(normalized)) return;
  values = [...values, normalized].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  notifySubscribers();
}

function removeWaitingOption(name) {
  const normalized = normalizeWaitingValue(name);
  if (!normalized) return;
  const next = values.filter((v) => v !== normalized);
  if (next.length === values.length) return;
  values = next;
  notifySubscribers();
}

async function queryWaitingFromGraph() {
  const attrName = getWaitingAttrName();
  if (!attrName || typeof window === "undefined" || !window.roamAlphaAPI?.q) return [];
  const safeAttr = escapeForQuery(attrName);
  const defaultSafe = escapeForQuery(DEFAULT_WAITING_ATTR);
  const labels = Array.from(new Set([safeAttr, defaultSafe])).filter(Boolean);
  const pull = "[:block/string {:block/refs [:node/title]}]";

  const refQuery = `
    [:find (pull ?c ${pull})
     :in $ [?label ...]
     :where
       [?attr :node/title ?label]
       [?c :block/refs ?attr]]`;

  const inlineRegexQuery = `
    [:find ?s
     :in $ ?pattern
     :where
       [?c :block/string ?s]
       [(re-pattern ?pattern) ?rp]
       [(re-find ?rp ?s)]]`;

  const refRows = await window.roamAlphaAPI.q(refQuery, labels);
  let rows = [...(refRows || [])];

  const pattern = `(?i)^\\s*(?:${labels.join("|")})\\s*::`;
  const regexRows = await window.roamAlphaAPI.q(inlineRegexQuery, pattern);
  if (Array.isArray(regexRows)) {
    rows = [
      ...rows,
      ...regexRows.map((r) => ({
        "block/string": typeof r === "string" ? r : r?.[0],
      })),
    ];
  }

  const getField = (obj, candidates) => {
    for (const key of candidates) {
      if (obj && obj[key] != null) return obj[key];
    }
    return undefined;
  };

  const out = [];
  for (const row of rows || []) {
    const entry = row?.[0] || row;
    if (!entry) continue;
    const stringVal = getField(entry, ["block/string", "string", ":block/string"]) || "";
    const refsVal = getField(entry, ["block/refs", "refs", ":block/refs"]) || [];
    const refs = Array.isArray(refsVal) ? refsVal : [];
    const refTitles = refs
      .map((ref) => ref?.["node/title"] || ref?.[":node/title"])
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean);
    const nonAttrRef = refTitles.find((title) => title !== attrName);
    if (nonAttrRef) {
      out.push(nonAttrRef);
      continue;
    }
    const parts = stringVal.split("::");
    if (parts.length >= 2) {
      const valuePart = parts.slice(1).join("::");
      const normalized = normalizeWaitingValue(valuePart);
      if (normalized) out.push(normalized);
    }
  }
  return out;
}

async function refreshWaitingOptions(force = false) {
  const now = Date.now();
  if (!force && refreshPromise) return refreshPromise;
  if (!force && now - lastRefreshed < CACHE_TTL_MS && values.length) {
    return Promise.resolve();
  }
  refreshPromise = queryWaitingFromGraph()
    .then((list) => {
      lastRefreshed = Date.now();
      setValues(list);
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function subscribeToWaitingOptions(cb) {
  if (typeof cb !== "function") return () => {};
  subscribers.add(cb);
  cb(values.slice());
  return () => subscribers.delete(cb);
}

function initWaitingStore(api) {
  extensionAPI = api || null;
  void refreshWaitingOptions(true);
  setTimeout(() => void refreshWaitingOptions(true), 500);
}

export {
  initWaitingStore,
  getWaitingAttrName,
  refreshWaitingOptions,
  getWaitingOptions,
  addWaitingOption,
  removeWaitingOption,
  subscribeToWaitingOptions,
  normalizeWaitingValue,
};
