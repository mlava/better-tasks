import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters } from "../src/core/filters.js";

// Pin "now" to Thursday 9 July 2026, 10:30 local.
const NOW = new Date(2026, 6, 9, 10, 30, 0, 0);
const START_OF_TODAY = new Date(2026, 6, 9, 0, 0, 0, 0);

// Noon-anchored, as parseRoamDate produces.
const d = (y, m, day) => new Date(y, m - 1, day, 12, 0, 0, 0);
const epoch = (y, m, day) => new Date(y, m - 1, day, 12, 0, 0, 0).getTime();

const task = (over = {}) => ({
  uid: "u1",
  title: "Task",
  text: "{{[[TODO]]}} Task",
  pageTitle: "Page",
  isCompleted: false,
  isBlocked: false,
  completedAt: null,
  dueAt: null,
  editedAt: NOW.getTime(),
  startBucket: null,
  deferBucket: null,
  dueBucket: null,
  recurrenceBucket: null,
  metadata: {},
  ...over,
});

const run = (tasks, filters = {}, query = "") => applyFilters(tasks, filters, query, { now: NOW });
const uids = (tasks, filters, query) => run(tasks, filters, query).map((t) => t.uid);

test("no filters returns everything", () => {
  const tasks = [task(), task({ uid: "u2" })];
  assert.deepEqual(uids(tasks, {}), ["u1", "u2"]);
});

// ========================= completion =========================

test("Completion filters open vs completed", () => {
  const tasks = [task({ uid: "open" }), task({ uid: "done", isCompleted: true })];
  assert.deepEqual(uids(tasks, { Completion: ["open"] }), ["open"]);
  assert.deepEqual(uids(tasks, { Completion: ["completed"] }), ["done"]);
  assert.deepEqual(uids(tasks, { Completion: ["open", "completed"] }), ["open", "done"]);
});

test("filter keys accept both cases", () => {
  const tasks = [task({ uid: "open" }), task({ uid: "done", isCompleted: true })];
  assert.deepEqual(uids(tasks, { completion: ["open"] }), ["open"]);
  assert.deepEqual(uids(tasks, { priority: ["high"] }), []);
});

// ========================= completedRange =========================

test("completedRange 7d includes today back through 6 days ago", () => {
  const f = { Completion: ["completed"], completedRange: "7d" };
  const inRange = task({ uid: "in", isCompleted: true, completedAt: d(2026, 7, 3) });
  const outRange = task({ uid: "out", isCompleted: true, completedAt: d(2026, 7, 2) });
  const today = task({ uid: "today", isCompleted: true, completedAt: d(2026, 7, 9) });
  assert.deepEqual(uids([inRange, outRange, today], f), ["in", "today"]);
});

test("completedRange 1d is today only", () => {
  const f = { Completion: ["completed"], completedRange: "1d" };
  const today = task({ uid: "today", isCompleted: true, completedAt: d(2026, 7, 9) });
  const yesterday = task({ uid: "yday", isCompleted: true, completedAt: d(2026, 7, 8) });
  assert.deepEqual(uids([today, yesterday], f), ["today"]);
});

test("completedRange 30d and 90d boundaries", () => {
  const mk = (uid, date) => task({ uid, isCompleted: true, completedAt: date });
  const f30 = { Completion: ["completed"], completedRange: "30d" };
  // threshold = startOfToday - 29 days = 10 June
  assert.deepEqual(uids([mk("in", d(2026, 6, 10)), mk("out", d(2026, 6, 9))], f30), ["in"]);
  const f90 = { Completion: ["completed"], completedRange: "90d" };
  // threshold = startOfToday - 89 days = 11 April
  assert.deepEqual(uids([mk("in", d(2026, 4, 11)), mk("out", d(2026, 4, 10))], f90), ["in"]);
});

test("completedRange only applies when the view is completed-only", () => {
  const done = task({ uid: "old", isCompleted: true, completedAt: d(2020, 1, 1) });
  // Both open+completed selected → completedOnly is false → range ignored
  assert.deepEqual(uids([done], { Completion: ["open", "completed"], completedRange: "7d" }), ["old"]);
  // No completion filter at all → range ignored
  assert.deepEqual(uids([done], { completedRange: "7d" }), ["old"]);
});

test("completedRange: missing or invalid completedAt excludes the task", () => {
  const f = { Completion: ["completed"], completedRange: "7d" };
  const noDate = task({ uid: "nodate", isCompleted: true, completedAt: null });
  const bad = task({ uid: "bad", isCompleted: true, completedAt: new Date("nonsense") });
  assert.deepEqual(uids([noDate, bad], f), []);
});

test("completedRange 'any' or an unknown range does not filter", () => {
  const old = task({ uid: "old", isCompleted: true, completedAt: d(2020, 1, 1) });
  assert.deepEqual(uids([old], { Completion: ["completed"], completedRange: "any" }), ["old"]);
  assert.deepEqual(uids([old], { Completion: ["completed"], completedRange: "5d" }), ["old"]);
});

