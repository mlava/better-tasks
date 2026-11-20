import test from "node:test";
import assert from "node:assert/strict";

import { createExternalReferenceMutationAdapter } from "../src/core/task-delete-external-reference.js";
import { runTransactionalTaskDelete } from "../src/core/task-delete-transaction.js";

function operation(overrides = {}) {
  return {
    kind: "dependent",
    taskUid: "dependent",
    attributeUid: "depends-attr",
    attributeOrder: 2,
    beforeString: "BT_attrDepends:: ((task)), ((kept))",
    afterString: "BT_attrDepends:: ((kept))",
    ...overrides,
  };
}

function raw(state) {
  if (!state) return null;
  return {
    ":block/uid": state.uid,
    ":block/string": state.string,
    ":block/order": state.order,
    ":block/_children": [{ ":block/uid": state.parentUid }],
  };
}

function mockRoam(initialState, hooks = {}) {
  let state = initialState ? { ...initialState } : null;
  const calls = { pull: 0, create: 0, update: 0, delete: 0, move: 0 };
  const api = {
    data: {
      async: {
        pull: async () => {
          calls.pull += 1;
          if (hooks.pull) return hooks.pull({ calls, state, setState: (next) => { state = next; } });
          return raw(state);
        },
      },
      block: {
        create: async ({ location, block }) => {
          calls.create += 1;
          if (hooks.create) return hooks.create({ location, block, calls, state, setState: (next) => { state = next; } });
          if (state) throw new Error("UID already exists");
          state = { uid: block.uid, parentUid: location["parent-uid"], string: block.string, order: location.order };
        },
        update: async ({ block }) => {
          calls.update += 1;
          if (hooks.update) return hooks.update({ block, calls, state, setState: (next) => { state = next; } });
          if (!state) throw new Error("missing");
          state = { ...state, string: block.string };
        },
        delete: async () => {
          calls.delete += 1;
          if (hooks.delete) return hooks.delete({ calls, state, setState: (next) => { state = next; } });
          state = null;
        },
        move: async () => { calls.move += 1; },
      },
    },
  };
  return { api, calls, getState: () => state, setState: (next) => { state = next; } };
}

function beforeState(op = operation()) {
  return {
    uid: op.attributeUid,
    parentUid: op.taskUid,
    string: op.beforeString,
    order: op.attributeOrder,
  };
}

test("pre-write freshness failure performs no mutation and cannot be marked for restore", async () => {
  const roam = mockRoam(beforeState(), { pull: async () => { throw new Error("fresh read failed"); } });
  const adapter = createExternalReferenceMutationAdapter(roam.api);
  const result = await adapter.apply(operation());
  assert.equal(result.status, "unknown");
  assert.equal(result.applied, false);
  assert.equal(result.writeAttempted, false);
  assert.deepEqual(roam.calls, { pull: 1, create: 0, update: 0, delete: 0, move: 0 });
});

test("a failed post-write read reports that the write may have committed", async () => {
  const roam = mockRoam(beforeState(), {
    pull: async ({ calls, state }) => {
      if (calls.pull === 2) throw new Error("verification unavailable");
      return raw(state);
    },
  });
  const result = await createExternalReferenceMutationAdapter(roam.api).apply(operation());
  assert.equal(result.status, "unknown");
  assert.equal(result.applied, false);
  assert.equal(result.writeAttempted, true);
  assert.equal(roam.calls.update, 1);
});

for (const [label, op, hookName] of [
  ["update", operation(), "update"],
  ["delete", operation({ afterString: null }), "delete"],
]) {
  test(`${label} committed-then-threw is proven from the fresh after-state`, async () => {
    const roam = mockRoam(beforeState(op), {
      [hookName]: async ({ block, state, setState }) => {
        setState(hookName === "delete" ? null : { ...state, string: block.string });
        throw new Error("response lost");
      },
    });
    const result = await createExternalReferenceMutationAdapter(roam.api).apply(op);
    assert.equal(result.status, "applied");
    assert.equal(result.applied, true);
    assert.match(result.responseError.message, /response lost/);
  });
}

