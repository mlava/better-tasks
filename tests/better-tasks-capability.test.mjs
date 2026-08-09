import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FRESH_BLOCK_PULL_PATTERN,
  FRESH_BLOCK_SUBTREE_PULL_PATTERN,
  createBetterTasksCapability,
  createFreshRoamBlockReader,
  hasBetterTasksOwnershipSignal,
  installBetterTasksCapability,
  installOwnedWindowRegistryEntry,
  normalizeRoamPropertyTree,
  resolveChildSurfaceRepeatText,
  updateDueParseDiagnostics,
} from "../src/core/better-tasks-capability.js";
import {
  createTaskDeleteFingerprint,
  runInteractiveTaskDelete,
} from "../src/core/task-delete-flow.js";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);
const sharedContractFixture = JSON.parse(
  readFileSync(new URL("./fixtures/better-tasks-capability-v1.json", import.meta.url), "utf8")
);

function makeGraph(definitions) {
  const nodes = new Map();
  for (const definition of definitions) {
    nodes.set(definition.uid, {
      string: "",
      children: [],
      directParentUid: null,
      ...definition,
    });
  }
  for (const node of nodes.values()) {
    if (!node.directParentUid) continue;
    const parent = nodes.get(node.directParentUid);
    if (parent && !parent.children.includes(node.uid)) parent.children.push(node.uid);
  }
  const hydrate = (uid, seen = new Set()) => {
    const node = nodes.get(uid);
    if (!node || seen.has(uid)) return null;
    const nextSeen = new Set(seen).add(uid);
    const entityType = node.entityType || (node.uid === "page" ? "page" : "block");
    const directParentState = node.directParentState || (
      node.directParentUid ? "one" : entityType === "page" ? "none" : "none"
    );
    return {
      ...node,
      entityType,
      directParentState,
      children: node.children.map((childUid) => hydrate(childUid, nextSeen)).filter(Boolean),
    };
  };
  return { nodes, read: async (uid) => hydrate(uid) };
}

function makeCapability(graph, overrides = {}) {
  return createBetterTasksCapability({
    version: packageMetadata.version,
    readBlockFresh: graph.read,
    inspectTask: async (block) => ({
      managed: hasBetterTasksOwnershipSignal(block.meta),
      explicitParentTaskUid: block.meta?.metadata?.parentTaskUid || null,
    }),
    getOwnershipVocabulary: () => ({
      attributeNames: [
        "BT_attrDue",
        "My Due",
        "Old Due",
        "BT_attrParent",
        "Old Parent",
        "BT_attrNotes",
        "rt-processed",
        "BT_attrAdvance",
      ],
      parentAttributeNames: ["parent", "BT_attrParent", "Old Parent"],
      activityContainerTitles: [
        "**Activity log**",
        "**Aktivitätsprotokoll**",
        "**Registro de actividad**",
      ],
    }),
    deleteTask: async () => false,
    createTask: async () => ({ error: "not configured" }),
    summarizeTask: async (block, _inspection, relationship) => ({ uid: block.uid, ...relationship }),
    ...overrides,
  });
}

test("capability satisfies the shared companion v1 contract fixture", async () => {
  const capability = makeCapability(makeGraph(sharedContractFixture.graph));
  for (const fixtureCase of sharedContractFixture.cases) {
    assert.deepEqual(
      await capability.classifyBlock(fixtureCase.uid, fixtureCase.options),
      fixtureCase.expected,
      fixtureCase.uid
    );
  }
});

test("fresh Roam reader uses data.async.pull and the direct-parent reverse ref on every call", async () => {
  const calls = [];
  const roamAlphaAPI = {
    data: {
      async: {
        async pull(pattern, eid) {
          calls.push({ pattern, eid });
          return {
            ":block/uid": eid[1],
            ":block/string": "ordinary",
            ":block/props": {
              ":rt": { ":id": "graph-owned-id", ":nested": [{ ":value": 1 }] },
            },
            ":block/_children": [{ ":block/uid": "parent-uid" }],
            ":block/children": [{ ":block/uid": "child-uid", ":block/string": "child" }],
          };
        },
      },
    },
  };
  const read = createFreshRoamBlockReader(roamAlphaAPI);
  const first = await read("target-uid");
  const second = await read("target-uid");
  await read("target-uid", { includeDescendants: true });

  assert.equal(calls.length, 4, "the authoritative reader must not cache");
  assert.deepEqual(calls[0].eid, [":block/uid", "target-uid"]);
  assert.match(calls[0].pattern, /:block\/_children/);
  assert.match(calls[0].pattern, /:block\/children/);
  assert.equal(first.directParentUid, "parent-uid");
  assert.equal(first.children[0].uid, "child-uid");
  assert.deepEqual(first.props, {
    rt: { id: "graph-owned-id", nested: [{ value: 1 }] },
  });
  assert.deepEqual(second, first);
  assert.equal(calls[0].pattern, FRESH_BLOCK_PULL_PATTERN);
  assert.equal(calls[2].pattern, FRESH_BLOCK_PULL_PATTERN);
  assert.equal(calls[3].pattern, FRESH_BLOCK_SUBTREE_PULL_PATTERN);
});

test("colon-keyed Roam properties normalize recursively without mutating primitives", () => {
  const raw = { ":rt": { ":id": "id", ":flags": [{ ":done": true }] }, plain: null };
  assert.deepEqual(normalizeRoamPropertyTree(raw), {
    rt: { id: "id", flags: [{ done: true }] },
    plain: null,
  });
  assert.deepEqual(raw, { ":rt": { ":id": "id", ":flags": [{ ":done": true }] }, plain: null });
});

test("fresh Roam reader fails explicitly when the documented async pull API is absent", async () => {
  const read = createFreshRoamBlockReader({ data: {} });
  await assert.rejects(() => read("uid"), /data\.async\.pull is required/);
});

test("fresh Roam reader never selects parents[0] from an ambiguous reverse ref", async () => {
  const read = createFreshRoamBlockReader({
    data: {
      async: {
        pull: async () => ({
          ":block/uid": "target",
          ":block/string": "ordinary",
          ":block/_children": [
            { ":block/uid": "parent-a" },
            { ":block/uid": "parent-b" },
          ],
        }),
      },
    },
  });
  const block = await read("target");
  assert.equal(block.directParentState, "ambiguous");
  assert.equal(block.directParentUid, null);
});

