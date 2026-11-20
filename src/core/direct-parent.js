/**
 * Build a query for a block's immediate parent.
 *
 * `:block/parents` contains every ancestor and does not guarantee an order,
 * so taking its first result can select the page or a higher container. The
 * inverse `:block/children` relation identifies the direct parent exactly.
 */
export function buildDirectParentUidQuery(safeChildUid) {
  return `
        [:find ?puid
         :where
         [?c :block/uid "${safeChildUid}"]
         [?p :block/children ?c]
         [?p :block/uid ?puid]]`;
}