// ========================= buckets + upcomingRange =========================

test("bucket filters match exactly", () => {
  const a = task({ uid: "a", dueBucket: "overdue", startBucket: "today", recurrenceBucket: "recurring" });
  const b = task({ uid: "b", dueBucket: "upcoming", startBucket: "future", recurrenceBucket: "oneoff" });
  assert.deepEqual(uids([a, b], { Due: ["overdue"] }), ["a"]);
  assert.deepEqual(uids([a, b], { Start: ["future"] }), ["b"]);
  assert.deepEqual(uids([a, b], { Recurrence: ["recurring"] }), ["a"]);
  assert.deepEqual(uids([a, b], { Defer: ["anything"] }), []);
});

test("upcomingRange applies only to upcoming-bucket tasks when 'upcoming' is selected", () => {
  const f = { Due: ["upcoming"], upcomingRange: "7d" };
  const soon = task({ uid: "soon", dueBucket: "upcoming", dueAt: d(2026, 7, 15) }); // last ms of day 7
  const late = task({ uid: "late", dueBucket: "upcoming", dueAt: d(2026, 7, 16) });
  assert.deepEqual(uids([soon, late], f), ["soon"]);
});

test("upcomingRange excludes dates before today, and is skipped without the upcoming bucket", () => {
  const past = task({ uid: "past", dueBucket: "upcoming", dueAt: d(2026, 7, 8) });
  assert.deepEqual(uids([past], { Due: ["upcoming"], upcomingRange: "7d" }), []);
  // dueBucket is not "upcoming" → range never consulted
  const other = task({ uid: "other", dueBucket: "overdue", dueAt: d(2020, 1, 1) });
  assert.deepEqual(uids([other], { Due: ["upcoming", "overdue"], upcomingRange: "7d" }), ["other"]);
  // 1d is not a valid upcoming range → no filtering
  const far = task({ uid: "far", dueBucket: "upcoming", dueAt: d(2030, 1, 1) });
  assert.deepEqual(uids([far], { Due: ["upcoming"], upcomingRange: "1d" }), ["far"]);
});

// ========================= metadata =========================

test("priority, energy and gtd", () => {
  const hi = task({ uid: "hi", metadata: { priority: "high", energy: "low", gtd: "Next Action" } });
  const none = task({ uid: "none", metadata: {} });
  assert.deepEqual(uids([hi, none], { Priority: ["high"] }), ["hi"]);
  assert.deepEqual(uids([hi, none], { Priority: [""] }), ["none"], "empty string matches unset");
  assert.deepEqual(uids([hi, none], { Energy: ["low"] }), ["hi"]);
  assert.deepEqual(uids([hi, none], { GTD: ["next action"] }), ["hi"], "gtd is lowercased before matching");
  assert.deepEqual(uids([hi, none], { GTD: ["Next Action"] }), [], "gtd filter values must be lowercase");
});

test("projectText is an exact match; waitingText and contextText are substring matches", () => {
  const web = task({ uid: "web", metadata: { project: "Website Refresh", waitingFor: "Alice Smith", context: ["home", "errands"] } });
  assert.deepEqual(uids([web], { projectText: "website refresh" }), ["web"], "case-insensitive");
  assert.deepEqual(uids([web], { projectText: "Website" }), [], "exact match, not substring");
  assert.deepEqual(uids([web], { waitingText: "alice" }), ["web"], "substring");
  assert.deepEqual(uids([web], { contextText: "err" }), ["web"], "substring across the context array");
  assert.deepEqual(uids([web], { contextText: "office" }), []);
});

test("context filter tolerates a missing or non-array context", () => {
  const t = task({ uid: "t", metadata: { context: "home" } });
  assert.deepEqual(uids([t], { contextText: "home" }), [], "non-array context matches nothing");
});

// ========================= blocked =========================

test("Blocked filter splits blocked from actionable", () => {
  const blocked = task({ uid: "b", isBlocked: true });
  const open = task({ uid: "a", isBlocked: false });
  assert.deepEqual(uids([blocked, open], { Blocked: ["blocked"] }), ["b"]);
  assert.deepEqual(uids([blocked, open], { Blocked: ["actionable"] }), ["a"]);
  assert.deepEqual(uids([blocked, open], { blocked: ["blocked"] }), ["b"], "lowercase alias works");
});

// ========================= stalled =========================

test("Stalled: a task not edited within stalledDays is stalled", () => {
  const stale = task({ uid: "stale", editedAt: epoch(2026, 6, 1) });   // 38 days ago
  const fresh = task({ uid: "fresh", editedAt: epoch(2026, 7, 8) });   // yesterday
  assert.deepEqual(uids([stale, fresh], { Stalled: ["stalled"] }), ["stale"]);
  assert.deepEqual(uids([stale, fresh], { Stalled: ["active"] }), ["fresh"]);
});