test("a user edit after cleanup is a rollback conflict and is never overwritten", async () => {
  const op = operation();
  const roam = mockRoam(beforeState(op));
  const adapter = createExternalReferenceMutationAdapter(roam.api);
  assert.equal((await adapter.apply(op)).status, "applied");
  roam.setState({ ...roam.getState(), string: "BT_attrDepends:: ((user-edit))" });
  const writesBeforeRestore = roam.calls.update;
  const result = await adapter.restore(op);
  assert.equal(result.status, "conflict");
  assert.equal(result.restored, false);
  assert.equal(roam.calls.update, writesBeforeRestore);
  assert.equal(roam.getState().string, "BT_attrDepends:: ((user-edit))");
});

test("a concurrently recreated deleted attribute is never overwritten or moved", async () => {
  const op = operation({ afterString: null });
  const roam = mockRoam(beforeState(op));
  const adapter = createExternalReferenceMutationAdapter(roam.api);
  assert.equal((await adapter.apply(op)).status, "applied");
  roam.setState({ ...beforeState(op), string: "BT_attrDepends:: ((user-recreated))", order: 7 });
  const result = await adapter.restore(op);
  assert.equal(result.status, "conflict");
  assert.equal(roam.calls.create, 0);
  assert.equal(roam.calls.move, 0);
  assert.equal(roam.getState().order, 7);
});

test("an order-only third state fences rollback rather than moving a concurrent edit", async () => {
  const op = operation();
  const roam = mockRoam(beforeState(op));
  const adapter = createExternalReferenceMutationAdapter(roam.api);
  assert.equal((await adapter.apply(op)).status, "applied");
  roam.setState({ ...roam.getState(), order: 9 });
  const result = await adapter.restore(op);
  assert.equal(result.status, "conflict");
  assert.equal(roam.calls.move, 0);
  assert.equal(roam.getState().order, 9);
});

test("delete rollback create committed-then-threw is certified as restored", async () => {
  const op = operation({ afterString: null });
  const roam = mockRoam(null, {
    create: async ({ location, block, setState }) => {
      setState({ uid: block.uid, parentUid: location["parent-uid"], string: block.string, order: location.order });
      throw new Error("create response lost");
    },
  });
  const result = await createExternalReferenceMutationAdapter(roam.api).restore(op);
  assert.equal(result.status, "restored");
  assert.equal(result.restored, true);
  assert.match(result.responseError.message, /response lost/);
});

test("transaction surfaces a rollback conflict without clobbering the edited reference", async () => {
  const op = operation();
  const roam = mockRoam(beforeState(op));
  const adapter = createExternalReferenceMutationAdapter(roam.api);
  const snapshot = {
    version: 2,
    rootUid: "task",
    parentUid: "page",
    order: 0,
    tree: { uid: "task", string: "{{[[TODO]]}} task", order: 0, children: [] },
    treeUids: ["task"],
    externalRefs: {
      dependents: [{
        taskUid: op.taskUid,
        attributeUid: op.attributeUid,
        attributeName: "BT_attrDepends",
        attributeString: op.beforeString,
        attributeOrder: op.attributeOrder,
        prevDepends: ["task", "kept"],
      }],
      explicitSubtasks: [],
    },
  };
  const outcome = await runTransactionalTaskDelete({
    snapshot,
    applyExternalReference: async (operationToApply) => {
      const result = await adapter.apply(operationToApply);
      roam.setState({ ...roam.getState(), string: "BT_attrDepends:: ((user-edit))" });
      return result;
    },
    restoreExternalReference: adapter.restore,
    deleteRoot: async () => { throw new Error("delete failed"); },
    rootExistsFresh: async () => true,
    notifyAfterDelete: async () => [],
  });
  assert.equal(outcome.status, "not-deleted");
  assert.equal(outcome.restored, false);
  assert.equal(outcome.reason, "root-delete-not-observed-rollback-conflict");
  assert.equal(roam.getState().string, "BT_attrDepends:: ((user-edit))");
});
