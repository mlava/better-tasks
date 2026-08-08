import {
  collectTaskNodeUids,
  collectTreeUids,
  normalizePulledSubtree,
} from "./subtree.js";

export const STRICT_DELETE_SUBTREE_PULL_PATTERN =
  "[:block/uid :block/string :block/order :block/props :block/open :block/heading :block/text-align {:block/children ...}]";

export const STRICT_DELETE_PARENT_PULL_PATTERN =
  "[:block/uid :block/order {:block/_children [:block/uid :node/title]}]";

export const STRICT_BLOCK_EXISTENCE_PULL_PATTERN = "[:block/uid]";

export class TaskDeleteSnapshotError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "TaskDeleteSnapshotError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function fail(code, message, cause = null) {
  throw new TaskDeleteSnapshotError(code, message, cause);
}

function escapeDatalogString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildStrictTaskReferenceQuery(refUid) {
  const safeUid = escapeDatalogString(refUid);
  return `
    [:find (pull ?parent [:block/uid :block/string
              {:block/children [:block/uid :block/string :block/order]}])
     :where
       [?child :block/string ?str]
       [(clojure.string/includes? ?str "((${safeUid}))")]
       [?parent :block/children ?child]]`;
}

function validateRawSubtreeNode(raw, seen, path = "root") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("subtree-shape-invalid", `Delete subtree ${path} is not an object`);
  }
  const uid = raw[":block/uid"];
  if (typeof uid !== "string" || !uid) {
    fail("subtree-uid-invalid", `Delete subtree ${path} has no UID`);
  }
  if (seen.has(uid)) fail("subtree-uid-duplicate", `Delete subtree repeats UID ${uid}`);
  seen.add(uid);
  if (typeof raw[":block/string"] !== "string") {
    fail("subtree-string-invalid", `Delete subtree block ${uid} has no string`);
  }
  const order = raw[":block/order"];
  if (!Number.isInteger(order) || order < 0) {
    fail("subtree-order-invalid", `Delete subtree block ${uid} has invalid order`);
  }
  if (
    Object.prototype.hasOwnProperty.call(raw, ":block/props") &&
    raw[":block/props"] != null &&
    (typeof raw[":block/props"] !== "object" || Array.isArray(raw[":block/props"]))
  ) {
    fail("subtree-props-invalid", `Delete subtree block ${uid} has invalid props`);
  }
  if (
    Object.prototype.hasOwnProperty.call(raw, ":block/open") &&
    raw[":block/open"] != null &&
    typeof raw[":block/open"] !== "boolean"
  ) fail("subtree-open-invalid", `Delete subtree block ${uid} has invalid open state`);
  if (
    Object.prototype.hasOwnProperty.call(raw, ":block/heading") &&
    raw[":block/heading"] != null &&
    (!Number.isInteger(raw[":block/heading"]) || raw[":block/heading"] < 0)
  ) fail("subtree-heading-invalid", `Delete subtree block ${uid} has invalid heading`);
  if (
    Object.prototype.hasOwnProperty.call(raw, ":block/text-align") &&
    raw[":block/text-align"] != null &&
    typeof raw[":block/text-align"] !== "string"
  ) fail("subtree-text-align-invalid", `Delete subtree block ${uid} has invalid text alignment`);
  const children = raw[":block/children"];
  if (children != null && !Array.isArray(children)) {
    fail("subtree-children-invalid", `Delete subtree block ${uid} has invalid children`);
  }
  for (const [index, child] of (children || []).entries()) {
    validateRawSubtreeNode(child, seen, `${path}.${index}`);
  }
}

function validateNormalizedTree(tree, expectedRootUid) {
  if (!tree || tree.uid !== expectedRootUid) {
    fail("subtree-root-mismatch", `Delete subtree root does not match ${expectedRootUid}`);
  }
  const walk = (node) => {
    if (
      typeof node.uid !== "string" ||
      typeof node.string !== "string" ||
      !Number.isInteger(node.order) ||
      !Array.isArray(node.children)
    ) {
      fail("subtree-normalization-invalid", `Normalized delete subtree is invalid at ${node?.uid || "unknown"}`);
    }
    for (const child of node.children) walk(child);
  };
  walk(tree);
}

