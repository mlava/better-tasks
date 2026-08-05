const GROUP_ROW_PX = 30;
const SUBTASK_ROW_PX = 80;
const FLOATING_DASHBOARD_WIDTH_PX = 620;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function visibleDashboardText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\(\(\([^)]*\)\)\)/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\(\(([A-Za-z0-9_-]{9})\)\)/g, "$1")
    .replace(/(?:\*\*|__|~~|\^\^|`)/g, "");
}

function pillDisplayValue(pill) {
  return visibleDashboardText(pill?.value ?? pill?.raw ?? "");
}

function estimatePillRows(pills, availableWidth) {
  if (!Array.isArray(pills) || pills.length === 0) return 0;
  const gap = 6;
  let rows = 1;
  let used = 0;
  for (const pill of pills) {
    // Blueprint's small pill text averages about 5px per character. Project
    // pills are allowed to consume a whole line, matching their max-width.
    const textWidth = pill?.type === "project" ? 34 : 38;
    const width = clamp(textWidth + pillDisplayValue(pill).length * 5, 48, availableWidth);
    if (used > 0 && used + gap + width > availableWidth) {
      rows += 1;
      used = width;
    } else {
      used += (used > 0 ? gap : 0) + width;
    }
  }
  return rows;
}

/**
 * Estimate a dashboard virtual row before it has ever been mounted.
 *
 * TanStack Virtual corrects estimates with ResizeObserver after mounting. A
 * close first estimate keeps the scroll range stable instead of progressively
 * growing as the user discovers rows for the first time.
 */
export function estimateDashboardRowSize(
  row,
  { viewportWidth = FLOATING_DASHBOARD_WIDTH_PX, mobile = false } = {}
) {
  if (row?.type === "group") return GROUP_ROW_PX;
  if (row?.type === "subtask") return SUBTASK_ROW_PX;

  const task = row?.task || {};
  const title = visibleDashboardText(task.displayTitle || task.title || "");
  const notes = visibleDashboardText(task.metadata?.notes || "");
  const bodyWidth = Math.max(220, viewportWidth - (mobile ? 92 : 224));
  const pillWidth = Math.max(200, viewportWidth - (mobile ? 84 : 256));
  const charsPerLine = Math.max(28, Math.floor(bodyWidth / 7));
  const titleLines = clamp(Math.ceil(Math.max(1, title.length) / charsPerLine), 1, 6);
  const titleHeight = titleLines * 23;
  const notesHeight = notes ? (notes.length > charsPerLine ? 40 : 24) + 8 : 0;
  const pillRows = estimatePillRows(task.metaPills, pillWidth);
  const pillHeight = pillRows > 0 ? 24 + (pillRows - 1) * 30 : 0;

  // 62px covers row padding, page context and desktop actions. This formula
  // matches the dashboard's observed 109px compact rows and 200px+ rich rows.
  return 62 + titleHeight + notesHeight + pillHeight;
}

export const DASHBOARD_ROW_ESTIMATE_DEFAULTS = Object.freeze({
  group: GROUP_ROW_PX,
  subtask: SUBTASK_ROW_PX,
  floatingWidth: FLOATING_DASHBOARD_WIDTH_PX,
});
