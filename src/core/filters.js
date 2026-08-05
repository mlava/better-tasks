// Pure dashboard filter engine for Better Tasks.
//
// Extracted from src/dashboard/App.jsx so it can be unit-tested in Node. This
// is the single funnel every task passes through: the dashboard list, all
// preset views, the Daily/Weekly/Monthly review flows, Project Sweep, and the
// Focus Mode queue are all built from its output. A bug here silently hides a
// task, which is the worst failure mode this extension has.
//
// Pure: no Roam, no DOM, no React. The clock is injected via `options.now` so
// results are deterministic under test; production omits it and gets the real
// clock. `now` is read exactly once per pass, so a filter run that straddles
// midnight cannot classify two tasks against two different "todays".
//
// Task shape (from collectDashboardTasks):
//   { title, text, pageTitle, isCompleted, isBlocked,
//     completedAt: Date|null,   // noon-anchored (parseRoamDate)
//     dueAt: Date|null,         // noon-anchored (parseRoamDate)
//     editedAt: number|null,    // raw epoch ms from Roam's :edit/time
//     startBucket, deferBucket, dueBucket, recurrenceBucket,
//     metadata: { priority, energy, gtd, project, waitingFor, context[] } }

const DEFAULT_STALLED_DAYS = 14;

export function startOfDay(date) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Subtract N calendar days, staying on the same wall-clock time.
 *
 * Do NOT use `t - n * DAY_MS`: across a DST transition a day is 23 or 25 hours,
 * so millisecond arithmetic lands an hour either side of midnight. `completedAt`
 * and `dueAt` are noon-anchored, so an hour of slop is harmless for them — but
 * `editedAt` is a raw epoch timestamp sitting right next to the boundary, and a
 * task edited within that hour would flip between stalled and active.
 */
export function subtractDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() - n);
  return d;
}

/** Add N calendar days, staying on the same wall-clock time. */
export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * @param {object[]} tasks
 * @param {object} filters
 * @param {string} [query]           free-text search across title/page/text
 * @param {object} [options]
 * @param {Date} [options.now]       injected clock (tests); defaults to real now
 */
export function applyFilters(tasks, filters, query = "", options = {}) {
  const queryText = query.trim().toLowerCase();
  const recurrenceFilter = new Set(filters.Recurrence || filters.recurrence || []);
  const startFilter = new Set(filters.Start || filters.start || []);
  const deferFilter = new Set(filters.Defer || filters.defer || []);
  const dueFilter = new Set(filters.Due || filters.due || []);
  const dueArr = Array.from(dueFilter);
  const dueIncludesUpcoming = dueArr.includes("upcoming");
  const completionFilter = new Set(filters.Completion || filters.completion || []);
  const completionArr = Array.from(completionFilter);
  const completedOnly = completionArr.length === 1 && completionArr[0] === "completed";
  const priorityFilter = new Set(filters.Priority || filters.priority || []);
  const energyFilter = new Set(filters.Energy || filters.energy || []);
  const gtdFilter = new Set(filters.GTD || filters.gtd || []);
  const completedRange = typeof filters.completedRange === "string" ? filters.completedRange : "any";
  const upcomingRange = typeof filters.upcomingRange === "string" ? filters.upcomingRange : "any";
  const projectText = (filters.projectText || "").trim();
  const waitingText = (filters.waitingText || "").trim().toLowerCase();
  const contextText = (filters.contextText || "").trim().toLowerCase();

  // Hoisted: these were previously rebuilt inside the per-task callback, which
  // allocated two Sets (and a Date) for every task on every keystroke.
  const blockedFilter = new Set(filters.Blocked || filters.blocked || []);
  const stalledFilter = new Set(filters.Stalled || []);
  const stalledDays = typeof filters.stalledDays === "number" ? filters.stalledDays : DEFAULT_STALLED_DAYS;

  // One clock read for the whole pass.
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const startOfToday = startOfDay(now);
  const stalledThreshold = subtractDays(startOfToday, stalledDays).getTime();

  const isWithinCompletedRange = (date, range) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (range === "any") return true;
    const days =
      range === "1d" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
    if (!days) return true;
    const threshold = subtractDays(startOfToday, days - 1);
    return date >= threshold;
  };
  const isWithinUpcomingRange = (date, range) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (range === "any") return true;
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
    if (!days) return true;
    if (date < startOfToday) return false;
    // Exclusive end: last millisecond of the final day in the window.
    const end = new Date(addDays(startOfToday, days).getTime() - 1);
    return date <= end;
  };

  return tasks.filter((task) => {
    if (completionFilter.size) {
      const value = task.isCompleted ? "completed" : "open";
      if (!completionFilter.has(value)) return false;
    }
    if (completedOnly && completedRange !== "any" && task.isCompleted) {
      if (!isWithinCompletedRange(task.completedAt, completedRange)) return false;
    }
    if (recurrenceFilter.size && !recurrenceFilter.has(task.recurrenceBucket)) return false;
    if (startFilter.size && !startFilter.has(task.startBucket)) return false;
    if (deferFilter.size && !deferFilter.has(task.deferBucket)) return false;
    if (dueFilter.size && !dueFilter.has(task.dueBucket)) return false;
    if (dueIncludesUpcoming && upcomingRange !== "any" && task.dueBucket === "upcoming") {
      if (!isWithinUpcomingRange(task.dueAt, upcomingRange)) return false;
    }
    const meta = task.metadata || {};
    if (priorityFilter.size && !priorityFilter.has(meta.priority || "")) return false;
    if (energyFilter.size && !energyFilter.has(meta.energy || "")) return false;
    const gtdValue = (meta.gtd || "").toLowerCase();
    if (gtdFilter.size && !gtdFilter.has(gtdValue)) return false;
    if (blockedFilter.size) {
      const value = task.isBlocked ? "blocked" : "actionable";
      if (!blockedFilter.has(value)) return false;
    }
    if (stalledFilter.size) {
      const hasEditTime = typeof task.editedAt === "number" && task.editedAt > 0;
      const isStalled = !task.isCompleted &&
        (!hasEditTime || task.editedAt < stalledThreshold);
      if (stalledFilter.has("stalled") && !isStalled) return false;
      if (stalledFilter.has("active") && isStalled) return false;
    }
    if (projectText) {
      const hay = (meta.project || "").trim();
      if (hay.toLowerCase() !== projectText.toLowerCase()) return false;
    }
    if (waitingText) {
      const hay = (meta.waitingFor || "").toLowerCase();
      if (!hay.includes(waitingText)) return false;
    }
    if (contextText) {
      const ctxs = Array.isArray(meta.context) ? meta.context : [];
      const matches = ctxs.some((c) => typeof c === "string" && c.toLowerCase().includes(contextText));
      if (!matches) return false;
    }
    if (queryText) {
      const haystack = `${task.displayTitle || ""} ${task.title} ${task.pageTitle || ""} ${task.text}`.toLowerCase();
      if (!haystack.includes(queryText)) return false;
    }
    return true;
  });
}
