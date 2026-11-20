const TASK_MACRO_RE = /^\s*(?:\{\{\s*(?:\[\[\s*)?(?:TODO|DONE)(?:\s*\]\])?\s*\}\}|(?:TODO|DONE)\s+)/i;
const ATTRIBUTE_RE = /^\s*([\p{L}\p{N}_\-/\s]+)::/u;
const OWNED_CAPABILITY_NAMESPACES = new WeakSet();

export const FRESH_BLOCK_PULL_PATTERN = `
  [:block/uid :block/string :block/props :block/order :node/title
   {:block/page [:block/uid :node/title]}
   {:block/_children [:block/uid]}
   {:block/children
    [:block/uid :block/string :block/props :block/order]}]`;

export const FRESH_BLOCK_SUBTREE_PULL_PATTERN = `
  [:block/uid :block/string :block/props :block/order
   {:block/children ...}]`;

function valueAt(value, keyword, fallback) {
  if (!value || typeof value !== "object") return fallback;
  const plain = keyword.replace(/^:/, "");
  return value[keyword] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}

export function normalizeRoamPropertyTree(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeRoamPropertyTree(item));
  if (!value || typeof value !== "object") return value;
  const normalized = {};
  for (const [rawKey, child] of Object.entries(value)) {
    const key = typeof rawKey === "string" ? rawKey.replace(/^:/, "") : rawKey;
    normalized[key] = normalizeRoamPropertyTree(child);
  }
  return normalized;
}

export function resolveChildSurfaceRepeatText({ repeatChildValue, inlineRepeat, props } = {}) {
  return (
    repeatChildValue ||
    inlineRepeat ||
    (typeof props?.repeat === "string" && props.repeat ? props.repeat : null)
  );
}

export function updateDueParseDiagnostics({
  uid,
  dueSource,
  dueChildValue,
  parsedDate,
  suppressDiagnostics = false,
  noteFailure,
  clearFailure,
} = {}) {
  if (suppressDiagnostics || !uid) return;
  const parsedSuccessfully =
    parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());
  if (dueSource && parsedSuccessfully) {
    clearFailure?.(uid);
  } else if (dueSource && dueChildValue) {
    noteFailure?.(uid);
  } else if (!dueSource) {
    clearFailure?.(uid);
  }
}

function normalizePulledBlock(value) {
  if (!value || typeof value !== "object") return null;
  const uid = valueAt(value, ":block/uid", null);
  if (typeof uid !== "string" || !uid) return null;
  const rawParents = valueAt(value, ":block/_children", []);
  const rawChildren = valueAt(value, ":block/children", []);
  const rawPage = valueAt(value, ":block/page", null);
  const parents = (Array.isArray(rawParents) ? rawParents : [rawParents])
    .map((parent) => normalizePulledBlock(parent))
    .filter(Boolean);
  const children = (Array.isArray(rawChildren) ? rawChildren : [rawChildren])
    .map((child) => normalizePulledBlock(child))
    .filter(Boolean);
  const pageUid = valueAt(rawPage, ":block/uid", null);
  const pageTitle = valueAt(rawPage, ":node/title", null);
  const nodeTitle = valueAt(value, ":node/title", null);
  const entityType = typeof nodeTitle === "string" ? "page" : "block";
  const directParentState =
    parents.length === 1 ? "one" : parents.length === 0 ? "none" : "ambiguous";
  const [onlyParent] = parents;
  return {
    uid,
    string: valueAt(value, ":block/string", ""),
    props: normalizeRoamPropertyTree(valueAt(value, ":block/props", null)),
    order: valueAt(value, ":block/order", null),
    entityType,
    nodeTitle,
    parents,
    directParentState,
    directParentUid: directParentState === "one" ? onlyParent.uid : null,
    children,
    page: pageUid || pageTitle ? { uid: pageUid, title: pageTitle } : null,
  };
}

