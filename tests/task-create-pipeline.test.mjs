import test from "node:test";
import assert from "node:assert/strict";

import { runTaskCreationPipeline } from "../src/core/task-create-pipeline.js";

function setup(overrides = {}) {
  const calls = [];
  const stage = (name, value = undefined) => async () => {
    calls.push(name);
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    calls,
    args: {
      createdUid: "created-task",
      createRoot: stage("root"),
      confirmRootAfterCreateFailure: async () => false,
      initializeProps: stage("props"),
      applyAttributes: stage("attributes"),
      applyStatus: stage("status"),
      buildSummary: stage("summary", { uid: "created-task", status: "TODO" }),
      ...overrides,
    },
  };
}

test("root creation failure is explicitly a zero-write failure", async () => {
  const { args } = setup({ createRoot: async () => { throw new Error("create failed"); } });
  const result = await runTaskCreationPipeline(args);
  assert.equal(result.partialSuccess, false);
  assert.equal(result.code, "BT_TASK_CREATE_ROOT_FAILED");
  assert.equal("createdUid" in result, false);
});

test("a committed root with a lost response exposes its UID and forbids a blind retry", async () => {
  const { args } = setup({
    createRoot: async () => { throw new Error("response lost"); },
    confirmRootAfterCreateFailure: async () => true,
  });
  const result = await runTaskCreationPipeline(args);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.createdUid, "created-task");
  assert.equal(result.code, "BT_TASK_CREATE_ROOT_RESPONSE_LOST");
});

test("an unreadable root state is explicit and still exposes the generated UID", async () => {
  const { args } = setup({
    createRoot: async () => { throw new Error("response lost"); },
    confirmRootAfterCreateFailure: async () => { throw new Error("fresh read unavailable"); },
  });
  const result = await runTaskCreationPipeline(args);
  assert.equal(result.partialSuccess, null);
  assert.equal(result.createdUid, "created-task");
  assert.equal(result.code, "BT_TASK_CREATE_ROOT_STATE_UNKNOWN");
  assert.match(result.confirmationError.message, /fresh read unavailable/);
});

for (const [field, code, reason] of [
  ["initializeProps", "BT_TASK_CREATE_PROPS_FAILED", "created-task-props-failed"],
  ["applyAttributes", "BT_TASK_CREATE_ATTRIBUTES_FAILED", "created-task-attributes-failed"],
  ["applyStatus", "BT_TASK_CREATE_STATUS_FAILED", "created-task-status-failed"],
  ["buildSummary", "BT_TASK_CREATE_SUMMARY_FAILED", "created-task-summary-failed"],
]) {
  test(`a real post-create ${field} failure exposes the created UID`, async () => {
    let created = false;
    const { args } = setup({
      createRoot: async () => { created = true; },
      [field]: async () => { throw new Error(`${field} failed`); },
    });
    const result = await runTaskCreationPipeline(args);
    assert.equal(created, true);
    assert.equal(result.partialSuccess, true);
    assert.equal(result.createdUid, "created-task");
    assert.equal(result.code, code);
    assert.equal(result.reason, reason);
  });
}

test("successful production pipeline returns only the recognized summary", async () => {
  const { args, calls } = setup();
  assert.deepEqual(await runTaskCreationPipeline(args), { uid: "created-task", status: "TODO" });
  assert.deepEqual(calls, ["root", "props", "attributes", "status", "summary"]);
});
