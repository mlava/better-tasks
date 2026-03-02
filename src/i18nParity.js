// i18nParity.js

/**
 * Recursively collect all dotted keys for a given locale object.
 * Arrays and functions are treated as leaf values.
 */
function collectKeys(obj, prefix = "") {
  const keys = new Set();

  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (value && typeof value === "object" && !Array.isArray(value)) {
        // Recurse into plain objects
        const childKeys = collectKeys(value, fullKey);
        for (const ck of childKeys) keys.add(ck);
      } else {
        // Leaf (primitive, array, function, etc.)
        keys.add(fullKey);
      }
    }
  }

  return keys;
}

/**
 * Safely get a nested value by a dotted key path from an object.
 * e.g. getByPath(localeObj, "settings.weekStartOptions")
 */
function getByPath(obj, path) {
  return path.split(".").reduce((acc, segment) => {
    if (acc == null) return undefined;
    return acc[segment];
  }, obj);
}

/**
 * Extracts normalized placeholder token names from template strings.
 * Example: "Hi {{ name }} on {{date}}" -> Set(["name", "date"])
 */
function extractPlaceholderTokens(str) {
  const tokens = new Set();
  if (typeof str !== "string") return tokens;

  const re = /\{\{\s*([^{}\s]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    tokens.add(match[1]);
  }
  return tokens;
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function truncate(str, maxLen = 60) {
  if (typeof str !== "string") return String(str);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}

/**
 * Asserts that all locales in the i18n object have the same key structure as the base locale.
 * Also checks that arrays for the same key have the same length.
 * Also checks placeholder-token parity for string leaves (same {{...}} token set per key).
 *
 * Throws an Error with a detailed message if any mismatch is found.
 */
function assertI18nParity(i18n, baseLocale = "en") {
  const locales = Object.keys(i18n);
  if (!locales.includes(baseLocale)) {
    throw new Error(`Base locale "${baseLocale}" not found in i18n object.`);
  }

  const base = i18n[baseLocale];
  const baseKeys = collectKeys(base);

  const errors = [];

  for (const locale of locales) {
    if (locale === baseLocale) continue;

    const target = i18n[locale];
    const targetKeys = collectKeys(target);

    // Missing keys
    for (const key of baseKeys) {
      if (!targetKeys.has(key)) {
        errors.push(`[${locale}] is missing key: ${key}`);
      }
    }

    // Extra keys
    for (const key of targetKeys) {
      if (!baseKeys.has(key)) {
        errors.push(`[${locale}] has extra key not in "${baseLocale}": ${key}`);
      }
    }

    // Array length parity
    for (const key of baseKeys) {
      if (!targetKeys.has(key)) continue;

      const baseVal = getByPath(base, key);
      const targetVal = getByPath(target, key);

      // Leaf type parity (catches function↔string, string↔number, etc.)
      const baseType = Array.isArray(baseVal) ? "array" : typeof baseVal;
      const targetType = Array.isArray(targetVal) ? "array" : typeof targetVal;
      if (baseType !== targetType) {
        errors.push(`[${locale}] type mismatch at key "${key}": base is ${baseType}, locale is ${targetType}`);
      }

      if (Array.isArray(baseVal) && Array.isArray(targetVal)) {
        if (baseVal.length !== targetVal.length) {
          errors.push(
            `[${locale}] array length mismatch at key "${key}": ` +
            `${baseVal.length} (base) vs ${targetVal.length} (locale)`
          );
        }

        // Placeholder parity for array string elements
        const minLen = Math.min(baseVal.length, targetVal.length);
        for (let i = 0; i < minLen; i++) {
          if (typeof baseVal[i] === "string" && typeof targetVal[i] === "string") {
            const bt = extractPlaceholderTokens(baseVal[i]);
            const tt = extractPlaceholderTokens(targetVal[i]);
            if (!sameSet(bt, tt)) {
              errors.push(
                `[${locale}] placeholder mismatch at key "${key}[${i}]": ` +
                `base={${[...bt].sort().join(", ")}} vs locale={${[...tt].sort().join(", ")}} ` +
                `(base: "${truncate(baseVal[i])}" / locale: "${truncate(targetVal[i])}")`
              );
            }
          }
        }
      }

      // Placeholder token parity for string leaves
      if (typeof baseVal === "string" && typeof targetVal === "string") {
        const baseTokens = extractPlaceholderTokens(baseVal);
        const targetTokens = extractPlaceholderTokens(targetVal);
        if (!sameSet(baseTokens, targetTokens)) {
          const baseList = [...baseTokens].sort().join(", ");
          const targetList = [...targetTokens].sort().join(", ");
          errors.push(
            `[${locale}] placeholder mismatch at key "${key}": ` +
            `base={${baseList}} vs locale={${targetList}} ` +
            `(base: "${truncate(baseVal)}" / locale: "${truncate(targetVal)}")`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    const MAX_ERRORS = 200;
    const displayed = errors.slice(0, MAX_ERRORS);
    const suffix = errors.length > MAX_ERRORS
      ? `\n  ... and ${errors.length - MAX_ERRORS} more error(s)`
      : "";
    const msg =
      `i18n parity check failed:\n` + displayed.map((e) => `  - ${e}`).join("\n") + suffix;
    throw new Error(msg);
  }
}

module.exports = {
  assertI18nParity,
};
