// Pure subtree snapshot/rebuild logic for Better Tasks.
//
// Supports the task-deletion undo path: a Roam block subtree is captured via a
// recursive datascript pull before deletion, then rebuilt on undo. This module
// only shapes and walks the captured tree — it knows nothing about Roam, the
// DOM, or any injected accessors. Zero dependencies.
//
// A node counts as a TASK only when its string STARTS (after optional leading
// whitespace) with one of the four Roam TODO/DONE macros. Mid-string macros —
// such as those that appear inside activity-log event text after Roam flattens
// a deleted ((uid)) ref — are NOT tasks. `isTaskNodeString` encodes that test
// and is shared by countTaskBlocks and collectTaskNodeUids.
//
// `:block/props` values are key-normalized copies: Roam's recursive pull API
// returns props objects whose keys are namespaced keywords WITH LEADING COLONS
// (e.g. ":repeat", ":rt": {":tz": ...}). The restore path writes props back
// via updateBlock, which expects PLAIN keys — so every leading colon is
// stripped (recursively) at capture time rather than at restore time.

/**
 * Normalize a single node from a Roam recursive pull.
 *
 * The pull returns keyword-keyed maps (`:block/uid`, `:block/string`, …) with
 * `:block/children` arriving UNSORTED. This function produces a stable shape
 * and sorts children ascending by `order` at every depth. Ties keep their
 * relative input position (a stable sort).
 *
 * `props` is a key-normalized COPY: every leading colon on prop keys (and on
 * keys of nested plain objects/arrays within props) is stripped recursively,
 * so the restored object uses plain keys (`rt`, `tz`, …) as expected by
 * updateBlock. The original pull object is never mutated.
 *
 * Returns null for null/undefined input or any node missing `:block/uid`.
 */
export function normalizePulledSubtree(raw) {
  if (raw == null) return null;
  if (!(":block/uid" in raw)) return null;

  const node = {
    uid: raw[":block/uid"],
    string: ":block/string" in raw ? raw[":block/string"] : "",
    order: ":block/order" in raw ? raw[":block/order"] : 0,
    props: undefined,
    open: undefined,
    heading: undefined,
    textAlign: undefined,
    children: [],
  };

  if (raw[":block/props"] != null) node.props = normalizePropKeys(raw[":block/props"]);
  if (raw[":block/open"] != null) node.open = raw[":block/open"];
  if (raw[":block/heading"] != null) node.heading = raw[":block/heading"];
  if (raw[":block/text-align"] != null) node.textAlign = raw[":block/text-align"];

  if (":block/children" in raw && Array.isArray(raw[":block/children"])) {
    node.children = raw[":block/children"]
      .map(normalizePulledSubtree)
      .filter((c) => c !== null)
      .sort((a, b) => a.order - b.order);
  }

  return node;
}

/**
 * Strip one leading colon from every key in a props value, recursively.
 *
 * Roam's recursive pull API returns props objects whose keys are namespaced
 * keywords WITH LEADING COLONS (":rt", ":tz", …). The restore path writes
 * props back via updateBlock, which expects PLAIN keys. This helper produces a
 * deep copy with a single leading colon stripped from each key at position 0,
 * recursing into nested plain objects and arrays. Primitives, null, undefined,
 * and Date instances pass through unchanged. The input is never mutated.
 *
 * Exported so the impure fallback-walk snapshot path can reuse the same
 * normalization when it rebuilds props from a non-pull source.
 *
 * - Plain object: returns a NEW object; each key has one leading ":" stripped
 *   if present (":rt" → "rt", "rt" → "rt" unchanged, ":" → ""), and each
 *   value is normalizePropKeys(value).
 * - Array: returns a NEW array; each element is passed through
 *   normalizePropKeys (object elements get keys stripped; primitives pass
 *   through).
 * - string/number/boolean/null/undefined and Date instances: returned as-is.
 */
export function normalizePropKeys(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map(normalizePropKeys);
  }
  const out = {};
  for (const key of Object.keys(value)) {
    const stripped =
      typeof key === "string" && key.length > 0 && key.charCodeAt(0) === 58
        ? key.slice(1)
        : key;
    out[stripped] = normalizePropKeys(value[key]);
  }
  return out;
}

/**
 * Flatten a normalized tree into an ordered list of block-create steps.
 *
 * The root step uses the supplied `parentUid`; every descendant step uses its
 * own parent node's uid as `parentUid`. Steps are emitted depth-first
 * pre-order with siblings in ascending `order`.
 *
 * INVARIANT (load-bearing for undo): each step's `parentUid` is either the
 * function's `parentUid` argument or the uid of a step emitted EARLIER. The
 * caller creates blocks in array order, so a parent always exists before its
 * children are attached.
 */
