const TASK_TOKEN_RE = /^(\s*)(\{\{\s*(?:\[\[\s*)?(TODO|DONE)(?:\s*\]\])?\s*\}\}|(TODO|DONE))(?=$|[ \t\r\n])/i;
const BRACKET_STATUS_RE = /^#\[\[(task-status\/[^\]\r\n]+)\]\]/i;
const PLAIN_STATUS_RE = /^#(task-status\/[^\s\.,;:!\?\)\]\}\r\n]+)(?=$|\s|[\.,;:!\?\)\]\}])/i;
const STATUS_TITLE_RE = /^task-status\/[^\[\]#\r\n/]+$/i;

function skipHorizontalWhitespace(text, index) {
  let cursor = index;
  while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
  return cursor;
}

function parseTaskStatusPrefix(text) {
  const source = String(text || "");
  const task = source.match(TASK_TOKEN_RE);
  if (!task) return null;
  const taskEnd = task[0].length;
  const statusStart = skipHorizontalWhitespace(source, taskEnd);
  const statusMatch = source.slice(statusStart).match(BRACKET_STATUS_RE) ||
    source.slice(statusStart).match(PLAIN_STATUS_RE);
  return {
    source,
    taskState: String(task[3] || task[4] || "").toUpperCase(),
    taskEnd,
    statusStart,
    statusEnd: statusMatch ? statusStart + statusMatch[0].length : null,
    statusTagTitle: statusMatch ? statusMatch[1] : null,
  };
}

export function normalizeTaskStatusTagTitle(value) {
  if (value == null) return null;
  const title = typeof value === "string" ? value.trim() : "";
  return STATUS_TITLE_RE.test(title) ? title : undefined;
}

export function extractTaskStatusTag(text) {
  const parsed = parseTaskStatusPrefix(text);
  if (!parsed?.statusTagTitle) return null;
  return {
    title: parsed.statusTagTitle,
    label: parsed.statusTagTitle.slice("task-status/".length),
    taskState: parsed.taskState,
  };
}

export function stripTaskStatusTagFromTaskText(text) {
  const parsed = parseTaskStatusPrefix(text);
  if (!parsed?.statusTagTitle) return String(text || "");
  return parsed.source.slice(0, parsed.statusStart) + parsed.source.slice(parsed.statusEnd);
}

export function applyTaskStatusTagToManagedText(text, statusTagTitle) {
  const parsed = parseTaskStatusPrefix(text);
  if (!parsed) return { ok: false, reason: "not-task", nextString: String(text || "") };
  const normalizedTitle = normalizeTaskStatusTagTitle(statusTagTitle);
  if (typeof normalizedTitle === "undefined") {
    return { ok: false, reason: "invalid-status-tag-title", nextString: parsed.source };
  }

  let nextString;
  if (parsed.statusTagTitle) {
    nextString = normalizedTitle == null
      ? parsed.source.slice(0, parsed.statusStart) + parsed.source.slice(parsed.statusEnd)
      : parsed.source.slice(0, parsed.statusStart) + `#[[${normalizedTitle}]]` + parsed.source.slice(parsed.statusEnd);
  } else if (normalizedTitle == null) {
    nextString = parsed.source;
  } else {
    nextString = parsed.source.slice(0, parsed.taskEnd) + ` #[[${normalizedTitle}]]` + parsed.source.slice(parsed.taskEnd);
  }

  const next = parseTaskStatusPrefix(nextString);
  if (!next || next.taskState !== parsed.taskState) {
    return { ok: false, reason: "task-state-changed", nextString: parsed.source };
  }
  return {
    ok: true,
    reason: nextString === parsed.source ? "already-current" : "ready",
    nextString,
    taskState: parsed.taskState,
    statusTagTitle: normalizedTitle,
  };
}

function outcome(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}

function readEditorHandoff(options) {
  const hasExpected = options.expectedLiveEditorString !== undefined;
  const hasEditor = options.editorString !== undefined;
  if (!hasExpected && !hasEditor) return { ok: true, value: null };
  if (
    !hasExpected ||
    !hasEditor ||
    typeof options.expectedLiveEditorString !== "string" ||
    typeof options.editorString !== "string"
  ) {
    return { ok: false, reason: "invalid-editor-handoff" };
  }
  return {
    ok: true,
    value: {
      expectedLiveEditorString: options.expectedLiveEditorString,
      editorString: options.editorString,
    },
  };
}

function editorMatchesHandoff(live, handoff) {
  return live === handoff.expectedLiveEditorString || live === handoff.editorString;
}

async function readString(readBlockFresh, uid) {
  const block = await readBlockFresh(uid);
  return block && typeof block.string === "string" ? block.string : null;
}

export function createBetterTasksStatusTagRequester({
  readBlockFresh,
  classifyBlock,
  writeBlockString,
  getLiveEditorString = () => null,
  notifyBlockChange = () => {},
}) {
  for (const [name, value] of Object.entries({ readBlockFresh, classifyBlock, writeBlockString })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  return async function requestStatusTag(uid, options = {}) {
    const normalizedUid = typeof uid === "string" ? uid.trim() : "";
    if (!normalizedUid) return outcome("rejected", { reason: "invalid-uid" });
    if (typeof options.expectedString !== "string") {
      return outcome("rejected", { reason: "expected-string-required" });
    }
    const normalizedTitle = normalizeTaskStatusTagTitle(options.statusTagTitle);
    if (typeof normalizedTitle === "undefined") {
      return outcome("rejected", { reason: "invalid-status-tag-title" });
    }
    const handoffResult = readEditorHandoff(options);
    if (!handoffResult.ok) {
      return outcome("rejected", { reason: handoffResult.reason });
    }
    const editorHandoff = handoffResult.value;

    let classification;
    try {
      classification = await classifyBlock(normalizedUid);
    } catch (error) {
      return outcome("unknown", { reason: "classification-failed", error });
    }
    if (!classification || classification.kind === "unknown") {
      return outcome("unknown", {
        reason: classification?.reason || "classification-unknown",
        classification,
      });
    }
    if (classification.kind !== "task") {
      return outcome("rejected", { reason: "target-not-managed-task", classification });
    }

    let before;
    try {
      before = await readString(readBlockFresh, normalizedUid);
    } catch (error) {
      return outcome("unknown", { reason: "pre-write-read-failed", error, classification });
    }
    if (before == null) return outcome("rejected", { reason: "block-not-found", classification });
    if (before !== options.expectedString) {
      return outcome("conflict", {
        reason: "stale-expected-string",
        string: before,
        classification,
      });
    }
    const liveEditorString = getLiveEditorString(normalizedUid);
    if (editorHandoff && !editorMatchesHandoff(liveEditorString, editorHandoff)) {
      return outcome("conflict", {
        reason: "active-editor-diverged",
        string: typeof liveEditorString === "string" ? liveEditorString : null,
        classification,
      });
    }
    if (!editorHandoff && typeof liveEditorString === "string" && liveEditorString !== before) {
      return outcome("conflict", {
        reason: "active-editor-diverged",
        string: liveEditorString,
        classification,
      });
    }

    if (editorHandoff) {
      const graphPrefix = parseTaskStatusPrefix(before);
      const editorPrefix = parseTaskStatusPrefix(editorHandoff.editorString);
      if (!graphPrefix || !editorPrefix || graphPrefix.taskState !== editorPrefix.taskState) {
        return outcome("rejected", {
          reason: "editor-task-state-mismatch",
          classification,
        });
      }
    }

    const transformSource = editorHandoff?.editorString ?? before;
    const transformed = applyTaskStatusTagToManagedText(transformSource, normalizedTitle);
    if (!transformed.ok) {
      return outcome("rejected", { reason: transformed.reason, classification });
    }
    if (transformed.nextString === before) {
      return outcome("unchanged", {
        reason: "already-current",
        string: before,
        classification,
      });
    }

    if (editorHandoff) {
      const liveImmediatelyBeforeWrite = getLiveEditorString(normalizedUid);
      if (!editorMatchesHandoff(liveImmediatelyBeforeWrite, editorHandoff)) {
        return outcome("conflict", {
          reason: "active-editor-changed-before-write",
          string:
            typeof liveImmediatelyBeforeWrite === "string"
              ? liveImmediatelyBeforeWrite
              : null,
          classification,
        });
      }
    }

    let writeError = null;
    try {
      await writeBlockString(normalizedUid, transformed.nextString);
    } catch (error) {
      writeError = error;
    }

    let after;
    try {
      after = await readString(readBlockFresh, normalizedUid);
    } catch (error) {
      return outcome("unknown", {
        reason: "post-write-read-failed",
        error: writeError || error,
        classification,
      });
    }
    if (after === transformed.nextString) {
      try { notifyBlockChange(normalizedUid); } catch (_) {}
      return outcome("updated", {
        reason: writeError ? "write-threw-after-commit" : "certified",
        string: after,
        classification,
      });
    }
    if (after === before) {
      return outcome("not-updated", {
        reason: writeError ? "write-failed-before-commit" : "write-not-observed",
        error: writeError || undefined,
        string: after,
        classification,
      });
    }
    return outcome("conflict", {
      reason: after == null ? "block-missing-after-write" : "third-state-after-write",
      error: writeError || undefined,
      string: after,
      classification,
    });
  };
}

export function createBetterTasksCapabilityV2(v1, requestStatusTag) {
  if (!v1 || typeof v1 !== "object") throw new TypeError("v1 capability is required");
  if (typeof requestStatusTag !== "function") throw new TypeError("requestStatusTag must be a function");
  return Object.freeze({
    version: v1.version,
    classifyBlock: v1.classifyBlock,
    requestDelete: v1.requestDelete,
    createSubtask: v1.createSubtask,
    requestStatusTag,
  });
}
