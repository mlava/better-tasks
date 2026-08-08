import { buildExternalReferenceOperations } from "./task-delete-transaction.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalize(value[key]);
  }
  return result;
}

function sortCanonicalEntries(values) {
  return values
    .map((entry) => canonicalize(entry))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function validateTaskDeleteSnapshot(snapshot, expectedRootUid = null) {
  if (!snapshot || typeof snapshot !== "object") return "snapshot-missing";
  if (snapshot.version !== 2) return "snapshot-version-invalid";
  if (typeof snapshot.rootUid !== "string" || !snapshot.rootUid) return "snapshot-root-missing";
  if (expectedRootUid && snapshot.rootUid !== expectedRootUid) return "snapshot-root-mismatch";
  if (typeof snapshot.parentUid !== "string" || !snapshot.parentUid) return "snapshot-parent-missing";
  if (!Number.isInteger(snapshot.order) || snapshot.order < 0) return "snapshot-order-invalid";
  if (!snapshot.tree || typeof snapshot.tree !== "object") return "snapshot-tree-missing";
  if (snapshot.tree.uid !== snapshot.rootUid) return "snapshot-tree-root-mismatch";
  if (snapshot.tree.order !== snapshot.order) return "snapshot-tree-order-mismatch";
  const walkedTreeUids = [];
  const walk = (node) => {
    if (
      !node ||
      typeof node !== "object" ||
      typeof node.uid !== "string" ||
      !node.uid ||
      typeof node.string !== "string" ||
      !Number.isInteger(node.order) ||
      node.order < 0 ||
      !Array.isArray(node.children) ||
      (node.props != null && (typeof node.props !== "object" || Array.isArray(node.props))) ||
      (node.open != null && typeof node.open !== "boolean") ||
      (node.heading != null && (!Number.isInteger(node.heading) || node.heading < 0)) ||
      (node.textAlign != null && typeof node.textAlign !== "string")
    ) return false;
    walkedTreeUids.push(node.uid);
    return node.children.every(walk);
  };
  if (!walk(snapshot.tree) || new Set(walkedTreeUids).size !== walkedTreeUids.length) {
    return "snapshot-tree-shape-invalid";
  }
  if (
    !Array.isArray(snapshot.treeUids) ||
    snapshot.treeUids[0] !== snapshot.rootUid ||
    JSON.stringify(snapshot.treeUids) !== JSON.stringify(walkedTreeUids)
  ) {
    return "snapshot-tree-uids-invalid";
  }
  if (!Array.isArray(snapshot.externalRefs?.dependents)) return "snapshot-dependents-invalid";
  if (!Array.isArray(snapshot.externalRefs?.explicitSubtasks)) return "snapshot-explicit-subtasks-invalid";
  try {
    buildExternalReferenceOperations(snapshot);
  } catch (_) {
    return "snapshot-external-refs-invalid";
  }
  return null;
}

export function createTaskDeleteFingerprint(snapshot) {
  const problem = validateTaskDeleteSnapshot(snapshot);
  if (problem) throw new TypeError(`Cannot fingerprint delete snapshot: ${problem}`);
  return JSON.stringify(canonicalize({
    version: snapshot.version,
    rootUid: snapshot.rootUid,
    parentUid: snapshot.parentUid,
    order: snapshot.order,
    tree: snapshot.tree,
    treeUids: snapshot.treeUids.slice(),
    externalRefs: {
      dependents: sortCanonicalEntries(snapshot.externalRefs.dependents),
      explicitSubtasks: sortCanonicalEntries(snapshot.externalRefs.explicitSubtasks),
    },
  }));
}

export function createTaskDeleteStructuralFingerprint(snapshot) {
  const problem = validateTaskDeleteSnapshot(snapshot);
  if (problem) throw new TypeError(`Cannot fingerprint delete snapshot: ${problem}`);
  return JSON.stringify(canonicalize({
    version: snapshot.version,
    rootUid: snapshot.rootUid,
    parentUid: snapshot.parentUid,
    order: snapshot.order,
    tree: snapshot.tree,
    treeUids: snapshot.treeUids.slice(),
  }));
}

export function createDeleteTerminalResult(status, reason, fields = {}) {
  const defaults = {
    didDelete: status === "deleted-with-undo" || status === "deleted-rollback-failed",
    restored: status === "deleted-rolled-back",
  };
  return { status, ...defaults, reason, ...fields };
}

function isCertifiedRestore(result) {
  return result === true || (
    result &&
    result.status === "restored" &&
    result.restored === true
  );
}

function captureFailure(reason, error = null) {
  return createDeleteTerminalResult("not-deleted", reason, {
    didDelete: false,
    restored: false,
    ...(error ? { error } : {}),
  });
}

export async function runInteractiveTaskDelete({
  rootUid,
  snapshot = null,
  captureSnapshot,
  confirmDelete,
  deleteSnapshot,
  registerUndo,
  restoreSnapshot,
}) {
  if (typeof rootUid !== "string" || !rootUid) {
    throw new TypeError("rootUid must be a non-empty string");
  }
  for (const [name, value] of Object.entries({
    captureSnapshot,
    confirmDelete,
    deleteSnapshot,
    registerUndo,
    restoreSnapshot,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  let preview;
  try {
    preview = snapshot || (await captureSnapshot());
  } catch (error) {
    return captureFailure("preview-snapshot-capture-failed", error);
  }
  const previewProblem = validateTaskDeleteSnapshot(preview, rootUid);
  if (previewProblem) return captureFailure(`preview-${previewProblem}`);
  let confirmed;
  try {
    confirmed = await confirmDelete(preview);
  } catch (error) {
    return captureFailure("confirmation-failed", error);
  }
  if (!confirmed) {
    return createDeleteTerminalResult("cancelled", "cancelled", {
      didDelete: false,
      restored: false,
    });
  }

  let captured;
  try {
    captured = await captureSnapshot();
  } catch (error) {
    return captureFailure("fresh-snapshot-capture-failed", error);
  }
  const capturedProblem = validateTaskDeleteSnapshot(captured, rootUid);
  if (capturedProblem) return captureFailure(`fresh-${capturedProblem}`);
  const previewFingerprint = createTaskDeleteFingerprint(preview);
  const capturedFingerprint = createTaskDeleteFingerprint(captured);
  if (previewFingerprint !== capturedFingerprint) {
    return createDeleteTerminalResult("changed", "snapshot-changed", {
      didDelete: false,
      restored: false,
      previewFingerprint,
      capturedFingerprint,
    });
  }

  let deletion;
  try {
    deletion = await deleteSnapshot(captured);
  } catch (error) {
    return createDeleteTerminalResult("delete-state-unknown", "delete-transaction-threw", {
      didDelete: null,
      restored: false,
      error,
      snapshot: captured,
    });
  }
  if (!deletion || typeof deletion !== "object" || typeof deletion.status !== "string") {
    return createDeleteTerminalResult("delete-state-unknown", "delete-transaction-result-invalid", {
      didDelete: null,
      restored: false,
      snapshot: captured,
    });
  }
  if (deletion.status !== "deleted" || deletion.didDelete !== true) return deletion;

  try {
    await registerUndo({
      snapshot: captured,
      undo: () => restoreSnapshot(captured),
    });
  } catch (error) {
    try {
      const restored = await restoreSnapshot(captured);
      if (!isCertifiedRestore(restored)) {
        return createDeleteTerminalResult(
          "deleted-rollback-failed",
          restored === false
            ? "undo-registration-failed-restore-returned-false"
            : "undo-registration-failed-restore-not-confirmed",
          {
            didDelete: true,
            restored: false,
            error,
            restoration: restored,
            deletion,
            snapshot: captured,
          }
        );
      }
      return createDeleteTerminalResult("deleted-rolled-back", "undo-registration-failed-restored", {
        didDelete: false,
        restored: true,
        error,
        deletion,
        snapshot: captured,
      });
    } catch (restoreError) {
      return createDeleteTerminalResult(
        "deleted-rollback-failed",
        "undo-registration-failed-restore-threw",
        {
          didDelete: true,
          restored: false,
          error,
          restoreError,
          deletion,
          snapshot: captured,
        }
      );
    }
  }
  return createDeleteTerminalResult("deleted-with-undo", "deleted", {
    didDelete: true,
    restored: false,
    deletion,
    snapshot: captured,
  });
}
