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
 * Asserts that all locales in the i18n object have the same key structure as the base locale.
 * Also checks that arrays for the same key have the same length.
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

      if (Array.isArray(baseVal) && Array.isArray(targetVal)) {
        if (baseVal.length !== targetVal.length) {
          errors.push(
            `[${locale}] array length mismatch at key "${key}": ` +
            `${baseVal.length} (base) vs ${targetVal.length} (locale)`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    const msg =
      `i18n parity check failed:\n` + errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(msg);
  }
}

module.exports = {
  assertI18nParity,
};
