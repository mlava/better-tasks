export function createScrollIdleGate({
  windowLike = typeof window !== "undefined" ? window : null,
  quietMs = 160,
  idleTimeoutMs = 800,
} = {}) {
  let disposed = false;
  let scrolling = false;
  let scrollTimer = null;
  const pending = new Set();
  const scheduled = new Map();

  const scheduleTimeout = (callback, delay) => {
    if (typeof windowLike?.setTimeout === "function") {
      return windowLike.setTimeout(callback, delay);
    }
    return setTimeout(callback, delay);
  };

  const cancelTimeout = (id) => {
    if (id == null) return;
    if (typeof windowLike?.clearTimeout === "function") {
      windowLike.clearTimeout(id);
      return;
    }
    clearTimeout(id);
  };

  const cancelScheduled = (resolve) => {
    const entry = scheduled.get(resolve);
    if (!entry) return;
    scheduled.delete(resolve);
    if (entry.kind === "idle" && typeof windowLike?.cancelIdleCallback === "function") {
      windowLike.cancelIdleCallback(entry.id);
    } else {
      cancelTimeout(entry.id);
    }
  };

  const finish = (resolve) => {
    cancelScheduled(resolve);
    if (!pending.delete(resolve)) return;
    resolve();
  };

  const schedule = (resolve) => {
    if (!pending.has(resolve) || scheduled.has(resolve)) return;
    if (disposed) {
      finish(resolve);
      return;
    }
    if (scrolling) return;

    const run = () => {
      scheduled.delete(resolve);
      if (disposed || !scrolling) {
        finish(resolve);
      }
      // If scrolling resumed, the waiter remains pending and markScrollEnd()
      // will schedule it again after the quiet boundary.
    };

    if (typeof windowLike?.requestIdleCallback === "function") {
      const id = windowLike.requestIdleCallback(run, { timeout: idleTimeoutMs });
      scheduled.set(resolve, { kind: "idle", id });
    } else {
      const id = scheduleTimeout(run, 0);
      scheduled.set(resolve, { kind: "timeout", id });
    }
  };

  const schedulePending = () => {
    for (const resolve of pending) schedule(resolve);
  };

  const markScrollEnd = () => {
    if (disposed) return;
    if (scrollTimer != null) {
      cancelTimeout(scrollTimer);
      scrollTimer = null;
    }
    scrolling = false;
    schedulePending();
  };

  const markScroll = () => {
    if (disposed) return;
    scrolling = true;
    for (const resolve of pending) cancelScheduled(resolve);
    if (scrollTimer != null) cancelTimeout(scrollTimer);
    scrollTimer = scheduleTimeout(markScrollEnd, quietMs);
  };

  const wait = () => new Promise((resolve) => {
    if (disposed) {
      resolve();
      return;
    }
    pending.add(resolve);
    schedule(resolve);
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scrolling = false;
    if (scrollTimer != null) {
      cancelTimeout(scrollTimer);
      scrollTimer = null;
    }
    for (const resolve of [...pending]) finish(resolve);
  };

  return {
    markScroll,
    markScrollEnd,
    wait,
    dispose,
    isScrolling: () => scrolling,
  };
}
