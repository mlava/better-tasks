export const SUGGESTION_COUNT_SNAPSHOT_SCHEMA = 1;
export const SUGGESTION_COUNT_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function suggestionCountSnapshotKey(graphName = "default") {
  return `betterTasks.dashboard.suggestionCount.${encodeURIComponent(String(graphName || "default"))}`;
}

export function readSuggestionCountSnapshot(
  storage,
  key,
  { now = Date.now(), maxAgeMs = SUGGESTION_COUNT_SNAPSHOT_MAX_AGE_MS } = {}
) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const count = Number(parsed?.count);
    const computedAt = Number(parsed?.computedAt);
    if (parsed?.schema !== SUGGESTION_COUNT_SNAPSHOT_SCHEMA) return null;
    if (!Number.isInteger(count) || count < 0 || count > 10000) return null;
    if (!Number.isFinite(computedAt) || computedAt <= 0) return null;
    if (now - computedAt > maxAgeMs || computedAt - now > 60 * 1000) return null;
    return { count, computedAt };
  } catch (_) {
    return null;
  }
}

export function writeSuggestionCountSnapshot(storage, key, count, { now = Date.now() } = {}) {
  const normalized = Number(count);
  if (!storage || !key || !Number.isInteger(normalized) || normalized < 0 || normalized > 10000) {
    return null;
  }
  const snapshot = {
    schema: SUGGESTION_COUNT_SNAPSHOT_SCHEMA,
    count: normalized,
    computedAt: now,
  };
  try {
    storage.setItem(key, JSON.stringify(snapshot));
    return snapshot;
  } catch (_) {
    return null;
  }
}
