import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDirectParentUidQuery } from "../src/core/direct-parent.js";

test("child attribute sync queries the immediate parent relation", () => {
  const query = buildDirectParentUidQuery("child-uid");

  assert.match(query, /\[\?p :block\/children \?c\]/);
  assert.doesNotMatch(query, /:block\/parents/);
  assert.match(query, /\[\?c :block\/uid "child-uid"\]/);
});
