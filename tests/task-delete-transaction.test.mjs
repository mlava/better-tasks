import test from "node:test";
import assert from "node:assert/strict";

import { createTaskDeleteFingerprint } from "../src/core/task-delete-flow.js";
import {
  buildExternalReferenceOperations,
  runTransactionalTaskDelete,
} from "../src/core/task-delete-transaction.js";

function snapshot(overrides = {}) {
  return {
    version: 2,
    rootUid: "task",
    parentUid: "page",
    order: 4,
    tree: {
      uid: "task",
      string: "{{[[TODO]]}} task",
      order: 4,
      props: { rt: { id: "task-id" } },
      children: [{ uid: "child", string: "note", order: 0, children: [] }],
    },
    treeUids: ["task", "child"],
    externalRefs: {
      dependents: [
        {
          taskUid: "dependent-one", attributeUid: "depends-one", attributeName: "BT_attrDepends",
          attributeString: "BT_attrDepends:: ((task)), ((kept))", attributeOrder: 0,
          prevDepends: ["task", "kept"],
        },
        {
          taskUid: "dependent-two", attributeUid: "depends-two", attributeName: "BT_attrDepends",
          attributeString: "BT_attrDepends:: ((task))", attributeOrder: 1, prevDepends: ["task"],
        },
      ],
      explicitSubtasks: [{
        taskUid: "linked", refUid: "task", attributeUid: "parent-link",
        attributeName: "BT_attrParent", attributeString: "BT_attrParent:: ((task))", attributeOrder: 2,
      }],
    },
    capturedAt: 10,
    ...overrides,
  };
}

test("external-reference operations contain the exact before state needed for idempotent restoration", () => {
  assert.deepEqual(buildExternalReferenceOperations(snapshot()), [
    {
      kind: "dependent", taskUid: "dependent-one", attributeUid: "depends-one", attributeOrder: 0,
      beforeString: "BT_attrDepends:: ((task)), ((kept))", afterString: "BT_attrDepends:: ((kept))",
    },
    {
      kind: "dependent", taskUid: "dependent-two", attributeUid: "depends-two", attributeOrder: 1,
      beforeString: "BT_attrDepends:: ((task))", afterString: null,
    },
    {
      kind: "explicit-parent", taskUid: "linked", attributeUid: "parent-link", attributeOrder: 2,
      beforeString: "BT_attrParent:: ((task))", afterString: null,
    },
  ]);
});

const appliedResult = (operation) => ({
  status: "applied", applied: true, reason: "confirmed", operation,
});
const restoredResult = (operation) => ({
  status: "restored", restored: true, reason: "confirmed", operation,
});

for (const failAt of [1, 2]) {
  test(`cleanup failure at external-reference mutation ${failAt} restores only earlier proven writes`, async () => {
    const applied = [];
    const restored = [];
    let deleteCalls = 0;
    const outcome = await runTransactionalTaskDelete({
      snapshot: snapshot(),
      applyExternalReference: async (operation) => {
        applied.push(operation.attributeUid);
        if (applied.length === failAt) {
          return { status: "conflict", applied: false, reason: "not-proven", operation };
        }
        return appliedResult(operation);
      },
      restoreExternalReference: async (operation) => { restored.push(operation.attributeUid); return restoredResult(operation); },
      deleteRoot: async () => { deleteCalls += 1; },
      rootExistsFresh: async () => true,
      notifyAfterDelete: async () => [],
    });
    assert.equal(outcome.status, "not-deleted");
    assert.equal(outcome.didDelete, false);
    assert.equal(outcome.restored, true);
    assert.deepEqual(restored, applied.slice(0, -1).reverse());
    assert.equal(outcome.provenAppliedCount, failAt - 1);
    assert.equal(deleteCalls, 0);
  });
}

test("an uncertain post-write outcome is included in conflict-fenced compensation", async () => {
  const restored = [];
  let deleteCalls = 0;
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => ({
      status: "unknown",
      applied: false,
      writeAttempted: true,
      reason: "apply-after-read-failed",
      operation,
    }),
    restoreExternalReference: async (operation) => {
      restored.push(operation.attributeUid);
      return { status: "already-restored", restored: true, operation };
    },
    deleteRoot: async () => { deleteCalls += 1; },
    rootExistsFresh: async () => true,
    notifyAfterDelete: async () => [],
  });
  assert.equal(outcome.status, "not-deleted");
  assert.equal(outcome.restored, true);
  assert.equal(outcome.provenAppliedCount, 0);
  assert.equal(outcome.rollbackCandidateCount, 1);
  assert.deepEqual(restored, ["depends-one"]);
  assert.equal(deleteCalls, 0);
});