test("real-shaped colon-key pulls preserve nested rt.id for authoritative recognition", async () => {
  const rawByUid = new Map([
    ["task", {
      ":block/uid": "task",
      ":block/string": "{{[[TODO]]}} colon props",
      ":block/props": { ":rt": { ":id": "graph-id" } },
      ":block/_children": [{ ":block/uid": "page" }],
      ":block/children": [],
    }],
    ["page", {
      ":block/uid": "page",
      ":node/title": "Page",
      ":block/children": [],
    }],
  ]);
  const readBlockFresh = createFreshRoamBlockReader({
    data: { async: { pull: async (_pattern, eid) => rawByUid.get(eid[1]) || null } },
  });
  const capability = createBetterTasksCapability({
    version: packageMetadata.version,
    readBlockFresh,
    inspectTask: async (block) => ({ managed: !!block.props?.rt?.id, explicitParentTaskUid: null }),
    getOwnershipVocabulary: () => ({
      attributeNames: [],
      parentAttributeNames: ["parent"],
      activityContainerTitles: [],
    }),
    deleteTask: async () => false,
    createTask: async () => ({ error: "unused" }),
    summarizeTask: async () => ({ error: "unused" }),
  });
  assert.equal((await capability.classifyBlock("task")).kind, "task");
});

test("real-shaped colon-key repeat-only props normalize into authoritative ownership input", async () => {
  const rawByUid = new Map([
    ["task", {
      ":block/uid": "task",
      ":block/string": "{{[[TODO]]}} legacy repeat",
      ":block/props": { ":repeat": "daily" },
      ":block/_children": [{ ":block/uid": "page" }],
      ":block/children": [],
    }],
    ["page", {
      ":block/uid": "page",
      ":node/title": "Page",
      ":block/children": [],
    }],
  ]);
  const readBlockFresh = createFreshRoamBlockReader({
    data: { async: { pull: async (_pattern, eid) => rawByUid.get(eid[1]) || null } },
  });
  const capability = createBetterTasksCapability({
    version: packageMetadata.version,
    readBlockFresh,
    inspectTask: async (block, options) => {
      assert.deepEqual(options, { authoritative: true, suppressDiagnostics: true });
      const repeat = resolveChildSurfaceRepeatText({ props: block.props });
      return {
        managed: hasBetterTasksOwnershipSignal({ repeat }),
        explicitParentTaskUid: null,
      };
    },
    getOwnershipVocabulary: () => ({
      attributeNames: [],
      parentAttributeNames: ["parent"],
      activityContainerTitles: [],
    }),
    deleteTask: async () => false,
    createTask: async () => ({ error: "unused" }),
    summarizeTask: async () => ({ error: "unused" }),
  });
  assert.equal((await capability.classifyBlock("task")).kind, "task");
});

test("recognition includes parent-only, notes-only, completed-only, and rt.id-only task state", () => {
  const cases = [
    { name: "parent", meta: { childAttrMap: { parent: { value: "((p))" } } } },
    { name: "notes", meta: { childAttrMap: { notes: { value: "note" } } } },
    { name: "completed", meta: { childAttrMap: { completed: { value: "[[August 8th, 2026]]" } } } },
    { name: "rt.id", meta: { rtId: "managed-id" } },
  ];
  for (const { name, meta } of cases) {
    assert.equal(hasBetterTasksOwnershipSignal(meta), true, `${name}-only state must be recognized`);
  }
  assert.equal(hasBetterTasksOwnershipSignal({}), false);
});

test("v1 capability exposes only the public contract with the package-derived version", () => {
  const capability = makeCapability(makeGraph([]));
  assert.equal(capability.version, packageMetadata.version);
  assert.deepEqual(Object.keys(capability), ["version", "classifyBlock", "requestDelete", "createSubtask"]);
  assert.equal(Object.isFrozen(capability), true);
});

test("classifyBlock returns the exact task and ordinary discriminants with fresh results", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "task", string: "{{[[TODO]]}} managed", directParentUid: "page", meta: { rtId: "rt-1" } },
    { uid: "ordinary", string: "ordinary", directParentUid: "page" },
  ]);
  let reads = 0;
  const read = graph.read;
  graph.read = async (uid) => {
    reads += 1;
    return read(uid);
  };
  const capability = makeCapability(graph);

  assert.deepEqual(await capability.classifyBlock("task"), {
    kind: "task",
    uid: "task",
    ownerTaskUid: "task",
    relationship: null,
    directParentTaskUid: null,
    containsManagedTasks: false,
    topLevelManagedTaskUids: [],
  });
  assert.deepEqual(await capability.classifyBlock("ordinary"), {
    kind: "ordinary",
    uid: "ordinary",
    ownerTaskUid: null,
    relationship: null,
    directParentTaskUid: null,
    containsManagedTasks: false,
    topLevelManagedTaskUids: [],
  });
  graph.nodes.get("task").meta = {};
  assert.equal((await capability.classifyBlock("task")).kind, "ordinary", "a later call must see graph changes");
  assert.ok(reads >= 4, "each classification must pull the target and its direct-parent chain again");
});

test("classification recognizes every corrected metadata-only task case", async () => {
  const definitions = [
    { uid: "page", string: "" },
    { uid: "parent-only", string: "{{[[TODO]]}} parent", directParentUid: "page", meta: { childAttrMap: { parent: { value: "((root))" } } } },
    { uid: "notes-only", string: "{{[[TODO]]}} notes", directParentUid: "page", meta: { childAttrMap: { notes: { value: "text" } } } },
    { uid: "completed-only", string: "{{[[DONE]]}} completed", directParentUid: "page", meta: { childAttrMap: { completed: { value: "today" } } } },
    { uid: "rt-only", string: "{{[[TODO]]}} id", directParentUid: "page", meta: { rtId: "id" } },
  ];
  const capability = makeCapability(makeGraph(definitions));
  for (const uid of ["parent-only", "notes-only", "completed-only", "rt-only"]) {
    assert.equal((await capability.classifyBlock(uid)).kind, "task", uid);
  }
});

