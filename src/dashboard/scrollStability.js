/**
 * Keep the browser's physical scroll offset authoritative while virtual rows
 * settle. TanStack's default estimate correction writes scrollTop after a
 * ResizeObserver measurement; with trackpad momentum that write can arrive
 * just after scroll end and look like a brief freeze followed by a nudge.
 * Dashboard estimates are deliberately close enough that preserving the
 * user's offset is the less surprising behavior.
 */
export function shouldAdjustDashboardScrollPositionOnItemSizeChange() {
  return false;
}
