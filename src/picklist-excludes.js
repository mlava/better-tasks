const DEFAULT_EXCLUDED_PREFIX = "roam/";

function stripWrappingBrackets(value) {
  const v = String(value || "").trim();
  const match = v.match(/^\[\[(.*)\]\]$/);
  return match ? match[1].trim() : v;
}

export function normalizePageTitle(raw) {
  return stripWrappingBrackets(raw).trim().toLowerCase();
}

function splitCommaSeparatedPageTitles(raw) {
  const s = String(raw || "");
  const parts = [];
  let current = "";
  let inDoubleBrackets = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];

    if (!inDoubleBrackets && c === "[" && next === "[") {
      inDoubleBrackets = true;
      current += "[[";
      i++;
      continue;
    }

    if (inDoubleBrackets && c === "]" && next === "]") {
      inDoubleBrackets = false;
      current += "]]";
      i++;
      continue;
    }

    if (!inDoubleBrackets && c === ",") {
      parts.push(current);
      current = "";
      continue;
    }

    current += c;
  }

  parts.push(current);
  return parts;
}

export function parseExcludedPicklistPages(raw) {
  const set = new Set();
  for (const part of splitCommaSeparatedPageTitles(raw)) {
    const normalized = normalizePageTitle(part);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function shouldExcludePicklistSourcePage(pageTitle, enabled, userExcludedSet) {
  const t = normalizePageTitle(pageTitle);
  if (t.startsWith(DEFAULT_EXCLUDED_PREFIX)) return true;
  if (!enabled) return false;
  if (!userExcludedSet || typeof userExcludedSet.has !== "function") return false;
  return userExcludedSet.has(t);
}
