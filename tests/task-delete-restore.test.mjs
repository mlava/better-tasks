import test from "node:test";
import assert from "node:assert/strict";

import { createCertifiedTaskRestore } from "../src/core/task-delete-restore.js";

function snapshot(overrides = {}) {
  const value = {
    version: 2,
    rootUid: "task",
    parentUid: "page",
    order: 3,
    tree: {
      uid: "task",
      string: "{{[[TODO]]}} task",
      order: 3,
      props: { rt: { id: "stable-id" } },
      open: true,
      heading: 1,
      textAlign: "center",
      children: [{
        uid: "child",
        string: "note",
        order: 0,
        open: false,
        heading: 2,
        textAlign: "left",
        children: [],
      }],
    },
    treeUids: ["task", "child"],
    externalRefs: { dependents: [], explicitSubtasks: [] },
    ...overrides,
  };
  return value;
}

function rawNode(state) {
  if (!state) return null;
  return {
    ":block/uid": state.uid,
    ":block/string": state.string,
    ":block/order": state.order,
    ...(state.props === undefined ? {} : { ":block/props": state.props }),
    ...(state.open === undefined ? {} : { ":block/open": state.open }),
    ...(state.heading === undefined ? {} : { ":block/heading": state.heading }),
    ...(state.textAlign === undefined ? {} : { ":block/text-align": state.textAlign }),
    ":block/_children": [{ ":block/uid": state.parentUid }],
  };
}

function makeHarness({ pullHook, createHook, updateHook, captureHook, restoreExternalReference } = {}) {
  const nodes = new Map();
  const calls = { pull: 0, create: [], update: [], capture: 0, restoreExternal: 0 };
  const api = {
    data: {
      async: {
        pull: async (_pattern, lookup) => {
          calls.pull += 1;
          if (pullHook) return pullHook({ lookup, nodes, calls });
          return rawNode(nodes.get(lookup[1]) || null);
        },
      },
      block: {
        create: async (args) => {
          calls.create.push(args);
          if (createHook) return createHook({ args, nodes, calls });
          const { block, location } = args;
          nodes.set(block.uid, {
            uid: block.uid,
            parentUid: location["parent-uid"],
            order: location.order,
            string: block.string,
            open: block.open,
            heading: block.heading,
            textAlign: block["text-align"],
          });
        },
        update: async (args) => {
          calls.update.push(args);
          if (updateHook) return updateHook({ args, nodes, calls });
          const current = nodes.get(args.block.uid);
          nodes.set(args.block.uid, { ...current, props: args.block.props });
        },
      },
    },
  };
  const captured = snapshot();
  const restore = createCertifiedTaskRestore({
    roamAlphaAPI: api,
    blockExistsFresh: async (uid) => uid === "page" || nodes.has(uid),
    captureSnapshot: async () => {
      calls.capture += 1;
      return captureHook ? captureHook({ calls, nodes, snapshot: captured }) : captured;
    },
    restoreExternalReference: async (operation) => {
      calls.restoreExternal += 1;
      return restoreExternalReference
        ? restoreExternalReference(operation)
        : { status: "restored", restored: true };
    },
  });
  return { restore, nodes, calls, snapshot: captured };
}

test("actual certified restore uses namespaced CRUD and certifies the complete v2 fingerprint", async () => {
  const harness = makeHarness();
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.status, "restored");
  assert.equal(result.restored, true);
  assert.equal(harness.calls.create.length, 2);
  assert.equal(harness.calls.update.length, 1);
  assert.equal(harness.calls.capture, 2);
  assert.deepEqual(harness.nodes.get("child"), {
    uid: "child", parentUid: "task", order: 0, string: "note",
    open: false, heading: 2, textAlign: "left",
  });
});

test("props update failure is not swallowed and cannot reach external restoration", async () => {
  const harness = makeHarness({ updateHook: async () => { throw new Error("props rejected"); } });
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.status, "restore-partial");
  assert.equal(result.reason, "restore-props-not-observed");
  assert.equal(result.failedUid, "task");
  assert.equal(harness.calls.restoreExternal, 0);
});

test("a concurrent props edit before the restore update is fenced and never overwritten", async () => {
  const harness = makeHarness({
    pullHook: ({ lookup, nodes, calls }) => {
      const state = nodes.get(lookup[1]) || null;
      if (lookup[1] === "task" && calls.pull === 3 && state) {
        const edited = { ...state, props: { user: { edit: true } } };
        nodes.set("task", edited);
        return rawNode(edited);
      }
      return rawNode(state);
    },
  });
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.reason, "restore-props-precondition-conflict");
  assert.equal(harness.calls.update.length, 0);
  assert.deepEqual(harness.nodes.get("task").props, { user: { edit: true } });
});

test("missing child after a resolved create is a truthful partial restore", async () => {
  const harness = makeHarness({
    createHook: async ({ args, nodes, calls }) => {
      if (args.block.uid === "child") return;
      nodes.set(args.block.uid, {
        uid: args.block.uid, parentUid: args.location["parent-uid"], order: args.location.order,
        string: args.block.string, open: args.block.open, heading: args.block.heading,
        textAlign: args.block["text-align"],
      });
    },
  });
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.reason, "restore-create-not-observed");
  assert.equal(result.failedUid, "child");
  assert.equal(harness.calls.restoreExternal, 0);
});

test("wrong restored order is fenced before external references are touched", async () => {
  const harness = makeHarness({
    createHook: async ({ args, nodes }) => {
      nodes.set(args.block.uid, {
        uid: args.block.uid, parentUid: args.location["parent-uid"], order: args.location.order + 1,
        string: args.block.string, open: args.block.open, heading: args.block.heading,
        textAlign: args.block["text-align"],
      });
    },
  });
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.reason, "restore-create-after-state-conflict");
  assert.equal(harness.calls.restoreExternal, 0);
});

test("external-reference conflict yields a certified partial outcome", async () => {
  const externalSnapshot = snapshot({
    externalRefs: {
      dependents: [{
        taskUid: "dependent", attributeUid: "depends", attributeName: "BT_attrDepends",
        attributeString: "BT_attrDepends:: ((task))", attributeOrder: 0, prevDepends: ["task"],
      }],
      explicitSubtasks: [],
    },
  });
  const harness = makeHarness({ restoreExternalReference: async () => ({ status: "conflict", restored: false }) });
  harness.snapshot.externalRefs = externalSnapshot.externalRefs;
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.reason, "restore-external-reference-conflict");
  assert.equal(result.structureRestored, true);
  assert.equal(result.restored, false);
  assert.equal(harness.calls.restoreExternal, 1);
});

test("final strict fingerprint mismatch catches cosmetic/props drift", async () => {
  const harness = makeHarness({
    captureHook: ({ calls, snapshot: expected }) => {
      if (calls.capture === 1) return expected;
      return { ...expected, tree: { ...expected.tree, open: false } };
    },
  });
  const result = await harness.restore.restore(harness.snapshot);
  assert.equal(result.reason, "restore-full-certification-mismatch");
  assert.equal(result.restored, false);
});
