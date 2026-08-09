import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyTaskStatusTagToManagedText,
  createBetterTasksCapabilityV2,
  createBetterTasksStatusTagRequester,
  extractTaskStatusTag,
  resolveEditorBlockUid,
  stripTaskStatusTagFromTaskText,
} from "../src/core/task-status-capability.js";
import { installBetterTasksCapabilityVersion } from "../src/core/better-tasks-capability.js";

const contract = JSON.parse(
  readFileSync(new URL("./fixtures/better-tasks-capability-v2.json", import.meta.url), "utf8")
);

function fakeEditor({ id = "", ancestors = {} } = {}) {
  return {
    id,
    dataset: {},
    getAttribute: () => null,
    closest: (selector) => ancestors[selector] || null,
  };
}

function fakeUidHost(attribute, uid) {
  return {
    id: "",
    dataset: {},
    getAttribute: (name) => name === attribute ? uid : null,
  };
}

test("editor UID resolution supports current Roam data-block-uid ancestors", () => {
  const uid = "1HOlv_LF5";
  const editor = fakeEditor({
    ancestors: {
      "[data-block-uid]": fakeUidHost("data-block-uid", uid),
    },
  });
  assert.equal(resolveEditorBlockUid(editor), uid);
});

test("editor UID resolution supports legacy attributes, input IDs, and DOM helpers", () => {
  assert.equal(resolveEditorBlockUid(fakeEditor({
    ancestors: { "[data-uid]": fakeUidHost("data-uid", "abcdefghi") },
  })), "abcdefghi");
  assert.equal(resolveEditorBlockUid(fakeEditor({ id: "block-input-123456789" })), "123456789");
  assert.equal(resolveEditorBlockUid(fakeEditor(), {
    blockUidFromTarget: () => "helperUID",
  }), "helperUID");
  assert.equal(resolveEditorBlockUid(fakeEditor(), {
    blockUidFromTarget: () => "not a uid",
  }), null);
});

test("managed status transform preserves TODO/DONE and task prose", () => {
  assert.equal(
    applyTaskStatusTagToManagedText("{{[[TODO]]}} Task", "task-status/Active").nextString,
    "{{[[TODO]]}} #[[task-status/Active]] Task"
  );
  assert.equal(
    applyTaskStatusTagToManagedText("{{[[DONE]]}} #[[task-status/Active]] Task", "task-status/Waiting").nextString,
    "{{[[DONE]]}} #[[task-status/Waiting]] Task"
  );
  assert.equal(
    applyTaskStatusTagToManagedText("{{[[DONE]]}} #[[task-status/Active]] Task", null).nextString,
    "{{[[DONE]]}}  Task"
  );
});

test("status extraction and dashboard stripping recognize the managed prefix only", () => {
  const input = "{{[[TODO]]}} #[[task-status/Active]] Call #[[task-status/Waiting]] later";
  assert.deepEqual(extractTaskStatusTag(input), {
    title: "task-status/Active",
    label: "Active",
    taskState: "TODO",
  });
  assert.equal(
    stripTaskStatusTagFromTaskText(input),
    "{{[[TODO]]}}  Call #[[task-status/Waiting]] later"
  );
});

test("invalid status namespaces and non-task targets are rejected", () => {
  assert.equal(applyTaskStatusTagToManagedText("plain", "task-status/Active").ok, false);
  assert.equal(applyTaskStatusTagToManagedText("{{[[TODO]]}} task", "project/Active").reason, "invalid-status-tag-title");
  assert.equal(applyTaskStatusTagToManagedText("{{[[TODO]]}} task", "task-status/A/B").reason, "invalid-status-tag-title");
});

function requesterHarness({ initial = "{{[[TODO]]}} Task", classification = { kind: "task", uid: "task" } } = {}) {
  let value = initial;
  let writes = 0;
  let notifications = 0;
  const request = createBetterTasksStatusTagRequester({
    readBlockFresh: async () => ({ uid: "task", string: value }),
    classifyBlock: async () => classification,
    writeBlockString: async (_uid, next) => { writes += 1; value = next; },
    notifyBlockChange: () => { notifications += 1; },
  });
  return { request, get value() { return value; }, get writes() { return writes; }, get notifications() { return notifications; } };
}

test("provider writes and certifies one status-only change", async () => {
  const harness = requesterHarness();
  const result = await harness.request("task", {
    expectedString: "{{[[TODO]]}} Task",
    statusTagTitle: "task-status/Active",
  });
  assert.equal(result.status, "updated");
  assert.equal(harness.value, "{{[[TODO]]}} #[[task-status/Active]] Task");
  assert.equal(harness.writes, 1);
  assert.equal(harness.notifications, 1);
});

test("provider refuses stale, non-owned, and active-editor-diverged targets", async () => {
  const stale = requesterHarness();
  assert.equal((await stale.request("task", { expectedString: "old", statusTagTitle: "task-status/Active" })).reason, "stale-expected-string");
  assert.equal(stale.writes, 0);

  const ordinary = requesterHarness({ classification: { kind: "ordinary" } });
  assert.equal((await ordinary.request("task", { expectedString: "{{[[TODO]]}} Task", statusTagTitle: "task-status/Active" })).reason, "target-not-managed-task");
  assert.equal(ordinary.writes, 0);

  let value = "{{[[TODO]]}} Task";
  let writes = 0;
  const edited = createBetterTasksStatusTagRequester({
    readBlockFresh: async () => ({ uid: "task", string: value }),
    classifyBlock: async () => ({ kind: "task" }),
    writeBlockString: async () => { writes += 1; },
    getLiveEditorString: () => "{{[[TODO]]}} Unsaved edit",
  });
  assert.equal((await edited("task", { expectedString: value, statusTagTitle: "task-status/Active" })).reason, "active-editor-diverged");
  assert.equal(writes, 0);
});

