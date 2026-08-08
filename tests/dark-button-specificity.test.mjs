import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Roam core (assets/css/less-compiled/site.css) ships
//     .bp3-dark button { color: var(--dark-bg); }
// which paints EVERY <button> label with the page background colour in dark
// mode. Any Better Tasks rule that wants to colour a <button> has to out-
// specify it, and a plain `.bt-thing { color: ... }` at 0,1,0 does not. That
// has now bitten three separate surfaces on this branch (Today panel row
// titles, filter chips + task pills, analytics period chips), so this suite
// locks the fixed surfaces in place rather than re-discovering the trap.
const ROAM_DARK_BUTTON = ".bp3-dark button";

const css = readFileSync(new URL("../extension.css", import.meta.url), "utf8");

// ---------------------------------------------------------------- parsing

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Minimal rule reader: walks braces so nested at-rule bodies (@media,
// @container, @supports) are descended into rather than swallowed whole, and
// yields { selector, declarations } for every non-at-rule block.
function parseRules(text) {
  const rules = [];
  const stack = [];
  let buffer = "";
  for (const ch of text) {
    if (ch === "{") {
      const prelude = buffer.trim();
      buffer = "";
      stack.push(prelude.startsWith("@") ? null : prelude);
    } else if (ch === "}") {
      const prelude = stack.pop();
      if (prelude) rules.push({ selector: prelude, declarations: buffer });
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  return rules;
}

const RULES = parseRules(stripComments(css));

// ------------------------------------------------------------ specificity

const FUNCTIONAL_PSEUDO = /:(?:is|not|has|matches|any)\(/;

// Returns [ids, classes, elements] for one compound/complex selector.
function specificity(selector) {
  let rest = selector.trim();
  let ids = 0;
  let classes = 0;
  let elements = 0;

  // :is()/:not()/:has() take the specificity of their most specific argument.
  let match;
  while ((match = FUNCTIONAL_PSEUDO.exec(rest))) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < rest.length; close += 1) {
      if (rest[close] === "(") depth += 1;
      else if (rest[close] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const best = rest
      .slice(open + 1, close)
      .split(",")
      .map(specificity)
      .reduce((acc, cur) => (compare(cur, acc) > 0 ? cur : acc), [0, 0, 0]);
    ids += best[0];
    classes += best[1];
    elements += best[2];
    rest = `${rest.slice(0, match.index)} ${rest.slice(close + 1)}`;
  }

  const take = (pattern, bump) => {
    const found = rest.match(pattern) || [];
    bump(found.length);
    rest = rest.replace(pattern, " ");
  };

  take(/::[\w-]+/g, (n) => { elements += n; });       // pseudo-elements
  take(/#[\w-]+/g, (n) => { ids += n; });
  take(/\.[\w-]+/g, (n) => { classes += n; });
  take(/\[[^\]]*\]/g, (n) => { classes += n; });
  take(/:[\w-]+/g, (n) => { classes += n; });         // pseudo-classes
  take(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g, (n) => { elements += n; });

  return [ids, classes, elements];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// --------------------------------------------------------------- helpers

function selectorList(rule) {
  return rule.selector.split(",").map((part) => part.trim()).filter(Boolean);
}

function declares(rule, property) {
  return new RegExp(`(^|;)\\s*${property}\\s*:`).test(rule.declarations);
}

function isDarkScoped(selector) {
  return /\.bp3-dark|\.bt-theme-dark/.test(selector);
}

// Every dark-scoped selector in the file that targets `target` and lives in a
// rule declaring `property`.
function darkSelectorsFor(target, property) {
  const out = [];
  for (const rule of RULES) {
    if (!declares(rule, property)) continue;
    for (const selector of selectorList(rule)) {
      if (!isDarkScoped(selector)) continue;
      if (!selector.includes(target)) continue;
      out.push(selector);
    }
  }
  return out;
}

// -------------------------------------------------------------- the tests

test("the adversary rule is the specificity we think it is", () => {
  assert.deepEqual(specificity(ROAM_DARK_BUTTON), [0, 1, 1]);
  // A bare component class loses to it — this is the whole bug.
  assert.ok(compare(specificity(".bt-analytics-period-btn"), specificity(ROAM_DARK_BUTTON)) < 0);
  // And the shape used to fix it wins.
  assert.ok(
    compare(
      specificity("body.bt-theme-dark .bt-analytics-period-btn"),
      specificity(ROAM_DARK_BUTTON)
    ) > 0
  );
});

test("specificity() handles the selector forms this stylesheet uses", () => {
  assert.deepEqual(specificity(":is(html, body).bp3-dark .bt-chip"), [0, 2, 1]);
  assert.deepEqual(
    specificity("body.bt-theme-dark .bt-analytics-period-btn:not(.bt-analytics-period-btn--active):hover"),
    [0, 4, 1]
  );
  assert.deepEqual(specificity("body.bt-theme-dark .bt-analytics-header .bp3-button"), [0, 3, 1]);
});

// Each of these renders as a <button> and therefore needs an explicit dark
// colour that beats `.bp3-dark button`.
const BUTTON_SURFACES = [
  ".bt-analytics-period-btn",
  ".bt-analytics-period-btn--active",
  ".bt-chip",
  ".bt-chip--active",
  ".bt-pill",
  ".bt-today-panel-root button",
];

for (const target of BUTTON_SURFACES) {
  test(`${target} has a dark colour rule that outranks .bp3-dark button`, () => {
    const selectors = darkSelectorsFor(target, "color");
    assert.ok(selectors.length > 0, `no dark-scoped colour rule found for ${target}`);
    for (const selector of selectors) {
      assert.ok(
        compare(specificity(selector), specificity(ROAM_DARK_BUTTON)) > 0,
        `${selector} is ${specificity(selector).join(",")} — does not beat ${ROAM_DARK_BUTTON}`
      );
    }
  });
}

// bp3-dark lives on <html> in this Roam build, so a rule that only ever says
// `body.bp3-dark` never fires; each of these needs the :is(html, body) form or
// the JS-applied bt-theme-dark class to reach it.
for (const target of BUTTON_SURFACES) {
  test(`${target} is reachable when bp3-dark sits on <html>`, () => {
    const selectors = darkSelectorsFor(target, "color");
    assert.ok(
      selectors.some((s) => /:is\(\s*html\s*,\s*body\s*\)\.bp3-dark|\.bt-theme-dark/.test(s)),
      `${target} is only covered by \`body.bp3-dark\`, which never matches`
    );
  });
}

test("the analytics close button is covered beyond Blueprint's own dark rule", () => {
  const selectors = darkSelectorsFor(".bt-analytics-header .bp3-button", "color");
  assert.ok(selectors.length > 0, "no dark rule for the analytics header close button");
  // Blueprint ships `.bp3-dark .bp3-button` at 0,2,0; ours has to beat that too.
  for (const selector of selectors) {
    assert.ok(compare(specificity(selector), [0, 2, 0]) > 0, `${selector} does not beat .bp3-dark .bp3-button`);
  }
});

test("the analytics panel keeps a dark backdrop like the other overlays", () => {
  const selectors = darkSelectorsFor(".bt-analytics-overlay__backdrop", "background");
  assert.ok(selectors.length > 0, "analytics overlay has no dark backdrop rule");
});
