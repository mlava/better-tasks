import { test } from "node:test";
import assert from "node:assert/strict";
import { getThemeObserverRegistrations } from "../src/core/theme-observer.js";

// A tiny stand-in for the browser's MutationObserver that honours the one
// piece of its contract this suite cares about: whether an attribute
// mutation on a given node is delivered to the callback, based on the
// registered target, `subtree`, and `attributeFilter` - exactly the
// dimensions Better Tasks' theme observer configures.
function isDescendantOf(node, ancestor) {
  let cur = node.parentNode;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parentNode;
  }
  return false;
}

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.registrations = [];
  }
  observe(target, options) {
    this.registrations.push({ target, options });
  }
  // Test helper only - simulates the browser deciding whether a mutation
  // on `node` matches any registration and, if so, invoking the callback.
  simulateAttributeMutation(node, attributeName) {
    for (const { target, options } of this.registrations) {
      if (!options.attributes) continue;
      if (options.attributeFilter && !options.attributeFilter.includes(attributeName)) continue;
      const matches = node === target || (options.subtree && isDescendantOf(node, target));
      if (matches) {
        this.callback();
        return;
      }
    }
  }
}

function makeNode(parentNode = null) {
  return { parentNode };
}

function buildDocumentTree() {
  const documentElement = makeNode();
  const body = makeNode(documentElement);
  // Mirrors Roam's own structure: a block container deep under <body> that
  // gets its `class` toggled by Roam's own render as the user types.
  const blockContainer = makeNode(body);
  const blockMain = makeNode(blockContainer);
  const head = makeNode(documentElement);
  const themeLink = makeNode(head);
  return { documentElement, body, blockContainer, blockMain, head, themeLink };
}

function attachFakeObserver(tree) {
  let calls = 0;
  const observer = new FakeMutationObserver(() => {
    calls += 1;
  });
  for (const { target, options } of getThemeObserverRegistrations(tree)) {
    observer.observe(target, options);
  }
  return { observer, getCalls: () => calls };
}

test("typing inside a block (a nested class mutation) never reaches the theme observer", () => {
  const tree = buildDocumentTree();
  const { observer, getCalls } = attachFakeObserver(tree);

  // This is what Roam does on nearly every keystroke: toggle a class deep
  // inside body/documentElement's subtree. It must not trigger a resync.
  observer.simulateAttributeMutation(tree.blockMain, "class");
  assert.equal(getCalls(), 0, "a descendant class mutation must not reach the theme observer");
});

test("a real theme change on body or documentElement itself still resyncs", () => {
  const tree = buildDocumentTree();
  const { observer, getCalls } = attachFakeObserver(tree);

  observer.simulateAttributeMutation(tree.body, "class");
  observer.simulateAttributeMutation(tree.documentElement, "data-theme");
  assert.equal(getCalls(), 2, "class/data-theme changes on body or documentElement must still resync");
});

test("document.head keeps subtree tracking so injected stylesheet swaps still resync", () => {
  const tree = buildDocumentTree();
  const { observer, getCalls } = attachFakeObserver(tree);

  observer.simulateAttributeMutation(tree.themeLink, "href");
  assert.equal(getCalls(), 1, "a stylesheet link swap nested under <head> must still resync");
});

test("body/documentElement registrations do not request subtree observation", () => {
  const tree = buildDocumentTree();
  const registrations = getThemeObserverRegistrations(tree);
  const byTarget = new Map(registrations.map((r) => [r.target, r.options]));

  assert.equal(byTarget.get(tree.body).subtree, false);
  assert.equal(byTarget.get(tree.documentElement).subtree, false);
  assert.equal(byTarget.get(tree.head).subtree, true);
});
