function isUid(value) {
  return typeof value === "string" && value.length > 0;
}

function assertSnapshotArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function parseCapturedAttribute(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\s*([^:]+?)::\s*(.*?)\s*$/u);
  return match ? { name: match[1].trim(), value: match[2] } : null;
}

export function buildExternalReferenceOperations(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new TypeError("A delete snapshot is required");
  const treeUids = assertSnapshotArray(snapshot.treeUids, "snapshot.treeUids");
  const treeSet = new Set(treeUids);
  const dependents = assertSnapshotArray(snapshot.externalRefs?.dependents, "snapshot.externalRefs.dependents");
  const explicitSubtasks = assertSnapshotArray(snapshot.externalRefs?.explicitSubtasks, "snapshot.externalRefs.explicitSubtasks");
  const operations = [];
  const attributeUids = new Set();
  const add = (operation) => {
    if (attributeUids.has(operation.attributeUid)) {
      throw new TypeError(`Duplicate external-reference attribute UID: ${operation.attributeUid}`);
    }
    attributeUids.add(operation.attributeUid);
    operations.push(operation);
  };

  for (const entry of dependents) {
    if (
      !isUid(entry?.taskUid) || !isUid(entry?.attributeUid) ||
      typeof entry?.attributeName !== "string" || !entry.attributeName ||
      typeof entry?.attributeString !== "string" ||
      !Number.isInteger(entry?.attributeOrder) || entry.attributeOrder < 0 ||
      !Array.isArray(entry?.prevDepends) || entry.prevDepends.some((uid) => !isUid(uid))
    ) throw new TypeError("Malformed dependent reference snapshot");
    const capturedAttribute = parseCapturedAttribute(entry.attributeString);
    const capturedRefs = capturedAttribute?.value
      .split(",")
      .map((token) => token.trim().match(/^\(\(([a-zA-Z0-9_-]+)\)\)$/)?.[1] || null);
    if (
      treeSet.has(entry.taskUid) || capturedAttribute?.name !== entry.attributeName ||
      capturedRefs?.some((uid) => !uid) ||
      JSON.stringify(capturedRefs) !== JSON.stringify(entry.prevDepends) ||
      !entry.prevDepends.some((uid) => treeSet.has(uid))
    ) throw new TypeError("Inconsistent dependent reference snapshot");
    const remainingDepends = entry.prevDepends.filter((uid) => !treeSet.has(uid));
    add({
      kind: "dependent",
      taskUid: entry.taskUid,
      attributeUid: entry.attributeUid,
      attributeOrder: entry.attributeOrder,
      beforeString: entry.attributeString,
      afterString: remainingDepends.length
        ? `${entry.attributeName}:: ${remainingDepends.map((uid) => `((${uid}))`).join(", ")}`
        : null,
    });
  }

  for (const entry of explicitSubtasks) {
    if (
      !isUid(entry?.taskUid) || !isUid(entry?.refUid) || !isUid(entry?.attributeUid) ||
      typeof entry?.attributeName !== "string" || !entry.attributeName ||
      typeof entry?.attributeString !== "string" ||
      !Number.isInteger(entry?.attributeOrder) || entry.attributeOrder < 0
    ) throw new TypeError("Malformed explicit-parent reference snapshot");
    const capturedAttribute = parseCapturedAttribute(entry.attributeString);
    if (
      treeSet.has(entry.taskUid) || !treeSet.has(entry.refUid) ||
      capturedAttribute?.name !== entry.attributeName ||
      capturedAttribute?.value !== `((${entry.refUid}))`
    ) throw new TypeError("Inconsistent explicit-parent reference snapshot");
    add({
      kind: "explicit-parent",
      taskUid: entry.taskUid,
      attributeUid: entry.attributeUid,
      attributeOrder: entry.attributeOrder,
      beforeString: entry.attributeString,
      afterString: null,
    });
  }
  return operations;
}

async function restoreEligibleOperations(rollbackCandidates, restoreExternalReference) {
  const results = [];
  for (const operation of rollbackCandidates.slice().reverse()) {
    let result;
    try {
      result = await restoreExternalReference(operation);
    } catch (error) {
      result = { status: "unknown", restored: false, reason: "restore-adapter-threw", error, operation };
    }
    results.push({ operation, result });
  }
  const conflicts = results.filter(({ result }) => result?.status === "conflict");
  const unknown = results.filter(({ result }) =>
    !result || !["restored", "already-restored"].includes(result.status) && result.status !== "conflict"
  );
  return {
    results,
    conflicts,
    unknown,
    restored: conflicts.length === 0 && unknown.length === 0,
  };
}