function normalizeAliases(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    fail("attribute-aliases-missing", `No ${label} aliases were provided for delete snapshot capture`);
  }
  const aliases = new Set(
    values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim().replace(/:+$/, "").toLowerCase())
      .filter(Boolean)
  );
  if (aliases.size === 0) {
    fail("attribute-aliases-missing", `No valid ${label} aliases were provided for delete snapshot capture`);
  }
  return aliases;
}

function parseAttributeString(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\s*([^:]+?)::\s*(.*)$/u);
  if (!match) return null;
  return { name: match[1].trim(), value: match[2].trim() };
}

function parseStrictDependencyValue(value, attributeUid) {
  if (typeof value !== "string" || !value.trim()) {
    fail("dependency-value-invalid", `Dependency attribute ${attributeUid} is empty`);
  }
  const result = [];
  for (const token of value.split(",")) {
    const match = token.trim().match(/^\(\(([a-zA-Z0-9_-]+)\)\)$/);
    if (!match) {
      fail("dependency-value-invalid", `Dependency attribute ${attributeUid} is malformed`);
    }
    result.push(match[1]);
  }
  return result;
}

function validateReferenceParent(rawParent) {
  if (!rawParent || typeof rawParent !== "object" || Array.isArray(rawParent)) {
    fail("reference-parent-invalid", "Reference query returned a malformed parent");
  }
  const taskUid = rawParent[":block/uid"];
  if (typeof taskUid !== "string" || !taskUid) {
    fail("reference-parent-uid-invalid", "Reference query parent has no UID");
  }
  if (typeof rawParent[":block/string"] !== "string") {
    fail("reference-parent-string-invalid", `Reference query parent ${taskUid} has no string`);
  }
  const children = rawParent[":block/children"];
  if (!Array.isArray(children)) {
    fail("reference-children-invalid", `Reference query parent ${taskUid} has no child array`);
  }
  const normalizedChildren = children.map((child) => {
    const uid = child?.[":block/uid"];
    const string = child?.[":block/string"];
    const order = child?.[":block/order"];
    if (typeof uid !== "string" || !uid || typeof string !== "string") {
      fail("reference-attribute-invalid", `Reference query parent ${taskUid} has a malformed child`);
    }
    if (!Number.isInteger(order) || order < 0) {
      fail("reference-attribute-order-invalid", `Reference attribute ${uid} has invalid order`);
    }
    return { uid, string, order };
  });
  return { taskUid, string: rawParent[":block/string"], children: normalizedChildren };
}

function stableReferenceParent(parent) {
  return JSON.stringify({
    taskUid: parent.taskUid,
    string: parent.string,
    children: parent.children
      .slice()
      .sort((left, right) => left.uid.localeCompare(right.uid)),
  });
}

