export const EXTERNAL_REFERENCE_STATE_PULL_PATTERN =
  "[:block/uid :block/string :block/order {:block/_children [:block/uid]}]";

function presentState(operation, string = operation.beforeString) {
  return {
    kind: "present",
    uid: operation.attributeUid,
    parentUid: operation.taskUid,
    string,
    order: operation.attributeOrder,
  };
}

export function expectedExternalReferenceBeforeState(operation) {
  return presentState(operation);
}

export function expectedExternalReferenceAfterState(operation) {
  return operation.afterString == null
    ? { kind: "absent", uid: operation.attributeUid }
    : presentState(operation, operation.afterString);
}

export function externalReferenceStatesEqual(left, right) {
  if (!left || !right || left.kind !== right.kind || left.uid !== right.uid) return false;
  if (left.kind === "absent") return true;
  return (
    left.parentUid === right.parentUid &&
    left.string === right.string &&
    left.order === right.order
  );
}

export function createExternalReferenceStateReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") throw new TypeError("roamAlphaAPI.data.async.pull is required");
  return async function readExternalReferenceState(operation) {
    const raw = await pull.call(
      roamAlphaAPI.data.async,
      EXTERNAL_REFERENCE_STATE_PULL_PATTERN,
      [":block/uid", operation.attributeUid]
    );
    if (raw == null) return { kind: "absent", uid: operation.attributeUid };
    if (
      !raw ||
      typeof raw !== "object" ||
      raw[":block/uid"] !== operation.attributeUid ||
      typeof raw[":block/string"] !== "string" ||
      !Number.isInteger(raw[":block/order"]) ||
      raw[":block/order"] < 0
    ) {
      throw new TypeError(`Malformed external-reference block ${operation.attributeUid}`);
    }
    const parents = raw[":block/_children"];
    if (
      !Array.isArray(parents) ||
      parents.length !== 1 ||
      typeof parents[0]?.[":block/uid"] !== "string" ||
      !parents[0][":block/uid"]
    ) {
      throw new TypeError(`External-reference block ${operation.attributeUid} has an ambiguous parent`);
    }
    return {
      kind: "present",
      uid: operation.attributeUid,
      parentUid: parents[0][":block/uid"],
      string: raw[":block/string"],
      order: raw[":block/order"],
    };
  };
}

function mutationResult(status, operation, reason, fields = {}) {
  return { status, operation, reason, ...fields };
}

async function observe(readState, operation, phase, responseError = null) {
  try {
    return { state: await readState(operation), error: null };
  } catch (error) {
    return { state: null, error, phase, responseError };
  }
}

export function createExternalReferenceMutationAdapter(roamAlphaAPI) {
  const blockApi = roamAlphaAPI?.data?.block;
  if (
    typeof blockApi?.create !== "function" ||
    typeof blockApi?.update !== "function" ||
    typeof blockApi?.delete !== "function"
  ) {
    throw new TypeError("roamAlphaAPI.data.block.create/update/delete are required");
  }
  const readState = createExternalReferenceStateReader(roamAlphaAPI);

  const apply = async (operation) => {
    const before = expectedExternalReferenceBeforeState(operation);
    const after = expectedExternalReferenceAfterState(operation);
    const pre = await observe(readState, operation, "apply-before-read");
    if (pre.error) {
      return mutationResult("unknown", operation, "apply-before-read-failed", {
        applied: false,
        writeAttempted: false,
        error: pre.error,
      });
    }
    if (!externalReferenceStatesEqual(pre.state, before)) {
      return mutationResult("conflict", operation, "apply-precondition-conflict", {
        applied: false,
        writeAttempted: false,
        observedState: pre.state,
      });
    }

    let responseError = null;
    try {
      if (after.kind === "absent") {
        await blockApi.delete.call(blockApi, { block: { uid: operation.attributeUid } });
      } else {
        await blockApi.update.call(blockApi, {
          block: { uid: operation.attributeUid, string: operation.afterString },
        });
      }
    } catch (error) {
      responseError = error;
    }
    const post = await observe(readState, operation, "apply-after-read", responseError);
    if (post.error) {
      return mutationResult("unknown", operation, "apply-after-read-failed", {
        applied: false,
        writeAttempted: true,
        error: post.error,
        responseError,
      });
    }
    if (externalReferenceStatesEqual(post.state, after)) {
      return mutationResult("applied", operation, "apply-after-state-confirmed", {
        applied: true,
        writeAttempted: true,
        responseError,
      });
    }
    if (externalReferenceStatesEqual(post.state, before)) {
      return mutationResult("not-applied", operation, "apply-write-not-observed", {
        applied: false,
        writeAttempted: true,
        responseError,
      });
    }
    return mutationResult("conflict", operation, "apply-after-state-conflict", {
      applied: false,
      writeAttempted: true,
      responseError,
      observedState: post.state,
    });
  };

  const restore = async (operation) => {
    const before = expectedExternalReferenceBeforeState(operation);
    const after = expectedExternalReferenceAfterState(operation);
    const pre = await observe(readState, operation, "restore-before-read");
    if (pre.error) {
      return mutationResult("unknown", operation, "restore-before-read-failed", {
        restored: false,
        error: pre.error,
      });
    }
    if (externalReferenceStatesEqual(pre.state, before)) {
      return mutationResult("already-restored", operation, "restore-before-state-already-present", {
        restored: true,
      });
    }
    if (!externalReferenceStatesEqual(pre.state, after)) {
      return mutationResult("conflict", operation, "restore-precondition-conflict", {
        restored: false,
        observedState: pre.state,
      });
    }

    let responseError = null;
    try {
      if (after.kind === "absent") {
        await blockApi.create.call(blockApi, {
          location: { "parent-uid": operation.taskUid, order: operation.attributeOrder },
          block: { uid: operation.attributeUid, string: operation.beforeString },
        });
      } else {
        await blockApi.update.call(blockApi, {
          block: { uid: operation.attributeUid, string: operation.beforeString },
        });
      }
    } catch (error) {
      responseError = error;
    }
    const post = await observe(readState, operation, "restore-after-read", responseError);
    if (post.error) {
      return mutationResult("unknown", operation, "restore-after-read-failed", {
        restored: false,
        error: post.error,
        responseError,
      });
    }
    if (externalReferenceStatesEqual(post.state, before)) {
      return mutationResult("restored", operation, "restore-before-state-confirmed", {
        restored: true,
        responseError,
      });
    }
    if (externalReferenceStatesEqual(post.state, after)) {
      return mutationResult("not-restored", operation, "restore-write-not-observed", {
        restored: false,
        responseError,
      });
    }
    return mutationResult("conflict", operation, "restore-after-state-conflict", {
      restored: false,
      responseError,
      observedState: post.state,
    });
  };

  return Object.freeze({ readState, apply, restore });
}