export function flattenSubtreeToCreateSteps(tree, parentUid) {
  if (tree == null) return [];

  const steps = [];
  const walk = (node, parent) => {
    steps.push({ parentUid: parent, order: node.order, string: node.string, uid: node.uid });
    for (const child of node.children) walk(child, node.uid);
  };
  walk(tree, parentUid);
  return steps;
}

/**
 * Every uid in the tree, root first, depth-first pre-order.
 */
export function collectTreeUids(tree) {
  if (tree == null) return [];
  const out = [];
  const walk = (node) => {
    out.push(node.uid);
    for (const child of node.children) walk(child);
  };
  walk(tree);
  return out;
}

const TASK_MACROS = ["{{[[TODO]]}}", "{{TODO}}", "{{[[DONE]]}}", "{{DONE}}"];

/**
 * Does `s` look like a Roam task block? A node counts as a task ONLY when its
 * string begins (after optional leading whitespace) with one of the four
 * TODO/DONE macro forms. Mid-string macros — e.g. inside activity-log event
 * text after Roam flattens a deleted ((uid)) ref — are NOT tasks. Matching is
 * case-sensitive. Exported so index.js can reuse the same test where needed.
 */
export function isTaskNodeString(s) {
  if (typeof s !== "string") return false;
  const trimmed = s.trimStart();
  return TASK_MACROS.some((m) => trimmed.startsWith(m));
}

function isTaskString(s) {
  return isTaskNodeString(s);
}

/**
 * Count nodes whose string STARTS (after optional leading whitespace) with a
 * Roam TODO or DONE macro — i.e. real task blocks, not activity-log event text
 * that merely contains a mid-string macro.
 *
 * Matching is case-sensitive. When `options.excludeRoot` is true (the default)
 * the root node itself is not counted even if it is a task — the common case
 * is counting task children inside a container that is being deleted.
 */
export function countTaskBlocks(tree, options = {}) {
  if (tree == null) return 0;
  const excludeRoot = options == null || options.excludeRoot == null ? true : options.excludeRoot;
  let count = 0;
  const walk = (node, isRoot) => {
    if (!(isRoot && excludeRoot) && isTaskString(node.string)) count += 1;
    for (const child of node.children) walk(child, false);
  };
  walk(tree, true);
  return count;
}

/**
 * Collect the uids of nodes whose string passes the start-anchored task test
 * (see isTaskNodeString), depth-first pre-order.
 *
 * `options.excludeRoot` defaults to FALSE — unlike countTaskBlocks, the root
 * task itself is usually wanted when collecting scan targets. Returns [] for
 * null/undefined tree.
 */
export function collectTaskNodeUids(tree, options = {}) {
  if (tree == null) return [];
  const excludeRoot = options == null || options.excludeRoot == null ? false : options.excludeRoot;
  const out = [];
  const walk = (node, isRoot) => {
    if (!(isRoot && excludeRoot) && isTaskString(node.string)) out.push(node.uid);
    for (const child of node.children) walk(child, false);
  };
  walk(tree, true);
  return out;
}

/**
 * De-duplicate a set of selected root uids and drop any that are nested inside
 * a DIFFERENT selected uid's subtree.
 *
 * `uidToTreeUids` may be a Map or a plain object mapping uid → array of every
 * uid in that uid's subtree (including itself). A uid with no entry is kept
 * unless another selection's tree list contains it.
 *
 * Result preserves first-occurrence input order. Chains collapse to the
 * outermost ancestor: selecting [A, B, C] where A ⊃ B ⊃ C returns [A].
 */
export function dropNestedSelections(uids, uidToTreeUids) {
  if (!Array.isArray(uids)) return [];

  const lookup = (uid) => {
    if (uidToTreeUids instanceof Map) return uidToTreeUids.get(uid);
    if (uidToTreeUids != null) return uidToTreeUids[uid];
    return undefined;
  };

  const seen = new Set();
  const kept = [];
  for (const uid of uids) {
    if (seen.has(uid)) continue;
    seen.add(uid);

    let nested = false;
    for (const other of uids) {
      if (other === uid) continue;
      const tree = lookup(other);
      if (tree && tree.includes(uid)) {
        nested = true;
        break;
      }
    }
    if (!nested) kept.push(uid);
  }
  return kept;
}
