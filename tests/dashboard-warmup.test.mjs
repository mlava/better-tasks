import assert from "node:assert/strict";
import test from "node:test";

import { scheduleDashboardWarmup } from "../src/core/dashboard-warmup.js";

test("dashboard warm-up uses an idle slice and loads once", async () => {
  let idleCallback = null;
  let calls = 0;
  const windowLike = {
    requestIdleCallback(callback, options) {
      assert.equal(options.timeout, 4000);
      idleCallback = callback;
      return 7;
    },
    cancelIdleCallback() {},
  };
  const dispose = scheduleDashboardWarmup({
    isOpen: () => false,
    ensureInitialLoad: async () => { calls += 1; },
  }, { windowLike });

  assert.equal(calls, 0);
  idleCallback();
  await Promise.resolve();
  assert.equal(calls, 1);
  dispose();
});

test("dashboard warm-up is cancelled during unload", () => {
  let idleCallback = null;
  let cancelled = null;
  let calls = 0;
  const windowLike = {
    requestIdleCallback(callback) { idleCallback = callback; return 19; },
    cancelIdleCallback(id) { cancelled = id; },
  };
  const dispose = scheduleDashboardWarmup({
    ensureInitialLoad: () => { calls += 1; },
  }, { windowLike });

  dispose();
  idleCallback();
  assert.equal(cancelled, 19);
  assert.equal(calls, 0);
});

test("dashboard warm-up does not compete with an already open dashboard", () => {
  let idleCallback = null;
  let calls = 0;
  const windowLike = {
    requestIdleCallback(callback) { idleCallback = callback; return 1; },
    cancelIdleCallback() {},
  };
  scheduleDashboardWarmup({
    isOpen: () => true,
    ensureInitialLoad: () => { calls += 1; },
  }, { windowLike });

  idleCallback();
  assert.equal(calls, 0);
});

test("dashboard warm-up primes Analytics after the shared model is ready", async () => {
  let idleCallback = null;
  const events = [];
  const windowLike = {
    requestIdleCallback(callback) { idleCallback = callback; return 4; },
    cancelIdleCallback() {},
  };
  scheduleDashboardWarmup({
    isOpen: () => false,
    ensureInitialLoad: async () => { events.push("model"); },
    warmAnalyticsCache: async ({ yieldToMainThread, isCancelled }) => {
      events.push("analytics");
      assert.equal(typeof yieldToMainThread, "function");
      assert.equal(isCancelled(), false);
    },
  }, { windowLike });

  idleCallback();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["model", "analytics"]);
});
