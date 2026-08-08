function failureMessage(error) {
  return error instanceof Error ? error.message : String(error || "Task creation failed");
}

function partialFailure(createdUid, code, reason, error) {
  return {
    error: failureMessage(error),
    partialSuccess: true,
    createdUid,
    code,
    reason,
    cause: error,
  };
}

/**
 * Owns the point-of-no-return boundary for task creation. A root-create failure
 * is a zero-write failure; every later failure explicitly carries the created
 * UID so callers cannot safely retry as though nothing was written.
 */
export async function runTaskCreationPipeline({
  createdUid,
  createRoot,
  confirmRootAfterCreateFailure,
  initializeProps,
  applyAttributes,
  applyStatus,
  buildSummary,
} = {}) {
  if (typeof createdUid !== "string" || !createdUid) throw new TypeError("createdUid is required");
  for (const [name, value] of Object.entries({
    createRoot, confirmRootAfterCreateFailure, initializeProps, applyAttributes, applyStatus, buildSummary,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  try {
    await createRoot();
  } catch (error) {
    let rootExists;
    try {
      rootExists = await confirmRootAfterCreateFailure();
    } catch (confirmationError) {
      return {
        error: failureMessage(error),
        partialSuccess: null,
        createdUid,
        code: "BT_TASK_CREATE_ROOT_STATE_UNKNOWN",
        reason: "created-task-root-state-unknown",
        cause: error,
        confirmationError,
      };
    }
    if (rootExists === true) {
      return partialFailure(
        createdUid,
        "BT_TASK_CREATE_ROOT_RESPONSE_LOST",
        "created-task-root-response-lost",
        error
      );
    }
    if (rootExists !== false) {
      return {
        error: failureMessage(error),
        partialSuccess: null,
        createdUid,
        code: "BT_TASK_CREATE_ROOT_STATE_UNKNOWN",
        reason: "created-task-root-state-unknown",
        cause: error,
        confirmationError: new TypeError("Root confirmation did not return a boolean"),
      };
    }
    return {
      error: failureMessage(error),
      partialSuccess: false,
      code: "BT_TASK_CREATE_ROOT_FAILED",
      reason: "created-task-root-failed",
      cause: error,
    };
  }

  const stages = [
    [initializeProps, "BT_TASK_CREATE_PROPS_FAILED", "created-task-props-failed"],
    [applyAttributes, "BT_TASK_CREATE_ATTRIBUTES_FAILED", "created-task-attributes-failed"],
    [applyStatus, "BT_TASK_CREATE_STATUS_FAILED", "created-task-status-failed"],
  ];
  for (const [action, code, reason] of stages) {
    try {
      await action();
    } catch (error) {
      return partialFailure(createdUid, code, reason, error);
    }
  }

  try {
    const summary = await buildSummary();
    if (!summary || typeof summary !== "object") {
      throw new TypeError("Created task summary was not recognized");
    }
    return summary;
  } catch (error) {
    return partialFailure(
      createdUid,
      "BT_TASK_CREATE_SUMMARY_FAILED",
      "created-task-summary-failed",
      error
    );
  }
}
