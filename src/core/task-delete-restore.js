import { normalizePropKeys } from "./subtree.js";
import { buildExternalReferenceOperations } from "./task-delete-transaction.js";
import {
  createTaskDeleteFingerprint,
  createTaskDeleteStructuralFingerprint,
  validateTaskDeleteSnapshot,
} from "./task-delete-flow.js";

export const RESTORE_NODE_PULL_PATTERN =
  "[:block/uid :block/string :block/order :block/props :block/open :block/heading :block/text-align {:block/_children [:block/uid]}]";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function equalValue(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function normalizedOptionalProps(value) {
  return value == null ? undefined : normalizePropKeys(value);
}

function nodeStateEqual(left, right) {
  if (!left || !right) return left === right;
  return (
    left.uid === right.uid &&
    left.parentUid === right.parentUid &&
    left.string === right.string &&
    left.order === right.order &&
    left.open === right.open &&
    left.heading === right.heading &&
    left.textAlign === right.textAlign &&
    equalValue(left.props, right.props)
  );
}

function nodeSpecs(tree, parentUid) {
  const specs = [];
  const walk = (node, directParentUid) => {
    specs.push({ node, parentUid: directParentUid });
    for (const child of node.children || []) walk(child, node.uid);
  };
  walk(tree, parentUid);
  return specs;
}

function expectedNodeState(node, parentUid, props = undefined) {
  return {
    uid: node.uid,
    parentUid,
    string: node.string,
    order: node.order,
    props,
    open: node.open,
    heading: node.heading,
    textAlign: node.textAlign,
  };
}

function partial(reason, snapshot, fields = {}) {
  return {
    status: "restore-partial",
    restored: false,
    structureRestored: false,
    externalReferencesRestored: false,
    reason,
    snapshot,
    ...fields,
  };
}

export function createRestoreNodeReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") throw new TypeError("roamAlphaAPI.data.async.pull is required");
  return async function readRestoreNode(uid) {
    const raw = await pull.call(
      roamAlphaAPI.data.async,
      RESTORE_NODE_PULL_PATTERN,
      [":block/uid", uid]
    );
    if (raw == null) return null;
    if (
      !raw || typeof raw !== "object" || raw[":block/uid"] !== uid ||
      typeof raw[":block/string"] !== "string" ||
      !Number.isInteger(raw[":block/order"]) || raw[":block/order"] < 0
    ) throw new TypeError(`Malformed restored block ${uid}`);
    const parents = raw[":block/_children"];
    if (!Array.isArray(parents) || parents.length !== 1 || typeof parents[0]?.[":block/uid"] !== "string") {
      throw new TypeError(`Restored block ${uid} has an ambiguous parent`);
    }
    return {
      uid,
      parentUid: parents[0][":block/uid"],
      string: raw[":block/string"],
      order: raw[":block/order"],
      props: normalizedOptionalProps(raw[":block/props"]),
      open: raw[":block/open"],
      heading: raw[":block/heading"],
      textAlign: raw[":block/text-align"],
    };
  };
}

async function observeNode(readNode, uid, phase, responseError = null) {
  try {
    return { state: await readNode(uid), error: null };
  } catch (error) {
    return { state: null, error, phase, responseError };
  }
}