test("task relationships distinguish structural and explicit parents", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "root", string: "{{[[TODO]]}} root", directParentUid: "page", meta: { rtId: "root" } },
    { uid: "structural", string: "{{[[TODO]]}} structural", directParentUid: "root", meta: { rtId: "structural" } },
    { uid: "explicit", string: "{{[[TODO]]}} explicit", directParentUid: "page", meta: { metadata: { parentTaskUid: "root" } } },
  ]);
  const capability = makeCapability(graph);

  assert.deepEqual(await capability.classifyBlock("structural"), {
    kind: "task",
    uid: "structural",
    ownerTaskUid: "structural",
    relationship: "structural",
    directParentTaskUid: "root",
    containsManagedTasks: false,
    topLevelManagedTaskUids: [],
  });
  assert.deepEqual(await capability.classifyBlock("explicit"), {
    kind: "task",
    uid: "explicit",
    ownerTaskUid: "explicit",
    relationship: "explicit",
    directParentTaskUid: "root",
    containsManagedTasks: false,
    topLevelManagedTaskUids: [],
  });
});

test("explicit parents must fresh-resolve to an unambiguous managed task", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "ordinary-parent", string: "ordinary", directParentUid: "page" },
    {
      uid: "ambiguous-parent",
      string: "{{[[TODO]]}} ambiguous parent",
      directParentUid: null,
      directParentState: "ambiguous",
      meta: { rtId: "ambiguous-parent" },
    },
    { uid: "missing-link", string: "{{[[TODO]]}} missing", directParentUid: "page", meta: { metadata: { parentTaskUid: "missing" } } },
    { uid: "ordinary-link", string: "{{[[TODO]]}} ordinary", directParentUid: "page", meta: { metadata: { parentTaskUid: "ordinary-parent" } } },
    { uid: "ambiguous-link", string: "{{[[TODO]]}} ambiguous", directParentUid: "page", meta: { metadata: { parentTaskUid: "ambiguous-parent" } } },
  ]);
  const capability = makeCapability(graph);

  for (const [uid, reason] of [
    ["missing-link", /explicit parent not found/],
    ["ordinary-link", /explicit parent is not a managed task/],
    ["ambiguous-link", /ambiguous direct parents/],
  ]) {
    const result = await capability.classifyBlock(uid);
    assert.equal(result.kind, "unknown", uid);
    assert.match(result.reason, reason, uid);
  }
});

test("explicit-parent cycles fail closed without recursing indefinitely", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "cycle-a", string: "{{[[TODO]]}} A", directParentUid: "page", meta: { metadata: { parentTaskUid: "cycle-b" } } },
    { uid: "cycle-b", string: "{{[[TODO]]}} B", directParentUid: "page", meta: { metadata: { parentTaskUid: "cycle-a" } } },
  ]);
  const result = await makeCapability(graph).classifyBlock("cycle-a");
  assert.equal(result.kind, "unknown");
  assert.match(result.reason, /cyclic explicit parent relation/);
});

test("configured, historical, and internal metadata plus localized activity descendants are task-owned", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "task", string: "{{[[TODO]]}} root", directParentUid: "page", meta: { rtId: "root" } },
    { uid: "metadata", string: "BT_attrDue:: [[today]]", directParentUid: "task" },
    { uid: "configured", string: "My Due:: [[tomorrow]]", directParentUid: "task" },
    { uid: "aliased", string: "Old Due:: [[yesterday]]", directParentUid: "task" },
    { uid: "processed", string: "rt-processed:: 123", directParentUid: "task" },
    { uid: "processed-detail", string: "detail", directParentUid: "processed" },
    { uid: "advance", string: "BT_attrAdvance:: Complete", directParentUid: "task" },
    { uid: "history", string: "**Activity log**", directParentUid: "task" },
    { uid: "event", string: "2026-08-08 12:00 — Created", directParentUid: "history" },
    { uid: "event-detail", string: "detail", directParentUid: "event" },
    { uid: "history-de", string: "**Aktivitätsprotokoll**", directParentUid: "task" },
    { uid: "event-de", string: "Erstellt", directParentUid: "history-de" },
    { uid: "history-es", string: "**Registro de actividad**", directParentUid: "task" },
    { uid: "event-es", string: "Creada", directParentUid: "history-es" },
  ]);
  const capability = makeCapability(graph);

  for (const uid of [
    "metadata",
    "configured",
    "aliased",
    "processed",
    "processed-detail",
    "advance",
    "history",
    "event",
    "event-detail",
    "history-de",
    "event-de",
    "history-es",
    "event-es",
  ]) {
    const result = await capability.classifyBlock(uid);
    assert.equal(result.kind, "task-owned", uid);
    assert.equal(result.ownerTaskUid, "task", uid);
  }
});

test("includeDescendants reports only top-level managed descendants", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "container", string: "generic", directParentUid: "page" },
    { uid: "task-a", string: "{{[[TODO]]}} A", directParentUid: "container", meta: { rtId: "a" } },
    { uid: "task-a-child", string: "{{[[TODO]]}} A child", directParentUid: "task-a", meta: { rtId: "a-child" } },
    { uid: "middle", string: "middle", directParentUid: "container" },
    { uid: "task-b", string: "{{[[DONE]]}} B", directParentUid: "middle", meta: { childAttrMap: { completed: { value: "today" } } } },
  ]);
  const capability = makeCapability(graph);

  const shallow = await capability.classifyBlock("container");
  assert.equal(shallow.containsManagedTasks, false);
  assert.deepEqual(shallow.topLevelManagedTaskUids, []);

  const deep = await capability.classifyBlock("container", { includeDescendants: true });
  assert.equal(deep.kind, "ordinary");
  assert.equal(deep.containsManagedTasks, true);
  assert.deepEqual(deep.topLevelManagedTaskUids, ["task-a", "task-b"]);
});

test("missing UID and read errors are unknown, never ordinary", async () => {
  const graph = makeGraph([]);
  const missing = await makeCapability(graph).classifyBlock("missing");
  assert.equal(missing.kind, "unknown");
  assert.equal(missing.reason, "block-not-found");

  const failed = await makeCapability({ read: async () => { throw new Error("read failed"); } }).classifyBlock("uid");
  assert.equal(failed.kind, "unknown");
  assert.match(failed.reason, /read failed/);
});

