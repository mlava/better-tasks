import test from "node:test";
import assert from "node:assert/strict";

import { shouldAdjustDashboardScrollPositionOnItemSizeChange } from "../src/dashboard/scrollStability.js";

test("late virtual row measurements never rewrite the user's scroll offset", () => {
  assert.equal(shouldAdjustDashboardScrollPositionOnItemSizeChange({}, 24, {}), false);
  assert.equal(shouldAdjustDashboardScrollPositionOnItemSizeChange({}, -18, {}), false);
});