export function createCertifiedTaskRestore({
  roamAlphaAPI,
  blockExistsFresh,
  captureSnapshot,
  restoreExternalReference,
  settle = async () => {},
} = {}) {
  const blockApi = roamAlphaAPI?.data?.block;
  if (typeof blockApi?.create !== "function" || typeof blockApi?.update !== "function") {
    throw new TypeError("roamAlphaAPI.data.block.create/update are required");
  }
  for (const [name, value] of Object.entries({ blockExistsFresh, captureSnapshot, restoreExternalReference, settle })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }
  const readNode = createRestoreNodeReader(roamAlphaAPI);

  const captureAndCompare = async (snapshot, structuralOnly) => {
    const captured = await captureSnapshot(snapshot.rootUid);
    const expected = structuralOnly
      ? createTaskDeleteStructuralFingerprint(snapshot)
      : createTaskDeleteFingerprint(snapshot);
    const actual = structuralOnly
      ? createTaskDeleteStructuralFingerprint(captured)
      : createTaskDeleteFingerprint(captured);
    return { matches: expected === actual, expected, actual, captured };
  };

  const restoreStructure = async (snapshot) => {
    const problem = validateTaskDeleteSnapshot(snapshot, snapshot?.rootUid);
    if (problem) return partial(`restore-${problem}`, snapshot);
    let parentExists;
    try {
      parentExists = await blockExistsFresh(snapshot.parentUid);
    } catch (error) {
      return partial("restore-parent-read-failed", snapshot, { error });
    }
    if (!parentExists) return partial("restore-parent-missing", snapshot);

    let rootExists;
    try {
      rootExists = await blockExistsFresh(snapshot.rootUid);
    } catch (error) {
      return partial("restore-root-read-failed", snapshot, { error });
    }
    if (rootExists) {
      try {
        const comparison = await captureAndCompare(snapshot, true);
        if (!comparison.matches) return partial("restore-existing-root-conflict", snapshot, { comparison });
        return {
          status: "structure-restored",
          restored: false,
          structureRestored: true,
          externalReferencesRestored: false,
          alreadyPresent: true,
          createdUids: [],
          snapshot,
        };
      } catch (error) {
        return partial("restore-existing-root-capture-failed", snapshot, { error });
      }
    }

    for (const uid of snapshot.treeUids.slice(1)) {
      try {
        if (await blockExistsFresh(uid)) return partial("restore-descendant-uid-conflict", snapshot, { conflictUid: uid });
      } catch (error) {
        return partial("restore-descendant-read-failed", snapshot, { error, conflictUid: uid });
      }
    }

    const createdUids = [];
    for (const { node, parentUid } of nodeSpecs(snapshot.tree, snapshot.parentUid)) {
      const pre = await observeNode(readNode, node.uid, "restore-create-before-read");
      if (pre.error) return partial("restore-create-before-read-failed", snapshot, { error: pre.error, createdUids, failedUid: node.uid });
      if (pre.state !== null) return partial("restore-create-precondition-conflict", snapshot, { createdUids, failedUid: node.uid, observedState: pre.state });

      const block = { uid: node.uid, string: node.string };
      if (node.open !== undefined) block.open = node.open;
      if (node.heading !== undefined) block.heading = node.heading;
      if (node.textAlign !== undefined) block["text-align"] = node.textAlign;
      let responseError = null;
      try {
        await blockApi.create.call(blockApi, {
          location: { "parent-uid": parentUid, order: node.order },
          block,
        });
      } catch (error) {
        responseError = error;
      }
      const post = await observeNode(readNode, node.uid, "restore-create-after-read", responseError);
      if (post.error) return partial("restore-create-after-read-failed", snapshot, { error: post.error, responseError, createdUids, failedUid: node.uid });
      const expectedCreated = expectedNodeState(node, parentUid, undefined);
      if (!nodeStateEqual(post.state, expectedCreated)) {
        return partial(post.state == null ? "restore-create-not-observed" : "restore-create-after-state-conflict", snapshot, {
          responseError, createdUids, failedUid: node.uid, observedState: post.state,
        });
      }
      createdUids.push(node.uid);

      if (node.props !== undefined) {
        const propsPre = await observeNode(readNode, node.uid, "restore-props-before-read");
        if (propsPre.error) {
          return partial("restore-props-before-read-failed", snapshot, {
            error: propsPre.error, createdUids, failedUid: node.uid,
          });
        }
        if (!nodeStateEqual(propsPre.state, expectedCreated)) {
          return partial("restore-props-precondition-conflict", snapshot, {
            createdUids, failedUid: node.uid, observedState: propsPre.state,
          });
        }
        responseError = null;
        try {
          await blockApi.update.call(blockApi, { block: { uid: node.uid, props: node.props } });
        } catch (error) {
          responseError = error;
        }
        const propsPost = await observeNode(readNode, node.uid, "restore-props-after-read", responseError);
        if (propsPost.error) return partial("restore-props-after-read-failed", snapshot, { error: propsPost.error, responseError, createdUids, failedUid: node.uid });
        const expectedWithProps = expectedNodeState(node, parentUid, node.props);
        if (!nodeStateEqual(propsPost.state, expectedWithProps)) {
          return partial(nodeStateEqual(propsPost.state, expectedCreated) ? "restore-props-not-observed" : "restore-props-after-state-conflict", snapshot, {
            responseError, createdUids, failedUid: node.uid, observedState: propsPost.state,
          });
        }
      }
    }

    try {
      await settle();
    } catch (error) {
      return partial("restore-structure-settle-failed", snapshot, { createdUids, error });
    }
    try {
      const comparison = await captureAndCompare(snapshot, true);
      if (!comparison.matches) return partial("restore-structure-certification-mismatch", snapshot, { createdUids, comparison, structureRestored: false });
    } catch (error) {
      return partial("restore-structure-certification-failed", snapshot, { createdUids, error });
    }
    return {
      status: "structure-restored",
      restored: false,
      structureRestored: true,
      externalReferencesRestored: false,
      alreadyPresent: false,
      createdUids,
      snapshot,
    };
  };

  const restoreExternalAndCertify = async (snapshot, structureOutcome = null) => {
    const problem = validateTaskDeleteSnapshot(snapshot, snapshot?.rootUid);
    if (problem) return partial(`restore-${problem}`, snapshot);
    if (structureOutcome?.structureRestored !== true) {
      return partial("restore-structure-not-certified", snapshot, { structureOutcome });
    }
    const results = [];
    let operations;
    try {
      operations = buildExternalReferenceOperations(snapshot);
    } catch (error) {
      return partial("restore-external-snapshot-invalid", snapshot, {
        structureRestored: structureOutcome?.structureRestored === true,
        createdUids: structureOutcome?.createdUids || [],
        error,
      });
    }
    for (const operation of operations) {
      let result;
      try {
        result = await restoreExternalReference(operation);
      } catch (error) {
        result = { status: "unknown", restored: false, reason: "restore-adapter-threw", error };
      }
      results.push({ operation, result });
      if (!["restored", "already-restored"].includes(result?.status)) {
        return partial(
          result?.status === "conflict" ? "restore-external-reference-conflict" : "restore-external-reference-unknown",
          snapshot,
          {
            structureRestored: structureOutcome?.structureRestored === true,
            createdUids: structureOutcome?.createdUids || [],
            externalReferenceResults: results,
          }
        );
      }
    }
    try {
      await settle();
    } catch (error) {
      return partial("restore-full-settle-failed", snapshot, {
        structureRestored: true,
        createdUids: structureOutcome?.createdUids || [],
        externalReferenceResults: results,
        error,
      });
    }
    try {
      const comparison = await captureAndCompare(snapshot, false);
      if (!comparison.matches) {
        return partial("restore-full-certification-mismatch", snapshot, {
          structureRestored: true,
          createdUids: structureOutcome?.createdUids || [],
          externalReferenceResults: results,
          comparison,
        });
      }
    } catch (error) {
      return partial("restore-full-certification-failed", snapshot, {
        structureRestored: true,
        createdUids: structureOutcome?.createdUids || [],
        externalReferenceResults: results,
        error,
      });
    }
    return {
      status: "restored",
      restored: true,
      structureRestored: true,
      externalReferencesRestored: true,
      createdUids: structureOutcome?.createdUids || [],
      externalReferenceResults: results,
      snapshot,
    };
  };

  const restore = async (snapshot) => {
    const structureOutcome = await restoreStructure(snapshot);
    if (structureOutcome?.structureRestored !== true) return structureOutcome;
    return restoreExternalAndCertify(snapshot, structureOutcome);
  };

  return Object.freeze({ restore, restoreStructure, restoreExternalAndCertify, readNode });
}
