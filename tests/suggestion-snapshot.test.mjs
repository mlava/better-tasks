import assert from "node:assert/strict";
import test from "node:test";

import {
  readSuggestionCountSnapshot,
  suggestionCountSnapshotKey,
  writeSuggestionCountSnapshot,
} from "../src/core/suggestion-snapshot.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("suggestion count snapshot round-trips per graph", () => {
  const storage = memoryStorage();
  const key = suggestionCountSnapshotKey("Svy graph");
  writeSuggestionCountSnapshot(storage, key, 6, { now: 1000 });
  assert.deepEqual(readSuggestionCountSnapshot(storage, key, { now: 1200 }), {
    count: 6,
    computedAt: 1000,
  });
  assert.match(key, /Svy%20graph/);
});

test("suggestion count snapshot rejects stale or malformed values", () => {
  const storage = memoryStorage();
  const key = suggestionCountSnapshotKey("Svy");
  storage.setItem(key, JSON.stringify({ schema: 1, count: 6, computedAt: 1000 }));
  assert.equal(readSuggestionCountSnapshot(storage, key, { now: 5000, maxAgeMs: 1000 }), null);
  storage.setItem(key, JSON.stringify({ schema: 1, count: -1, computedAt: 5000 }));
  assert.equal(readSuggestionCountSnapshot(storage, key, { now: 5000 }), null);
  storage.setItem(key, "not-json");
  assert.equal(readSuggestionCountSnapshot(storage, key, { now: 5000 }), null);
});
