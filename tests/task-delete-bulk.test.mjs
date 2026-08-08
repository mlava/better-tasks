import test from "node:test";
import assert from "node:assert/strict";

import { runGuardedBulkUndoRegistration } from "../src/core/task-delete-bulk.js";

const snapshots = [{ rootUid: "one" }, { rootUid: "two" }];

test("bulk Undo registration rejection immediately restores and certifies every committed task", async () => {
  const structures = [];
  const completed = [];
  const result = await runGuardedBulkUndoRegistration({
    snapshots,
    registerUndo: async () => { throw new Error("toast failed"); },
    restoreStructure: async (snapshot) => {
      structures.push(snapshot.rootUid);
      return { status: "structure-restored", structureRestored: true };
    },
    completeRestore: async (snapshot) => {
      completed.push(snapshot.rootUid);
      return { status: "restored", restored: true };
    },
  });
  assert.equal(result.status, "bulk-deleted-rolled-back");
  assert.equal(result.didDelete, false);
  assert.equal(result.restored, true);
  assert.deepEqual(structures, ["one", "two"]);
  assert.deepEqual(completed, ["one", "two"]);
});

test("bulk rollback never restores external refs for a root whose structure failed", async () => {
  const completed = [];
  const result = await runGuardedBulkUndoRegistration({
    snapshots,
    registerUndo: async () => { throw new Error("registration failed"); },
    restoreStructure: async (snapshot) => snapshot.rootUid === "one"
      ? { status: "restore-partial", restored: false, structureRestored: false }
      : { status: "structure-restored", structureRestored: true },
    completeRestore: async (snapshot) => {
      completed.push(snapshot.rootUid);
      return { status: "restored", restored: true };
    },
  });
  assert.equal(result.status, "bulk-deleted-rollback-failed");
  assert.equal(result.didDelete, true);
  assert.equal(result.restored, false);
  assert.equal(result.failedCount, 1);
  assert.deepEqual(completed, ["two"]);
});

test("registered bulk Undo uses the same guarded rollback and reports a later partial failure", async () => {
  let undo;
  const registration = await runGuardedBulkUndoRegistration({
    snapshots,
    registerUndo: async (entry) => { undo = entry.undo; },
    restoreStructure: async () => ({ status: "structure-restored", structureRestored: true }),
    completeRestore: async (snapshot) => snapshot.rootUid === "one"
      ? { status: "restored", restored: true }
      : { status: "restore-partial", restored: false, structureRestored: true },
  });
  assert.equal(registration.status, "bulk-deleted-with-undo");
  assert.equal(registration.didDelete, true);
  const result = await undo();
  assert.equal(result.status, "bulk-deleted-rollback-failed");
  assert.equal(result.restoredCount, 1);
  assert.equal(result.failedCount, 1);
});
