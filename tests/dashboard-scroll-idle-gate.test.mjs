import assert from "node:assert/strict";
import test from "node:test";

import { createScrollIdleGate } from "../src/dashboard/scrollIdleGate.js";

function fakeWindow() {
  let nextId = 1;
  const timers = new Map();
  const idle = new Map();
  return {
    setTimeout(callback) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestIdleCallback(callback) {
      const id = nextId++;
      idle.set(id, callback);
      return id;
    },
    cancelIdleCallback(id) {
      idle.delete(id);
    },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    flushIdle() {
      const callbacks = [...idle.values()];
      idle.clear();
      callbacks.forEach((callback) => callback({ didTimeout: false, timeRemaining: () => 10 }));
    },
    pendingIdle: () => idle.size,
  };
}

test("background work waits until scrolling ends and the browser is idle", async () => {
  const windowLike = fakeWindow();
  const gate = createScrollIdleGate({ windowLike });
  gate.markScroll();
  let resolved = false;
  const pending = gate.wait().then(() => { resolved = true; });

  windowLike.flushIdle();
  await Promise.resolve();
  assert.equal(resolved, false);

  gate.markScrollEnd();
  assert.equal(windowLike.pendingIdle(), 1);
  windowLike.flushIdle();
  await pending;
  assert.equal(resolved, true);
});

test("a new scroll cancels queued idle work and requeues it after scrollend", async () => {
  const windowLike = fakeWindow();
  const gate = createScrollIdleGate({ windowLike });
  let resolved = false;
  const pending = gate.wait().then(() => { resolved = true; });
  assert.equal(windowLike.pendingIdle(), 1);

  gate.markScroll();
  assert.equal(windowLike.pendingIdle(), 0);
  windowLike.flushIdle();
  await Promise.resolve();
  assert.equal(resolved, false);

  gate.markScrollEnd();
  windowLike.flushIdle();
  await pending;
  assert.equal(resolved, true);
});

test("disposing resolves pending work and leaves the gate non-scrolling", async () => {
  const windowLike = fakeWindow();
  const gate = createScrollIdleGate({ windowLike });
  gate.markScroll();
  const pending = gate.wait();
  gate.dispose();
  await pending;
  assert.equal(gate.isScrolling(), false);
  assert.equal(windowLike.pendingIdle(), 0);
});
