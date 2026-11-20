import test from "node:test";
import assert from "node:assert/strict";

import {
  findBetterTasksSettingsTab,
  openBetterTasksSettings,
  selectBetterTasksSettingsTab,
} from "../src/core/open-settings.js";

function tab(text) {
  return {
    textContent: text,
    clicks: 0,
    click() { this.clicks += 1; },
  };
}

test("developer settings tab wins when release and fork are both installed", () => {
  const release = tab("Better Tasks");
  const developer = tab("Better Tasks (dev)");
  const documentLike = { querySelectorAll: () => [release, developer] };

  assert.equal(findBetterTasksSettingsTab(documentLike), developer);
  assert.equal(selectBetterTasksSettingsTab(documentLike), true);
  assert.equal(developer.clicks, 1);
  assert.equal(release.clicks, 0);
});

test("settings opener launches Roam Depot and selects the asynchronously mounted tab", async () => {
  const developer = tab("Better Tasks (dev)");
  let depotClicks = 0;
  let polls = 0;
  const documentLike = {
    querySelector(selector) {
      if (selector === ".rm-left-sidebar__roam-depot") {
        return { click() { depotClicks += 1; } };
      }
      return null;
    },
    querySelectorAll() {
      polls += 1;
      return polls >= 3 ? [developer] : [];
    },
  };

  const opened = await openBetterTasksSettings({
    documentLike,
    wait: async () => {},
    attempts: 4,
  });
  assert.equal(opened, true);
  assert.equal(depotClicks, 1);
  assert.equal(developer.clicks, 1);
});

test("settings opener fails cleanly when Roam Depot is unavailable", async () => {
  const documentLike = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const opened = await openBetterTasksSettings({ documentLike, roamAlphaAPI: null });
  assert.equal(opened, false);
});
