export const DEFAULT_ANALYTICS_PERIODS = ["30d", "7d", "90d", "all"];

export function createAnalyticsCache() {
  const values = new Map();

  return {
    get(period) {
      return values.get(period) || null;
    },
    has(period) {
      return values.has(period);
    },
    set(period, data) {
      values.set(period, data);
      return data;
    },
    clear() {
      values.clear();
    },
    async warm({
      periods = DEFAULT_ANALYTICS_PERIODS,
      compute,
      yieldToMainThread = null,
      isCancelled = null,
    } = {}) {
      if (typeof compute !== "function") return;
      for (const period of periods) {
        if (isCancelled?.()) return;
        if (values.has(period)) continue;
        if (typeof yieldToMainThread === "function") await yieldToMainThread();
        if (isCancelled?.()) return;
        const data = await compute(period);
        if (data != null && !values.has(period)) values.set(period, data);
      }
    },
  };
}