test("zero or ambiguous direct-parent reverse refs fail closed as unknown", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    {
      uid: "orphan",
      string: "ordinary",
      directParentState: "none",
      directParentUid: null,
    },
    {
      uid: "ambiguous",
      string: "{{[[TODO]]}} ambiguous",
      directParentState: "ambiguous",
      directParentUid: null,
      meta: { rtId: "ambiguous" },
    },
  ]);
  const capability = makeCapability(graph);
  const orphan = await capability.classifyBlock("orphan");
  const ambiguous = await capability.classifyBlock("ambiguous");
  assert.equal(orphan.kind, "unknown");
  assert.match(orphan.reason, /no authoritative direct parent/);
  assert.equal(ambiguous.kind, "unknown");
  assert.match(ambiguous.reason, /ambiguous direct parents/);
});

test("requestDelete cancel performs zero writes and invokes the interactive flow once", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "task", string: "{{[[TODO]]}} task", directParentUid: "page", meta: { rtId: "task" } },
  ]);
  let calls = 0;
  let writes = 0;
  const capability = makeCapability(graph, {
    deleteTask: async (uid, options) => {
      calls += 1;
      assert.equal(uid, "task");
      assert.deepEqual(options, { source: "native-insert-block" });
      const confirmed = false;
      if (confirmed) writes += 1;
      return { status: "cancelled", didDelete: false, restored: false, reason: "cancelled" };
    },
  });

  assert.deepEqual(await capability.requestDelete("task"), {
    status: "cancelled",
    didDelete: false,
    restored: false,
    reason: "cancelled",
  });
  assert.equal(calls, 1);
  assert.equal(writes, 0);
});

test("requestDelete preserves a deleted-with-rollback-failure terminal without collapsing it to false", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "task", string: "{{[[TODO]]}} task", directParentUid: "page", meta: { rtId: "task" } },
  ]);
  const expected = {
    status: "deleted-rollback-failed",
    didDelete: true,
    restored: false,
    reason: "undo-registration-failed-restore-returned-false",
  };
  const capability = makeCapability(graph, { deleteTask: async () => expected });
  assert.equal(await capability.requestDelete("task"), expected);
});

function makeDeleteSnapshot(overrides = {}) {
  return {
    version: 2,
    rootUid: "task",
    parentUid: "page",
    order: 0,
    tree: {
      uid: "task",
      string: "{{[[TODO]]}} task",
      order: 0,
      props: { rt: { id: "task-id" } },
      children: [{ uid: "child", string: "child", order: 0, children: [] }],
    },
    treeUids: ["task", "child"],
    externalRefs: {
      dependents: [{
        taskUid: "dependent",
        attributeUid: "depends-attribute",
        attributeName: "BT_attrDepends",
        attributeString: "BT_attrDepends:: ((task))",
        attributeOrder: 0,
        prevDepends: ["task"],
      }],
      explicitSubtasks: [{
        taskUid: "linked",
        refUid: "task",
        attributeUid: "parent-attribute",
        attributeName: "BT_attrParent",
        attributeString: "BT_attrParent:: ((task))",
        attributeOrder: 1,
      }],
    },
    capturedAt: 1,
    ...overrides,
  };
}

test("destructive fingerprint is deterministic and covers tree, references, and relationship inputs", () => {
  const first = makeDeleteSnapshot();
  const reordered = makeDeleteSnapshot({
    capturedAt: 999,
    externalRefs: {
      dependents: [
        {
          taskUid: "second", attributeUid: "depends-second", attributeName: "BT_attrDepends",
          attributeString: "BT_attrDepends:: ((task)), ((other))", attributeOrder: 0, prevDepends: ["task", "other"],
        },
        {
          taskUid: "dependent", attributeUid: "depends-attribute", attributeName: "BT_attrDepends",
          attributeString: "BT_attrDepends:: ((task))", attributeOrder: 0, prevDepends: ["task"],
        },
      ],
      explicitSubtasks: [makeDeleteSnapshot().externalRefs.explicitSubtasks[0]],
    },
  });
  const reorderedAgain = makeDeleteSnapshot({
    capturedAt: 1000,
    externalRefs: {
      dependents: [
        {
          taskUid: "dependent", attributeUid: "depends-attribute", attributeName: "BT_attrDepends",
          attributeString: "BT_attrDepends:: ((task))", attributeOrder: 0, prevDepends: ["task"],
        },
        {
          taskUid: "second", attributeUid: "depends-second", attributeName: "BT_attrDepends",
          attributeString: "BT_attrDepends:: ((task)), ((other))", attributeOrder: 0, prevDepends: ["task", "other"],
        },
      ],
      explicitSubtasks: [makeDeleteSnapshot().externalRefs.explicitSubtasks[0]],
    },
  });
  assert.equal(createTaskDeleteFingerprint(reordered), createTaskDeleteFingerprint(reorderedAgain));
  assert.notEqual(createTaskDeleteFingerprint(first), createTaskDeleteFingerprint(reordered));
  assert.notEqual(
    createTaskDeleteFingerprint(first),
    createTaskDeleteFingerprint(makeDeleteSnapshot({ parentUid: "other-page" }))
  );
  assert.notEqual(
    createTaskDeleteFingerprint(first),
    createTaskDeleteFingerprint(makeDeleteSnapshot({
      tree: { ...first.tree, string: "{{[[TODO]]}} changed" },
    }))
  );
});

test("actual interactive-delete seam previews once and performs zero writes on cancel", async () => {
  const preview = makeDeleteSnapshot();
  const calls = { capture: 0, confirm: 0, delete: 0, registerUndo: 0, restore: 0 };
  const result = await runInteractiveTaskDelete({
    rootUid: "task",
    captureSnapshot: async () => {
      calls.capture += 1;
      return preview;
    },
    confirmDelete: async (captured) => {
      calls.confirm += 1;
      assert.equal(captured, preview);
      return false;
    },
    deleteSnapshot: async () => { calls.delete += 1; },
    registerUndo: () => { calls.registerUndo += 1; },
    restoreSnapshot: async () => { calls.restore += 1; },
  });
  assert.deepEqual(result, { status: "cancelled", didDelete: false, restored: false, reason: "cancelled" });
  assert.deepEqual(calls, { capture: 1, confirm: 1, delete: 0, registerUndo: 0, restore: 0 });
});

