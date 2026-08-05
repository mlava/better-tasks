export const BLOCK_REFERENCE_RE = /\(\(([A-Za-z0-9_-]{9})\)\)/g;

export function extractBlockReferenceUids(value) {
  const input = String(value ?? "");
  const seen = new Set();
  const out = [];
  BLOCK_REFERENCE_RE.lastIndex = 0;
  let match;
  while ((match = BLOCK_REFERENCE_RE.exec(input)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      out.push(match[1]);
    }
  }
  return out;
}

export function resolveBlockReferences(value, resolver, options = {}) {
  const input = String(value ?? "");
  if (!input || typeof resolver !== "function") return input;
  const maxDepth = Number.isInteger(options.maxDepth) ? Math.max(0, options.maxDepth) : 4;
  const seen = options.seen instanceof Set ? options.seen : new Set();

  const visit = (text, depth, active) => {
    if (depth > maxDepth) return text;
    return String(text).replace(BLOCK_REFERENCE_RE, (raw, uid) => {
      if (active.has(uid)) return raw;
      let resolved = null;
      try {
        resolved = resolver(uid);
      } catch (_) {
        resolved = null;
      }
      if (typeof resolved !== "string" || !resolved.trim()) return raw;
      if (depth === maxDepth) return resolved.trim();
      const nextActive = new Set(active);
      nextActive.add(uid);
      return visit(resolved.trim(), depth + 1, nextActive);
    });
  };

  return visit(input, 0, seen);
}