function buildExternalReferences(candidateParents, referenceTargetUids, deletedTreeUids, aliases) {
  const treeSet = new Set(deletedTreeUids);
  const targetSet = new Set(referenceTargetUids);
  const dependents = [];
  const explicitSubtasks = [];
  for (const parent of candidateParents.values()) {
    if (treeSet.has(parent.taskUid)) continue;
    for (const child of parent.children) {
      const attribute = parseAttributeString(child.string);
      if (!attribute) continue;
      const normalizedName = attribute.name.toLowerCase();
      if (aliases.depends.has(normalizedName)) {
        const mentionsDeletedTask = referenceTargetUids.some((uid) => attribute.value.includes(`((${uid}))`));
        if (!mentionsDeletedTask) continue;
        const prevDepends = parseStrictDependencyValue(attribute.value, child.uid);
        if (!prevDepends.some((uid) => targetSet.has(uid))) {
          fail("dependency-reference-mismatch", `Dependency attribute ${child.uid} did not parse the queried reference`);
        }
        dependents.push({
          taskUid: parent.taskUid,
          attributeUid: child.uid,
          attributeName: attribute.name,
          attributeString: child.string,
          attributeOrder: child.order,
          prevDepends,
        });
      } else if (aliases.parent.has(normalizedName)) {
        const mentionsDeletedTask = referenceTargetUids.some((uid) => attribute.value.includes(`((${uid}))`));
        if (!mentionsDeletedTask) continue;
        const match = attribute.value.match(/^\(\(([a-zA-Z0-9_-]+)\)\)$/);
        if (!match || !targetSet.has(match[1])) {
          fail("parent-reference-invalid", `Parent attribute ${child.uid} is malformed or ambiguous`);
        }
        explicitSubtasks.push({
          taskUid: parent.taskUid,
          refUid: match[1],
          attributeUid: child.uid,
          attributeName: attribute.name,
          attributeString: child.string,
          attributeOrder: child.order,
        });
      }
    }
  }
  const byAttributeUid = (left, right) => left.attributeUid.localeCompare(right.attributeUid);
  dependents.sort(byAttributeUid);
  explicitSubtasks.sort(byAttributeUid);
  return { dependents, explicitSubtasks };
}

