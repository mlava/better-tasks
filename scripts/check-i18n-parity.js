// scripts/check-i18n-parity.js
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const { assertI18nParity } = require("../src/i18nParity.js");

function loadI18n() {
  const filename = path.join(__dirname, "..", "src", "i18n.js");
  const src = fs.readFileSync(filename, "utf8");
  const rewritten = src
    .replace(/^\s*export\s+const\s+i18n\s*=\s*/m, "module.exports.i18n = ")
    .replace(/^\s*export\s+default\s+i18n\s*;?\s*$/m, "");
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(rewritten, sandbox, { filename });
  return sandbox.module.exports.i18n;
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