test("a pre-write failure never adds the current reference to compensation", async () => {
  const restored = [];
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => ({
      status: "unknown",
      applied: false,
      writeAttempted: false,
      reason: "apply-before-read-failed",
      operation,
    }),
    restoreExternalReference: async (operation) => {
      restored.push(operation.attributeUid);
      return restoredResult(operation);
    },
    deleteRoot: async () => {},
    rootExistsFresh: async () => true,
    notifyAfterDelete: async () => [],
  });
  assert.equal(outcome.status, "not-deleted");
  assert.equal(outcome.rollbackCandidateCount, 0);
  assert.deepEqual(restored, []);
});

test("raw root deletion failure restores all external references and reports the fresh graph state", async () => {
  const applied = [];
  const restored = [];
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => { applied.push(operation.attributeUid); return appliedResult(operation); },
    restoreExternalReference: async (operation) => { restored.push(operation.attributeUid); return restoredResult(operation); },
    deleteRoot: async () => { throw new Error("delete rejected"); },
    rootExistsFresh: async () => true,
    notifyAfterDelete: async () => [],
  });
  assert.equal(outcome.status, "not-deleted");
  assert.equal(outcome.reason, "root-delete-not-observed-references-restored");
  assert.deepEqual(restored, applied.slice().reverse());
});

test("root state is observed before the first compensating reference write", async () => {
  const events = [];
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => {
      events.push(`apply:${operation.attributeUid}`);
      return appliedResult(operation);
    },
    restoreExternalReference: async (operation) => {
      events.push(`restore:${operation.attributeUid}`);
      return restoredResult(operation);
    },
    deleteRoot: async () => { events.push("delete"); throw new Error("response lost"); },
    rootExistsFresh: async () => { events.push("root-read"); return true; },
    notifyAfterDelete: async () => [],
  });
  assert.equal(outcome.status, "not-deleted");
  assert.ok(events.indexOf("root-read") < events.findIndex((entry) => entry.startsWith("restore:")));
});

test("root delete rejection after a committed delete reports deleted instead of inviting retry", async () => {
  let notifications = 0;
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => appliedResult(operation),
    restoreExternalReference: async (operation) => restoredResult(operation),
    deleteRoot: async () => { throw new Error("response lost"); },
    rootExistsFresh: async () => false,
    notifyAfterDelete: async () => { notifications += 1; return []; },
  });
  assert.equal(outcome.status, "deleted");
  assert.equal(outcome.didDelete, true);
  assert.equal(outcome.reason, "root-delete-response-lost-root-absent");
  assert.equal(outcome.provenAppliedCount, 3);
  assert.equal(outcome.restoredOperationCount, 0);
  assert.equal(notifications, 1);
});

test("post-delete notification exceptions cannot turn a canonical delete into a false failure", async () => {
  let existenceChecks = 0;
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => appliedResult(operation),
    restoreExternalReference: async (operation) => restoredResult(operation),
    deleteRoot: async () => {},
    rootExistsFresh: async () => { existenceChecks += 1; return false; },
    notifyAfterDelete: async () => { throw new Error("dashboard unavailable"); },
  });
  assert.equal(outcome.status, "deleted");
  assert.equal(outcome.didDelete, true);
  assert.equal(outcome.notificationErrors.length, 1);
  assert.equal(existenceChecks, 1);
});

test("a resolved raw delete that is not visible in a fresh read rolls references back and reports not deleted", async () => {
  const restored = [];
  let notifications = 0;
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => appliedResult(operation),
    restoreExternalReference: async (operation) => { restored.push(operation.attributeUid); return restoredResult(operation); },
    deleteRoot: async () => {},
    rootExistsFresh: async () => true,
    notifyAfterDelete: async () => { notifications += 1; },
  });
  assert.equal(outcome.status, "not-deleted");
  assert.equal(outcome.didDelete, false);
  assert.equal(outcome.restored, true);
  assert.equal(outcome.reason, "root-delete-not-observed-references-restored");
  assert.deepEqual(restored, ["parent-link", "depends-two", "depends-one"]);
  assert.equal(notifications, 0);
});