async function collectNotificationErrors(notifyAfterDelete, snapshot, operations) {
  const errors = [];
  try {
    const reported = await notifyAfterDelete(snapshot, operations);
    if (Array.isArray(reported)) errors.push(...reported);
    else if (Array.isArray(reported?.errors)) errors.push(...reported.errors);
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

async function settleFailureAfterRootRead({
  snapshot,
  phase,
  failure,
  provenApplied,
  rollbackCandidates,
  operations,
  restoreExternalReference,
  rootExistsFresh,
  notifyAfterDelete,
}) {
  let rootExists;
  try {
    rootExists = await rootExistsFresh(snapshot.rootUid);
  } catch (existenceError) {
    return {
      status: "delete-state-unknown",
      didDelete: null,
      restored: false,
      externalReferencesRestored: false,
      reason: `${phase}-root-state-unknown`,
      failure,
      existenceError,
      provenAppliedCount: provenApplied.length,
      rollbackCandidateCount: rollbackCandidates.length,
      restoredOperationCount: 0,
      snapshot,
    };
  }
  if (!rootExists) {
    return {
      status: "deleted",
      didDelete: true,
      restored: false,
      externalReferencesRestored: false,
      reason: `${phase}-root-absent`,
      failure,
      provenAppliedCount: provenApplied.length,
      rollbackCandidateCount: rollbackCandidates.length,
      restoredOperationCount: 0,
      notificationErrors: await collectNotificationErrors(notifyAfterDelete, snapshot, operations),
      snapshot,
    };
  }

  const rollback = await restoreEligibleOperations(rollbackCandidates, restoreExternalReference);
  const reason = rollback.conflicts.length
    ? `${phase}-rollback-conflict`
    : rollback.unknown.length
      ? `${phase}-rollback-unknown`
      : `${phase}-references-restored`;
  return {
    status: "not-deleted",
    didDelete: false,
    restored: rollback.restored,
    externalReferencesRestored: rollback.restored,
    reason,
    failure,
    provenAppliedCount: provenApplied.length,
    rollbackCandidateCount: rollbackCandidates.length,
    restoredOperationCount: rollback.results.filter(({ result }) =>
      ["restored", "already-restored"].includes(result?.status)
    ).length,
    rollbackResults: rollback.results,
    rollbackConflicts: rollback.conflicts,
    rollbackUnknown: rollback.unknown,
    snapshot,
  };
}

export async function runTransactionalTaskDelete({
  snapshot,
  applyExternalReference,
  restoreExternalReference,
  deleteRoot,
  rootExistsFresh,
  notifyAfterDelete,
}) {
  if (!snapshot?.rootUid) throw new TypeError("A rooted delete snapshot is required");
  for (const [name, value] of Object.entries({
    applyExternalReference, restoreExternalReference, deleteRoot, rootExistsFresh, notifyAfterDelete,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }
  let operations;
  try {
    operations = buildExternalReferenceOperations(snapshot);
  } catch (error) {
    return { status: "not-deleted", didDelete: false, restored: false, reason: "delete-snapshot-invalid", error, snapshot };
  }

  const provenApplied = [];
  for (const operation of operations) {
    let result;
    try {
      result = await applyExternalReference(operation);
    } catch (error) {
      result = {
        status: "unknown",
        applied: false,
        writeAttempted: true,
        reason: "apply-adapter-threw",
        error,
        operation,
      };
    }
    if (result?.status === "applied" && result.applied === true) {
      provenApplied.push(operation);
      continue;
    }
    const rollbackCandidates = result?.writeAttempted === true
      ? [...provenApplied, operation]
      : provenApplied.slice();
    return settleFailureAfterRootRead({
      snapshot,
      phase: `external-reference-${result?.status || "unknown"}`,
      failure: result,
      provenApplied,
      rollbackCandidates,
      operations,
      restoreExternalReference,
      rootExistsFresh,
      notifyAfterDelete,
    });
  }

  let deleteResponseError = null;
  try {
    await deleteRoot(snapshot.rootUid);
  } catch (error) {
    deleteResponseError = error;
  }
  let rootExists;
  try {
    rootExists = await rootExistsFresh(snapshot.rootUid);
  } catch (existenceError) {
    return {
      status: "delete-state-unknown",
      didDelete: null,
      restored: false,
      externalReferencesRestored: false,
      reason: deleteResponseError ? "root-delete-response-lost-root-state-unknown" : "root-delete-verification-failed",
      error: deleteResponseError,
      existenceError,
      provenAppliedCount: provenApplied.length,
      rollbackCandidateCount: provenApplied.length,
      restoredOperationCount: 0,
      snapshot,
    };
  }
  if (rootExists) {
    const rollback = await restoreEligibleOperations(provenApplied, restoreExternalReference);
    return {
      status: "not-deleted",
      didDelete: false,
      restored: rollback.restored,
      externalReferencesRestored: rollback.restored,
      reason: rollback.conflicts.length
        ? "root-delete-not-observed-rollback-conflict"
        : rollback.unknown.length
          ? "root-delete-not-observed-rollback-unknown"
          : "root-delete-not-observed-references-restored",
      error: deleteResponseError,
      provenAppliedCount: provenApplied.length,
      rollbackCandidateCount: provenApplied.length,
      restoredOperationCount: rollback.results.filter(({ result }) =>
        ["restored", "already-restored"].includes(result?.status)
      ).length,
      rollbackResults: rollback.results,
      rollbackConflicts: rollback.conflicts,
      rollbackUnknown: rollback.unknown,
      snapshot,
    };
  }

  return {
    status: "deleted",
    didDelete: true,
    restored: false,
    externalReferencesRestored: false,
    reason: deleteResponseError ? "root-delete-response-lost-root-absent" : "deleted",
    error: deleteResponseError,
    provenAppliedCount: provenApplied.length,
    rollbackCandidateCount: provenApplied.length,
    restoredOperationCount: 0,
    notificationErrors: await collectNotificationErrors(notifyAfterDelete, snapshot, operations),
    snapshot,
  };
}