test("Stalled: a missing edit time counts as stalled", () => {
  const noEdit = task({ uid: "noedit", editedAt: null });
  const zero = task({ uid: "zero", editedAt: 0 });
  assert.deepEqual(uids([noEdit, zero], { Stalled: ["stalled"] }), ["noedit", "zero"]);
});

test("Stalled: completed tasks are never stalled", () => {
  const done = task({ uid: "done", isCompleted: true, editedAt: epoch(2020, 1, 1) });
  assert.deepEqual(uids([done], { Stalled: ["stalled"] }), []);
  assert.deepEqual(uids([done], { Stalled: ["active"] }), ["done"]);
});

test("Stalled: stalledDays is configurable and defaults to 14", () => {
  // Edited 20 days ago: stalled at the default, active with a 30-day threshold.
  const t = task({ uid: "t", editedAt: epoch(2026, 6, 19) });
  assert.deepEqual(uids([t], { Stalled: ["stalled"] }), ["t"]);
  assert.deepEqual(uids([t], { Stalled: ["stalled"], stalledDays: 30 }), []);
  assert.deepEqual(uids([t], { Stalled: ["active"], stalledDays: 30 }), ["t"]);
});

test("Stalled: the boundary is startOfToday minus stalledDays", () => {
  const justInside = task({ uid: "in", editedAt: START_OF_TODAY.getTime() - 14 * 864e5 });
  const justOutside = task({ uid: "out", editedAt: START_OF_TODAY.getTime() - 14 * 864e5 - 1 });
  assert.deepEqual(uids([justInside, justOutside], { Stalled: ["stalled"] }), ["out"]);
});

test("Stalled has no lowercase alias (documents current behaviour)", () => {
  const stale = task({ uid: "stale", editedAt: epoch(2020, 1, 1) });
  assert.deepEqual(uids([stale], { stalled: ["active"] }), ["stale"], "lowercase key is ignored");
});

// ========================= query =========================

test("query searches title, pageTitle and text, case-insensitively", () => {
  const t = task({ uid: "t", title: "Buy Milk", pageTitle: "Groceries", text: "{{[[TODO]]}} Buy Milk" });
  assert.deepEqual(uids([t], {}, "milk"), ["t"]);
  assert.deepEqual(uids([t], {}, "GROCERIES"), ["t"]);
  assert.deepEqual(uids([t], {}, "  milk  "), ["t"], "query is trimmed");
  assert.deepEqual(uids([t], {}, "bread"), []);
  assert.deepEqual(uids([t], {}, ""), ["t"], "empty query does not filter");
});

test("query searches resolved block-reference titles", () => {
  const t = task({
    uid: "t",
    title: "((xJuYmHX0v))",
    text: "{{[[TODO]]}} ((xJuYmHX0v))",
    displayTitle: "Commit the dashboard performance changes",
  });
  assert.deepEqual(uids([t], {}, "performance"), ["t"]);
});

test("query tolerates a missing pageTitle", () => {
  const t = task({ uid: "t", pageTitle: null, title: "Alpha" });
  assert.deepEqual(uids([t], {}, "alpha"), ["t"]);
});

// ========================= composition + clock =========================

test("filters compose — all must pass", () => {
  const match = task({ uid: "match", isCompleted: false, isBlocked: false, dueBucket: "overdue", metadata: { priority: "high", project: "Web" } });
  const wrongPriority = task({ uid: "p", dueBucket: "overdue", metadata: { priority: "low", project: "Web" } });
  const wrongBucket = task({ uid: "b", dueBucket: "upcoming", metadata: { priority: "high", project: "Web" } });
  const filters = { Completion: ["open"], Due: ["overdue"], Priority: ["high"], projectText: "Web", Blocked: ["actionable"] };
  assert.deepEqual(uids([match, wrongPriority, wrongBucket], filters, "task"), ["match"]);
});

test("the clock is read once per pass — all tasks see the same 'today'", () => {
  // Two identical tasks either side of the stalled boundary must classify
  // consistently regardless of how long the pass takes.
  const tasks = Array.from({ length: 50 }, (_, i) => task({ uid: `u${i}`, editedAt: epoch(2026, 6, 1) }));
  assert.equal(run(tasks, { Stalled: ["stalled"] }).length, 50);
});

test("an omitted clock falls back to the real one", () => {
  const fresh = task({ uid: "fresh", editedAt: Date.now() });
  assert.deepEqual(applyFilters([fresh], { Stalled: ["active"] }).map((t) => t.uid), ["fresh"]);
});

test("query defaults to empty when omitted", () => {
  assert.equal(applyFilters([task()], {}).length, 1);
});