export function createFreshRoamBlockReader(roamAlphaAPI) {
  return async (uid, { includeDescendants = false } = {}) => {
    const pull = roamAlphaAPI?.data?.async?.pull;
    if (typeof pull !== "function") {
      throw new TypeError("roamAlphaAPI.data.async.pull is required");
    }
    const pulled = await pull.call(
      roamAlphaAPI.data.async,
      FRESH_BLOCK_PULL_PATTERN,
      [":block/uid", uid]
    );
    const block = normalizePulledBlock(pulled);
    if (!block || !includeDescendants) return block;
    const subtreePulled = await pull.call(
      roamAlphaAPI.data.async,
      FRESH_BLOCK_SUBTREE_PULL_PATTERN,
      [":block/uid", uid]
    );
    const subtree = normalizePulledBlock(subtreePulled);
    if (!subtree) return null;
    subtree.parents = block.parents;
    subtree.entityType = block.entityType;
    subtree.nodeTitle = block.nodeTitle;
    subtree.directParentState = block.directParentState;
    subtree.directParentUid = block.directParentUid;
    subtree.page = block.page;
    return subtree;
  };
}

export function hasBetterTasksOwnershipSignal(meta) {
  if (!meta || typeof meta !== "object") return false;
  const metadata = meta.metadata || {};
  const childAttrs = meta.childAttrMap || {};
  return !!(
    meta.repeat ||
    meta.hasTimingAttrs ||
    meta.hasMetadata ||
    meta.rtId ||
    meta.rtParent ||
    childAttrs.completed ||
    childAttrs.parent ||
    childAttrs.notes ||
    metadata.parentTaskUid ||
    metadata.notes
  );
}

function unknown(uid, reason) {
  return {
    kind: "unknown",
    uid,
    ownerTaskUid: null,
    relationship: null,
    directParentTaskUid: null,
    containsManagedTasks: false,
    topLevelManagedTaskUids: [],
    reason,
  };
}

function baseResult(kind, uid, fields = {}) {
  return {
    kind,
    uid,
    ownerTaskUid: fields.ownerTaskUid || null,
    relationship: fields.relationship || null,
    directParentTaskUid: fields.directParentTaskUid || null,
    containsManagedTasks: !!fields.containsManagedTasks,
    topLevelManagedTaskUids: Array.isArray(fields.topLevelManagedTaskUids)
      ? fields.topLevelManagedTaskUids.slice()
      : [],
  };
}

function normalizeAliases(values) {
  const aliases = new Set();
  for (const value of values || []) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/:+$/, "").toLowerCase();
    if (normalized) aliases.add(normalized);
  }
  return aliases;
}

function normalizeTitles(values) {
  const titles = new Set();
  for (const value of values || []) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) titles.add(normalized);
  }
  return titles;
}

function normalizeOwnershipVocabulary(value) {
  const vocabulary = value && typeof value === "object" ? value : {};
  return {
    attributeNames: normalizeAliases(vocabulary.attributeNames),
    parentAttributeNames: normalizeAliases([
      "parent",
      "parent_uid",
      "parent-uid",
      "parentuid",
      ...(vocabulary.parentAttributeNames || []),
    ]),
    activityContainerTitles: normalizeTitles(vocabulary.activityContainerTitles),
  };
}

function isOwnedAttributeBlock(block, aliases) {
  const match = typeof block?.string === "string" ? block.string.match(ATTRIBUTE_RE) : null;
  return !!match && aliases.has(match[1].trim().toLowerCase());
}

function isOwnedActivityBlock(block, titles) {
  return typeof block?.string === "string" && titles.has(block.string.trim());
}

function looksLikeTask(block) {
  return typeof block?.string === "string" && TASK_MACRO_RE.test(block.string);
}

async function inspectManagedTask(block, inspectTask) {
  if (!looksLikeTask(block)) return { managed: false, explicitParentTaskUid: null };
  const inspection = await inspectTask(block, {
    authoritative: true,
    suppressDiagnostics: true,
  });
  if (!inspection || typeof inspection !== "object") {
    throw new TypeError("inspectTask returned a malformed result");
  }
  return {
    managed: inspection.managed === true,
    explicitParentTaskUid:
      typeof inspection.explicitParentTaskUid === "string" && inspection.explicitParentTaskUid
        ? inspection.explicitParentTaskUid
        : null,
  };
}