test("a failed fresh post-delete read returns an explicit unknown state and never notifies success", async () => {
  const restored = [];
  let notifications = 0;
  const outcome = await runTransactionalTaskDelete({
    snapshot: snapshot(),
    applyExternalReference: async (operation) => appliedResult(operation),
    restoreExternalReference: async (operation) => { restored.push(operation.attributeUid); return restoredResult(operation); },
    deleteRoot: async () => {},
    rootExistsFresh: async () => { throw new Error("fresh read unavailable"); },
    notifyAfterDelete: async () => { notifications += 1; },
  });
  assert.equal(outcome.status, "delete-state-unknown");
  assert.equal(outcome.didDelete, null);
  assert.equal(outcome.reason, "root-delete-verification-failed");
  assert.equal(outcome.externalReferencesRestored, false);
  assert.deepEqual(restored, []);
  assert.equal(notifications, 0);
});

test("destructive fingerprint is deterministic and changes for every cleanup/restore input", () => {
  const base = snapshot();
  const fingerprint = createTaskDeleteFingerprint(base);
  const clones = [
    { ...base, parentUid: "other-page" },
    { ...base, order: 5, tree: { ...base.tree, order: 5 } },
    { ...base, tree: { ...base.tree, string: "{{[[TODO]]}} edited" } },
    { ...base, tree: { ...base.tree, props: { rt: { id: "changed-id" } } } },
    { ...base, tree: { ...base.tree, open: false } },
    { ...base, tree: { ...base.tree, heading: 2 } },
    { ...base, tree: { ...base.tree, textAlign: "center" } },
    { ...base, tree: { ...base.tree, children: [{ ...base.tree.children[0], string: "changed note" }] } },
    { ...base, tree: { ...base.tree, children: [{ ...base.tree.children[0], order: 1 }] } },
    { ...base, treeUids: [...base.treeUids, "extra"], tree: { ...base.tree, children: [...base.tree.children, { uid: "extra", string: "x", order: 1, children: [] }] } },
  ];
  const dependentFields = ["taskUid", "attributeUid", "attributeName", "attributeString", "attributeOrder", "prevDepends"];
  for (const field of dependentFields) {
    const entry = { ...base.externalRefs.dependents[0] };
    if (field === "attributeString") {
      entry.attributeString = "Changed Depends:: ((task)), ((kept))";
      entry.attributeName = "Changed Depends";
    } else if (field === "attributeName") {
      entry.attributeName = "Changed Depends";
      entry.attributeString = "Changed Depends:: ((task)), ((kept))";
    } else if (field === "attributeOrder") entry[field] = 9;
    else if (field === "prevDepends") {
      entry[field] = ["kept", "task"];
      entry.attributeString = "BT_attrDepends:: ((kept)), ((task))";
    } else entry[field] = `${entry[field]}-changed`;
    clones.push({ ...base, externalRefs: { ...base.externalRefs, dependents: [entry, base.externalRefs.dependents[1]] } });
  }
  const explicitFields = ["taskUid", "refUid", "attributeUid", "attributeName", "attributeString", "attributeOrder"];
  for (const field of explicitFields) {
    const entry = { ...base.externalRefs.explicitSubtasks[0] };
    if (field === "attributeString") {
      entry.attributeString = "Changed Parent:: ((task))";
      entry.attributeName = "Changed Parent";
    } else if (field === "attributeName") {
      entry.attributeName = "Changed Parent";
      entry.attributeString = "Changed Parent:: ((task))";
    } else if (field === "attributeOrder") entry[field] = 7;
    else if (field === "refUid") {
      entry.refUid = "child";
      entry.attributeString = "BT_attrParent:: ((child))";
    } else entry[field] = `${entry[field]}-changed`;
    clones.push({ ...base, externalRefs: { ...base.externalRefs, explicitSubtasks: [entry] } });
  }
  for (const changed of clones) {
    assert.notEqual(createTaskDeleteFingerprint(changed), fingerprint);
  }
  const reordered = snapshot({
    externalRefs: {
      dependents: base.externalRefs.dependents.slice().reverse(),
      explicitSubtasks: base.externalRefs.explicitSubtasks.slice(),
    },
    capturedAt: 999,
  });
  assert.equal(createTaskDeleteFingerprint(reordered), fingerprint);
});