test("actual interactive-delete seam aborts when the snapshot changes during confirmation", async () => {
  const preview = makeDeleteSnapshot();
  const changed = makeDeleteSnapshot({
    capturedAt: 2,
    tree: { ...preview.tree, string: "{{[[TODO]]}} edited while confirming" },
  });
  const calls = { capture: 0, confirm: 0, delete: 0, registerUndo: 0, restore: 0 };
  const result = await runInteractiveTaskDelete({
    rootUid: "task",
    captureSnapshot: async () => {
      calls.capture += 1;
      return calls.capture === 1 ? preview : changed;
    },
    confirmDelete: async () => { calls.confirm += 1; return true; },
    deleteSnapshot: async () => { calls.delete += 1; return { status: "deleted", didDelete: true }; },
    registerUndo: async () => { calls.registerUndo += 1; },
    restoreSnapshot: async () => { calls.restore += 1; return true; },
  });
  assert.equal(result.didDelete, false);
  assert.equal(result.reason, "snapshot-changed");
  assert.match(result.previewFingerprint, /task/);
  assert.match(result.capturedFingerprint, /edited while confirming/);
  assert.deepEqual(calls, { capture: 2, confirm: 1, delete: 0, registerUndo: 0, restore: 0 });
});

test("actual interactive-delete seam rejects wrong preview and fresh roots before deletion", async () => {
  const calls = { capture: 0, confirm: 0, delete: 0, registerUndo: 0, restore: 0 };
  const wrongPreview = await runInteractiveTaskDelete({
    rootUid: "task",
    snapshot: makeDeleteSnapshot({ rootUid: "other" }),
    captureSnapshot: async () => { calls.capture += 1; return makeDeleteSnapshot(); },
    confirmDelete: async () => { calls.confirm += 1; return true; },
    deleteSnapshot: async () => { calls.delete += 1; return true; },
    registerUndo: async () => { calls.registerUndo += 1; },
    restoreSnapshot: async () => { calls.restore += 1; return true; },
  });
  assert.deepEqual(wrongPreview, {
    status: "not-deleted", didDelete: false, restored: false, reason: "preview-snapshot-root-mismatch",
  });
  assert.deepEqual(calls, { capture: 0, confirm: 0, delete: 0, registerUndo: 0, restore: 0 });

  const wrongFresh = await runInteractiveTaskDelete({
    rootUid: "task",
    snapshot: makeDeleteSnapshot(),
    captureSnapshot: async () => { calls.capture += 1; return makeDeleteSnapshot({ rootUid: "other" }); },
    confirmDelete: async () => { calls.confirm += 1; return true; },
    deleteSnapshot: async () => { calls.delete += 1; return true; },
    registerUndo: async () => { calls.registerUndo += 1; },
    restoreSnapshot: async () => { calls.restore += 1; return true; },
  });
  assert.deepEqual(wrongFresh, {
    status: "not-deleted", didDelete: false, restored: false, reason: "fresh-snapshot-root-mismatch",
  });
  assert.deepEqual(calls, { capture: 1, confirm: 1, delete: 0, registerUndo: 0, restore: 0 });
});

for (const [label, registerUndo] of [
  ["synchronous throw", () => { throw new Error("sync registration failed"); }],
  ["asynchronous rejection", async () => { throw new Error("async registration failed"); }],
]) {
  test(`actual interactive-delete seam restores the fresh snapshot after Undo ${label}`, async () => {
    const preview = makeDeleteSnapshot({ capturedAt: 1 });
    const fresh = makeDeleteSnapshot({ capturedAt: 2 });
    const calls = { capture: 0, confirm: 0, delete: 0, registerUndo: 0, restore: 0 };
    const result = await runInteractiveTaskDelete({
      rootUid: "task",
      captureSnapshot: async () => {
        calls.capture += 1;
        return calls.capture === 1 ? preview : fresh;
      },
      confirmDelete: async () => { calls.confirm += 1; return true; },
      deleteSnapshot: async (captured) => {
        calls.delete += 1;
        assert.equal(captured, fresh);
        return { status: "deleted", didDelete: true, restored: false, reason: "deleted" };
      },
      registerUndo: async (registration) => {
        calls.registerUndo += 1;
        assert.equal(registration.snapshot, fresh);
        return registerUndo();
      },
      restoreSnapshot: async (captured) => {
        calls.restore += 1;
        assert.equal(captured, fresh);
        return true;
      },
    });
    assert.equal(result.didDelete, false);
    assert.equal(result.status, "deleted-rolled-back");
    assert.equal(result.reason, "undo-registration-failed-restored");
    assert.equal(result.restored, true);
    assert.match(result.error.message, /registration failed/);
    assert.deepEqual(calls, { capture: 2, confirm: 1, delete: 1, registerUndo: 1, restore: 1 });
  });
}

test("Undo registration failure accepts only the certified production restore outcome", async () => {
  const fresh = makeDeleteSnapshot();
  const restoration = {
    status: "restored",
    restored: true,
    structureRestored: true,
    externalReferencesRestored: true,
  };
  const result = await runInteractiveTaskDelete({
    rootUid: "task",
    snapshot: fresh,
    captureSnapshot: async () => fresh,
    confirmDelete: async () => true,
    deleteSnapshot: async () => ({ status: "deleted", didDelete: true }),
    registerUndo: async () => { throw new Error("undo unavailable"); },
    restoreSnapshot: async () => restoration,
  });
  assert.equal(result.status, "deleted-rolled-back");
  assert.equal(result.didDelete, false);
  assert.equal(result.restored, true);
});

for (const [label, restoreSnapshot, expectedReason] of [
  ["returns false", async () => false, "undo-registration-failed-restore-returned-false"],
  ["throws", async () => { throw new Error("restore failed"); }, "undo-registration-failed-restore-threw"],
]) {
  test(`Undo registration failure with restore that ${label} reports deletion may remain`, async () => {
    const fresh = makeDeleteSnapshot();
    const result = await runInteractiveTaskDelete({
      rootUid: "task",
      snapshot: fresh,
      captureSnapshot: async () => fresh,
      confirmDelete: async () => true,
      deleteSnapshot: async () => ({ status: "deleted", didDelete: true, restored: false, reason: "deleted" }),
      registerUndo: async () => { throw new Error("undo unavailable"); },
      restoreSnapshot,
    });
    assert.equal(result.status, "deleted-rollback-failed");
    assert.equal(result.didDelete, true);
    assert.equal(result.restored, false);
    assert.equal(result.reason, expectedReason);
  });
}