async function collectTopLevelManagedTaskUids(root, inspectTask) {
  const found = [];
  const visit = async (block) => {
    const inspection = await inspectManagedTask(block, inspectTask);
    if (inspection.managed) {
      found.push(block.uid);
      return;
    }
    for (const child of block.children || []) await visit(child);
  };
  for (const child of root.children || []) await visit(child);
  return found;
}

function assertAuthoritativeBlockParent(block, { allowPage = false } = {}) {
  if (!block || typeof block !== "object") throw new Error("block read was malformed");
  if (block.entityType === "page") {
    if (allowPage && block.directParentState === "none") return;
    throw new Error("target UID resolves to a page, not a block");
  }
  if (block.directParentState !== "one" || !block.directParentUid) {
    throw new Error(
      block.directParentState === "ambiguous"
        ? "block has ambiguous direct parents"
        : "block has no authoritative direct parent"
    );
  }
}

async function readAncestorPath(block, readBlockFresh, maxDepth = 128) {
  const path = [];
  const seen = new Set([block.uid]);
  let parentUid = block.directParentUid || null;
  while (parentUid) {
    if (seen.has(parentUid)) throw new Error("cyclic parent relation");
    if (path.length >= maxDepth) throw new Error("parent relation exceeded safety limit");
    seen.add(parentUid);
    const parent = await readBlockFresh(parentUid);
    if (!parent) throw new Error(`direct parent not found: ${parentUid}`);
    assertAuthoritativeBlockParent(parent, { allowPage: true });
    path.push(parent);
    parentUid = parent.directParentUid || null;
  }
  return path;
}


async function validateExplicitParentChain(taskBlock, inspection, readBlockFresh, inspectTask) {
  let explicitParentUid = inspection.explicitParentTaskUid;
  if (!explicitParentUid) return null;
  const seen = new Set([taskBlock.uid]);
  let firstParentUid = null;
  for (let depth = 0; explicitParentUid; depth += 1) {
    if (depth >= 128) throw new Error("explicit parent relation exceeded safety limit");
    if (seen.has(explicitParentUid)) throw new Error("cyclic explicit parent relation");
    seen.add(explicitParentUid);
    const parent = await readBlockFresh(explicitParentUid);
    if (!parent) throw new Error(`explicit parent not found: ${explicitParentUid}`);
    assertAuthoritativeBlockParent(parent);
    const parentInspection = await inspectManagedTask(parent, inspectTask);
    if (!parentInspection.managed) {
      throw new Error(`explicit parent is not a managed task: ${explicitParentUid}`);
    }
    if (!firstParentUid) firstParentUid = explicitParentUid;
    explicitParentUid = parentInspection.explicitParentTaskUid;
  }
  return firstParentUid;
}

function scrubCreateOptions(options, parentUid, vocabulary) {
  const source = options && typeof options === "object" ? options : {};
  const forbiddenTopLevel = new Set([
    "parent",
    "parent_uid",
    "parent-uid",
    "parentuid",
    ...vocabulary.parentAttributeNames,
  ]);
  const sanitized = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key).trim().replace(/:+$/, "").toLowerCase();
    if (normalizedKey === "attributes" || forbiddenTopLevel.has(normalizedKey)) continue;
    sanitized[key] = value;
  }
  const attributes = {};
  const sourceAttributes = source.attributes && typeof source.attributes === "object"
    ? source.attributes
    : {};
  for (const [key, value] of Object.entries(sourceAttributes)) {
    const normalizedKey = String(key).trim().replace(/:+$/, "").toLowerCase();
    if (vocabulary.parentAttributeNames.has(normalizedKey)) continue;
    attributes[key] = value;
  }
  if (Object.keys(attributes).length > 0) sanitized.attributes = attributes;
  sanitized.parent_uid = parentUid;
  return sanitized;
}

function partialSubtaskCreationFailure(createdUid, code, reason, error) {
  return {
    error,
    partialSuccess: true,
    createdUid,
    code,
    reason,
  };
}

