const SETTINGS_TAB_SELECTOR = '[role="tab"]';
const DEPOT_BUTTON_SELECTOR = ".rm-left-sidebar__roam-depot";

function normalizedText(node) {
  return String(node?.textContent || node?.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the settings tab Roam creates for Better Tasks.
 *
 * Developer extensions are displayed as "Better Tasks (dev)" even though
 * the registered tabTitle is still "Better Tasks", so prefer that exact tab
 * when both the Depot and developer builds are present.
 */
export function findBetterTasksSettingsTab(documentLike) {
  const tabs = Array.from(documentLike?.querySelectorAll?.(SETTINGS_TAB_SELECTOR) || []);
  const exactDev = tabs.find((tab) => normalizedText(tab) === "Better Tasks (dev)");
  if (exactDev) return exactDev;
  const exactRelease = tabs.find((tab) => normalizedText(tab) === "Better Tasks");
  if (exactRelease) return exactRelease;
  return tabs.find((tab) => /^Better Tasks(?:\s|\(|$)/i.test(normalizedText(tab))) || null;
}

export function selectBetterTasksSettingsTab(documentLike) {
  const tab = findBetterTasksSettingsTab(documentLike);
  if (!tab || typeof tab.click !== "function") return false;
  tab.click();
  return true;
}

const defaultWait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

/**
 * Open Roam Depot and focus Better Tasks' extension settings.
 *
 * Roam's documented extension settings API can create a panel, but currently
 * has no method for opening it. This small DOM adapter is intentionally kept
 * isolated so it can be removed when Roam exposes an official opener.
 */
export async function openBetterTasksSettings({
  documentLike = typeof document !== "undefined" ? document : null,
  roamAlphaAPI = typeof window !== "undefined" ? window.roamAlphaAPI : null,
  wait = defaultWait,
  attempts = 24,
  intervalMs = 50,
} = {}) {
  if (!documentLike) return false;
  if (selectBetterTasksSettingsTab(documentLike)) return true;

  let depotButton = documentLike.querySelector?.(DEPOT_BUTTON_SELECTOR) || null;
  if (!depotButton) {
    try {
      await roamAlphaAPI?.ui?.leftSidebar?.open?.();
    } catch (_) {
      // The settings dialog can still be opened if the sidebar is already in
      // the DOM; continue to the normal lookup below.
    }
    depotButton = documentLike.querySelector?.(DEPOT_BUTTON_SELECTOR) || null;
  }
  if (!depotButton || typeof depotButton.click !== "function") return false;
  depotButton.click();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (selectBetterTasksSettingsTab(documentLike)) return true;
    await wait(intervalMs);
  }
  return false;
}
