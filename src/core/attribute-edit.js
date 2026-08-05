const ATTRIBUTE_LINE_RE = /^([\p{L}\p{N}_\-\/\s]+)::\s*(.+)$/u;

/**
 * Read the current draft without touching Roam's graph API.
 *
 * Better Tasks listens at document scope so it can mirror child attributes
 * into task props. Almost every input event is unrelated, though. Keeping
 * this check pure and synchronous lets normal block typing leave immediately.
 */
export function parseAttributeEditTarget(target) {
  if (!target || typeof target !== "object") return null;

  let rawText = null;
  if (typeof target.value === "string") {
    rawText = target.value;
  } else if (target.isContentEditable && typeof target.textContent === "string") {
    rawText = target.textContent;
  }

  if (typeof rawText !== "string") return null;
  // Ordinary prose is overwhelmingly the common case. Avoid even the Unicode
  // attribute regex unless the draft contains Roam's attribute delimiter.
  if (!rawText.includes("::")) return null;
  const match = rawText.trim().match(ATTRIBUTE_LINE_RE);
  if (!match) return null;

  return {
    key: match[1].trim().toLowerCase(),
    value: match[2],
  };
}