test("actual interactive-delete seam deletes once and registers targeted Undo from the fresh snapshot", async () => {
  const preview = makeDeleteSnapshot({ capturedAt: 1 });
  const fresh = makeDeleteSnapshot({ capturedAt: 2 });
  const calls = { capture: 0, confirm: 0, delete: 0, registerUndo: 0, restore: 0 };
  let undo = null;
  const result = await runInteractiveTaskDelete({
    rootUid: "task",
    captureSnapshot: async () => {
      calls.capture += 1;
      return calls.capture === 1 ? preview : fresh;
    },
    confirmDelete: async (captured) => {
      calls.confirm += 1;
      assert.equal(captured, preview);
      return true;
    },
    deleteSnapshot: async (captured) => {
      calls.delete += 1;
      assert.equal(captured, fresh);
      return { status: "deleted", didDelete: true, restored: false, reason: "deleted" };
    },
    registerUndo: async (registration) => {
      calls.registerUndo += 1;
      assert.equal(registration.snapshot, fresh);
      undo = registration.undo;
    },
    restoreSnapshot: async (captured) => {
      calls.restore += 1;
      assert.equal(captured, fresh);
      return true;
    },
  });
  assert.equal(result.didDelete, true);
  assert.equal(result.status, "deleted-with-undo");
  assert.equal(result.reason, "deleted");
  assert.equal(result.snapshot, fresh);
  assert.deepEqual(calls, { capture: 2, confirm: 1, delete: 1, registerUndo: 1, restore: 0 });
  assert.equal(await undo(), true);
  assert.deepEqual(calls, { capture: 2, confirm: 1, delete: 1, registerUndo: 1, restore: 1 });
});

test("createSubtask scrubs every caller parent channel and fresh-reads the recognized direct child", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "parent", string: "{{[[TODO]]}} parent", directParentUid: "page", meta: { rtId: "parent" } },
  ]);
  const capability = makeCapability(graph, {
    createTask: async (args) => {
      assert.deepEqual(args, {
        text: "child",
        attributes: { due: "today" },
        parent_uid: "parent",
      });
      graph.nodes.set("child", {
        uid: "child",
        string: "{{[[TODO]]}} child",
        directParentUid: "parent",
        children: [],
        meta: { rtId: "child-public-id" },
      });
      graph.nodes.get("parent").children.push("child");
      return { uid: "child" };
    },
    summarizeTask: async (block, _inspection, { parentTaskUid }) => ({
      uid: block.uid,
      text: block.string,
      status: "TODO",
      is_subtask: true,
      parent_task_uid: parentTaskUid,
    }),
  });

  const summary = await capability.createSubtask("parent", {
    text: "child",
    parent: "wrong-top-level-parent",
    parent_uid: "wrong-location",
    parentUid: "wrong-camel-location",
    BT_attrParent: "((wrong-alias))",
    Attributes: { parent: "((wrong-case-container))" },
    attributes: {
      parent: "((wrong-canonical))",
      parent_uid: "wrong-nested-location",
      parentUid: "wrong-nested-camel-location",
      BT_attrParent: "((wrong-current-alias))",
      "Old Parent": "((wrong-historical-alias))",
      due: "today",
    },
  });
  assert.deepEqual(summary, {
    uid: "child",
    text: "{{[[TODO]]}} child",
    status: "TODO",
    is_subtask: true,
    parent_task_uid: "parent",
    relationship: "structural",
    directParentTaskUid: "parent",
    ownerTaskUid: "child",
  });
  const authoritative = await capability.classifyBlock("child");
  assert.equal(authoritative.kind, "task");
  assert.equal(authoritative.relationship, "structural");
  assert.equal(authoritative.directParentTaskUid, "parent");
});

test("createSubtask fails closed on wrong placement or a conflicting explicit parent", async () => {
  const baseDefinitions = [
    { uid: "page", string: "" },
    { uid: "parent", string: "{{[[TODO]]}} parent", directParentUid: "page", meta: { rtId: "parent" } },
    { uid: "other", string: "{{[[TODO]]}} other", directParentUid: "page", meta: { rtId: "other" } },
  ];

  const wrongGraph = makeGraph(baseDefinitions);
  const wrongPlacement = makeCapability(wrongGraph, {
    createTask: async () => {
      wrongGraph.nodes.set("wrong-child", {
        uid: "wrong-child",
        string: "{{[[TODO]]}} wrong",
        directParentUid: "page",
        children: [],
        meta: { rtId: "wrong-child" },
      });
      return { uid: "wrong-child" };
    },
  });
  const wrongResult = await wrongPlacement.createSubtask("parent", { text: "wrong" });
  assert.equal(wrongResult.partialSuccess, true);
  assert.equal(wrongResult.createdUid, "wrong-child");
  assert.equal(wrongResult.code, "BT_SUBTASK_POSTCONDITION_FAILED");
  assert.equal(wrongResult.reason, "created-subtask-not-certified-structural");

  const conflictGraph = makeGraph(baseDefinitions);
  const conflictingParent = makeCapability(conflictGraph, {
    createTask: async () => {
      conflictGraph.nodes.set("conflict-child", {
        uid: "conflict-child",
        string: "{{[[TODO]]}} conflict",
        directParentUid: "parent",
        children: [],
        meta: { metadata: { parentTaskUid: "other" } },
      });
      return { uid: "conflict-child" };
    },
  });
  const conflictResult = await conflictingParent.createSubtask("parent", { text: "conflict" });
  assert.equal(conflictResult.partialSuccess, true);
  assert.equal(conflictResult.createdUid, "conflict-child");
  assert.equal(conflictResult.code, "BT_SUBTASK_POSTCONDITION_FAILED");

  const racedGraph = makeGraph(baseDefinitions);
  const parentDeconvertedDuringCreate = makeCapability(racedGraph, {
    createTask: async () => {
      racedGraph.nodes.get("parent").meta = {};
      racedGraph.nodes.set("raced-child", {
        uid: "raced-child",
        string: "{{[[TODO]]}} raced",
        directParentUid: "parent",
        children: [],
        meta: { rtId: "raced-child" },
      });
      racedGraph.nodes.get("parent").children.push("raced-child");
      return { uid: "raced-child" };
    },
  });
  const racedResult = await parentDeconvertedDuringCreate.createSubtask("parent", { text: "raced" });
  assert.equal(racedResult.partialSuccess, true);
  assert.equal(racedResult.createdUid, "raced-child");
  assert.equal(racedResult.code, "BT_SUBTASK_POSTCONDITION_FAILED");
});