export function createStrictTaskDeleteSnapshotReader({
  roamAlphaAPI,
  getAttributeNames,
  isRootOwnedTask,
  isReferenceParentOwnedTask,
  now = Date.now,
} = {}) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  const query = roamAlphaAPI?.data?.async?.q;
  if (typeof pull !== "function" || typeof query !== "function") {
    throw new TypeError("roamAlphaAPI.data.async.pull and q are required");
  }
  if (typeof getAttributeNames !== "function") throw new TypeError("getAttributeNames must be a function");
  if (typeof isRootOwnedTask !== "function") {
    throw new TypeError("isRootOwnedTask must be a function");
  }
  if (typeof isReferenceParentOwnedTask !== "function") {
    throw new TypeError("isReferenceParentOwnedTask must be a function");
  }

  return async function captureStrictTaskDeleteSnapshot(uid) {
    if (typeof uid !== "string" || !uid.trim()) {
      fail("target-uid-invalid", "A non-empty task UID is required");
    }
    const rootUid = uid.trim();
    let rawTree;
    try {
      rawTree = await pull.call(
        roamAlphaAPI.data.async,
        STRICT_DELETE_SUBTREE_PULL_PATTERN,
        [":block/uid", rootUid]
      );
    } catch (error) {
      fail("subtree-pull-failed", `Could not pull delete subtree ${rootUid}`, error);
    }
    if (rawTree == null) fail("subtree-not-found", `Delete subtree ${rootUid} was not found`);
    validateRawSubtreeNode(rawTree, new Set());
    const tree = normalizePulledSubtree(rawTree);
    validateNormalizedTree(tree, rootUid);

    let rawParent;
    try {
      rawParent = await pull.call(
        roamAlphaAPI.data.async,
        STRICT_DELETE_PARENT_PULL_PATTERN,
        [":block/uid", rootUid]
      );
    } catch (error) {
      fail("parent-pull-failed", `Could not pull delete parent for ${rootUid}`, error);
    }
    if (!rawParent || rawParent[":block/uid"] !== rootUid) {
      fail("parent-root-mismatch", `Delete parent pull does not match ${rootUid}`);
    }
    const parents = rawParent[":block/_children"];
    if (!Array.isArray(parents) || parents.length !== 1) {
      fail("parent-cardinality-invalid", `Delete target ${rootUid} does not have exactly one direct parent`);
    }
    const parentUid = parents[0]?.[":block/uid"];
    if (typeof parentUid !== "string" || !parentUid) {
      fail("parent-uid-invalid", `Delete target ${rootUid} has an invalid direct parent`);
    }
    const order = rawParent[":block/order"];
    if (!Number.isInteger(order) || order < 0 || order !== tree.order) {
      fail("parent-order-invalid", `Delete target ${rootUid} has inconsistent order`);
    }

    let rawAttributeNames;
    try {
      rawAttributeNames = await getAttributeNames();
    } catch (error) {
      fail("attribute-aliases-read-failed", "Could not read Better Tasks attribute aliases", error);
    }
    const aliases = {
      depends: normalizeAliases(rawAttributeNames?.dependsAliases, "dependency"),
      parent: normalizeAliases(rawAttributeNames?.parentAliases, "parent"),
    };
    const treeUids = collectTreeUids(tree);
    if (treeUids.includes(parentUid)) {
      fail("parent-cycle-invalid", `Delete target ${rootUid} has a parent inside its own subtree`);
    }
    const scanUids = collectTaskNodeUids(tree);
    if (!scanUids.includes(rootUid)) {
      fail("root-not-task-shaped", `Delete subtree ${rootUid} is not task-shaped`);
    }
    let rootOwned;
    try {
      rootOwned = await isRootOwnedTask(tree);
    } catch (error) {
      fail("root-ownership-read-failed", `Could not verify delete target ${rootUid}`, error);
    }
    if (typeof rootOwned !== "boolean") {
      fail("root-ownership-result-invalid", `Ownership check for delete target ${rootUid} was not boolean`);
    }
    if (!rootOwned) {
      fail("root-not-owned-task", `Delete target ${rootUid} is not owned by Better Tasks`);
    }

    const candidateParents = new Map();
    for (const refUid of scanUids) {
      let rows;
      try {
        rows = await query.call(
          roamAlphaAPI.data.async,
          buildStrictTaskReferenceQuery(refUid)
        );
      } catch (error) {
        fail("reference-query-failed", `Could not query references for ${refUid}`, error);
      }
      if (!Array.isArray(rows)) {
        fail("reference-query-shape-invalid", `Reference query for ${refUid} did not return rows`);
      }
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 1) {
          fail("reference-query-row-invalid", `Reference query for ${refUid} returned a malformed row`);
        }
        const parent = validateReferenceParent(row[0]);
        const previous = candidateParents.get(parent.taskUid);
        if (previous && stableReferenceParent(previous) !== stableReferenceParent(parent)) {
          fail("references-changed-during-capture", `Reference parent ${parent.taskUid} changed during capture`);
        }
        candidateParents.set(parent.taskUid, parent);
      }
    }
    const ownedCandidateParents = new Map();
    for (const [taskUid, candidate] of candidateParents) {
      let owned;
      try {
        owned = await isReferenceParentOwnedTask(candidate);
      } catch (error) {
        fail("reference-parent-ownership-read-failed", `Could not verify reference parent ${taskUid}`, error);
      }
      if (typeof owned !== "boolean") {
        fail("reference-parent-ownership-result-invalid", `Ownership check for reference parent ${taskUid} was not boolean`);
      }
      if (owned) ownedCandidateParents.set(taskUid, candidate);
    }
    const externalRefs = buildExternalReferences(ownedCandidateParents, scanUids, treeUids, aliases);
    return {
      version: 2,
      rootUid,
      parentUid,
      order,
      tree,
      treeUids,
      externalRefs,
      capturedAt: now(),
    };
  };
}

export function createFreshBlockExistenceReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") throw new TypeError("roamAlphaAPI.data.async.pull is required");
  return async (uid) => {
    const raw = await pull.call(
      roamAlphaAPI.data.async,
      STRICT_BLOCK_EXISTENCE_PULL_PATTERN,
      [":block/uid", uid]
    );
    if (raw == null) return false;
    if (!raw || typeof raw !== "object" || raw[":block/uid"] !== uid) {
      fail("existence-pull-shape-invalid", `Existence pull does not match ${uid}`);
    }
    return true;
  };
}
