// scripts/check-i18n-parity.js
const { i18n } = require("../src/i18n.js");
const { assertI18nParity } = require("../src/i18nParity.js");

try {
  assertI18nParity(i18n, "en");
  console.log("[i18n] Parity check passed ✅");
} catch (err) {
  console.error("[i18n] Parity check failed ❌");
  console.error(err.message || err);
  process.exit(1);
}
