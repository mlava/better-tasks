/**
 * Warm the dashboard model after Roam reaches an idle slice.
 *
 * This keeps the extension's startup path light while removing the graph-wide
 * task collection from the first dashboard click. The returned disposer is
 * safe to call whether the callback has fired or not.
 */
export function scheduleDashboardWarmup(
  controller,
  { windowLike = globalThis.window, timeoutMs = 4000 } = {}
) {
  if (!controller || typeof controller.ensureInitialLoad !== "function") return () => {};

  let disposed = false;
  let idleId = null;
  let timerId = null;
  const pendingIdleWaits = new Map();
  const waitForIdle = () => new Promise((resolve) => {
    if (disposed) {
      resolve();
      return;
    }
    const finish = (id) => {
      pendingIdleWaits.delete(id);
      resolve();
    };
    if (typeof windowLike?.requestIdleCallback === "function") {
      const id = windowLike.requestIdleCallback(() => finish(id), { timeout: timeoutMs });
      pendingIdleWaits.set(id, { kind: "idle", resolve });
    } else {
      const id = windowLike?.setTimeout?.(() => finish(id), 0);
      pendingIdleWaits.set(id, { kind: "timer", resolve });
    }
  });
  const run = async () => {
    idleId = null;
    timerId = null;
    if (disposed || controller.isOpen?.()) return;
    try {
      await controller.ensureInitialLoad();
      if (disposed || controller.isOpen?.()) return;
      await controller.warmAnalyticsCache?.({
        yieldToMainThread: waitForIdle,
        isCancelled: () => disposed || !!controller.isOpen?.(),
      });
    } catch (error) {
      console.warn("[BetterTasks] dashboard warm-up failed", error);
    }
  };

  if (typeof windowLike?.requestIdleCallback === "function") {
    idleId = windowLike.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    timerId = windowLike?.setTimeout?.(run, Math.min(timeoutMs, 1500));
  }

  return () => {
    disposed = true;
    if (idleId != null) windowLike?.cancelIdleCallback?.(idleId);
    if (timerId != null) windowLike?.clearTimeout?.(timerId);
    for (const [id, entry] of pendingIdleWaits) {
      if (entry.kind === "idle") windowLike?.cancelIdleCallback?.(id);
      else windowLike?.clearTimeout?.(id);
      entry.resolve();
    }
    pendingIdleWaits.clear();
    idleId = null;
    timerId = null;
  };
}