test("createSubtask final authoritative classification catches a move during summary and reports partial success", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "parent", string: "{{[[TODO]]}} parent", directParentUid: "page", meta: { rtId: "parent" } },
  ]);
  const events = [];
  const capability = makeCapability(graph, {
    createTask: async () => {
      graph.nodes.set("moving-child", {
        uid: "moving-child",
        string: "{{[[TODO]]}} moving child",
        directParentUid: "parent",
        children: [],
        meta: { rtId: "moving-child" },
      });
      graph.nodes.get("parent").children.push("moving-child");
      return { uid: "moving-child" };
    },
    summarizeTask: async (block) => {
      events.push(`summarize:${block.directParentUid}`);
      graph.nodes.get("moving-child").directParentUid = "page";
      graph.nodes.get("parent").children = [];
      return { uid: block.uid, text: block.string };
    },
    readBlockFresh: async (uid) => {
      events.push(`read:${uid}`);
      return graph.read(uid);
    },
  });
  const result = await capability.createSubtask("parent", { text: "moving child" });
  assert.equal(result.partialSuccess, true);
  assert.equal(result.createdUid, "moving-child");
  assert.equal(result.code, "BT_SUBTASK_POSTCONDITION_FAILED");
  assert.equal(result.reason, "created-subtask-not-certified-structural");
  assert.equal(events.at(-1), "read:page", "final classifier's ancestor read is the last graph observation");
  assert.ok(events.indexOf("summarize:parent") < events.lastIndexOf("read:moving-child"));
});

test("createSubtask summary failure is an explicit partial success with the created UID", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "parent", string: "{{[[TODO]]}} parent", directParentUid: "page", meta: { rtId: "parent" } },
  ]);
  const capability = makeCapability(graph, {
    createTask: async () => {
      graph.nodes.set("created-child", {
        uid: "created-child", string: "{{[[TODO]]}} child", directParentUid: "parent",
        children: [], meta: { rtId: "created-child" },
      });
      graph.nodes.get("parent").children.push("created-child");
      return { uid: "created-child" };
    },
    summarizeTask: async () => { throw new Error("summary adapter failed"); },
  });
  const result = await capability.createSubtask("parent", { text: "child" });
  assert.equal(result.partialSuccess, true);
  assert.equal(result.createdUid, "created-child");
  assert.equal(result.code, "BT_SUBTASK_SUMMARY_FAILED");
  assert.equal(result.reason, "created-subtask-summary-failed");
  assert.match(result.error, /summary adapter failed/);
});

test("authoritative inspection injection ignores stale overrides and suppresses diagnostics", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    { uid: "task", string: "{{[[TODO]]}} stale", directParentUid: "page", meta: { rtId: "graph-id" } },
  ]);
  const staleRepeatOverrides = new Map([["task", { repeat: "daily" }]]);
  graph.nodes.get("task").meta = {};
  const inspections = [];
  let diagnostics = 0;
  let deletes = 0;
  const capability = makeCapability(graph, {
    inspectTask: async (block, options = {}) => {
      inspections.push({ uid: block.uid, options });
      if (!options.suppressDiagnostics) diagnostics += 1;
      const managed = options.authoritative
        ? hasBetterTasksOwnershipSignal(block.meta)
        : staleRepeatOverrides.has(block.uid);
      return { managed, explicitParentTaskUid: null };
    },
    deleteTask: async () => { deletes += 1; return true; },
  });
  assert.equal((await capability.classifyBlock("task")).kind, "ordinary");
  const terminal = await capability.requestDelete("task");
  assert.equal(terminal.status, "not-deleted");
  assert.equal(terminal.didDelete, false);
  assert.equal(terminal.reason, "target-not-managed-task");
  assert.ok(inspections.length >= 2);
  for (const { options } of inspections) {
    assert.deepEqual(options, { authoritative: true, suppressDiagnostics: true });
  }
  assert.equal(diagnostics, 0);
  assert.equal(deletes, 0);
});

test("invalid due metadata classification is diagnostic-free on the authoritative path", async () => {
  const graph = makeGraph([
    { uid: "page", string: "" },
    {
      uid: "task",
      string: "{{[[TODO]]}} invalid due",
      directParentUid: "page",
      meta: { hasTimingAttrs: true },
    },
    { uid: "due", string: "BT_attrDue:: definitely-not-a-date", directParentUid: "task" },
  ]);
  let diagnosticCalls = 0;
  const capability = makeCapability(graph, {
    inspectTask: async (block, options = {}) => {
      const invalidDue = (block.children || []).some(
        (child) => /BT_attrDue:: definitely-not-a-date/.test(child.string || "")
      );
      if (invalidDue) {
        updateDueParseDiagnostics({
          uid: block.uid,
          dueSource: "definitely-not-a-date",
          dueChildValue: "definitely-not-a-date",
          parsedDate: null,
          suppressDiagnostics: options.suppressDiagnostics,
          noteFailure: () => { diagnosticCalls += 1; },
          clearFailure: () => { diagnosticCalls += 1; },
        });
      }
      return {
        managed: hasBetterTasksOwnershipSignal(block.meta),
        explicitParentTaskUid: null,
      };
    },
  });
  const result = await capability.classifyBlock("task");
  assert.equal(result.kind, "task");
  assert.equal(diagnosticCalls, 0);
});

