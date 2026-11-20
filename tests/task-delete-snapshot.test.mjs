import test from "node:test";
import assert from "node:assert/strict";

import {
  TaskDeleteSnapshotError,
  createFreshBlockExistenceReader,
  createStrictTaskDeleteSnapshotReader,
} from "../src/core/task-delete-snapshot.js";
import { runInteractiveTaskDelete } from "../src/core/task-delete-flow.js";

function rawTree() {
  return {
    ":block/uid": "task",
    ":block/string": "{{[[TODO]]}} task",
    ":block/order": 2,
    ":block/props": { ":rt": { ":id": "task-id" } },
    ":block/children": [
      {
        ":block/uid": "note",
        ":block/string": "notes",
        ":block/order": 0,
        ":block/children": [],
      },
    ],
  };
}

function rawParent() {
  return {
    ":block/uid": "task",
    ":block/order": 2,
    ":block/_children": [{ ":block/uid": "page", ":node/title": "Page" }],
  };
}

function referenceRows() {
  return [
    [{
      ":block/uid": "dependent",
      ":block/string": "{{[[TODO]]}} dependent",
      ":block/children": [{
        ":block/uid": "depends-attr",
        ":block/string": "BT_attrDepends:: ((task)), ((other))",
        ":block/order": 1,
      }],
    }],
    [{
      ":block/uid": "linked",
      ":block/string": "{{[[TODO]]}} linked",
      ":block/children": [{
        ":block/uid": "parent-attr",
        ":block/string": "BT_attrParent:: ((task))",
        ":block/order": 3,
      }],
    }],
  ];
}

function makeReader({ pull, q, isRootOwnedTask, isReferenceParentOwnedTask } = {}) {
  let pulls = 0;
  const roamAlphaAPI = {
    data: {
      async: {
        pull: pull || (async () => (++pulls === 1 ? rawTree() : rawParent())),
        q: q || (async () => referenceRows()),
      },
    },
  };
  return createStrictTaskDeleteSnapshotReader({
    roamAlphaAPI,
    getAttributeNames: () => ({
      dependsAliases: ["BT_attrDepends", "Old Depends"],
      parentAliases: ["BT_attrParent", "Old Parent"],
    }),
    isRootOwnedTask: isRootOwnedTask || (async () => true),
    isReferenceParentOwnedTask: isReferenceParentOwnedTask || (async () => true),
    now: () => 42,
  });
}

test("strict delete capture uses fresh async pull/query and preserves exact reversible reference fields", async () => {
  const snapshot = await makeReader()("task");
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.rootUid, "task");
  assert.equal(snapshot.parentUid, "page");
  assert.equal(snapshot.order, 2);
  assert.deepEqual(snapshot.treeUids, ["task", "note"]);
  assert.deepEqual(snapshot.tree.props, { rt: { id: "task-id" } });
  assert.deepEqual(snapshot.externalRefs.dependents, [{
    taskUid: "dependent",
    attributeUid: "depends-attr",
    attributeName: "BT_attrDepends",
    attributeString: "BT_attrDepends:: ((task)), ((other))",
    attributeOrder: 1,
    prevDepends: ["task", "other"],
  }]);
  assert.deepEqual(snapshot.externalRefs.explicitSubtasks, [{
    taskUid: "linked",
    refUid: "task",
    attributeUid: "parent-attr",
    attributeName: "BT_attrParent",
    attributeString: "BT_attrParent:: ((task))",
    attributeOrder: 3,
  }]);
  assert.equal(snapshot.capturedAt, 42);
});

test("strict delete capture rejects an ordinary TODO root before reference queries", async () => {
  let queries = 0;
  const reader = makeReader({
    q: async () => { queries += 1; return referenceRows(); },
    isRootOwnedTask: async () => false,
  });
  await assert.rejects(reader("task"), (error) => {
    assert.ok(error instanceof TaskDeleteSnapshotError);
    assert.equal(error.code, "root-not-owned-task");
    return true;
  });
  assert.equal(queries, 0);
});

test("strict reference capture ignores ordinary alias lookalikes and retains Better Tasks-owned parents", async () => {
  const checked = [];
  const snapshot = await makeReader({
    isReferenceParentOwnedTask: async (candidate) => {
      checked.push(candidate.taskUid);
      return candidate.taskUid === "dependent";
    },
  })("task");
  assert.deepEqual(checked.sort(), ["dependent", "linked"]);
  assert.deepEqual(snapshot.externalRefs.dependents.map((entry) => entry.taskUid), ["dependent"]);
  assert.deepEqual(snapshot.externalRefs.explicitSubtasks, []);
});

