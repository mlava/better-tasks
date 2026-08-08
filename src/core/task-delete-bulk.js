function restoreSucceeded(result) {
  return result === true || (
    result &&
    result.status === "restored" &&
    result.restored === true
  );
}

function structureSucceeded(result) {
  return result === true || result?.structureRestored === true;
}

/**
 * Registers one Undo for a committed batch. Registration failure immediately
 * invokes the same compensation path. External references are restored only
 * for roots whose structure was certified first.
 */
export async function runGuardedBulkUndoRegistration({
  snapshots,
  registerUndo,
  restoreStructure,
  completeRestore,
} = {}) {
  if (!Array.isArray(snapshots) || snapshots.some((snapshot) => !snapshot?.rootUid)) {
    throw new TypeError("snapshots must contain rooted delete snapshots");
  }
  for (const [name, value] of Object.entries({ registerUndo, restoreStructure, completeRestore })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  const restoreAll = async () => {
    const items = [];
    for (const snapshot of snapshots) {
      let structure;
      try {
        structure = await restoreStructure(snapshot);
      } catch (error) {
        structure = { status: "restore-partial", restored: false, structureRestored: false, reason: "bulk-restore-structure-threw", error };
      }
      if (!structureSucceeded(structure)) {
        items.push({ rootUid: snapshot.rootUid, snapshot, structure, restored: false });
        continue;
      }
      items.push({ rootUid: snapshot.rootUid, snapshot, structure, restored: false });
    }
    // Rebuild every certifiable root before restoring any references. This
    // prevents a reference from targeting another batch root that has not yet
    // been recreated. Failed roots are never passed to the external phase.
    for (const item of items) {
      if (!structureSucceeded(item.structure)) continue;
      let completed;
      try {
        completed = await completeRestore(item.snapshot, item.structure);
      } catch (error) {
        completed = { status: "restore-partial", restored: false, structureRestored: true, reason: "bulk-restore-certification-threw", error };
      }
      item.completed = completed;
      item.restored = restoreSucceeded(completed);
    }
    const restoredCount = items.filter((item) => item.restored).length;
    const restored = restoredCount === snapshots.length;
    return {
      status: restored ? "bulk-deleted-rolled-back" : "bulk-deleted-rollback-failed",
      didDelete: !restored,
      restored,
      restoredCount,
      failedCount: snapshots.length - restoredCount,
      items,
    };
  };

  try {
    await registerUndo({ snapshots, undo: restoreAll });
  } catch (error) {
    const compensation = await restoreAll();
    return {
      ...compensation,
      reason: compensation.restored
        ? "bulk-undo-registration-failed-restored"
        : "bulk-undo-registration-failed-rollback-failed",
      registrationError: error,
    };
  }

  return {
    status: "bulk-deleted-with-undo",
    didDelete: snapshots.length > 0,
    restored: false,
    restoredCount: 0,
    failedCount: 0,
    reason: "bulk-deleted",
  };
}
