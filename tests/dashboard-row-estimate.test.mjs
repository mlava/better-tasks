import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_ROW_ESTIMATE_DEFAULTS,
  estimateDashboardRowSize,
  visibleDashboardText,
} from "../src/dashboard/rowEstimate.js";

test("group and subtask estimates match their stable rendered heights", () => {
  assert.equal(estimateDashboardRowSize({ type: "group" }), 30);
  assert.equal(estimateDashboardRowSize({ type: "subtask" }), 80);
});

test("compact rows no longer use the old 100px blanket guess", () => {
  const size = estimateDashboardRowSize({
    type: "task",
    task: {
      title: "Short task",
      metadata: {},
      metaPills: [{ type: "due", value: "Mon" }],
    },
  });
  assert.equal(size, 109);
});

test("notes, wrapped titles, and wide project pills predict richer rows", () => {
  const size = estimateDashboardRowSize({
    type: "task",
    task: {
      title: "A long task title that wraps onto a second line in the floating dashboard view",
      metadata: { notes: "A sufficiently long note that occupies both clamped note lines in the task row." },
      metaPills: [
        { type: "due", value: "Mon" },
        { type: "project", value: "{{or: [[A long project name]] | [[Another project]] | +[[Active Projects]]}}" },
        { type: "context", value: "computer" },
        { type: "priority", value: "High" },
        { type: "energy", value: "Medium" },
      ],
    },
  });
  assert.ok(size >= 210, `expected a rich row estimate, received ${size}`);
});

test("wider full-page layouts estimate fewer wraps", () => {
  const row = {
    type: "task",
    task: {
      title: "A fairly long task title that wraps in the compact floating dashboard",
      metadata: { notes: "Some explanatory notes for the task." },
      metaPills: [
        { type: "due", value: "Monday" },
        { type: "project", value: "[[Dashboard Performance]]" },
        { type: "context", value: "computer" },
      ],
    },
  };
  assert.ok(
    estimateDashboardRowSize(row, { viewportWidth: 620 }) >
      estimateDashboardRowSize(row, { viewportWidth: 1200 })
  );
});

test("row estimates count visible Roam text instead of reference markup", () => {
  assert.equal(visibleDashboardText("Review [[Long Project Name]] with **Alex**"), "Review Long Project Name with Alex");
  assert.equal(visibleDashboardText("[Alias](((abcdefghi)))"), "Alias");

  const plain = estimateDashboardRowSize({
    type: "task",
    task: { title: "Review Long Project Name with Alex", metadata: {} },
  });
  const rich = estimateDashboardRowSize({
    type: "task",
    task: { title: "Review [[Long Project Name]] with **Alex**", metadata: {} },
  });
  assert.equal(rich, plain);
});

test("resolved block-reference text drives the estimate instead of the raw UID", () => {
  const resolved = estimateDashboardRowSize({
    type: "task",
    task: {
      title: "See ((xJuYmHX0v))",
      displayTitle: "See the full referenced task title which wraps onto another line",
      metadata: {},
    },
  }, { viewportWidth: 360 });
  const raw = estimateDashboardRowSize({
    type: "task",
    task: { title: "See ((xJuYmHX0v))", metadata: {} },
  }, { viewportWidth: 360 });
  assert.ok(resolved > raw);
});

test("exported defaults document the floating dashboard geometry", () => {
  assert.deepEqual(DASHBOARD_ROW_ESTIMATE_DEFAULTS, {
    group: 30,
    subtask: 80,
    floatingWidth: 620,
  });
});
