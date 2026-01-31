# Debug cheatsheet

This file lists supported console flags you can set on `window` for Better Tasks.

## Logging flags

- `window.__btDebug = true`
  - Enables additional debug logs guarded by `debugLog(...)`.
  - Disable with: `window.__btDebug = false` or `delete window.__btDebug`.

- `window.__btDebugRefreshTimer = true`
  - Logs dashboard background refresh ticks (at most once every 5 minutes) and logs when the timer is cleared on unload.
  - Disable with: `window.__btDebugRefreshTimer = false` or `delete window.__btDebugRefreshTimer`.
