export const SETTINGS_KEY_TEMPLATES = "bt_templates";

const STORE_SCHEMA = 1;
const TEMPLATE_SCHEMA = 1;
const MAX_TEMPLATES = 50;
const MAX_SUBTASKS = 20;

const KNOWN_ATTR_KEYS = [
  "repeat", "due", "start", "defer",
  "project", "waitingFor", "context",
  "priority", "energy", "gtd",
];

function nowMs() {
  return Date.now();
}

function emptyStore() {
  return { schema: STORE_SCHEMA, templates: [] };
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

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `btt_${crypto.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `btt_${hex}`;
  }
  return `btt_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalizeAttributes(attrs) {
  if (!attrs || typeof attrs !== "object") return {};
  const out = {};
  for (const key of KNOWN_ATTR_KEYS) {
    if (key in attrs) {
      const val = attrs[key];
      out[key] = val == null ? null : String(val);
    }
  }
  return out;
}

function normalizeSubtask(sub) {
  if (!sub || typeof sub !== "object") return null;
  const titlePattern = typeof sub.titlePattern === "string" ? sub.titlePattern.trim() : "";
  if (!titlePattern) return null;
  return {
    titlePattern,
    attributes: normalizeAttributes(sub.attributes || {}),
  };
}

export function normalizeTemplate(tmpl) {
  if (!tmpl || typeof tmpl !== "object") return null;
  const id = typeof tmpl.id === "string" ? tmpl.id : null;
  const name = typeof tmpl.name === "string" ? tmpl.name.trim() : "";
  if (!id || !name) return null;
  const titlePattern = typeof tmpl.titlePattern === "string" ? tmpl.titlePattern.trim() : "";
  const createdAt = typeof tmpl.createdAt === "number" ? tmpl.createdAt : nowMs();
  const updatedAt = typeof tmpl.updatedAt === "number" ? tmpl.updatedAt : createdAt;
  const attributes = normalizeAttributes(tmpl.attributes || {});
  const rawSubs = Array.isArray(tmpl.subtasks) ? tmpl.subtasks : [];
  const subtasks = rawSubs.map(normalizeSubtask).filter(Boolean).slice(0, MAX_SUBTASKS);
  return {
    id,
    name,
    createdAt,
    updatedAt,
    schema: TEMPLATE_SCHEMA,
    titlePattern,
    attributes,
    subtasks,
  };
}

function normalizeStore(store) {
  if (!store || typeof store !== "object") return emptyStore();
  const rawTemplates = Array.isArray(store.templates) ? store.templates : [];
  const templates = rawTemplates
    .map(normalizeTemplate)
    .filter(Boolean)
    .slice(0, MAX_TEMPLATES);
  return { schema: STORE_SCHEMA, templates };
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

export function loadTemplateStore(extensionAPI) {
  try {
    const raw = extensionAPI?.settings?.get?.(SETTINGS_KEY_TEMPLATES);
    return safeParseStore(raw);
  } catch (_) {
    return emptyStore();
  }
}

export function saveTemplateStore(extensionAPI, store) {
  const normalized = normalizeStore(store);
  try {
    extensionAPI?.settings?.set?.(SETTINGS_KEY_TEMPLATES, JSON.stringify(normalized));
  } catch (_) {
    // ignore settings failures
  }
  return normalized;
}

export function getTemplate(store, id) {
  if (!store || !id) return null;
  const normalized = normalizeStore(store);
  return normalized.templates.find((t) => t.id === id) || null;
}

export function createTemplate(store, templateInput) {
  const next = normalizeStore(store);
  const id = generateId();
  const t = nowMs();
  const raw = {
    ...(templateInput || {}),
    id,
    createdAt: t,
    updatedAt: t,
    schema: TEMPLATE_SCHEMA,
  };
  const template = normalizeTemplate(raw);
  if (!template) return next;
  next.templates = [...next.templates, template];
  return next;
}

export function updateTemplate(store, id, patch) {
  const next = normalizeStore(store);
  const idx = next.templates.findIndex((t) => t.id === id);
  if (idx === -1) return next;
  const existing = next.templates[idx];
  const merged = {
    ...existing,
    ...patch,
    id: existing.id, // id is immutable
    createdAt: existing.createdAt,
    updatedAt: nowMs(),
    schema: TEMPLATE_SCHEMA,
  };
  const updated = normalizeTemplate(merged);
  if (!updated) return next;
  next.templates = next.templates.slice();
  next.templates[idx] = updated;
  return next;
}

export function duplicateTemplate(store, id) {
  const next = normalizeStore(store);
  const source = next.templates.find((t) => t.id === id);
  if (!source) return next;
  const clone = cloneJsonSafe(source);
  clone.id = generateId();
  clone.name = `${source.name} (copy)`;
  const t = nowMs();
  clone.createdAt = t;
  clone.updatedAt = t;
  const template = normalizeTemplate(clone);
  if (!template) return next;
  next.templates = [...next.templates, template];
  return next;
}

export function deleteTemplate(store, id) {
  const next = normalizeStore(store);
  next.templates = next.templates.filter((t) => t.id !== id);
  return next;
}

/**
 * Extract parameter names from title patterns.
 * Supports {paramName} and {paramName:defaultValue} syntax.
 * Scans the main titlePattern and all subtask titlePatterns.
 */
export function extractParameters(titlePattern, subtasks) {
  const seen = new Set();
  const params = [];
  const regex = /\{(\w+)(?::([^}]*))?\}/g;
  const sources = [titlePattern || ""];
  if (Array.isArray(subtasks)) {
    for (const sub of subtasks) {
      if (sub && typeof sub.titlePattern === "string") {
        sources.push(sub.titlePattern);
      }
    }
  }
  for (const src of sources) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(src)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        params.push({ name, defaultValue: match[2] ?? "" });
      }
    }
  }
  return params;
}

/**
 * Replace {param} placeholders in text with values from paramValues map.
 * Strips {{ and }} from resolved values to prevent Roam macro injection.
 */
export function resolveTitle(pattern, paramValues) {
  if (!pattern) return "";
  const values = paramValues || {};
  return pattern.replace(/\{(\w+)(?::[^}]*)?\}/g, (_, key) => {
    const val = typeof values[key] === "string" ? values[key] : "";
    // Strip {{ / }} to prevent Roam macro injection
    return val.replace(/\{\{/g, "").replace(/\}\}/g, "");
  });
}
