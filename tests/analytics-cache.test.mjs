import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsCache } from "../src/core/analytics-cache.js";

test("analytics cache keeps every period until the task model changes", () => {
  const cache = createAnalyticsCache();
  cache.set("7d", { completed: 2 });
  cache.set("30d", { completed: 8 });

  assert.deepEqual(cache.get("7d"), { completed: 2 });
  assert.deepEqual(cache.get("30d"), { completed: 8 });

  cache.clear();
  assert.equal(cache.get("7d"), null);
  assert.equal(cache.get("30d"), null);
});

test("analytics warming yields between periods and skips cached work", async () => {
  const cache = createAnalyticsCache();
  cache.set("30d", { period: "30d" });
  const events = [];

  await cache.warm({
    periods: ["30d", "7d", "90d"],
    yieldToMainThread: async () => { events.push("yield"); },
    compute: async (period) => {
      events.push(period);
      return { period };
    },
  });

  assert.deepEqual(events, ["yield", "7d", "yield", "90d"]);
  assert.equal(cache.get("7d").period, "7d");
  assert.equal(cache.get("90d").period, "90d");
});

test("analytics warming stops before computation when scrolling resumes", async () => {
  const cache = createAnalyticsCache();
  let cancelled = false;
  let computes = 0;

  await cache.warm({
    periods: ["30d", "7d"],
    yieldToMainThread: async () => { cancelled = true; },
    isCancelled: () => cancelled,
    compute: async () => { computes += 1; return {}; },
  });

  assert.equal(computes, 0);
});