test("capability lifecycle is identity-fenced across load, unload, and reload", () => {
  const oldTool = { execute: () => "legacy caller still works" };
  const registry = { "better-tasks": oldTool };
  const windowLike = {
    RoamExtensionTools: registry,
    betterTasks: { v2: { version: "2.0.0" } },
  };
  const first = Object.freeze({ version: "1.0.0" });
  const second = Object.freeze({ version: "1.0.1" });

  const unloadFirst = installBetterTasksCapability(windowLike, first);
  assert.equal(windowLike.betterTasks.v1, first);
  const unloadSecond = installBetterTasksCapability(windowLike, second);
  assert.equal(windowLike.betterTasks.v1, second);

  unloadFirst();
  assert.equal(windowLike.betterTasks.v1, second, "stale unload must not remove the reloaded capability");
  assert.equal(windowLike.RoamExtensionTools, registry);
  assert.equal(windowLike.RoamExtensionTools["better-tasks"].execute(), "legacy caller still works");

  unloadSecond();
  assert.equal(windowLike.betterTasks.v1, undefined);
  assert.deepEqual(windowLike.betterTasks.v2, { version: "2.0.0" });
  assert.equal(windowLike.RoamExtensionTools, registry);
});

test("unload removes a namespace created solely for the owned v1 capability", () => {
  const windowLike = {};
  const capability = { version: packageMetadata.version };
  const unload = installBetterTasksCapability(windowLike, capability);
  assert.equal(windowLike.betterTasks.v1, capability);
  unload();
  unload();
  assert.equal(windowLike.betterTasks, undefined);
});

test("actual tool-registry installer is identity-fenced across overlapping reloads", () => {
  const sibling = { execute: () => "sibling" };
  const windowLike = { RoamExtensionTools: { sibling } };
  const first = { name: "first" };
  const second = { name: "second" };
  const unloadFirst = installOwnedWindowRegistryEntry(
    windowLike,
    "RoamExtensionTools",
    "better-tasks",
    first
  );
  const unloadSecond = installOwnedWindowRegistryEntry(
    windowLike,
    "RoamExtensionTools",
    "better-tasks",
    second
  );
  unloadFirst();
  assert.equal(windowLike.RoamExtensionTools["better-tasks"], second);
  const foreignReplacement = { name: "foreign-replacement" };
  windowLike.RoamExtensionTools["better-tasks"] = foreignReplacement;
  unloadSecond();
  assert.equal(windowLike.RoamExtensionTools["better-tasks"], foreignReplacement);
  assert.equal(windowLike.RoamExtensionTools.sibling, sibling);
});

test("index wires the capability version from package metadata without replacing RoamExtensionTools", () => {
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const capabilitySource = readFileSync(
    new URL("../src/core/better-tasks-capability.js", import.meta.url),
    "utf8"
  );
  const authoritativeInspection = source.slice(
    source.indexOf("async function inspectTaskFromAuthoritativeGraph"),
    source.indexOf("function registerBetterTasksCapability")
  );
  const recurringMeta = source.slice(
    source.indexOf("async function readRecurringMeta"),
    source.indexOf("async function resolveMetaAfterCompletion")
  );
  const deleteFlow = source.slice(
    source.indexOf("async function deleteTaskFlow"),
    source.indexOf("function withBulkOperationSuppression")
  );
  assert.match(source, /BETTER_TASKS_PACKAGE_VERSION\s*=\s*require\("\.\.\/package\.json"\)\.version/);
  assert.match(source, /registerExtensionToolsAPI\(\);\s*registerBetterTasksCapability\(\);/);
  assert.match(source, /deleteTask:\s*\(uid, options\)\s*=>\s*deleteTaskFlow\(uid, options\)/);
  assert.match(source, /installOwnedWindowRegistryEntry\(\s*window,\s*"RoamExtensionTools",\s*EXTENSION_TOOLS_ID,\s*registration/);
  assert.match(source, /removeExtensionToolsRegistration\?\.\(\);\s*removeExtensionToolsRegistration = null/);
  assert.match(authoritativeInspection, /attributeSurface: "Child"/);
  assert.match(authoritativeInspection, /allowOverrides: false, suppressDiagnostics/);
  assert.match(
    source.slice(
      source.indexOf("function registerBetterTasksCapability"),
      source.indexOf("const KNOWN_BT_ATTR_KEYS")
    ),
    /summarizeTask:[\s\S]*allowOverrides: false,[\s\S]*suppressDiagnostics: true/
  );
  assert.match(recurringMeta, /attrSurface === "Child"[\s\S]*resolveChildSurfaceRepeatText\(/);
  assert.match(
    recurringMeta,
    /updateDueParseDiagnostics\(\{[\s\S]*suppressDiagnostics,[\s\S]*noteFailure: noteDueParseFailure,[\s\S]*clearFailure: clearDueParseFailure/
  );
  assert.match(source, /INTERNAL_METADATA_ATTRIBUTE_NAMES = Object\.freeze\(\["rt-processed", ADVANCE_ATTR\]\)/);
  assert.match(source, /Object\.values\(I18N_MAP\)/);
  assert.match(source, /async function executeToolCreate\(args = \{\}\)[\s\S]*runTaskCreationPipeline\(\{[\s\S]*createRoot:\s*\(\) => createBlock\(parentUid, "last", taskText, uid\)[\s\S]*initializeProps:\s*\(\) => updateBlockProps\(uid, \{ rt: \{ id: shortId\(\), tz: set\.timezone \} \}\)/);
  assert.match(source, /async function updateBlockProps\(uid, merge\)[\s\S]*invalidateBlockCache\(uid\)/);
  assert.match(source, /window\.roamAlphaAPI\.data\.block\.update\(\{ block: \{ uid, props: next \} \}\)/);
  assert.match(deleteFlow, /inspectTaskFromAuthoritativeGraph\(block,\s*\{\s*suppressDiagnostics: true/);
  assert.match(deleteFlow, /const outcome = await runInteractiveTaskDelete\(\{\s*rootUid: uid/);
  assert.match(deleteFlow, /captureSnapshot:\s*\(\) => captureTaskDeleteSnapshot\(uid\)/);
  assert.match(deleteFlow, /deleteTaskCore\(captured\)/);
  assert.match(deleteFlow, /restoreTaskFromSnapshot\(captured\)/);
  assert.match(deleteFlow, /return outcome;/);
  assert.match(capabilitySource, /const classification = await classifyBlock\(uid\)/);
  assert.match(capabilitySource, /classification\.kind !== "task"/);
  assert.match(capabilitySource, /classification\.relationship !== "structural"/);
  assert.match(capabilitySource, /classification\.directParentTaskUid !== normalizedParentUid/);
  assert.match(source, /async function deleteTaskCore\(snapshot\)[\s\S]*runTransactionalTaskDelete\(\{/);
});
