import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAttributeEditTarget } from "../src/core/attribute-edit.js";

test("ordinary Roam typing exits the attribute-edit hot path", () => {
  const ordinaryDrafts = [
    "Write a normal sentence",
    "[[Page reference]]",
    "((block-ref))",
    "{{[[TODO]]}} Finish this",
    "=ROUND(B4*C4/100,2)",
    "",
  ];

  for (const value of ordinaryDrafts) {
    assert.equal(parseAttributeEditTarget({ value }), null, value);
  }
});

test("ordinary drafts skip attribute parsing before any delimiter appears", () => {
  const draft = {
    get value() {
      return "A long ordinary paragraph that never becomes an attribute";
    },
  };

  assert.equal(parseAttributeEditTarget(draft), null);
});

test("attribute child drafts are classified without a graph read", () => {
  assert.deepEqual(parseAttributeEditTarget({ value: "repeat:: every weekday" }), {
    key: "repeat",
    value: "every weekday",
  });
  assert.deepEqual(parseAttributeEditTarget({ value: "  Due Date :: [[August 4th, 2026]]  " }), {
    key: "due date",
    value: "[[August 4th, 2026]]",
  });
});

test("contenteditable attribute drafts are supported", () => {
  assert.deepEqual(
    parseAttributeEditTarget({ isContentEditable: true, textContent: "due:: tomorrow" }),
    { key: "due", value: "tomorrow" }
  );
});

test("non-editable targets and empty attribute values are ignored", () => {
  assert.equal(parseAttributeEditTarget(null), null);
  assert.equal(parseAttributeEditTarget({ textContent: "due:: tomorrow" }), null);
  assert.equal(parseAttributeEditTarget({ value: "due::" }), null);
});
