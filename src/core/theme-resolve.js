// Pure decision for whether the dashboard / Today panel should render dark.
//
// Precedence:
//   1. A theme extension's own appearance toggle (Roam Studio / Blueprint)
//      set explicitly to light or dark — the user chose that mode.
//   2. Roam's `bp3-dark` class or `data-theme="dark"` marker.
//   3. The measured luminance of Roam's rendered background. This is the
//      ground truth for what the user is looking at, and it must outrank the
//      OS hint: macOS in dark mode with Roam in its default light theme used
//      to fall through to `prefers-color-scheme` and resolve dark, which
//      tagged `body.bt-theme-dark` and painted the Today panel's pinned
//      near-white dark-mode text onto the white page.
//   4. The OS `prefers-color-scheme` hint, only when nothing above is
//      available (e.g. Roam's chrome isn't mounted yet, so there is no
//      background to sample).
export function resolvePanelIsDark({
  externalMode = null,
  explicitDark = false,
  sampledLuminance = null,
  systemPrefersDark = false,
} = {}) {
  if (externalMode === "dark") return true;
  if (externalMode === "light") return false;
  if (explicitDark) return true;
  if (typeof sampledLuminance === "number" && !Number.isNaN(sampledLuminance)) {
    return sampledLuminance < 0.5;
  }
  return !!systemPrefersDark;
}

// Whether syncDashboardThemeVars should skip re-writing the panel's custom
// properties given the last cached sample.
//
// The "nothing changed" check used to compare the sampled panel-surface
// colour alone. That sample is built from incidental candidates (Roam/
// Blueprint custom properties that may not exist yet, a background-color
// walk that can legitimately return the same string on two different ticks)
// and is NOT guaranteed to move in lockstep with the resolved light/dark
// mode — most visibly right after a theme-observer class mutation, where
// Roam's own dark class flips correctly but the surface-colour heuristic
// still reports the pre-flip value on that pass. Keying the skip decision
// on surface alone let a genuine dark<->light transition get silently
// dropped: the function returned early before ever reaching the
// classList.toggle("bt-theme-dark", ...) call or the six custom-property
// writes, so the panel stayed stuck on its last-written mode.
//
// Require the resolved MODE to also be unchanged before skipping, so any
// tick where finalIsDark differs from the last write always proceeds —
// closing the class of bug regardless of why the surface sample happened
// to look unchanged.
export function shouldSkipThemeSync({
  forced = false,
  sameSurface = false,
  sameMode = false,
} = {}) {
  if (forced) return false;
  return sameSurface && sameMode;
}