export function createBetterTasksCapability({
  version,
  readBlockFresh,
  inspectTask,
  getOwnershipVocabulary,
  deleteTask,
  createTask,
  summarizeTask,
}) {
  if (typeof version !== "string" || !version) throw new TypeError("A package version is required");
  for (const [name, value] of Object.entries({
    readBlockFresh,
    inspectTask,
    getOwnershipVocabulary,
    deleteTask,
    createTask,
    summarizeTask,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  const classifyBlock = async (uid, options = {}) => {
    const normalizedUid = typeof uid === "string" ? uid.trim() : "";
    if (!normalizedUid) return unknown(normalizedUid, "invalid-uid");
    const includeDescendants = options != null && options.includeDescendants === true;
    try {
      const block = await readBlockFresh(normalizedUid, { includeDescendants: includeDescendants === true });
      if (!block) return unknown(normalizedUid, "block-not-found");
      assertAuthoritativeBlockParent(block);

      const [targetInspection, ancestors] = await Promise.all([
        inspectManagedTask(block, inspectTask),
        readAncestorPath(block, readBlockFresh),
      ]);
      const inspectedAncestors = [];
      for (const ancestor of ancestors) {
        inspectedAncestors.push({ block: ancestor, inspection: await inspectManagedTask(ancestor, inspectTask) });
      }

      let topLevelManagedTaskUids = [];
      if (includeDescendants === true) {
        topLevelManagedTaskUids = await collectTopLevelManagedTaskUids(block, inspectTask);
      }

      if (targetInspection.managed) {
        const immediateParent = inspectedAncestors[0] || null;
        const validatedExplicitParentTaskUid = await validateExplicitParentChain(
          block,
          targetInspection,
          readBlockFresh,
          inspectTask
        );
        const structuralParentTaskUid = immediateParent?.inspection?.managed
          ? immediateParent.block.uid
          : null;
        return baseResult("task", normalizedUid, {
          ownerTaskUid: normalizedUid,
          relationship: validatedExplicitParentTaskUid ? "explicit" : structuralParentTaskUid ? "structural" : null,
          directParentTaskUid: validatedExplicitParentTaskUid || structuralParentTaskUid,
          containsManagedTasks: topLevelManagedTaskUids.length > 0,
          topLevelManagedTaskUids,
        });
      }

      const vocabulary = normalizeOwnershipVocabulary(await getOwnershipVocabulary());
      const pathBelowAncestor = [block];
      for (const { block: ancestor, inspection } of inspectedAncestors) {
        if (inspection.managed) {
          const owned = pathBelowAncestor.some(
            (candidate) =>
              isOwnedAttributeBlock(candidate, vocabulary.attributeNames) ||
              isOwnedActivityBlock(candidate, vocabulary.activityContainerTitles)
          );
          if (owned) {
            return baseResult("task-owned", normalizedUid, {
              ownerTaskUid: ancestor.uid,
              containsManagedTasks: topLevelManagedTaskUids.length > 0,
              topLevelManagedTaskUids,
            });
          }
          break;
        }
        pathBelowAncestor.push(ancestor);
      }

      return baseResult("ordinary", normalizedUid, {
        containsManagedTasks: topLevelManagedTaskUids.length > 0,
        topLevelManagedTaskUids,
      });
    } catch (error) {
      return unknown(normalizedUid, error?.message || "classification-failed");
    }
  };

  return Object.freeze({
    version,
    classifyBlock,
    async requestDelete(uid, options = {}) {
      const classification = await classifyBlock(uid);
      if (classification.kind !== "task") {
        return {
          status: "not-deleted",
          didDelete: false,
          restored: false,
          reason: "target-not-managed-task",
          classification,
        };
      }
      const source =
        typeof options?.source === "string" && options.source.trim()
          ? options.source.trim()
          : "native-insert-block";
      return deleteTask(classification.uid, { source });
    },
    async createSubtask(parentUid, options = {}) {
      const normalizedParentUid = typeof parentUid === "string" ? parentUid.trim() : "";
      const parent = await classifyBlock(normalizedParentUid);
      if (parent.kind !== "task") {
        return { error: `Parent is not a recognized Better Tasks task: ${parentUid}` };
      }
      const vocabulary = normalizeOwnershipVocabulary(await getOwnershipVocabulary());
      const createOptions = scrubCreateOptions(options, normalizedParentUid, vocabulary);
      const result = await createTask(createOptions);
      if (!result || result.error) return result || { error: "Subtask creation failed" };
      const uid = typeof result.uid === "string" ? result.uid : "";
      if (!uid) return { error: "Created subtask did not return a UID" };

      let block;
      try {
        block = await readBlockFresh(uid);
      } catch (error) {
        return partialSubtaskCreationFailure(
          uid,
          "BT_SUBTASK_SUMMARY_READ_FAILED",
          "created-subtask-summary-read-failed",
          `Created subtask ${uid}, but its summary read failed: ${error?.message || "unknown error"}`
        );
      }
      if (!block) {
        return partialSubtaskCreationFailure(
          uid,
          "BT_SUBTASK_SUMMARY_READ_FAILED",
          "created-subtask-summary-read-failed",
          `Created subtask ${uid}, but it could not be read for summary`
        );
      }
      let summary;
      try {
        summary = await summarizeTask(block, null, { parentTaskUid: normalizedParentUid });
      } catch (error) {
        return partialSubtaskCreationFailure(
          uid,
          "BT_SUBTASK_SUMMARY_FAILED",
          "created-subtask-summary-failed",
          `Created subtask ${uid}, but summary construction failed: ${error?.message || "unknown error"}`
        );
      }
      if (!summary || typeof summary !== "object" || summary.error) {
        return partialSubtaskCreationFailure(
          uid,
          "BT_SUBTASK_SUMMARY_FAILED",
          "created-subtask-summary-failed",
          summary?.error || `Created subtask ${uid}, but summary construction failed`
        );
      }

      const classification = await classifyBlock(uid);
      if (
        classification.kind !== "task" ||
        classification.relationship !== "structural" ||
        classification.directParentTaskUid !== normalizedParentUid
      ) {
        return partialSubtaskCreationFailure(
          uid,
          "BT_SUBTASK_POSTCONDITION_FAILED",
          "created-subtask-not-certified-structural",
          `Created subtask ${uid}, but final authoritative structural validation failed`
        );
      }
      return {
        ...summary,
        relationship: classification.relationship,
        directParentTaskUid: classification.directParentTaskUid,
        ownerTaskUid: classification.ownerTaskUid,
      };
    },
  });
}

export function installBetterTasksCapabilityVersion(windowLike, versionKey, capability) {
  if (!windowLike || (typeof windowLike !== "object" && typeof windowLike !== "function")) {
    throw new TypeError("A window-like object is required");
  }
  if (typeof versionKey !== "string" || !/^v\d+$/.test(versionKey)) {
    throw new TypeError("A version key such as v1 or v2 is required");
  }
  if (!capability || typeof capability !== "object") throw new TypeError("A capability object is required");
  const current = windowLike.betterTasks;
  if (current != null && typeof current !== "object") {
    throw new TypeError("window.betterTasks is already owned by a non-object value");
  }
  const namespace = current || {};
  if (current == null) OWNED_CAPABILITY_NAMESPACES.add(namespace);
  windowLike.betterTasks = namespace;
  namespace[versionKey] = capability;
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (windowLike.betterTasks === namespace && namespace[versionKey] === capability) {
      delete namespace[versionKey];
      if (OWNED_CAPABILITY_NAMESPACES.has(namespace) && Reflect.ownKeys(namespace).length === 0) {
        delete windowLike.betterTasks;
        OWNED_CAPABILITY_NAMESPACES.delete(namespace);
      }
    }
  };
}

export function installBetterTasksCapability(windowLike, capability) {
  return installBetterTasksCapabilityVersion(windowLike, "v1", capability);
}

export function installOwnedWindowRegistryEntry(
  windowLike,
  registryName,
  entryName,
  entry
) {
  if (!windowLike || (typeof windowLike !== "object" && typeof windowLike !== "function")) {
    throw new TypeError("A window-like object is required");
  }
  const current = windowLike[registryName];
  if (current != null && typeof current !== "object") {
    throw new TypeError(`window.${registryName} is already owned by a non-object value`);
  }
  const registry = current || {};
  windowLike[registryName] = registry;
  registry[entryName] = entry;
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (windowLike[registryName] === registry && registry[entryName] === entry) {
      delete registry[entryName];
      if (current == null && Reflect.ownKeys(registry).length === 0) {
        delete windowLike[registryName];
      }
    }
  };
}