test("malformed dependency text in an ordinary lookalike parent is ignored before strict parsing", async () => {
  const snapshot = await makeReader({
    q: async () => [[{
      ":block/uid": "ordinary",
      ":block/string": "ordinary paragraph",
      ":block/children": [{
        ":block/uid": "lookalike",
        ":block/string": "BT_attrDepends:: ((task)), not-a-ref",
        ":block/order": 0,
      }],
    }]],
    isReferenceParentOwnedTask: async () => false,
  })("task");
  assert.deepEqual(snapshot.externalRefs, { dependents: [], explicitSubtasks: [] });
});

test("strict delete capture rejects pull/query/cardinality/parse failures with stable codes", async () => {
  const cases = [
    ["subtree-pull-failed", makeReader({ pull: async () => { throw new Error("offline"); } })],
    ["parent-cardinality-invalid", makeReader({
      pull: (() => {
        let count = 0;
        return async () => (++count === 1 ? rawTree() : {
          ...rawParent(),
          ":block/_children": [{ ":block/uid": "one" }, { ":block/uid": "two" }],
        });
      })(),
    })],
    ["parent-cycle-invalid", makeReader({
      pull: (() => {
        let count = 0;
        return async () => (++count === 1 ? rawTree() : {
          ...rawParent(),
          ":block/_children": [{ ":block/uid": "note" }],
        });
      })(),
    })],
    ["subtree-open-invalid", makeReader({
      pull: (() => {
        let count = 0;
        return async () => (++count === 1 ? { ...rawTree(), ":block/open": "yes" } : rawParent());
      })(),
    })],
    ["reference-query-failed", makeReader({ q: async () => { throw new Error("query failed"); } })],
    ["dependency-value-invalid", makeReader({ q: async () => [[{
      ":block/uid": "dependent",
      ":block/string": "{{[[TODO]]}} dependent",
      ":block/children": [{
        ":block/uid": "depends-attr",
        ":block/string": "BT_attrDepends:: ((task)), not-a-ref",
        ":block/order": 0,
      }],
    }]] })],
  ];
  for (const [code, reader] of cases) {
    await assert.rejects(reader("task"), (error) => {
      assert.ok(error instanceof TaskDeleteSnapshotError);
      assert.equal(error.code, code);
      return true;
    });
  }
});

test("repeated strict capture failures cannot become matching incomplete fingerprints or reach confirmation", async () => {
  let attempts = 0;
  let confirms = 0;
  let deletes = 0;
  const reader = makeReader({ pull: async () => { attempts += 1; throw new Error("offline"); } });
  for (let index = 0; index < 2; index += 1) {
    const result = await runInteractiveTaskDelete({
      rootUid: "task",
      captureSnapshot: () => reader("task"),
      confirmDelete: async () => { confirms += 1; return true; },
      deleteSnapshot: async () => { deletes += 1; return { status: "deleted", didDelete: true }; },
      registerUndo: async () => {},
      restoreSnapshot: async () => true,
    });
    assert.equal(result.status, "not-deleted");
    assert.equal(result.reason, "preview-snapshot-capture-failed");
    assert.equal(result.error.code, "subtree-pull-failed");
  }
  assert.equal(attempts, 2);
  assert.equal(confirms, 0);
  assert.equal(deletes, 0);
});

test("matching incomplete snapshot objects are rejected before confirmation", async () => {
  let confirms = 0;
  let deletes = 0;
  const incomplete = {
    version: 2,
    rootUid: "task",
    parentUid: "page",
    order: 0,
    tree: { uid: "task", string: "{{[[TODO]]}} task", order: 0, children: [] },
    treeUids: ["task"],
    externalRefs: {
      dependents: [{ taskUid: "dependent", prevDepends: ["task"] }],
      explicitSubtasks: [],
    },
  };
  const result = await runInteractiveTaskDelete({
    rootUid: "task",
    captureSnapshot: async () => incomplete,
    confirmDelete: async () => { confirms += 1; return true; },
    deleteSnapshot: async () => { deletes += 1; return { status: "deleted", didDelete: true }; },
    registerUndo: async () => {},
    restoreSnapshot: async () => true,
  });
  assert.equal(result.status, "not-deleted");
  assert.equal(result.reason, "preview-snapshot-external-refs-invalid");
  assert.equal(confirms, 0);
  assert.equal(deletes, 0);
});

test("fresh existence reads are async-only and reject malformed success shapes", async () => {
  const calls = [];
  const readExists = createFreshBlockExistenceReader({
    data: { async: { pull: async (...args) => { calls.push(args); return { ":block/uid": "task" }; } } },
  });
  assert.equal(await readExists("task"), true);
  assert.deepEqual(calls[0][1], [":block/uid", "task"]);
  const malformed = createFreshBlockExistenceReader({
    data: { async: { pull: async () => ({ ":block/uid": "other" }) } },
  });
  await assert.rejects(malformed("task"), (error) => error.code === "existence-pull-shape-invalid");
});
