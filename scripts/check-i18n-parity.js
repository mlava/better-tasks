// scripts/check-i18n-parity.js
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const { assertI18nParity } = require("../src/i18nParity.js");

function loadI18n() {
  const localesDir = path.join(__dirname, "..", "src", "i18n", "locales");
  const files = fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith(".js"))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const i18n = {};
  for (const file of files) {
    const filename = path.join(localesDir, file);
    const src = fs.readFileSync(filename, "utf8");
    const rewritten = src.replace(/^\s*export\s+default\s+locale\s*;?\s*(?:\/\/.*)?$/m, "module.exports = locale;");
    const sandbox = { module: { exports: {} }, exports: {}, console, Date, Intl };
    const script = new vm.Script(rewritten, { filename });
    script.runInNewContext(sandbox, { timeout: 1000 });
    if (!sandbox.module.exports || typeof sandbox.module.exports !== "object") {
      throw new Error(`[i18n] ${file} did not export a locale object`);
    }
    const localeKey = file.replace(/\.js$/, "");
    i18n[localeKey] = sandbox.module.exports;
  }
  return i18n;
}

async function main() {
  const i18n = loadI18n();
  assertI18nParity(i18n, "en");
  console.log("[i18n] Parity check passed ✅");
}

main().catch((err) => {
  console.error("[i18n] Parity check failed ❌");
  console.error(err?.message || err);
  process.exit(1);
});