test("provider certifies a slash-command editor handoff without changing task state", async () => {
  const writes = [];
  let stored = "{{[[TODO]]}} Call landlord";
  const rawEditor = "{{[[TODO]]}} Call /task status: Active landlord";
  const cleanedEditor = "{{[[TODO]]}} Call  landlord";
  const request = createBetterTasksStatusTagRequester({
    readBlockFresh: async () => ({ uid: "task", string: stored }),
    classifyBlock: async () => ({ kind: "task", uid: "task" }),
    writeBlockString: async (_uid, string) => {
      writes.push(string);
      stored = string;
    },
    getLiveEditorString: () => rawEditor,
  });

  const result = await request("task", {
    expectedString: stored,
    statusTagTitle: "task-status/Active",
    source: "task-status-tags",
    expectedLiveEditorString: rawEditor,
    editorString: cleanedEditor,
  });

  assert.equal(result.status, "updated");
  assert.deepEqual(writes, ["{{[[TODO]]}} #[[task-status/Active]] Call  landlord"]);
});

test("provider rejects editor task-state drift and a last-moment editor change", async () => {
  const base = {
    readBlockFresh: async () => ({ uid: "task", string: "{{[[DONE]]}} Finished" }),
    classifyBlock: async () => ({ kind: "task", uid: "task" }),
    writeBlockString: async () => assert.fail("must not write"),
  };
  const rawTodoEditor = "{{[[TODO]]}} /task status: Active Finished";
  const stateMismatch = createBetterTasksStatusTagRequester({
    ...base,
    getLiveEditorString: () => rawTodoEditor,
  });
  const mismatchResult = await stateMismatch("task", {
    expectedString: "{{[[DONE]]}} Finished",
    statusTagTitle: "task-status/Active",
    source: "task-status-tags",
    expectedLiveEditorString: rawTodoEditor,
    editorString: "{{[[TODO]]}} Finished",
  });
  assert.equal(mismatchResult.status, "rejected");
  assert.equal(mismatchResult.reason, "editor-task-state-mismatch");

  let editorRead = 0;
  const rawDoneEditor = "{{[[DONE]]}} /task status: Active Finished";
  const changed = createBetterTasksStatusTagRequester({
    ...base,
    getLiveEditorString: () => {
      editorRead += 1;
      return editorRead === 1 ? rawDoneEditor : "{{[[DONE]]}} user kept typing";
    },
  });
  const changedResult = await changed("task", {
    expectedString: "{{[[DONE]]}} Finished",
    statusTagTitle: "task-status/Active",
    source: "task-status-tags",
    expectedLiveEditorString: rawDoneEditor,
    editorString: "{{[[DONE]]}} Finished",
  });
  assert.equal(changedResult.status, "conflict");
  assert.equal(changedResult.reason, "active-editor-changed-before-write");
});

test("provider certifies an update that throws after commit", async () => {
  let value = "{{[[DONE]]}} Task";
  const request = createBetterTasksStatusTagRequester({
    readBlockFresh: async () => ({ uid: "task", string: value }),
    classifyBlock: async () => ({ kind: "task" }),
    writeBlockString: async (_uid, next) => {
      value = next;
      throw new Error("lost acknowledgement");
    },
  });
  const result = await request("task", {
    expectedString: "{{[[DONE]]}} Task",
    statusTagTitle: "task-status/Cancelled",
  });
  assert.equal(result.status, "updated");
  assert.equal(result.reason, "write-threw-after-commit");
  assert.match(result.string, /^\{\{\[\[DONE\]\]\}\}/);
});

test("v2 extends rather than mutates the frozen v1 surface", () => {
  const v1 = Object.freeze({
    version: "1.0.0",
    classifyBlock() {},
    requestDelete() {},
    createSubtask() {},
  });
  const requestStatusTag = () => {};
  const v2 = createBetterTasksCapabilityV2(v1, requestStatusTag);
  assert.deepEqual(Object.keys(v1), ["version", "classifyBlock", "requestDelete", "createSubtask"]);
  assert.deepEqual(Object.keys(v2), contract.exactMethods);
  assert.equal(v2.requestStatusTag, requestStatusTag);
  assert.equal(Object.isFrozen(v2), true);
});

test("v2 installation is identity-fenced across reload and stale unload", () => {
  const windowLike = {};
  const first = { version: "first" };
  const second = { version: "second" };
  const unloadFirst = installBetterTasksCapabilityVersion(windowLike, "v2", first);
  const unloadSecond = installBetterTasksCapabilityVersion(windowLike, "v2", second);
  unloadFirst();
  assert.equal(windowLike.betterTasks.v2, second);
  unloadSecond();
  assert.equal(windowLike.betterTasks, undefined);
});

test("production index installs v2 and separates the workflow label from dashboard title", () => {
  const indexSource = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const dashboardSource = readFileSync(new URL("../src/dashboard/App.jsx", import.meta.url), "utf8");
  assert.match(indexSource, /createBetterTasksCapabilityV2\(v1, requestStatusTag\)/);
  assert.match(indexSource, /installBetterTasksCapabilityVersion\(window, "v2", v2\)/);
  assert.match(indexSource, /stripTaskStatusTagFromTaskText\(text\)/);
  assert.match(indexSource, /resolveEditorBlockUid\(active, window\.roamAlphaAPI\?\.util\?\.dom\)/);
  assert.match(indexSource, /statusTitle: info\.taskStatus\.title/);
  assert.match(dashboardSource, /data-task-status-title=/);
});
