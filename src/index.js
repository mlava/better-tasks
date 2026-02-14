import iziToast from "izitoast";
import DashboardApp from "./dashboard/App";
import { i18n as I18N_MAP } from "./i18n";
import {
  initProjectStore,
  refreshProjectOptions,
  getProjectOptions,
  addProjectOption,
  removeProjectOption,
  subscribeToProjectOptions,
  normalizeProjectValue,
} from "./project-store";
import {
  initWaitingStore,
  refreshWaitingOptions,
  getWaitingOptions,
  addWaitingOption,
  removeWaitingOption,
  subscribeToWaitingOptions,
  normalizeWaitingValue,
} from "./waiting-store";
import {
  initContextStore,
  refreshContextOptions,
  getContextOptions,
  addContextOption,
  removeContextOption,
  subscribeToContextOptions,
  normalizeContextValue,
} from "./context-store";
import {
  loadViewsStore,
  saveViewsStore,
  createView as createDashView,
  setActiveView as setActiveDashView,
  installPresetDashboardViews,
} from "./dashboard/viewsStore";

const ADV_ATTR_NAMES_SETTING = "bt-advanced-attr-names";
const DEFAULT_REPEAT_ATTR = "BT_attrRepeat";
const DEFAULT_START_ATTR = "BT_attrStart";
const DEFAULT_DEFER_ATTR = "BT_attrDefer";
const DEFAULT_DUE_ATTR = "BT_attrDue";
const DEFAULT_COMPLETED_ATTR = "BT_attrCompleted";
const DEFAULT_PROJECT_ATTR = "BT_attrProject";
const DEFAULT_WAITING_FOR_ATTR = "BT_attrWaitingFor";
const DEFAULT_CONTEXT_ATTR = "BT_attrContext";
const DEFAULT_PRIORITY_ATTR = "BT_attrPriority";
const DEFAULT_ENERGY_ATTR = "BT_attrEnergy";
const DEFAULT_GTD_ATTR = "BT_attrGTD";
const ADVANCE_ATTR = "BT_attrAdvance";
const INSTALL_TOAST_KEY = "rt-intro-toast";
const AI_MODE_SETTING = "bt-ai-mode";
const AI_KEY_SETTING = "bt-ai-openai-key";
const AI_MODE_OPTIONS = ["Off", "Use my OpenAI key"];
const AI_MODEL = "gpt-4o-mini";
const AI_SYSTEM_PROMPT = [
  "You are a strict JSON generator for task parsing. Return ONLY JSON with no prose.",
  'Required: { "title": string }',
  'Optional: "repeatRule", "dueDateText", "startDateText", "deferDateText", "project", "context", "priority", "energy".',
  'priority/energy must be one of: "low", "medium", "high", or null.',
  "Dates: prefer Roam page links like [[November 18th, 2025]]; if unsure, use short phrases like \"next Monday\" (not bare weekday names).",
  "If you see time (e.g., 3pm), include it only in dueDateText/startDateText (e.g., \"next Wednesday at 3pm\").",
  "For wording that implies when work can start (beginning/starting/available/from/after), use startDateText; for deadlines (by/before/due), use dueDateText; for postponement, use deferDateText.",
  "For vague spans like \"this week/this weekend/this month/this quarter\", prefer concrete dates (start of span for startDateText, end of span for dueDateText when only one date is given).",
  "Please consider words like every, each, daily, weekly, monthly, yearly, annually, weekdays, weekends, biweekly, fortnightly, quarterly, semiannual(ly), semi-annual(ly), twice a year, every N days/weeks/months/years as indicators of repeat rules.",
  "Keep scheduling details (repeat/dates) OUT of the title; place them only in repeatRule/dueDateText/startDateText/deferDateText. The title should just be the task text.",
  "Do not invent details not implied.",
  'If input lacks a clear task title, set "title" to the original input.',
].join(" ");
const START_ICON = "⏱";
const DEFER_ICON = "⏳";
const DUE_ICON = "📅";
const WEEK_START_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const GTD_STATUS_ORDER = ["next action", "delegated", "deferred", "someday"];
const PARENT_WRITE_DELAY_MS = 120;
const TOAST_HIDE_DELAY_MS = 120;
const DASHBOARD_TOPBAR_BUTTON_ID = "bt-dashboard-button";
const DASHBOARD_TOPBAR_SPACER_ID = "bt-dashboard-button-spacer";
const TODAY_WIDGET_LAYOUT_SETTING = "bt-today-widget-layout";
const TODAY_WIDGET_OVERDUE_SETTING = "bt-today-widget-include-overdue";
const TODAY_WIDGET_COMPLETED_SETTING = "bt-today-widget-show-completed";
const TODAY_WIDGET_PLACEMENT_SETTING = "bt-today-widget-placement";
const TODAY_WIDGET_HEADING_SETTING = "bt-today-widget-heading";
const TODAY_WIDGET_TITLE_SETTING = "bt-today-widget-title";
const TODAY_WIDGET_ENABLE_SETTING = "bt-today-widget-enabled";
const TODAY_BADGE_ENABLE_SETTING = "bt-today-badge-enabled";
const TODAY_BADGE_LABEL_SETTING = "bt-today-badge-label";
const TODAY_BADGE_OVERDUE_SETTING = "bt-today-badge-include-overdue";
const TODAY_BADGE_BG_SETTING = "bt-today-badge-bg";
const TODAY_BADGE_FG_SETTING = "bt-today-badge-fg";
const LANGUAGE_SETTING = "bt-language";
const ADV_DASH_OPTIONS_SETTING = "bt-advanced-dashboard-options";
const REVIEW_STEP_NEXT_ACTIONS_SETTING = "bt-review-step-next-actions";
const REVIEW_STEP_WAITING_FOR_SETTING = "bt-review-step-waiting-for";
const REVIEW_STEP_COMPLETED_7D_SETTING = "bt-review-step-completed-7d";
const REVIEW_STEP_UPCOMING_7D_SETTING = "bt-review-step-upcoming-7d";
const REVIEW_STEP_OVERDUE_SETTING = "bt-review-step-overdue";
const REVIEW_STEP_SOMEDAY_SETTING = "bt-review-step-someday";
const TODAY_WIDGET_ANCHOR_TEXT_DEFAULT = "Better Tasks - Today";
const TODAY_WIDGET_ANCHOR_TEXT_LEGACY = ["BetterTasks Today Widget", "Better Tasks - Today"];
const TODAY_WIDGET_PANEL_CHILD_TEXT = "";
const TODAY_WIDGET_PANEL_CHILD_TEXT_LEGACY = ["Today Widget Panel"];
const PILL_THRESHOLD_SETTING = "bt-pill-checkbox-threshold";
const DEFAULT_PILL_THRESHOLD = 100; // skip pill rendering when too many checkboxes are present
const SUPPORTED_LANGUAGES = Object.keys(I18N_MAP || { en: {} });
const EN_STRING_PATH_MAP = new Map();
let currentLanguage = "en";
let todayBadgeNode = null;
let todayBadgeLabelNode = null;
let todayBadgeCountNode = null;
let todayBadgeRefreshTimer = null;
let lastTodayBadgeSignature = null;
const todayBadgeOverrides = { bg: null, fg: null, label: null };
let todayWidgetCbWindowStart = 0;
let todayWidgetCbCount = 0;
let todayWidgetCbTrippedUntil = 0;
const TODAY_WIDGET_CB_WINDOW_MS = 2000;
const TODAY_WIDGET_CB_MAX = 10;
const TODAY_WIDGET_CB_COOLDOWN_MS = 15000;

function buildEnStringLookup(obj, prefix = []) {
  if (!obj || typeof obj !== "object") return;
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === "string") {
      const path = [...prefix, key];
      if (!EN_STRING_PATH_MAP.has(value)) {
        EN_STRING_PATH_MAP.set(value, path);
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      buildEnStringLookup(value, [...prefix, key]);
    }
  });
}
buildEnStringLookup(I18N_MAP?.en || {});
let todayWidgetRenderTimer = null;
let todayTitleChangeDebounceTimer = null;
let todayWidgetPanelRoot = null;
let todayWidgetPanelContainer = null;
let lastTodayWidgetSignature = null;
let lastTodayInlineSignature = null;
let todayInlineRenderInFlight = false;
let lastTodayAnchorIsHeading = false;
let todayEnabledOverride = null;
let todayHeadingRecheckPending = false;
let todayHeadingRetryCount = 0;
const MAX_TODAY_HEADING_RETRIES = 3;
let todayNavListenerAttached = false;
let teardownTodayPanelGlobal = null;
let lastTodayAnchorUid = null;
const todayInlineChildUids = new Set();
const todayAnchorTextHistory = new Set();
const MAX_TODAY_ANCHOR_TEXT_HISTORY = 200;
const MAX_INVALID_PARSE_TOASTED = 1000;
let pillRefreshTimer = null;
let todayWidgetForceNext = false;
let lastTodayRenderAt = 0;
let lastPillDecorateRun = 0;
let dashboardRefreshTimer = null;
let dashboardRefreshLogAt = 0;
const DASHBOARD_REFRESH_LOG_INTERVAL_MS = 5 * 60 * 1000;
let dashboardWatchClearTimer = null;
let pillScrollHandlerAttached = false;
let pillScrollHandler = null;
let pillScrollDebounceMs = 420;
let todayNavListener = null;
let detachTodayNavigationListenerGlobal = null;
const MAX_BLOCKS_FOR_PILLS = 1500;
const pillSkipDecorate = new Set();
const INLINE_META_CACHE_TTL_MS = 10 * 60 * 1000;
const INLINE_META_CACHE_MAX = 5000;
const TODAY_WIDGET_ENABLED = true; // temporary kill switch
const DEBUG_BT = false;
const DEBUG_BT_PERF = false;
let bulkOperationInProgress = false; // Suppress individual toasts during bulk operations
let bulkOperationCooldownTimer = null; // Keep toast suppression active briefly after bulk op ends
const BULK_OPERATION_COOLDOWN_MS = 1500; // Time to keep suppressing toasts after bulk op
const DASHBOARD_NOTIFY_BATCH_SIZE = 25;
const DASHBOARD_NOTIFY_DEBOUNCE_MS = 250;
let dashboardNotifyQueue = new Set();
let dashboardNotifyTimer = null;
const TODAY_WIDGET_PAGE_GUARD_TTL_MS = 1500;
let todayWidgetPageGuard = { at: 0, value: true, inFlight: null };
let todayWidgetRefreshTimer = null;
let todayWidgetRefreshForcePending = false;
const PILL_DOM_COUNT_TTL_MS = 6000;
let pillDomCountsCache = { at: 0, blockCount: null, checkboxCount: null };

let lastAttrNames = null;
let activeDashboardController = null;
const dashboardWatchers = new Map();
let topbarButtonObserver = null;
let themeObserver = null;
let themeSyncTimer = null;
let lastThemeSample = null;
let roamStudioToggleObserver = null;
let btPendingRoamStudioTheme = false;
const ReactDOMGlobal = typeof window !== "undefined" ? window.ReactDOM || null : null;
const ReactGlobal = typeof window !== "undefined" ? window.React || null : null;

class DashboardErrorBoundary extends (ReactGlobal?.Component || class { }) {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  componentDidCatch(error, info) {
    try {
      // info.componentStack is the most useful thing to identify which component is looping/crashing.
      console.error("[BetterTasks] Dashboard render crashed", error);
      if (info?.componentStack) console.error("[BetterTasks] Dashboard component stack:", info.componentStack);
    } finally {
      this.setState({ error, info });
    }
  }
  render() {
    if (this.state?.error) {
      return (
        <div className="bt-dashboard bt-dashboard--error">
          <header className="bt-dashboard__header">
            <div>
              <h2>Better Tasks</h2>
              <p>Dashboard failed to render. Check console for details.</p>
            </div>
            <div className="bt-dashboard__header-actions">
              <button type="button" className="bp3-button bp3-small" aria-label="Close" onClick={this.props?.onRequestClose}>
                ✕
              </button>
            </div>
          </header>
        </div>
      );
    }
    return this.props?.children || null;
  }
}

function enqueueDashboardNotifyBlockChange(uid) {
  if (!uid) return;
  try {
    if (!activeDashboardController?.isOpen?.()) return;
  } catch (err) {
    debugLog("dashboard notify isOpen check failed", err);
    return;
  }
  dashboardNotifyQueue.add(uid);
  if (dashboardNotifyTimer) return;
  dashboardNotifyTimer = setTimeout(() => {
    dashboardNotifyTimer = null;
    void flushDashboardNotifyQueue();
  }, DASHBOARD_NOTIFY_DEBOUNCE_MS);
}

async function flushDashboardNotifyQueue() {
  if (!dashboardNotifyQueue.size) return;
  let isOpen = false;
  try {
    isOpen = !!activeDashboardController?.isOpen?.();
  } catch (err) {
    debugLog("dashboard notify isOpen check failed", err);
    isOpen = false;
  }
  if (!isOpen) {
    dashboardNotifyQueue.clear();
    return;
  }
  const uids = Array.from(dashboardNotifyQueue);
  dashboardNotifyQueue.clear();
  const batch = uids.slice(0, DASHBOARD_NOTIFY_BATCH_SIZE);
  const remainder = uids.slice(DASHBOARD_NOTIFY_BATCH_SIZE);
  for (const id of batch) {
    try {
      await activeDashboardController?.notifyBlockChange?.(id);
    } catch (err) {
      debugLog("dashboard notifyBlockChange failed", err);
    }
  }
  if (remainder.length) {
    for (const id of remainder) dashboardNotifyQueue.add(id);
    if (!dashboardNotifyTimer) {
      dashboardNotifyTimer = setTimeout(() => {
        dashboardNotifyTimer = null;
        void flushDashboardNotifyQueue();
      }, DASHBOARD_NOTIFY_DEBOUNCE_MS);
    }
  }
}

function DashboardRoot({ controller, onRequestClose, onHeaderReady, language }) {
  return (
    <DashboardErrorBoundary onRequestClose={onRequestClose}>
      <DashboardApp
        controller={controller}
        onRequestClose={onRequestClose}
        onHeaderReady={onHeaderReady}
        language={language}
      />
    </DashboardErrorBoundary>
  );
}

const DOW_MAP = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
};
const DOW_IDX = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const ORD_MAP = { "1st": 1, "first": 1, "2nd": 2, "second": 2, "3rd": 3, "third": 3, "4th": 4, "fourth": 4, "last": -1 };
const DOW_ALIASES = {
  su: "sunday",
  sun: "sunday",
  sunday: "sunday",
  mo: "monday",
  mon: "monday",
  monday: "monday",
  tu: "tuesday",
  tue: "tuesday",
  tues: "tuesday",
  tuesday: "tuesday",
  we: "wednesday",
  wed: "wednesday",
  wednesday: "wednesday",
  th: "thursday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  thursday: "thursday",
  fr: "friday",
  fri: "friday",
  friday: "friday",
  sa: "saturday",
  sat: "saturday",
  saturday: "saturday",
};
const DOW_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DEFAULT_WEEK_START_CODE = "MO";
const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_KEYWORD_INTERVAL_LOOKUP = {
  quarterly: 3,
  "every quarter": 3,
  semiannual: 6,
  "semi annual": 6,
  semiannually: 6,
  "semi annually": 6,
  "semi-annual": 6,
  "semi-annually": 6,
  "twice a year": 6,
  "twice-a-year": 6,
  "twice per year": 6,
  "twice-per-year": 6,
};

export default {
  onload: ({ extensionAPI }) => {
    initProjectStore(extensionAPI);
    initWaitingStore(extensionAPI);
    initContextStore(extensionAPI);
    const PICKLIST_EXCLUDE_ENABLED_SETTING = "bt_excludePicklistPagesEnabled";
    const PICKLIST_EXCLUDE_PAGES_SETTING = "bt_excludePicklistPages";
    const normalizeBooleanSetting = (raw) => {
      if (raw === true || raw === 1) return true;
      if (raw === false || raw === 0) return false;
      if (raw === undefined || raw === null) return false;
      const norm = typeof raw === "string" ? raw.trim().toLowerCase() : String(raw).trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(norm)) return true;
      if (["false", "0", "no", "off"].includes(norm)) return false;
      return !!raw;
    };

    const buildSettingsConfig = ({ todayEnabled, badgeEnabled, picklistExcludeEnabled, lang, uiOverrides } = {}) => {
      const langSetting = getLanguageSetting(lang);
      const tr = (k, fallback) => t(k, langSetting) || fallback;
      const overrides = uiOverrides && typeof uiOverrides === "object" ? uiOverrides : {};

      const todayEnabledValue = todayEnabled ?? getTodayWidgetEnabled();
      const badgeEnabledValue = badgeEnabled ?? getTodayBadgeEnabled();

      const picklistExcludeEnabledValue =
        picklistExcludeEnabled !== null && picklistExcludeEnabled !== undefined
          ? normalizeBooleanSetting(picklistExcludeEnabled)
          : normalizeBooleanSetting(extensionAPI?.settings?.get?.(PICKLIST_EXCLUDE_ENABLED_SETTING));

      const advancedAttrNamesEnabled =
        overrides.advancedAttrNamesEnabled !== undefined
          ? normalizeBooleanSetting(overrides.advancedAttrNamesEnabled)
          : normalizeBooleanSetting(extensionAPI?.settings?.get?.(ADV_ATTR_NAMES_SETTING));
      const advancedDashboardEnabled =
        overrides.advancedDashboardEnabled !== undefined
          ? normalizeBooleanSetting(overrides.advancedDashboardEnabled)
          : normalizeBooleanSetting(extensionAPI?.settings?.get?.(ADV_DASH_OPTIONS_SETTING));
      const destination =
        overrides.destination !== undefined
          ? overrides.destination
          : extensionAPI?.settings?.get?.("rt-destination");
      const isDnpUnderHeading = destination === "DNP under heading";

      const AI_MODE_USE_KEY = AI_MODE_OPTIONS[1];
      const aiMode =
        overrides.aiMode !== undefined ? overrides.aiMode : extensionAPI?.settings?.get?.(AI_MODE_SETTING);
      const shouldShowAiKey = aiMode === AI_MODE_USE_KEY;

      // Helper to set + rebuild (keeps handlers consistent)
      const setAndRebuild = (id, value, nextUiOverrides = null, options = {}) => {
        try {
          extensionAPI?.settings?.set?.(id, value);
        } catch (_) {
          // ignore
        }
        // Rebuild so conditional blocks appear/disappear immediately.
        // Delay slightly so the settings panel handler updates are visible.
        setTimeout(() => {
          rebuildSettingsPanel(null, null, null, null, nextUiOverrides);
          if (options.notifyReviewSteps && activeDashboardController?.notifyReviewStepSettingsChanged) {
            activeDashboardController.notifyReviewStepSettingsChanged();
          }
        }, 30);
      };

      const coreSettings = [
        {
          id: LANGUAGE_SETTING,
          name: tr("settings.language", "Language"),
          description: tr("settings.languageDescription", "Preferred language for Better Tasks"),
          action: { type: "select", items: SUPPORTED_LANGUAGES, onChange: (v) => handleLanguageChange(v) },
        },
        {
          id: "rt-destination",
          name: tr("settings.destNextTask", "Destination for next task"),
          description: tr("settings.destNextTaskDescription", "Where to create the next occurrence"),
          action: {
            type: "select",
            items: tr("settings.destinationOptions", ["DNP", "Same Page", "DNP under heading", "Project Page"]) || ["DNP", "Same Page", "DNP under heading", "Project Page"],
            onChange: (v) => {
              // Save destination then rebuild so rt-dnp-heading can show/hide
              const next = v?.value ?? v?.target?.value ?? v;
              setAndRebuild("rt-destination", next, { destination: next });
            },
          },
        },
        ...(isDnpUnderHeading
          ? [
            {
              id: "rt-dnp-heading",
              name: tr("settings.dnpHeading", "DNP heading"),
              description: tr(
                "settings.dnpHeadingDescription",
                "Create under this heading on DNP when destination is DNP under heading"
              ),
              action: { type: "input", placeholder: "Tasks" },
            },
          ]
          : []),
        {
          id: "rt-confirm",
          name: tr("settings.confirmBeforeSpawn", "Confirm before spawning next task"),
          description: tr(
            "settings.confirmBeforeSpawnDescription",
            "Ask for confirmation before spawning when a repeating Better Task is completed"
          ),
          action: { type: "switch" },
        },
        {
          id: "rt-week-start",
          name: tr("settings.weekStart", "First day of the week"),
          description: tr("settings.weekStartDescription", "Used to align weekly schedules with your graph preference"),
          action: { type: "select", items: tr("settings.weekStartOptions", WEEK_START_OPTIONS) || WEEK_START_OPTIONS },
        },
        {
          id: PILL_THRESHOLD_SETTING,
          name: tr("settings.pillThreshold", "Inline pill checkbox threshold"),
          description: tr(
            "settings.pillThresholdDescription",
            "Max checkbox count before Better Tasks inline pills skip initial rendering (default 100). Higher values will render but the page may be slower."
          ),
          action: { type: "input", placeholder: DEFAULT_PILL_THRESHOLD.toString() },
        },
      ];
      const reviewStepDescription = tr(
        "settings.reviewStepDescription",
        "Include this step in the Weekly Review flow (order is fixed)."
      );
      const weeklyReviewSettings = [
        {
          id: REVIEW_STEP_NEXT_ACTIONS_SETTING,
          name: tr("settings.reviewStepNextActions", "Weekly Review: Next Actions"),
          description: reviewStepDescription,
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(REVIEW_STEP_NEXT_ACTIONS_SETTING, normalized, null, { notifyReviewSteps: true });
            },
          },
        },
        {
          id: REVIEW_STEP_WAITING_FOR_SETTING,
          name: tr("settings.reviewStepWaitingFor", "Weekly Review: Waiting For"),
          description: reviewStepDescription,
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(REVIEW_STEP_WAITING_FOR_SETTING, normalized, null, { notifyReviewSteps: true });
            },
          },
        },
        {
          id: REVIEW_STEP_COMPLETED_7D_SETTING,
          name: tr("settings.reviewStepCompleted7d", "Weekly Review: Completed (Last 7 Days)"),
          description: reviewStepDescription,
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(REVIEW_STEP_COMPLETED_7D_SETTING, normalized, null, { notifyReviewSteps: true });
            },
          },
        },
        {
          id: REVIEW_STEP_UPCOMING_7D_SETTING,
          name: tr("settings.reviewStepUpcoming7d", "Weekly Review: Upcoming (Next 7 Days)"),
          description: reviewStepDescription,
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(REVIEW_STEP_UPCOMING_7D_SETTING, normalized, null, { notifyReviewSteps: true });
            },
          },
        },
        {
          id: REVIEW_STEP_OVERDUE_SETTING,
          name: tr("settings.reviewStepOverdue", "Weekly Review: Overdue"),
          description: reviewStepDescription,
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(REVIEW_STEP_OVERDUE_SETTING, normalized, null, { notifyReviewSteps: true });
            },
          },
        },
        {
          id: REVIEW_STEP_SOMEDAY_SETTING,
          name: tr("settings.reviewStepSomeday", "Weekly Review: Someday / Maybe"),
          description: reviewStepDescription,
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(REVIEW_STEP_SOMEDAY_SETTING, normalized, null, { notifyReviewSteps: true });
            },
          },
        },
      ];

      const attributeSettingsToggle = [
        {
          id: ADV_ATTR_NAMES_SETTING,
          name: tr("settings.advancedAttrNames", "Customise attribute names (advanced)"),
          description: tr(
            "settings.advancedAttrNamesDescription",
            "Show settings to customise the attribute/page names Better Tasks uses. Defaults work for most users."
          ),
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(ADV_ATTR_NAMES_SETTING, normalized, { advancedAttrNamesEnabled: normalized });
            },
          },
        },
      ];

      const attributeSettings = [
        {
          id: "rt-repeat-attr",
          name: tr("settings.repeatAttr", "Repeat attribute name"),
          description: tr("settings.repeatAttrDescription", "Label for the recurrence rule attribute"),
          action: { type: "input", placeholder: DEFAULT_REPEAT_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-start-attr",
          name: tr("settings.startAttr", "Start attribute name"),
          description: tr("settings.startAttrDescription", "Label for start/available date attribute"),
          action: { type: "input", placeholder: DEFAULT_START_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-defer-attr",
          name: tr("settings.deferAttr", "Defer attribute name"),
          description: tr("settings.deferAttrDescription", "Label for defer/snooze date attribute"),
          action: { type: "input", placeholder: DEFAULT_DEFER_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-due-attr",
          name: tr("settings.dueAttr", "Due attribute name"),
          description: tr("settings.dueAttrDescription", "Label for due date attribute"),
          action: { type: "input", placeholder: DEFAULT_DUE_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-completed-attr",
          name: tr("settings.completedAttr", "Completed attribute name"),
          description: tr("settings.completedAttrDescription", "Label written when a recurring/scheduled task is completed"),
          action: { type: "input", placeholder: DEFAULT_COMPLETED_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "bt-attr-project",
          name: tr("settings.projectAttr", "Project attribute name"),
          description: tr("settings.projectAttrDescription", "Label for project attribute (child block)"),
          action: { type: "input", placeholder: "BT_attrProject", onChange: handleAttributeNameChange },
        },
        {
          id: "bt-attr-gtd",
          name: tr("settings.gtdAttr", "GTD status attribute name"),
          description: tr("settings.gtdAttrDescription", "Label for GTD status attribute (child block)"),
          action: { type: "input", placeholder: DEFAULT_GTD_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "bt-attr-waitingFor",
          name: tr("settings.waitingAttr", "Waiting-for attribute name"),
          description: tr("settings.waitingAttrDescription", "Label for waiting-for attribute (child block)"),
          action: { type: "input", placeholder: "BT_attrWaitingFor", onChange: handleAttributeNameChange },
        },
        {
          id: "bt-attr-context",
          name: tr("settings.contextAttr", "Context attribute name"),
          description: tr("settings.contextAttrDescription", "Label for context/tags attribute (child block)"),
          action: { type: "input", placeholder: "BT_attrContext", onChange: handleAttributeNameChange },
        },
        {
          id: "bt-attr-priority",
          name: tr("settings.priorityAttr", "Priority attribute name"),
          description: tr("settings.priorityAttrDescription", "Label for priority attribute (child block)"),
          action: { type: "input", placeholder: "BT_attrPriority", onChange: handleAttributeNameChange },
        },
        {
          id: "bt-attr-energy",
          name: tr("settings.energyAttr", "Energy attribute name"),
          description: tr("settings.energyAttrDescription", "Label for energy attribute (child block)"),
          action: { type: "input", placeholder: "BT_attrEnergy", onChange: handleAttributeNameChange },
        },
      ];

      const dashboardAdvancedToggle = [
        {
          id: ADV_DASH_OPTIONS_SETTING,
          name: tr("settings.advancedDashboard", "Advanced Dashboard options"),
          description: tr(
            "settings.advancedDashboardDescription",
            "Show settings for Weekly Review steps."
          ),
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeBooleanSetting(normalizeTodaySettingValue(v));
              setAndRebuild(
                ADV_DASH_OPTIONS_SETTING,
                normalized,
                { advancedDashboardEnabled: normalized },
                { notifyReviewSteps: true }
              );
            },
          },
        },
      ];
      const picklistAdvanced = [
        {
          id: PICKLIST_EXCLUDE_ENABLED_SETTING,
          name: tr("settings.picklistExcludesAdvanced", "Advanced Project/Context/Waiting options"),
          description: tr(
            "settings.picklistExcludesAdvancedDescription",
            "Show settings to exclude specific pages from Project/Context/Waiting picklists (roam/* pages are always excluded)."
          ),
          action: {
            type: "switch",
            onChange: (v) => {
              const normalized = normalizeTodaySettingValue(v);
              const nextEnabled = normalizeBooleanSetting(normalized);
              try {
                extensionAPI?.settings?.set?.(PICKLIST_EXCLUDE_ENABLED_SETTING, nextEnabled);
              } catch (_) { }
              try {
                void refreshProjectOptions(true);
                void refreshWaitingOptions(true);
                void refreshContextOptions(true);
              } catch (_) { }
              rebuildSettingsPanel(null, null, null, nextEnabled);
            },
          },
        },
        ...(picklistExcludeEnabledValue
          ? [
            {
              id: PICKLIST_EXCLUDE_PAGES_SETTING,
              name: tr("settings.excludePicklistPages", "Exclude pages from picklists"),
              description: tr(
                "settings.excludePicklistPagesDescription",
                "Comma-separated page titles. Wrap titles containing commas (e.g. daily notes) in [[...]]. Values found on these pages will not populate Project/Context/Waiting picklists (useful for Templates/SmartBlocks)."
              ),
              action: {
                type: "input",
                placeholder: tr(
                  "settings.excludePicklistPagesPlaceholder",
                  "Templates, SmartBlocks, [[December 18th, 2025]]"
                ),
                onChange: (v) => {
                  const normalized = normalizeTodaySettingValue(v);
                  try {
                    extensionAPI?.settings?.set?.(PICKLIST_EXCLUDE_PAGES_SETTING, String(normalized || ""));
                  } catch (_) { }
                  try {
                    void refreshProjectOptions(true);
                    void refreshWaitingOptions(true);
                    void refreshContextOptions(true);
                  } catch (_) { }
                },
              },
            },
          ]
          : []),
      ];

      const aiSettings = [
        {
          id: AI_MODE_SETTING,
          name: tr("settings.aiMode", "AI parsing mode"),
          description: tr("settings.aiModeDescription", "Optional: use your OpenAI API key for AI-assisted task parsing"),
          action: {
            type: "select",
            items: t("settings.aiModeOptions", langSetting) || AI_MODE_OPTIONS,
            onChange: (v) => {
              const next = v?.value ?? v?.target?.value ?? v;
              try { extensionAPI?.settings?.set?.(AI_MODE_SETTING, next); } catch (_) { }
              rebuildSettingsPanel(null, null, null, null, { aiMode: next });
            },
          },
        },
        ...(shouldShowAiKey
          ? [
            {
              id: AI_KEY_SETTING,
              name: tr("settings.aiKey", "OpenAI API key"),
              description: tr("settings.aiKeyDescription", "Sensitive: stored in Roam settings; used client-side only for AI parsing"),
              action: {
                type: "input",
                placeholder: "sk-...",
                onChange: (v) => {
                  const normalized = normalizeTodaySettingValue(v);
                  try {
                    extensionAPI?.settings?.set?.(AI_KEY_SETTING, String(normalized || ""));
                  } catch (_) { }
                },
              },
            },
          ]
          : []),
      ];

      const todayBadgeSettings = [
        {
          id: TODAY_BADGE_ENABLE_SETTING,
          name: tr("settings.todayBadgeEnable", "Enable Today badge"),
          description: tr("settings.todayBadgeEnableDescription", "Show a Today link and badge in the left sidebar (default off)"),
          action: { type: "switch", onChange: (v) => handleTodayBadgeSettingChange(TODAY_BADGE_ENABLE_SETTING, v) },
        },
        ...(badgeEnabledValue
          ? [
            {
              id: TODAY_BADGE_LABEL_SETTING,
              name: tr("settings.todayBadgeLabel", "Today badge label"),
              description: tr("settings.todayBadgeLabelDescription", "Text for the Today badge/link (markdown ignored for matching)"),
              action: { type: "input", placeholder: "Today", onChange: (v) => handleTodayBadgeSettingChange(TODAY_BADGE_LABEL_SETTING, v) },
            },
            {
              id: TODAY_BADGE_OVERDUE_SETTING,
              name: tr("settings.todayBadgeIncludeOverdue", "Include overdue in Today badge"),
              description: tr("settings.todayBadgeIncludeOverdueDescription", "Counts overdue tasks in the badge (completed tasks are never counted)"),
              action: { type: "switch", onChange: (v) => handleTodayBadgeSettingChange(TODAY_BADGE_OVERDUE_SETTING, v) },
            },
            {
              id: TODAY_BADGE_BG_SETTING,
              name: tr("settings.todayBadgeBg", "Today badge background"),
              description: tr("settings.todayBadgeBgDescription", "CSS color for the badge background"),
              action: { type: "input", placeholder: "#1F6FEB", onChange: (v) => handleTodayBadgeSettingChange(TODAY_BADGE_BG_SETTING, v) },
            },
            {
              id: TODAY_BADGE_FG_SETTING,
              name: tr("settings.todayBadgeFg", "Today badge text"),
              description: tr("settings.todayBadgeFgDescription", "CSS color for the badge text"),
              action: { type: "input", placeholder: "#FFFFFF", onChange: (v) => handleTodayBadgeSettingChange(TODAY_BADGE_FG_SETTING, v) },
            },
          ]
          : []),
      ];

      const todayWidgetSettings = [
        {
          id: TODAY_WIDGET_ENABLE_SETTING,
          name: tr("settings.enableTodayWidget", "Enable Today widget"),
          description: tr("settings.enableTodayWidgetDescription", "Show the Better Tasks Today widget on your daily note page"),
          action: { type: "switch", onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_ENABLE_SETTING, v) },
        },
      ];

      const todayWidgetDetails = todayEnabledValue
        ? [
          {
            id: TODAY_WIDGET_TITLE_SETTING,
            name: tr("settings.todayWidgetTitle", "Today widget title"),
            description: tr(
              "settings.todayWidgetTitleDescription",
              "Title used for the Today anchor; if a matching block exists on the DNP (any level), the widget renders under it, otherwise it creates one at the configured placement."
            ),
            action: { type: "input", placeholder: TODAY_WIDGET_ANCHOR_TEXT_DEFAULT, onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_TITLE_SETTING, v) },
          },
          {
            id: TODAY_WIDGET_PLACEMENT_SETTING,
            name: tr("settings.todayWidgetPlacement", "Today widget placement"),
            description: tr("settings.todayWidgetPlacementDescription", "Place the widget at the top or bottom of the DNP"),
            action: { type: "select", items: tr("settings.placementOptions", ["Top", "Bottom"]) || ["Top", "Bottom"], onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_PLACEMENT_SETTING, v) },
          },
          {
            id: TODAY_WIDGET_HEADING_SETTING,
            name: tr("settings.todayWidgetHeadingLevel", "Today widget heading level"),
            description: tr("settings.todayWidgetHeadingLevelDescription", "Apply heading styling to the Today widget anchor block"),
            action: { type: "select", items: tr("settings.headingLevelOptions", ["None", "H1", "H2", "H3"]) || ["None", "H1", "H2", "H3"], onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_HEADING_SETTING, v) },
          },
          {
            id: TODAY_WIDGET_LAYOUT_SETTING,
            name: tr("settings.todayWidgetLayout", "Today widget layout"),
            description: tr("settings.todayWidgetLayoutDescription", "Choose how the Today widget appears on your DNP"),
            action: { type: "select", items: tr("settings.todayWidgetLayoutOptions", ["Panel", "Roam-style inline"]) || ["Panel", "Roam-style inline"], onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_LAYOUT_SETTING, v) },
          },
          {
            id: TODAY_WIDGET_OVERDUE_SETTING,
            name: tr("settings.todayWidgetIncludeOverdue", "Include overdue tasks in Today widget"),
            description: tr("settings.todayWidgetIncludeOverdueDescription", "Show tasks with due dates before today"),
            action: { type: "switch", onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_OVERDUE_SETTING, v) },
          },
          {
            id: TODAY_WIDGET_COMPLETED_SETTING,
            name: tr("settings.todayWidgetShowCompleted", "Show completed tasks in Today widget"),
            description: tr("settings.todayWidgetShowCompletedDescription", "Include completed tasks (hidden by default)"),
            action: { type: "switch", onChange: (v) => handleTodaySettingChange(TODAY_WIDGET_COMPLETED_SETTING, v) },
          },
        ]
        : [];

      // Final ordering:
      // 1) Core
      // 2) Today Badge
      // 3) Today Widget
      // 4) AI
      // 5) Advanced Dashboard toggle
      // 6) Weekly Review steps (advanced)
      // 7) Picklist advanced
      // 8) Attribute names (advanced) toggle + fields
      const settings = [
        ...coreSettings,
        ...todayBadgeSettings,
        ...todayWidgetSettings,
        ...(todayEnabledValue ? todayWidgetDetails : []),
        ...aiSettings,
        ...dashboardAdvancedToggle,
        ...(advancedDashboardEnabled ? weeklyReviewSettings : []),
        ...picklistAdvanced,
        ...attributeSettingsToggle,
        ...(advancedAttrNamesEnabled ? attributeSettings : []),
      ];

      return {
        tabTitle: tr("settings.tabTitle", "Better Tasks"),
        settings,
      };
    };

    const rebuildSettingsPanel = (
      todayEnabledOverride = null,
      langOverride = null,
      badgeEnabledOverride = null,
      picklistExcludeEnabledOverride = null,
      uiOverrides = null
    ) => {
      try {
        const effectiveTodayEnabled =
          todayEnabledOverride !== null && todayEnabledOverride !== undefined ? todayEnabledOverride : getTodayWidgetEnabled();
        const effectiveBadgeEnabled =
          badgeEnabledOverride !== null && badgeEnabledOverride !== undefined ? badgeEnabledOverride : getTodayBadgeEnabled();

        const config = buildSettingsConfig({
          todayEnabled: effectiveTodayEnabled,
          badgeEnabled: effectiveBadgeEnabled,
          picklistExcludeEnabled: picklistExcludeEnabledOverride,
          uiOverrides,
          lang: langOverride,
        });
        extensionAPI.settings.panel.create(config);
      } catch (err) {
        console.warn("[BetterTasks] failed to rebuild settings panel", err);
      }
    };

    const config = buildSettingsConfig();
    extensionAPI.settings.panel.create(config);

    if (extensionAPI.settings.get(TODAY_WIDGET_ENABLE_SETTING) == null) {
      extensionAPI.settings.set(TODAY_WIDGET_ENABLE_SETTING, false);
    }
    if (extensionAPI.settings.get(TODAY_WIDGET_LAYOUT_SETTING) == null) {
      extensionAPI.settings.set(TODAY_WIDGET_LAYOUT_SETTING, "Panel");
    }
    if (extensionAPI.settings.get(TODAY_WIDGET_OVERDUE_SETTING) == null) {
      extensionAPI.settings.set(TODAY_WIDGET_OVERDUE_SETTING, false);
    }
    if (extensionAPI.settings.get(TODAY_WIDGET_COMPLETED_SETTING) == null) {
      extensionAPI.settings.set(TODAY_WIDGET_COMPLETED_SETTING, false);
    }
    if (extensionAPI.settings.get(TODAY_WIDGET_PLACEMENT_SETTING) == null) {
      extensionAPI.settings.set(TODAY_WIDGET_PLACEMENT_SETTING, "Top");
    }
    if (extensionAPI.settings.get(TODAY_WIDGET_HEADING_SETTING) == null) {
      extensionAPI.settings.set(TODAY_WIDGET_HEADING_SETTING, "None");
    }
    if (extensionAPI.settings.get(TODAY_BADGE_ENABLE_SETTING) == null) {
      extensionAPI.settings.set(TODAY_BADGE_ENABLE_SETTING, false);
    }
    if (extensionAPI.settings.get(TODAY_BADGE_OVERDUE_SETTING) == null) {
      extensionAPI.settings.set(TODAY_BADGE_OVERDUE_SETTING, false);
    }
    if (extensionAPI.settings.get(PICKLIST_EXCLUDE_ENABLED_SETTING) == null) {
      extensionAPI.settings.set(PICKLIST_EXCLUDE_ENABLED_SETTING, false);
    }
    if (extensionAPI.settings.get(PICKLIST_EXCLUDE_PAGES_SETTING) == null) {
      extensionAPI.settings.set(PICKLIST_EXCLUDE_PAGES_SETTING, "");
    }
    if (extensionAPI.settings.get(ADV_DASH_OPTIONS_SETTING) == null) {
      extensionAPI.settings.set(ADV_DASH_OPTIONS_SETTING, false);
    }
    if (extensionAPI.settings.get(REVIEW_STEP_NEXT_ACTIONS_SETTING) == null) {
      extensionAPI.settings.set(REVIEW_STEP_NEXT_ACTIONS_SETTING, true);
    }
    if (extensionAPI.settings.get(REVIEW_STEP_WAITING_FOR_SETTING) == null) {
      extensionAPI.settings.set(REVIEW_STEP_WAITING_FOR_SETTING, true);
    }
    if (extensionAPI.settings.get(REVIEW_STEP_COMPLETED_7D_SETTING) == null) {
      extensionAPI.settings.set(REVIEW_STEP_COMPLETED_7D_SETTING, true);
    }
    if (extensionAPI.settings.get(REVIEW_STEP_UPCOMING_7D_SETTING) == null) {
      extensionAPI.settings.set(REVIEW_STEP_UPCOMING_7D_SETTING, true);
    }
    if (extensionAPI.settings.get(REVIEW_STEP_OVERDUE_SETTING) == null) {
      extensionAPI.settings.set(REVIEW_STEP_OVERDUE_SETTING, true);
    }
    if (extensionAPI.settings.get(REVIEW_STEP_SOMEDAY_SETTING) == null) {
      extensionAPI.settings.set(REVIEW_STEP_SOMEDAY_SETTING, true);
    }
    lastAttrNames = resolveAttributeNames();

    const introSeen = extensionAPI.settings.get(INSTALL_TOAST_KEY);
    if (!introSeen) {
      toast(
        translateString(
          "This extension automatically recognises {{[[TODO]]}} tasks in your graph and uses attributes to determine a recurrence pattern and other attributes. By default, it uses attributes like 'BT_attrRepeat' and 'BT_attrDue'. These can be changed in the extension settings.<BR><BR>If you already happen to use attributes like 'BT_attrRepeat' or 'BT_attrDue' for other functions in your graph, please change the defaults in the Roam Depot Settings for this extension BEFORE testing its functionality to avoid any unexpected behaviour.",
          getLanguageSetting()
        ),
        10000,
        "betterTasks3 bt3-toast-info"
      );
      extensionAPI.settings.set(INSTALL_TOAST_KEY, "1");
    }
    currentLanguage = getLanguageSetting();

    const cmdConvert = translateString("Convert TODO to Better Task", getLanguageSetting());
    extensionAPI.ui.commandPalette.addCommand({
      label: cmdConvert,
      callback: () => convertTODO(null),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: cmdConvert,
      callback: (e) => convertTODO(e),
    });
    const cmdCreate = translateString("Create a Better Task", getLanguageSetting());
    extensionAPI.ui.commandPalette.addCommand({
      label: cmdCreate,
      callback: () => createBetterTaskEntryPoint(),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: cmdCreate,
      callback: (e) => createBetterTaskEntryPoint(e),
    });
    const slashCommandAPI = window.roamAlphaAPI?.ui?.slashCommand;
    if (slashCommandAPI) {
      const slashCreate = translateString("Create a Better Task", getLanguageSetting());
      const slashConvert = translateString("Convert TODO to Better Task", getLanguageSetting());
      slashCommandAPI.addCommand({
        label: slashCreate,
        callback: (args) => {
          const blockUid = args["block-uid"];
          createBetterTaskEntryPoint({ "block-uid": blockUid });
          return "";
        },
      });
      slashCommandAPI.addCommand({
        label: slashConvert,
        callback: (args) => {
          const blockUid = args["block-uid"];
          convertTODO({ "block-uid": blockUid });
          return "";
        },
      });
    }

    activeDashboardController = createDashboardController(extensionAPI);

    try {
      installPresetDashboardViews(extensionAPI, {
        force: false,
        getName: (key) => {
          const lang = getLanguageSetting();
          const val = t(["dashboard", "viewsPresets", key], lang);
          return typeof val === "string" ? val : null;
        },
      });
    } catch (err) {
      console.warn("[BetterTasks] preset dashboard views seed failed", err);
    }

    extensionAPI.ui.commandPalette.addCommand({
      label: translateString("Toggle Better Tasks Dashboard", getLanguageSetting()),
      callback: () => activeDashboardController.toggle(),
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: t(["commands", "toggleDashboardFullPage"], getLanguageSetting()) || "Toggle Better Tasks Dashboard (Full page)",
      callback: () => {
        if (!activeDashboardController) return;
        if (!activeDashboardController.isOpen?.()) {
          activeDashboardController.open?.();
          requestAnimationFrame(() => {
            activeDashboardController.setDashboardFullPage?.(true);
          });
          return;
        }
        activeDashboardController.toggleDashboardFullPage?.();
      },
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: translateString("Better Tasks: Switch view…", getLanguageSetting()),
      callback: async () => {
        try {
          if (!activeDashboardController?.isOpen?.()) {
            toast(t("toasts.dashViewsOpenToSwitch", getLanguageSetting()) || "Open Better Tasks Dashboard to switch views.");
            return;
          }
          const store = activeDashboardController.loadViewsStore?.();
          const views = store?.views || [];
          if (!views.length) {
            toast(t("toasts.dashViewsNoSaved", getLanguageSetting()) || "No saved views.");
            return;
          }
          const pickedId = await promptForDashView({
            title: "Better Tasks",
            placeholder: "Filter views",
            views,
            initialId: store?.activeViewId || null,
          });
          if (!pickedId) return;
          const view = views.find((v) => v.id === pickedId);
          if (!view) return;
          const nextStore = setActiveDashView(store, pickedId);
          const saved = activeDashboardController.saveViewsStore?.(nextStore) || nextStore;
          activeDashboardController.notifyDashViewsStoreChanged?.(saved);
          activeDashboardController.requestApplyDashViewState?.(view.state);
        } catch (err) {
          console.warn("[BetterTasks] switch view command failed", err);
          toast(t("toasts.dashViewsSwitchFailed", getLanguageSetting()) || "Unable to switch view.");
        }
      },
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: translateString("Better Tasks: Save current view as…", getLanguageSetting()),
      callback: async () => {
        try {
          if (!activeDashboardController?.isOpen?.()) {
            toast(t("toasts.dashViewsOpenToSave", getLanguageSetting()) || "Open Better Tasks Dashboard to save views.");
            return;
          }
          const dashState = activeDashboardController.getDashViewState?.();
          if (!dashState) {
            toast(
              t("toasts.dashViewsReadStateFailed", getLanguageSetting()) ||
              "Unable to read dashboard state. Try reopening the dashboard."
            );
            return;
          }
          const name = activeDashboardController.promptValue
            ? await activeDashboardController.promptValue({
              title: "Better Tasks",
              message: "Save current view as",
              placeholder: "View name",
              initial: "",
            })
            : null;
          if (!name) return;
          const store = activeDashboardController.loadViewsStore?.();
          const nextStore = createDashView(store, name, dashState);
          const saved = activeDashboardController.saveViewsStore?.(nextStore) || nextStore;
          activeDashboardController.notifyDashViewsStoreChanged?.(saved);
        } catch (err) {
          console.warn("[BetterTasks] save view command failed", err);
          toast(t("toasts.dashViewsSaveFailed", getLanguageSetting()) || "Unable to save view.");
        }
      },
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: t(["commands", "startReview"], getLanguageSetting()) || "Better Tasks: Weekly Review",
      callback: async () => {
        try {
          if (!activeDashboardController?.isOpen?.()) {
            activeDashboardController?.open?.();
          }
          activeDashboardController?.requestStartDashReview?.();
        } catch (err) {
          console.warn("[BetterTasks] start review command failed", err);
          toast(t(["toasts", "dashReviewStartFailed"], getLanguageSetting()) || "Unable to start review.");
        }
      },
    });
    extensionAPI.ui.commandPalette.addCommand({
      label:
        t(["commands", "reinstallPresetDashViews"], getLanguageSetting()) ||
        "Better Tasks: Reinstall preset dashboard views",
      callback: async () => {
        try {
          const result = installPresetDashboardViews(extensionAPI, {
            force: true,
            getName: (key) => {
              const lang = getLanguageSetting();
              const val = t(["dashboard", "viewsPresets", key], lang);
              return typeof val === "string" ? val : null;
            },
          });
          if (result?.didSave) {
            activeDashboardController?.notifyDashViewsStoreChanged?.(result.store);
          }
          const collisions = Array.isArray(result?.skippedNameCollisions)
            ? result.skippedNameCollisions
            : [];
          if (collisions.length) {
            const base =
              t("toasts.dashViewsPresetNameCollisions", getLanguageSetting()) ||
              "Skipped presets due to name conflicts:";
            toast(`${base} ${collisions.join(", ")}`);
            return;
          }
          const installed = Array.isArray(result?.installedIds) ? result.installedIds.length : 0;
          if (installed > 0) {
            toast(
              t("toasts.dashViewsPresetInstalled", getLanguageSetting()) ||
              "Preset dashboard views installed."
            );
            return;
          }
          toast(
            t("toasts.dashViewsPresetNothingToInstall", getLanguageSetting()) ||
            "All preset dashboard views are already present."
          );
        } catch (err) {
          console.warn("[BetterTasks] reinstall preset views failed", err);
          toast(
            t("toasts.dashViewsPresetInstallFailed", getLanguageSetting()) ||
            "Unable to reinstall preset dashboard views."
          );
        }
      },
    });
    if (getTodayWidgetEnabled()) {
      scheduleTodayWidgetRender();
      attachTodayNavigationListener();
    }
    if (getTodayBadgeEnabled()) {
      scheduleTodayBadgeRefresh(100, true);
      attachTodayNavigationListener();
    }
    if (!dashboardRefreshTimer && typeof window !== "undefined") {
      dashboardRefreshTimer = window.setInterval(() => {
        try {
          if (!activeDashboardController?.isOpen?.()) {
            if (window.__btDebugRefreshTimer) {
              const now = Date.now();
              if (now - dashboardRefreshLogAt >= DASHBOARD_REFRESH_LOG_INTERVAL_MS) {
                dashboardRefreshLogAt = now;
                console.debug("[BetterTasks] dashboard refresh tick");
              }
            }
            activeDashboardController?.refresh?.({ reason: "background" });
          }
        } catch (err) {
          debugLog("dashboard refresh tick failed", err);
        }
      }, 90_000);
    }
    ensureDashboardTopbarButton();
    observeTopbarButton();
    observeThemeChanges();

    // Placeholder for future feature - deconvert Better Tasks TODOs
    /* 
    extensionAPI.ui.commandPalette.addCommand({
      label: "Convert Better Task to plain TODO",
      callback: () => disableRecTODO(null),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: "Convert Better Task to plain TODO",
      callback: (e) => disableRecTODO(e),
    });
    */

    async function convertTODO(e) {
      const perfConvert = perfMark("convertTODO");
      let fuid = null;
      if (e && e["block-uid"]) {
        fuid = e["block-uid"];
      } else {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        fuid = focused && focused["block-uid"];
        if (!fuid) {
          toast(t(["toasts", "placeCursorConvert"], getLanguageSetting()) || "Place the cursor in the block you wish to convert.");
          return;
        }
      }

      const block = await getBlock(fuid);
      if (!block) {
        toast(t(["toasts", "unableReadBlock"], getLanguageSetting()) || "Unable to read the current block.");
        return;
      }
      const fstring = block.string || "";
      const props = parseProps(block.props);
      const inlineAttrs = parseAttrsFromBlockText(fstring);
      const childAttrs = parseAttrsFromChildBlocks(block.children || []);
      const attrNames = resolveAttributeNames();
      const existingMeta = parseRichMetadata(childAttrs, attrNames);
      const childRepeatEntry = pickChildAttr(childAttrs, attrNames.repeatAliases);
      const childDueEntry = pickChildAttr(childAttrs, attrNames.dueAliases);
      const childStartEntry = pickChildAttr(childAttrs, attrNames.startAliases);
      const childDeferEntry = pickChildAttr(childAttrs, attrNames.deferAliases);
      const inlineRepeatVal = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const inlineDueVal = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineStartVal = pickInlineAttr(inlineAttrs, attrNames.startAliases);
      const inlineDeferVal = pickInlineAttr(inlineAttrs, attrNames.deferAliases);
      const removalKeys = [
        ...new Set([
          ...attrNames.repeatRemovalKeys,
          ...attrNames.dueRemovalKeys,
          ...attrNames.startRemovalKeys,
          ...attrNames.deferRemovalKeys,
        ]),
      ];
      const baseWithoutAttrs = removeInlineAttributes(fstring, removalKeys);
      const initialTaskText = baseWithoutAttrs.trim();

      const promptResult = await promptForRepeatAndDue({
        includeTaskText: true,
        forceTaskInput: true,
        taskText: initialTaskText,
        repeat: props.repeat || childRepeatEntry?.value || inlineRepeatVal || "",
        due: props.due || childDueEntry?.value || inlineDueVal || "",
        start: props.start || childStartEntry?.value || inlineStartVal || "",
        defer: props.defer || childDeferEntry?.value || inlineDeferVal || "",
        project: existingMeta.project || "",
        waitingFor: existingMeta.waitingFor || "",
        context: existingMeta.context || "",
        priority: existingMeta.priority || "",
        energy: existingMeta.energy || "",
        gtd: existingMeta.gtd || "",
      });
      if (!promptResult) return;

      const set = S(attrNames);
      const normalizedRepeat =
        promptResult.repeat ? normalizeRepeatRuleText(promptResult.repeat) || promptResult.repeat : "";
      if (normalizedRepeat && !parseRuleText(normalizedRepeat, set)) {
        toast(t(["toasts", "unableUnderstandRepeat"], getLanguageSetting()) || "Unable to understand that repeat rule.");
        return;
      }

      let dueDate = null;
      let dueStr = null;
      const promptDueSource = promptResult.due || "";
      if (promptDueSource) {
        dueDate =
          promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
            ? new Date(promptResult.dueDate.getTime())
            : parseRoamDate(promptDueSource);
        if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
          toast(t(["toasts", "cannotParseDue"], getLanguageSetting()) || "Couldn't parse that due date.");
          return;
        }
        dueStr = formatDate(dueDate, set);
      }

      const startSourceFromPrompt = promptResult.start || "";
      const startFallbackSource = props.start || childStartEntry?.value || inlineStartVal || "";
      const startSource = startSourceFromPrompt || startFallbackSource;
      let startDate = null;
      let startStr = null;
      if (startSource) {
        startDate =
          promptResult.startDate instanceof Date && startSourceFromPrompt
            ? new Date(promptResult.startDate.getTime())
            : parseRoamDate(startSource);
        if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
          toast(t(["toasts", "cannotParseStart"], getLanguageSetting()) || "Couldn't parse that start date.");
          return;
        }
        startStr = formatDate(startDate, set);
      }

      const deferSourceFromPrompt = promptResult.defer || "";
      const deferFallbackSource = props.defer || childDeferEntry?.value || inlineDeferVal || "";
      const deferSource = deferSourceFromPrompt || deferFallbackSource;
      let deferDate = null;
      let deferStr = null;
      if (deferSource) {
        deferDate =
          promptResult.deferDate instanceof Date && deferSourceFromPrompt
            ? new Date(promptResult.deferDate.getTime())
            : parseRoamDate(deferSource);
        if (!(deferDate instanceof Date) || Number.isNaN(deferDate.getTime())) {
          toast(t(["toasts", "cannotParseDefer"], getLanguageSetting()) || "Couldn't parse that defer date.");
          return;
        }
        deferStr = formatDate(deferDate, set);
      }

      const taskSource =
        typeof promptResult.taskText === "string" && promptResult.taskText
          ? promptResult.taskText
          : typeof promptResult.taskTextRaw === "string" && promptResult.taskTextRaw
            ? promptResult.taskTextRaw
            : initialTaskText;
      const cleanedTaskText = removeInlineAttributes(taskSource || "", removalKeys).trim();
      const todoString = normalizeToTodoMacro(cleanedTaskText);
      if (todoString !== fstring) {
        await updateBlockString(fuid, todoString);
      }

      const hasRepeat = !!normalizedRepeat;
      const hasTimingInput = !!(dueStr || startStr || deferStr);
      const hasMetadataInput = !!(
        (promptResult.project || "").trim() ||
        (promptResult.waitingFor || "").trim() ||
        (promptResult.context || "").trim() ||
        (promptResult.priority || "").trim() ||
        (promptResult.energy || "").trim() ||
        (promptResult.gtd || "").trim()
      );
      if (!hasRepeat && !hasTimingInput && !hasMetadataInput) {
        toast(t(["toasts", "addRepeatDateOrMetadata"], getLanguageSetting()) || "Add a repeat rule, a date, or metadata.");
        return;
      }

      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;

      await updateBlockProps(fuid, { rt: rtProps });

      const attrNamesForWrite = set.attrNames;
      if (hasRepeat) {
        await ensureChildAttrForType(fuid, "repeat", normalizedRepeat, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "repeat", attrNamesForWrite);
      }
      if (dueStr) {
        await ensureChildAttrForType(fuid, "due", dueStr, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "due", attrNamesForWrite);
      }
      if (startStr) {
        await ensureChildAttrForType(fuid, "start", startStr, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "start", attrNamesForWrite);
      }
      if (deferStr) {
        await ensureChildAttrForType(fuid, "defer", deferStr, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "defer", attrNamesForWrite);
      }
      await applyMetadataFromPrompt(fuid, promptResult, attrNamesForWrite, { initial: existingMeta });

      repeatOverrides.delete(fuid);
      const createdMsg = t(["toasts", "createdRecurring"], getLanguageSetting()) || "Created your Better Task";
      toast(hasRepeat || hasTimingInput ? createdMsg : "Added metadata");
      scheduleSurfaceSync(set.attributeSurface);
      perfLog(perfConvert);
    }

    async function createBetterTaskEntryPoint(e) {
      let targetUid = null;
      if (e && e["block-uid"]) {
        targetUid = e["block-uid"];
      } else {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        targetUid = focused && focused["block-uid"];
        if (!targetUid) {
          toast(t(["toasts", "placeCursorCreate"], getLanguageSetting()) || "Place the cursor in the block where you wish to create the Better Task.");
          return;
        }
      }

      const block = await getBlock(targetUid);
      if (!block) {
        toast(t(["toasts", "unableReadBlock"], getLanguageSetting()) || "Unable to read the current block.");
        return;
      }

      let rawText = (block.string || "").trim();
      const aiSettings = getAiSettings();
      const aiEnabled = isAiEnabled(aiSettings);
      if (!rawText && !aiEnabled) {
        await createRecurringTODO(targetUid);
        return;
      }
      if (!rawText && aiEnabled) {
        const input = await promptForValue({
          title: "Create a Better Task",
          message: "Enter task text",
          placeholder: "Task text",
          initial: "",
        });
        if (!input) return;
        rawText = input.trim();
        if (!rawText) {
          toast(t(["toasts", "enterText"], getLanguageSetting()) || "Enter some task text.");
          return;
        }
        await updateBlockString(targetUid, input);
      }

      const attrNames = resolveAttributeNames();
      const removalKeys = [
        ...new Set([
          ...attrNames.repeatRemovalKeys,
          ...attrNames.dueRemovalKeys,
          ...attrNames.startRemovalKeys,
          ...attrNames.deferRemovalKeys,
          "completed",
        ]),
      ];
      const cleanedInput = removeInlineAttributes(rawText, removalKeys)
        .replace(/^\{\{\[\[(?:TODO|DONE)\]\]\}\}\s*/i, "")
        .trim();
      const aiInput = cleanedInput || rawText;

      if (!aiEnabled) {
        await createRecurringTODO(targetUid);
        return;
      }

      const aiAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
      let suppressAiAbort = false;
      const pending = showPersistentToast("Parsing task with AI…", {
        onClosed: () => {
          if (suppressAiAbort) return;
          aiAbort?.abort();
        },
      });
      let aiResult = null;
      try {
        aiResult = await parseTaskWithOpenAI(aiInput, aiSettings, { signal: aiAbort?.signal });
      } catch (err) {
        console.warn("[BetterTasks] AI parsing threw unexpectedly", err);
        aiResult = { ok: false, error: err };
      } finally {
        suppressAiAbort = true;
        hideToastInstance(pending);
      }
      if (aiResult?.reason === "aborted") return;
      if (aiResult.ok) {
        const applied = await createTaskFromParsedJson(targetUid, aiResult.task, aiInput);
        if (applied) {
          toast(t(["toasts", "createdWithAi"], getLanguageSetting()) || "Created Better Task with AI parsing");
          return;
        }
      } else {
        console.warn("[BetterTasks] AI parsing unavailable", aiResult.error || aiResult.reason);
        if (aiResult.status === 429 || aiResult.code === "insufficient_quota") {
          toast(
            `AI parsing unavailable (429 from OpenAI). Check your billing/credit: https://platform.openai.com/settings/organization/billing/overview`
          );
        } else {
          toast(t(["toasts", "aiFallback"], getLanguageSetting()) || "AI parsing unavailable, creating a normal Better Task instead.");
        }
      }

      await createRecurringTODO(targetUid);
    }

    async function createRecurringTODO(fuid) {
      if (!fuid) {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        fuid = focused && focused["block-uid"];
        if (fuid == null || fuid == undefined) {
          toast(
            t(["toasts", "placeCursorTodo"], getLanguageSetting()) ||
              "Place the cursor in the block where you wish to create the Better Task."
          );
          return;
        }
      }

      const block = await getBlock(fuid);
      if (!block) {
        toast(t(["toasts", "unableReadBlock"], getLanguageSetting()) || "Unable to read the current block.");
        return;
      }

      const props = parseProps(block.props);
      const inlineAttrs = parseAttrsFromBlockText(block.string || "");
      const childAttrs = parseAttrsFromChildBlocks(block.children || []);
      const attrNames = resolveAttributeNames();
      const childRepeatEntry = pickChildAttr(childAttrs, attrNames.repeatAliases);
      const childDueEntry = pickChildAttr(childAttrs, attrNames.dueAliases);
      const childStartEntry = pickChildAttr(childAttrs, attrNames.startAliases);
      const childDeferEntry = pickChildAttr(childAttrs, attrNames.deferAliases);
      const inlineRepeatVal = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const inlineDueVal = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineStartVal = pickInlineAttr(inlineAttrs, attrNames.startAliases);
      const inlineDeferVal = pickInlineAttr(inlineAttrs, attrNames.deferAliases);
      const removalKeys = [
        ...new Set([
          ...attrNames.repeatRemovalKeys,
          ...attrNames.dueRemovalKeys,
          ...attrNames.startRemovalKeys,
          ...attrNames.deferRemovalKeys,
        ]),
      ];
      const baseWithoutAttrs = removeInlineAttributes(block.string || "", removalKeys);
      const initialTaskText = baseWithoutAttrs.replace(/^\{\{\[\[(?:TODO|DONE)\]\]\}\}\s*/i, "").trim();
      const promptResult = await promptForRepeatAndDue({
        includeTaskText: true,
        forceTaskInput: true,
        taskText: initialTaskText,
        repeat: props.repeat || childRepeatEntry?.value || inlineRepeatVal || "",
        due: props.due || childDueEntry?.value || inlineDueVal || "",
        start: props.start || childStartEntry?.value || inlineStartVal || "",
        defer: props.defer || childDeferEntry?.value || inlineDeferVal || "",
      });
      if (!promptResult) return;

      const set = S(attrNames);
      const normalizedRepeat =
        promptResult.repeat ? normalizeRepeatRuleText(promptResult.repeat) || promptResult.repeat : "";
      if (normalizedRepeat && !parseRuleText(normalizedRepeat, set)) {
        toast(t(["toasts", "unableUnderstandRepeat"], getLanguageSetting()) || "Unable to understand that repeat rule.");
        return;
      }

      let dueDate = null;
      let dueStr = null;
      const promptDueSource = promptResult.due || "";
      if (promptDueSource) {
        dueDate =
          promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
            ? new Date(promptResult.dueDate.getTime())
            : parseRoamDate(promptDueSource);
        if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
          toast(t(["toasts", "cannotParseDue"], getLanguageSetting()) || "Couldn't parse that due date.");
          return;
        }
        dueStr = formatDate(dueDate, set);
      }

      const startSourceFromPrompt = promptResult.start || "";
      const startFallbackSource = props.start || childStartEntry?.value || inlineStartVal || "";
      const startSource = startSourceFromPrompt || startFallbackSource;
      let startDate = null;
      let startStr = null;
      if (startSource) {
        startDate =
          promptResult.startDate instanceof Date && startSourceFromPrompt
            ? new Date(promptResult.startDate.getTime())
            : parseRoamDate(startSource);
        if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
          toast(t(["toasts", "cannotParseStart"], getLanguageSetting()) || "Couldn't parse that start date.");
          return;
        }
        startStr = formatDate(startDate, set);
      }

      const deferSourceFromPrompt = promptResult.defer || "";
      const deferFallbackSource = props.defer || childDeferEntry?.value || inlineDeferVal || "";
      const deferSource = deferSourceFromPrompt || deferFallbackSource;
      let deferDate = null;
      let deferStr = null;
      if (deferSource) {
        deferDate =
          promptResult.deferDate instanceof Date && deferSourceFromPrompt
            ? new Date(promptResult.deferDate.getTime())
            : parseRoamDate(deferSource);
        if (!(deferDate instanceof Date) || Number.isNaN(deferDate.getTime())) {
          toast(t(["toasts", "cannotParseDefer"], getLanguageSetting()) || "Couldn't parse that defer date.");
          return;
        }
        deferStr = formatDate(deferDate, set);
      }

      const hasRepeat = !!normalizedRepeat;
      const hasTimingInput = !!(dueStr || startStr || deferStr);
      const hasMetadataInput = !!(
        (promptResult.project || "").trim() ||
        (promptResult.waitingFor || "").trim() ||
        (promptResult.context || "").trim() ||
        (promptResult.priority || "").trim() ||
        (promptResult.energy || "").trim() ||
        (promptResult.gtd || "").trim()
      );
      if (!hasRepeat && !hasTimingInput && !hasMetadataInput) {
        toast(
          t(["toasts", "addRepeatDateOrMetadata"], getLanguageSetting()) ||
            "Add a repeat rule, a date, or metadata."
        );
        return;
      }

      const taskTextInput =
        typeof promptResult.taskText === "string" && promptResult.taskText
          ? promptResult.taskText
          : typeof promptResult.taskTextRaw === "string" && promptResult.taskTextRaw
            ? promptResult.taskTextRaw
            : initialTaskText;
      const cleanedTaskText = removeInlineAttributes(taskTextInput || "", removalKeys).trim();
      const todoString = normalizeToTodoMacro(cleanedTaskText);
      if (todoString !== (block.string || "")) {
        await updateBlockString(fuid, todoString);
      }

      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;

      await updateBlockProps(fuid, { rt: rtProps });

      if (hasRepeat) await ensureChildAttrForType(fuid, "repeat", normalizedRepeat, set.attrNames);
      else await removeChildAttrsForType(fuid, "repeat", set.attrNames);
      if (dueStr) await ensureChildAttrForType(fuid, "due", dueStr, set.attrNames);
      else await removeChildAttrsForType(fuid, "due", set.attrNames);
      if (startStr) await ensureChildAttrForType(fuid, "start", startStr, set.attrNames);
      else await removeChildAttrsForType(fuid, "start", set.attrNames);
      if (deferStr) await ensureChildAttrForType(fuid, "defer", deferStr, set.attrNames);
      else await removeChildAttrsForType(fuid, "defer", set.attrNames);
      if (hasMetadataInput) {
        await applyMetadataFromPrompt(fuid, promptResult, set.attrNames);
      }

      repeatOverrides.delete(fuid);
      const createdMsg = t(["toasts", "createdRecurring"], getLanguageSetting()) || "Created your Better Task";
      toast(createdMsg);
      scheduleSurfaceSync(set.attributeSurface);
    }

    async function createTaskFromParsedJson(blockUid, parsed, rawInput = "") {
      if (!blockUid || !parsed) return false;
      const block = await getBlock(blockUid);
      if (!block) return false;
      const baseTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
      if (!baseTitle) return false;
      const cleanedTitle = stripSchedulingFromTitle(baseTitle, parsed);
      const attrNames = resolveAttributeNames();
      const set = S(attrNames);

      const todoString = normalizeToTodoMacro(cleanedTitle);
      if (todoString !== (block.string || "")) {
        await updateBlockString(blockUid, todoString);
      }

      let repeatVal = "";
      if (typeof parsed.repeatRule === "string" && parsed.repeatRule.trim()) {
        const normalizedRepeat = normalizeRepeatRuleText(parsed.repeatRule) || parsed.repeatRule.trim();
        if (parseRuleText(normalizedRepeat, set)) {
          repeatVal = normalizedRepeat;
        } else {
          console.warn("[BetterTasks] AI repeat rule invalid, ignoring", normalizedRepeat);
        }
      }

      const parseAndFormatDate = (value) => {
        if (typeof value !== "string" || !value.trim()) return null;
        const original = value.trim();
        const cleaned = stripTimeFromDateText(original);
        let dt = parseRoamDate(cleaned) || parseRelativeDateText(cleaned, set.weekStartCode);
        if (!dt && hasTimeOnlyHint(original)) {
          dt = pickAnchorDateFromTimeHint(original, set);
        }
        if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
        return formatDate(dt, set);
      };

      const weekendSpan = parseWeekendSpan(parsed.dueDateText || parsed.startDateText || "", set);
      const weekSpan = parseWeekSpan(parsed.dueDateText || parsed.startDateText || "", set);

      const dueStr =
        (weekendSpan?.due ? formatDate(weekendSpan.due, set) : null) ||
        (weekSpan?.due ? formatDate(weekSpan.due, set) : null) ||
        parseAndFormatDate(parsed.dueDateText);
      const startStr =
        (weekendSpan?.start ? formatDate(weekendSpan.start, set) : null) ||
        (weekSpan?.start ? formatDate(weekSpan.start, set) : null) ||
        parseAndFormatDate(parsed.startDateText);
      const deferStr = parseAndFormatDate(parsed.deferDateText);

      const props = parseProps(block.props);
      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;
      await updateBlockProps(blockUid, { rt: rtProps });

      if (repeatVal) await ensureChildAttrForType(blockUid, "repeat", repeatVal, set.attrNames);
      else await removeChildAttrsForType(blockUid, "repeat", set.attrNames);
      if (dueStr) await ensureChildAttrForType(blockUid, "due", dueStr, set.attrNames);
      else await removeChildAttrsForType(blockUid, "due", set.attrNames);
      if (startStr) await ensureChildAttrForType(blockUid, "start", startStr, set.attrNames);
      else await removeChildAttrsForType(blockUid, "start", set.attrNames);
      if (deferStr) await ensureChildAttrForType(blockUid, "defer", deferStr, set.attrNames);
      else await removeChildAttrsForType(blockUid, "defer", set.attrNames);
      const hasAiMeta = !!(
        (parsed.project || "").trim() ||
        (parsed.context || "").trim() ||
        (parsed.priority || "").trim() ||
        (parsed.energy || "").trim()
      );
      if (hasAiMeta) {
        await applyMetadataFromPrompt(
          blockUid,
          {
            project: parsed.project || "",
            context: parsed.context || "",
            priority: parsed.priority || "",
            energy: parsed.energy || "",
          },
          set.attrNames
        );
      }

      repeatOverrides.delete(blockUid);
      scheduleSurfaceSync(set.attributeSurface);
      return true;
    }

    function getWeekStartSetting() {
      const raw = extensionAPI.settings.get("rt-week-start");
      if (typeof raw === "string" && WEEK_START_OPTIONS.includes(raw)) return raw;
      return "Monday";
    }

    function enforceChildAttrSurface(api = extensionAPI) {
      try {
        const stored = api?.settings?.get("rt-attribute-surface");
        if (stored !== "Child") {
          api?.settings?.set("rt-attribute-surface", "Child");
        }
      } catch (err) {
        console.warn("[RecurringTasks] failed to enforce Child attribute surface", err);
      }
      return "Child";
    }

    function S(attrNamesOverride = null) {
      const attrSurface = enforceChildAttrSurface(extensionAPI);
      if (attrSurface !== lastAttrSurface) {
        lastAttrSurface = attrSurface;
        scheduleSurfaceSync(attrSurface);
      }
      const attrNames = attrNamesOverride || resolveAttributeNames();
      lastAttrNames = attrNames;
      let tz = "UTC";
      const langSetting = getLanguageSetting();
      let locale = langSetting === "en" ? "en-US" : langSetting;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch (_) {
        tz = "UTC";
      }
      try {
        locale =
          langSetting ||
          (typeof navigator !== "undefined" && navigator.language) ||
          Intl.DateTimeFormat().resolvedOptions().locale ||
          "en-US";
      } catch (_) {
        locale = "en-US";
      }
      const weekStartLabel = getWeekStartSetting();
      const weekStartCode = dowFromAlias(weekStartLabel) || "MO";
      return {
        destination: extensionAPI.settings.get("rt-destination") || "DNP",
        dnpHeading: extensionAPI.settings.get("rt-dnp-heading") || "Tasks",
        dateFormat: "ROAM",
        advanceFrom: "due",
        attributeSurface: attrSurface,
        confirmBeforeSpawn: !!extensionAPI.settings.get("rt-confirm"),
        timezone: tz,
        locale,
        attrNames,
        weekStart: weekStartLabel,
        weekStartCode,
      };
    }

    function getAiSettings() {
      const modeRaw = extensionAPI.settings.get(AI_MODE_SETTING);
      const mode = AI_MODE_OPTIONS.includes(modeRaw) ? modeRaw : "Off";
      const keyRaw = extensionAPI.settings.get(AI_KEY_SETTING);
      const apiKey = typeof keyRaw === "string" ? keyRaw.trim() : "";
      return { mode, apiKey };
    }

    function isAiEnabled(aiSettings) {
      return aiSettings?.mode === "Use my OpenAI key" && !!aiSettings.apiKey;
    }

    async function parseTaskWithOpenAI(input, aiSettings, options = {}) {
      if (!isAiEnabled(aiSettings)) return { ok: false, reason: "disabled" };
      const AI_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
      const AI_RETRY_MAX = 2;
      const AI_RETRY_BASE_MS = 400;
      const signal = options?.signal || null;
      const payload = {
        model: AI_MODEL,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: input },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
      };
      // console.info("[BetterTasks] OpenAI request", {
      //   model: payload.model,
      //   messages: payload.messages?.map((m) => ({
      //     role: m.role,
      //     contentLength: m.content?.length,
      //     content: m.content,
      //   })),
      //   messageCount: payload.messages?.length,
      //   userLength: input?.length,
      //   response_format: payload.response_format,
      //   max_tokens: payload.max_tokens,
      // });
      let response = null;
      let lastError = null;
      try {
        for (let attempt = 0; attempt <= AI_RETRY_MAX; attempt += 1) {
          try {
            if (signal?.aborted) {
              return { ok: false, reason: "aborted" };
            }
            response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${aiSettings.apiKey}`,
              },
              body: JSON.stringify(payload),
              signal: signal || undefined,
            });
          } catch (err) {
            if (err?.name === "AbortError") {
              return { ok: false, reason: "aborted" };
            }
            lastError = err;
            if (attempt < AI_RETRY_MAX) {
              try {
                await delayWithSignal(AI_RETRY_BASE_MS * Math.pow(2, attempt), signal);
              } catch (delayErr) {
                if (delayErr?.name === "AbortError") {
                  return { ok: false, reason: "aborted" };
                }
              }
              continue;
            }
            throw err;
          }
          if (!response || response.ok) break;
          if (!AI_RETRY_STATUSES.has(response.status) || attempt >= AI_RETRY_MAX) break;
          let retryDelayMs = AI_RETRY_BASE_MS * Math.pow(2, attempt);
          if (response.status === 429) {
            const retryAfter = response.headers?.get?.("retry-after");
            const retryAfterSec = retryAfter ? parseFloat(retryAfter) : NaN;
            if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
              retryDelayMs = Math.max(retryDelayMs, retryAfterSec * 1000);
            }
          }
          const jitterFactor = 0.8 + Math.random() * 0.4;
          try {
            await delayWithSignal(Math.round(retryDelayMs * jitterFactor), signal);
          } catch (delayErr) {
            if (delayErr?.name === "AbortError") {
              return { ok: false, reason: "aborted" };
            }
          }
        }
      } catch (err) {
        console.warn("[BetterTasks] OpenAI request failed", err);
        return { ok: false, error: err };
      }
      if (!response) {
        return { ok: false, error: lastError || new Error("OpenAI request failed") };
      }
      let responseBodyText = null;
      try {
        responseBodyText = await response.text();
      } catch (err) {
        if (err?.name === "AbortError") {
          return { ok: false, reason: "aborted" };
        }
      }
      let parsedBody = null;
      try {
        parsedBody = responseBodyText ? JSON.parse(responseBodyText) : null;
      } catch (_) {
        // leave parsedBody null
      }
      let parsedContent = null;
      try {
        const contentRaw = parsedBody?.choices?.[0]?.message?.content;
        parsedContent = contentRaw ? JSON.parse(contentRaw) : null;
      } catch (_) {
        parsedContent = null;
      }
      // console.info("[BetterTasks] OpenAI response", {
      //   status: response?.status,
      //   ok: response?.ok,
      //   body: parsedBody ?? responseBodyText,
      //   contentJson: parsedContent,
      // });
      if (!response || !response.ok) {
        let errorText = null;
        let errorJson = null;
        try {
          errorText = responseBodyText;
          errorJson = parsedBody || JSON.parse(errorText || "{}");
        } catch (_) {
          // ignore parse issues
        }
        const message =
          errorJson?.error?.message || errorText || `OpenAI response ${response?.status || "unknown"}`;
        const code = errorJson?.error?.code || errorJson?.error?.type || null;
        return {
          ok: false,
          error: new Error(message),
          status: response?.status,
          code,
        };
      }
      const data = parsedBody;
      if (!data) {
        return { ok: false, error: new Error("Empty response body") };
      }
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        return { ok: false, error: new Error("Empty response") };
      }
      let parsed = null;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return { ok: false, error: err };
      }
      const validated = validateParsedTask(parsed);
      if (!validated.ok) return validated;
      return validated;
    }

    function validateParsedTask(raw) {
      if (!raw || typeof raw !== "object") return { ok: false, error: new Error("Invalid JSON shape") };
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!title) return { ok: false, error: new Error("Missing title") };
      const task = { title };
      if (typeof raw.repeatRule === "string" && raw.repeatRule.trim()) task.repeatRule = raw.repeatRule.trim();
      if (typeof raw.dueDateText === "string" && raw.dueDateText.trim()) task.dueDateText = raw.dueDateText.trim();
      if (typeof raw.startDateText === "string" && raw.startDateText.trim()) task.startDateText = raw.startDateText.trim();
      if (typeof raw.deferDateText === "string" && raw.deferDateText.trim()) task.deferDateText = raw.deferDateText.trim();
      if (typeof raw.project === "string" && raw.project.trim()) task.project = raw.project.trim();
      if (typeof raw.context === "string" && raw.context.trim()) task.context = raw.context.trim();
      const allowedRatings = new Set(["low", "medium", "high"]);
      if (typeof raw.priority === "string" && allowedRatings.has(raw.priority)) task.priority = raw.priority;
      if (raw.priority === null) task.priority = null;
      if (typeof raw.energy === "string" && allowedRatings.has(raw.energy)) task.energy = raw.energy;
      if (raw.energy === null) task.energy = null;
      return { ok: true, task };
    }

    function stripSchedulingFromTitle(title, parsed) {
      const hasRepeat = typeof parsed?.repeatRule === "string" && parsed.repeatRule.trim();
      const hasDate =
        typeof parsed?.dueDateText === "string" && parsed.dueDateText.trim() ||
        typeof parsed?.startDateText === "string" && parsed.startDateText.trim() ||
        typeof parsed?.deferDateText === "string" && parsed.deferDateText.trim();
      let t = (title || "").trim();
      if (!t) return t;
      if (hasRepeat) {
        t = t.replace(/,\s*every\b.+$/i, "").trim();
        t = t.replace(/\bevery\s+.+$/i, "").trim();
        // Only drop bare cadence words when they are effectively trailing schedule hints (optionally with at/on ...)
        t = t.replace(/\b(daily|weekly|monthly|yearly|annually|weekdays|weekends)\b\s*(?:(?:at|on)\b.*)?$/i, "").trim();
      }
      if (hasDate) {
        t = t.replace(/\s*(on|by|due|for)\s+(tomorrow|today|next\s+[a-z]+|this\s+[a-z]+)$/i, "").trim();
        t = t.replace(/\s*(on\s+)?\[\[[^\]]+\]\]\s*$/i, "").trim();
        t = t.replace(/\s*(tomorrow|today|next\s+[a-z]+)$/i, "").trim();
      }
      return t || (title || "").trim();
    }

    const DEBUG_COMPLETION_LOGS =
      (() => {
        try {
          return window.localStorage?.getItem?.("bt-debug-completions") === "1";
        } catch (_) {
          return false;
        }
      })() || false;
    const processedMap = new Map();
    const completionPairs = new Map();
    const completionQueue = new Map();
    let completionQueueTimer = null;
    let completionQueueFlushInFlight = false;
    const COMPLETION_PAIR_WINDOW_MS = 1200;
    const USER_COMPLETION_BYPASS_MS = 2200;
    const COMPLETION_STALE_WINDOW_MS = 60_000;
    const NAV_COMPLETION_BLOCK_MS = 5000;
    const repeatOverrides = new Map();
    const invalidRepeatToasted = new Set();
    const invalidDueToasted = new Set();
    const deletingChildAttrs = new Set();
    const childAttrLocks = new Map();
    let pageLoadQuietUntil = 0;
    let lastNavigationAt = Date.now();
    let lastUserCheckboxInteraction = 0;
    const PAGE_COMPLETION_GRACE_MS = 1800;

    function normalizeOverrideEntry(entry) {
      if (!entry) return null;
      if (typeof entry === "string") {
        const normalized = normalizeRepeatRuleText(entry) || entry;
        return normalized ? { repeat: normalized } : null;
      }
      if (typeof entry === "object") {
        const out = {};
        if (typeof entry.repeat === "string" && entry.repeat) {
          out.repeat = normalizeRepeatRuleText(entry.repeat) || entry.repeat;
        }
        if (entry.due instanceof Date && !Number.isNaN(entry.due.getTime())) {
          out.due = entry.due;
        }
        return Object.keys(out).length ? out : null;
      }
      return null;
    }

    function mergeRepeatOverride(uid, patch) {
      if (!uid || !patch) return;
      const current = normalizeOverrideEntry(repeatOverrides.get(uid)) || {};
      const next = { ...current };
      if (typeof patch.repeat === "string" && patch.repeat) {
        next.repeat = normalizeRepeatRuleText(patch.repeat) || patch.repeat;
      }
      if (patch.due instanceof Date && !Number.isNaN(patch.due.getTime())) {
        next.due = patch.due;
      }
      if (patch.due === null) {
        delete next.due;
      }
      if (!next.repeat && !next.due) {
        repeatOverrides.delete(uid);
        return;
      }
      repeatOverrides.set(uid, next);
    }

    function captureBlockLocation(block) {
      const parents = Array.isArray(block?.parents) ? block.parents : [];
      const parentUid = parents.length ? parents[0]?.uid : block?.page?.uid || null;
      const order = typeof block?.order === "number" ? block.order : 0;
      return { parentUid, order };
    }

    function prepareDueChangeContext(block, meta, set) {
      const props = parseProps(block?.props);
      const inlineAttrs = parseAttrsFromBlockText(block?.string || "");
      const location = captureBlockLocation(block);
      const childMap = meta?.childAttrMap || {};
      const attrNames = set?.attrNames || resolveAttributeNames();
      const attrSurface = set?.attributeSurface || "Child";
      const dueInfo = pickChildAttr(childMap, attrNames.dueAliases, { allowFallback: false }) || null;
      const repeatInfo = pickChildAttr(childMap, attrNames.repeatAliases, { allowFallback: false }) || null;
      const inlineDueValue = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineRepeatValue = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const snapshot = captureBlockSnapshot(block);
      const previousDueDate =
        meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? new Date(meta.due.getTime()) : null;
      const previousDueStr =
        typeof props?.due === "string"
          ? props.due
          : previousDueDate
            ? formatDate(previousDueDate, set)
            : null;
      return {
        previousDueDate,
        previousDueStr,
        previousInlineDue: inlineDueValue || null,
        hadInlineDue: inlineDueValue != null,
        previousChildDue: dueInfo?.value || null,
        hadChildDue: !!dueInfo,
        previousChildDueUid: dueInfo?.uid || null,
        previousChildRepeat: repeatInfo?.value || null,
        previousChildRepeatUid: repeatInfo?.uid || null,
        previousParentUid: location.parentUid,
        previousOrder: location.order,
        previousProps: props && typeof props === "object" ? clonePlain(props) : {},
        previousInlineRepeat: inlineRepeatValue || null,
        hadInlineRepeat: inlineRepeatValue != null,
        snapshot,
      };
    }

    const dueUndoRegistry = new Map();

    function registerDueUndoAction(payload) {
      if (!payload?.blockUid) return;
      dueUndoRegistry.set(payload.blockUid, payload);
      iziToast.show({
        theme: "light",
        color: "black",
        class: "betterTasks bt-toast-strong-icon",
        position: "center",
        timeout: 5000,
        icon: "icon-check",
        iconText: "✓",
        iconColor: "#1f7a34",
        close: true,
        closeOnEscape: true,
        closeOnClick: false,
        message: translateString(payload.message || "Due updated", getLanguageSetting()),
        buttons: [
          [
            `<button>${escapeHtml(t(["buttons", "undo"], getLanguageSetting()) || "Undo")}</button>`,
            (instance, toastEl) => {
              instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
              performDueUndo(payload).catch((err) => console.error("[RecurringTasks] due undo failed", err));
            },
            true,
          ],
        ],
        onOpening: (_instance, toastEl) => {
          applyToastA11y(toastEl);
        },
        onClosed: () => {
          dueUndoRegistry.delete(payload.blockUid);
        },
      });
    }

    async function performDueUndo(payload) {
      if (!payload?.blockUid) return;
      dueUndoRegistry.delete(payload.blockUid);
      const uid = payload.blockUid;
      repeatOverrides.delete(uid);
      const set = payload.setSnapshot || S();
      const snapshot = payload.snapshot || null;
      try {
        // Move back before restoring metadata so child updates apply under the correct parent
        if (payload.wasMoved && payload.previousParentUid && payload.previousParentUid !== payload.newParentUid) {
          try {
            const order = payload.previousOrder != null ? payload.previousOrder : 0;
            await window.roamAlphaAPI.moveBlock({
              location: { "parent-uid": payload.previousParentUid, order },
              block: { uid },
            });
          } catch (err) {
            console.warn("[RecurringTasks] undo move failed", err);
          }
        }
        let block = await getBlock(uid);

        if (snapshot) {
          if (typeof snapshot.string === "string" && block?.string !== snapshot.string) {
            await updateBlockString(uid, snapshot.string);
            block = await getBlock(uid);
          }
          await setBlockProps(uid, snapshot.props || {});
          block = await getBlock(uid);

          // Clear current attrs first to avoid duplicates
          await removeChildAttrsForType(uid, "repeat", set.attrNames);
          await removeChildAttrsForType(uid, "due", set.attrNames);
          await removeChildAttr(uid, "rt-processed");
          const childAttrs = snapshot.childAttrs || {};
          if (childAttrs.repeat?.value != null && childAttrs.repeat.value !== "") {
            await ensureChildAttrForType(uid, "repeat", childAttrs.repeat.value, set.attrNames);
          }
          if (childAttrs.due?.value != null && childAttrs.due.value !== "") {
            await ensureChildAttrForType(uid, "due", childAttrs.due.value, set.attrNames);
          }
          if (childAttrs["rt-processed"]?.value != null && childAttrs["rt-processed"].value !== "") {
            await ensureChildAttr(uid, "rt-processed", childAttrs["rt-processed"].value);
          }
        } else {
          const propsUpdate = {};
          if (payload.previousDueStr) propsUpdate.due = payload.previousDueStr;
          else propsUpdate.due = undefined;
          if (payload.previousInlineRepeat || payload.previousChildRepeat) {
            propsUpdate.repeat = payload.previousInlineRepeat || payload.previousChildRepeat;
          } else {
            propsUpdate.repeat = undefined;
          }
          await updateBlockProps(uid, propsUpdate);
          block = await getBlock(uid);
          if (payload.previousChildRepeat != null) {
            await ensureChildAttrForType(uid, "repeat", payload.previousChildRepeat, set.attrNames);
          } else {
            await removeChildAttrsForType(uid, "repeat", set.attrNames);
          }
          if (payload.hadChildDue && payload.previousChildDue != null) {
            await ensureChildAttrForType(uid, "due", payload.previousChildDue, set.attrNames);
          } else {
            await removeChildAttrsForType(uid, "due", set.attrNames);
          }
          if (snapshot?.childAttrs?.["rt-processed"]?.value != null && snapshot.childAttrs["rt-processed"].value !== "") {
            await ensureChildAttr(uid, "rt-processed", snapshot.childAttrs["rt-processed"].value);
          } else {
            await removeChildAttr(uid, "rt-processed");
          }
        }

        const previousDueDate =
          payload.previousDueDate instanceof Date && !Number.isNaN(payload.previousDueDate.getTime())
            ? new Date(payload.previousDueDate.getTime())
            : null;
        const snapshotRepeat =
          snapshot?.props?.repeat ||
          snapshot?.childAttrs?.repeat?.value ||
          payload.previousInlineRepeat ||
          payload.previousChildRepeat ||
          null;

        const normalizedRepeat =
          snapshotRepeat != null
            ? normalizeRepeatRuleText(snapshotRepeat) || snapshotRepeat
            : payload.previousInlineRepeat != null
              ? normalizeRepeatRuleText(payload.previousInlineRepeat) || payload.previousInlineRepeat
              : payload.previousChildRepeat != null
                ? normalizeRepeatRuleText(payload.previousChildRepeat) || payload.previousChildRepeat
                : undefined;
        const restoreDueStr =
          payload.previousDueStr != null
            ? payload.previousDueStr
            : previousDueDate
              ? formatDate(previousDueDate, set)
              : undefined;
        const restoreDueDate = restoreDueStr ? parseRoamDate(restoreDueStr) || previousDueDate : previousDueDate;

        const overridePatch = {};
        if (normalizedRepeat) overridePatch.repeat = normalizedRepeat;
        if (restoreDueStr !== undefined) {
          if (restoreDueDate instanceof Date && !Number.isNaN(restoreDueDate.getTime())) {
            overridePatch.due = restoreDueDate;
          } else {
            overridePatch.due = null;
          }
        }

        if (Object.keys(overridePatch).length) {
          mergeRepeatOverride(uid, overridePatch);
        } else {
          repeatOverrides.delete(uid);
        }

        toast(t(["toasts", "undoSuccess"], getLanguageSetting()) || "Changes un-done successfully");
      } catch (err) {
        console.warn("[RecurringTasks] due undo error", err);
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    function isValidDateValue(value) {
      return value instanceof Date && !Number.isNaN(value.getTime());
    }

    function pickPlacementDate(candidates = {}) {
      if (!candidates || typeof candidates !== "object") return null;
      const { start, due, defer } = candidates;
      if (isValidDateValue(start)) return start;
      if (isValidDateValue(due)) return due;
      if (isValidDateValue(defer)) return defer;
      return null;
    }

    async function ensureTargetReady(anchorDate, prevBlock, set) {
      let uid = null;
      try {
        uid = await chooseTargetPageUid(anchorDate, prevBlock, set);
      } catch (err) {
        console.warn("[RecurringTasks] choose target failed (initial)", err);
      }
      if (!uid) return null;
      // Wait for Roam's DB/index to see the newly created page/heading
      for (let i = 0; i < 5; i++) {
        const exists = await getBlock(uid);
        if (exists) return uid;
        await delay(60 * (i + 1)); // 60ms, 120ms, 180ms, ...
      }
      // Last resort: explicitly (re)create the expected target
      try {
        if (set.destination === "DNP under heading" && set.dnpHeading) {
          const dnpTitle = toDnpTitle(anchorDate);
          const dnpUid = await getOrCreatePageUid(dnpTitle);
          uid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
        } else if (set.destination !== "Same Page") {
          const dnpTitle = toDnpTitle(anchorDate);
          uid = await getOrCreatePageUid(dnpTitle);
        }
      } catch (err) {
        console.warn("[RecurringTasks] ensureTargetReady fallback failed", err);
      }
      return uid;
    }

    async function relocateBlockForPlacement(block, candidates, set) {
      const locationBefore = captureBlockLocation(block);
      const result = {
        moved: false,
        targetUid: locationBefore.parentUid,
        previousParentUid: locationBefore.parentUid,
        previousOrder: locationBefore.order,
      };
      if (!block || !set) return result;
      const anchorDate = pickPlacementDate(candidates);
      if (!anchorDate) return result;
      let targetUid = locationBefore.parentUid;
      if (set.destination !== "Same Page") {
        targetUid = await ensureTargetReady(anchorDate, block, set);
      }
      if (targetUid) result.targetUid = targetUid;
      if (targetUid && targetUid !== locationBefore.parentUid) {
        try {
          await window.roamAlphaAPI.moveBlock({
            location: { "parent-uid": targetUid, order: 0 },
            block: { uid: block.uid },
          });
          result.moved = true;
        } catch (err) {
          console.warn("[RecurringTasks] relocateBlockForPlacement failed", err);
        }
      }
      return result;
    }
    const pendingPillTimers = new Map();

    function clearPendingPillTimer(uid) {
      if (!uid) return;
      const timer = pendingPillTimers.get(uid);
      if (timer) {
        clearTimeout(timer);
        pendingPillTimers.delete(uid);
      }
    }

    function schedulePillRefresh(mainEl, uid = null, delay = 60) {
      if (!mainEl) return;
      const targetUid = uid || findBlockUidFromElement(mainEl);
      if (!targetUid) return;
      clearPendingPillTimer(targetUid);
      const timer = setTimeout(() => {
        pendingPillTimers.delete(targetUid);
        void decorateBlockPills(mainEl);
      }, delay);
      pendingPillTimers.set(targetUid, timer);
    }

    function findMainForChildrenContainer(childrenEl) {
      if (!childrenEl) return null;
      const prev = childrenEl.previousElementSibling;
      if (prev?.classList?.contains("rm-block-main")) {
        return prev;
      }
      const container = childrenEl.closest?.(".roam-block-container, .roam-block");
      if (!container) return null;
      return (
        container.querySelector?.(":scope > .rm-block-main") ||
        container.querySelector?.(".rm-block-main") ||
        null
      );
    }
    const childEditDebounce = new Map();
    let observer = null;
    let observerReinitTimer = null;
    let lastSweep = 0;
    let lastAttrSurface = null;
    let pendingSurfaceSync = null;

    lastAttrSurface = enforceChildAttrSurface(extensionAPI);
    void syncPillsForSurface(lastAttrSurface);
    initiateObserver();
    window.addEventListener("hashchange", handleHashChange);

    delete window.roamAlphaAPI?.__rtWrapped;

    // === Child -> Props sync listeners (only used when attribute surface is "Child")
    const _handleAnyEdit = handleAnyEdit.bind(null);
    document.addEventListener("input", _handleAnyEdit, true);
    document.addEventListener("blur", _handleAnyEdit, true);

    const checkboxInteractionSelectors = ".check-container input, .rm-checkbox input";
    const _onCheckboxPointer = (event) => {
      if (!(event?.target instanceof HTMLElement)) return;
      if (!event.target.matches?.(checkboxInteractionSelectors)) return;
      markUserCheckboxInteraction();
    };
    const _onCheckboxChange = (event) => {
      if (!(event?.target instanceof HTMLElement)) return;
      if (!event.target.matches?.(checkboxInteractionSelectors)) return;
      markUserCheckboxInteraction();
      const host = event.target.closest(".rm-checkbox");
      if (!host) return;
      const uid = deriveUidFromMutationNode(host, null);
      if (!uid) return;
      const checkbox = host.querySelector?.("input[type='checkbox']") || null;
      // Defer to ensure class updates (rm-todo -> rm-done) have been applied
      setTimeout(() => {
        if (!host.classList?.contains("rm-done")) return;
        noteTodoRemoval(uid);
        enqueueCompletion(uid, { checkbox, userInitiated: true, detectedAt: Date.now() });
      }, 0);
    };
    const _onCmdEnterKey = (event) => {
      const isCmdEnter = (event.metaKey || event.ctrlKey) && event.key === "Enter";
      if (!isCmdEnter) return;
      if (!(event?.target instanceof HTMLElement)) return;
      const host =
        event.target.closest?.(".rm-block-main") ||
        event.target.closest?.(".roam-block-container, .roam-block") ||
        null;
      const initialCheckbox =
        host?.querySelector?.(":scope .rm-checkbox") || host?.querySelector?.(".rm-checkbox") || null;
      const initialChecked = !!initialCheckbox?.querySelector?.("input[type='checkbox']")?.checked;
      const initialDoneClass = !!initialCheckbox?.classList?.contains("rm-done");
      const uid =
        deriveUidFromMutationNode(initialCheckbox || host, host) || findBlockUidFromElement(host);
      if (!uid) return;
      const initialMacroDone = /\{\{\s*\[\[done\]\]\s*\}\}/i.test(event.target.value || host?.textContent || "");
      const initialIsDone = initialChecked || initialDoneClass || initialMacroDone;
      markUserCheckboxInteraction();

      const findCheckbox = () => {
        const container =
          (host && host.isConnected && host) ||
          document.querySelector?.(`.rm-block-main[data-uid='${uid}']`) ||
          document.querySelector?.(`.roam-block[data-uid='${uid}']`) ||
          null;
        const input =
          container?.querySelector?.(":scope .rm-checkbox input[type='checkbox']") ||
          container?.querySelector?.(".rm-checkbox input[type='checkbox']") ||
          null;
        if (!input) return null;
        const checkboxHost = input.closest?.(".rm-checkbox") || null;
        return { input, checkboxHost };
      };

      const attemptEnqueue = (tries = 0) => {
        const found = findCheckbox();
        const checkboxHost = found?.checkboxHost || null;
        const input = found?.input || null;
        const isChecked = input?.checked === true;
        const isDoneClass = checkboxHost?.classList?.contains("rm-done");
        if ((isChecked || isDoneClass) && !initialIsDone) {
          noteTodoRemoval(uid);
          enqueueCompletion(uid, { checkbox: input, userInitiated: true, detectedAt: Date.now() });
          return;
        }
        if (tries < 20) {
          setTimeout(() => attemptEnqueue(tries + 1), 50);
        }
      };

      // Roam flips classes/checked state after the key event; poll briefly for DONE/checked.
      setTimeout(() => attemptEnqueue(0), 20);

      // Fallback: poll the block text for DONE macro in case no checkbox renders (edit mode).
      const pollForDoneMacro = async (tries = 0) => {
        try {
          const block = await getBlock(uid);
          const text = block?.string || "";
          const toggledToDone = /\{\{\s*\[\[done\]\]\s*\}\}/i.test(text);
          if (toggledToDone && !initialIsDone) {
            noteTodoRemoval(uid);
            enqueueCompletion(uid, { checkbox: null, userInitiated: true, detectedAt: Date.now() });
            return;
          }
        } catch (_) {
          // ignore read failures
        }
        if (tries < 10) {
          setTimeout(() => pollForDoneMacro(tries + 1), 80);
        }
      };
      setTimeout(() => pollForDoneMacro(0), 60);
    };
    document.addEventListener("pointerdown", _onCheckboxPointer, true);
    document.addEventListener("change", _onCheckboxChange, true);
    document.addEventListener("keydown", _onCmdEnterKey, true);

    function normalizeUid(raw) {
      if (!raw) return null;
      const trimmed = String(raw).trim();
      if (!trimmed) return null;
      if (/^[A-Za-z0-9_-]{9}$/.test(trimmed)) return trimmed;

      if (trimmed.includes("/")) {
        const segment = trimmed.split("/").filter(Boolean).pop();
        const attempt = normalizeUid(segment);
        if (attempt) return attempt;
      }

      const tailMatch = trimmed.match(/[A-Za-z0-9_-]{9}$/);
      if (tailMatch) return tailMatch[0];
      return trimmed;
    }

    function findBlockUidFromCheckbox(input) {
      if (!input) return null;

      const candidates = [
        input.closest?.("[data-uid]"),
        input.closest?.(".roam-block"),
        input.closest?.(".rm-block-main"),
        input.closest?.(".roam-block-container"),
        input.closest?.(".roam-block-container > .roam-block"),
      ];

      for (const el of candidates) {
        if (!el) continue;
        const dataUid = normalizeUid(el.getAttribute?.("data-uid") || el.dataset?.uid);
        if (dataUid) return dataUid;
        const id = el.id || "";
        if (id.startsWith("block-input-")) return normalizeUid(id.slice("block-input-".length));
        if (id.startsWith("block-")) return normalizeUid(id.slice("block-".length));
      }

      const roamBlock = input.closest?.(".roam-block");
      const path = normalizeUid(roamBlock?.getAttribute?.("data-path"));
      if (path) {
        return path;
      }

      const domUtil = window.roamAlphaAPI?.util?.dom;
      if (domUtil) {
        try {
          if (typeof domUtil.elToUid === "function") {
            const uid = normalizeUid(domUtil.elToUid(input));
            if (uid) return uid;
          }
          if (typeof domUtil.blockUidFromTarget === "function") {
            const uid = normalizeUid(domUtil.blockUidFromTarget(input));
            if (uid) return uid;
          }
        } catch (err) {
          console.warn("[RecurringTasks] Failed to derive UID via dom util", err);
        }
      }

      return null;
    }

    function findBlockUidFromElement(el) {
      if (!el) return null;

      const direct = normalizeUid(el.getAttribute?.("data-uid") || el.dataset?.uid);
      if (direct) return direct;

      const withData = el.closest?.("[data-uid]");
      if (withData) {
        const cand = normalizeUid(withData.getAttribute?.("data-uid") || withData.dataset?.uid);
        if (cand) return cand;
      }

      const id = el.id || "";
      if (id.startsWith("block-input-")) return normalizeUid(id.slice("block-input-".length));
      if (id.startsWith("block-")) return normalizeUid(id.slice("block-".length));

      const blockInput =
        el.querySelector?.("[id^='block-input-']") || el.closest?.("[id^='block-input-']");
      if (blockInput) {
        const extracted = normalizeUid(blockInput.id.replace(/^block-input-/, ""));
        if (extracted) return extracted;
      }

      const roamBlock = el.closest?.(".roam-block") || el.querySelector?.(".roam-block");
      if (roamBlock) {
        const cand = normalizeUid(roamBlock.getAttribute?.("data-uid") || roamBlock.dataset?.uid);
        if (cand) return cand;
      }

      const domUtil = window.roamAlphaAPI?.util?.dom;
      if (domUtil) {
        try {
          if (typeof domUtil.elToUid === "function") {
            const cand = normalizeUid(domUtil.elToUid(el));
            if (cand) return cand;
          }
          if (typeof domUtil.blockUidFromTarget === "function") {
            const cand = normalizeUid(domUtil.blockUidFromTarget(el));
            if (cand) return cand;
          }
        } catch (err) {
          console.warn("[RecurringTasks] Failed to derive UID from element", err);
        }
      }

      return null;
    }

    function findCheckboxInNode(node, selector) {
      if (!(node instanceof HTMLElement)) return null;
      if (node.matches?.(selector)) return node;
      return node.querySelector?.(selector) || null;
    }

    function logCompletionDebug(event, payload = {}) {
      if (!DEBUG_COMPLETION_LOGS) return;
      try {
        console.log(`[BT Completion] ${event}`, payload);
      } catch (_) {
        // ignore logging failures
      }
    }

    function markUserCheckboxInteraction() {
      lastUserCheckboxInteraction = Date.now();
      logCompletionDebug("user-checkbox-interaction", { at: lastUserCheckboxInteraction });
    }

    function deriveUidFromMutationNode(node, fallbackTarget) {
      const checkboxInput =
        node instanceof HTMLElement
          ? node.matches?.("input[type='checkbox']") && node
            ? node
            : node.querySelector?.("input[type='checkbox']")
          : null;
      if (checkboxInput) {
        const uidFromCheckbox = findBlockUidFromCheckbox(checkboxInput);
        if (uidFromCheckbox) return uidFromCheckbox;
      }
      if (node instanceof HTMLElement) {
        const uidFromNode = findBlockUidFromElement(node);
        if (uidFromNode) return uidFromNode;
      }
      if (fallbackTarget instanceof HTMLElement) {
        const uidFromTarget = findBlockUidFromElement(fallbackTarget);
        if (uidFromTarget) return uidFromTarget;
      }
      return null;
    }

    function noteTodoRemoval(uid) {
      if (!uid) return;
      const now = Date.now();
      const recentClick = now - lastUserCheckboxInteraction <= USER_COMPLETION_BYPASS_MS;
      if (now < pageLoadQuietUntil && !recentClick) {
        logCompletionDebug("skip-todo-removal-quiet", {
          uid,
          now,
          quietUntil: pageLoadQuietUntil,
          recentClick,
          lastUserCheckboxInteraction,
        });
        return;
      }
      const entry = completionPairs.get(uid) || {};
      completionPairs.set(uid, { ...entry, removedAt: now });
      logCompletionDebug("todo-removed", { uid, removedAt: now });
    }

    function noteDoneAddition(uid, checkbox) {
      if (!uid) return;
      const now = Date.now();
      const recentClick = now - lastUserCheckboxInteraction <= USER_COMPLETION_BYPASS_MS;
      const entry = completionPairs.get(uid) || {};
      const pairedRemoval =
        entry.removedAt && now - entry.removedAt <= COMPLETION_PAIR_WINDOW_MS;
      const userInitiated = recentClick;
      if (now < pageLoadQuietUntil && !userInitiated) {
        logCompletionDebug("skip-done-add-quiet", {
          uid,
          now,
          quietUntil: pageLoadQuietUntil,
          recentClick,
          lastUserCheckboxInteraction,
        });
        return;
      }
      if (entry.removedAt && now - entry.removedAt <= COMPLETION_PAIR_WINDOW_MS) {
        completionPairs.delete(uid);
        logCompletionDebug("done-added-paired", { uid, removedAt: entry.removedAt, addedAt: now });
        enqueueCompletion(uid, { checkbox, userInitiated, detectedAt: now });
        return;
      }
      completionPairs.set(uid, { ...entry, addedAt: now, userInitiated });
      logCompletionDebug("done-added-no-pair", { uid, addedAt: now, userInitiated });
    }

    function enqueueCompletion(uid, options = {}) {
      if (!uid) return;
      completionQueue.set(uid, options);
      if (!completionQueueTimer && !completionQueueFlushInFlight) {
        completionQueueTimer = setTimeout(flushCompletionQueue, 0);
      }
      logCompletionDebug("enqueue-completion", { uid, queueSize: completionQueue.size });
    }

    async function flushCompletionQueue() {
      completionQueueTimer = null;
      if (completionQueueFlushInFlight) return;
      completionQueueFlushInFlight = true;
      try {
        logCompletionDebug("flush-queue-start", { size: completionQueue.size });
        while (completionQueue.size > 0) {
          const entries = Array.from(completionQueue.entries());
          completionQueue.clear();
          for (const [uid, opts] of entries) {
            try {
              await processTaskCompletion(uid, opts);
            } catch (err) {
              console.error("[RecurringTasks] completion handling failed", err);
              logCompletionDebug("flush-queue-error", { uid, error: err?.message });
            }
          }
        }
      } finally {
        completionQueueFlushInFlight = false;
        if (completionQueue.size > 0 && !completionQueueTimer) {
          completionQueueTimer = setTimeout(flushCompletionQueue, 0);
        }
        logCompletionDebug("flush-queue-finish");
      }
    }

    function sweepCompletionPairs(now = Date.now()) {
      for (const [uid, entry] of completionPairs) {
        const { removedAt, addedAt } = entry || {};
        if (
          (removedAt && now - removedAt > COMPLETION_PAIR_WINDOW_MS) ||
          (addedAt && now - addedAt > COMPLETION_PAIR_WINDOW_MS)
        ) {
          completionPairs.delete(uid);
          logCompletionDebug("pair-expired", { uid, removedAt, addedAt, now });
        }
      }
    }

    function disconnectObserver() {
      if (!observer) return;
      try {
        observer.disconnect();
      } catch (_) {
        // Ignore disconnect errors
      }
      observer = null;
    }

    function scheduleObserverRestart(delay = 200) {
      if (observerReinitTimer) clearTimeout(observerReinitTimer);
      observerReinitTimer = setTimeout(() => {
        initiateObserver();
      }, delay);
    }

    function handleHashChange() {
      disconnectObserver();
      lastNavigationAt = Date.now();
      pageLoadQuietUntil = lastNavigationAt + PAGE_COMPLETION_GRACE_MS;
      logCompletionDebug("hashchange", {
        quietUntil: pageLoadQuietUntil,
        graceMs: PAGE_COMPLETION_GRACE_MS,
        navigationAt: lastNavigationAt,
      });
      scheduleObserverRestart();
    }

    if (typeof window !== "undefined") {
      try {
        window.__RecurringTasksCleanup?.();
      } catch (_) {
        // ignore cleanup errors from previous runs
      }
      window.__RecurringTasksCleanup = () => {
        window.removeEventListener("hashchange", handleHashChange);
        if (observerReinitTimer) {
          clearTimeout(observerReinitTimer);
          observerReinitTimer = null;
        }
        if (pendingSurfaceSync) {
          clearTimeout(pendingSurfaceSync);
          pendingSurfaceSync = null;
        }
        for (const timer of pendingPillTimers.values()) {
          clearTimeout(timer);
        }
        pendingPillTimers.clear();
        // remove child->props listeners
        document.removeEventListener("input", _handleAnyEdit, true);
        document.removeEventListener("blur", _handleAnyEdit, true);
        document.removeEventListener("pointerdown", _onCheckboxPointer, true);
        document.removeEventListener("change", _onCheckboxChange, true);
        document.removeEventListener("keydown", _onCmdEnterKey, true);
        detachPillEventDelegation();
        clearAllPills();
        disconnectObserver();
      };
    }

    function initiateObserver() {
      disconnectObserver();
      // Targets: main + right sidebar
      if (typeof document === "undefined") return;
      const targetNode1 = document?.getElementsByClassName
        ? document.getElementsByClassName("roam-main")[0]
        : null;
      const targetNode2 = document?.getElementById ? document.getElementById("right-sidebar") : null;
      if (!targetNode1 && !targetNode2) return;

      lastNavigationAt = Date.now();
      pageLoadQuietUntil = lastNavigationAt + PAGE_COMPLETION_GRACE_MS;
      logCompletionDebug("observer-init", {
        quietUntil: pageLoadQuietUntil,
        graceMs: PAGE_COMPLETION_GRACE_MS,
        navigationAt: lastNavigationAt,
      });

      const obsConfig = {
        attributes: true,
        attributeFilter: ["class", "open", "aria-expanded"],
        attributeOldValue: true,
        childList: true,
        subtree: true,
      };
      const handleMutations = function (mutationsList) {
        const isBtPillMutationNode = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          if (node.classList?.contains("rt-pill-wrap")) return true;
          return !!node.closest?.(".rt-pill-wrap");
        };
        let shouldBatchRefreshPills = false;
        for (const mutation of mutationsList) {
          if (mutation.type === "attributes") {
            const target = mutation.target;
            if (!(target instanceof HTMLElement)) {
              continue;
            }
            // Ignore attribute churn caused by Better Tasks pill DOM itself.
            if (isBtPillMutationNode(target)) continue;
            const attrName = mutation.attributeName;
            if (attrName === "class" && target.classList?.contains("rm-checkbox")) {
              const wasTodo = (mutation.oldValue || "").includes("rm-todo");
              const isDone = target.classList.contains("rm-done");
              if (wasTodo && isDone) {
                const uid = deriveUidFromMutationNode(target, null);
                if (uid) {
                  const checkbox = target.querySelector?.("input[type='checkbox']") || null;
                  noteTodoRemoval(uid);
                  enqueueCompletion(uid, { checkbox, userInitiated: true, detectedAt: Date.now() });
                  shouldBatchRefreshPills = true;
                  continue;
                }
              }
            }
            // Avoid hover-driven churn: only refresh pills on expand/collapse-like attribute changes.
            if (attrName !== "open" && attrName !== "aria-expanded") {
              continue;
            }
            let main = null;
            if (target.classList?.contains("rm-block-main")) {
              main = target;
            } else if (target.classList?.contains("roam-block-container") || target.classList?.contains("roam-block")) {
              main = target.querySelector?.(":scope > .rm-block-main") || null;
            } else {
              main = target.closest?.(".rm-block-main") || null;
            }
            if (main) {
              // Debounce UI-driven changes (expand/collapse) so rapid interactions don't thrash.
              schedulePillRefresh(main, null, 240);
            }
            continue;
          }
          const target = mutation.target instanceof HTMLElement ? mutation.target : null;
          // Ignore childList churn caused by Better Tasks pill DOM itself.
          if (target && isBtPillMutationNode(target)) continue;

          if (mutation.removedNodes && mutation.removedNodes.length > 0) {
            for (const node of mutation.removedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              if (isBtPillMutationNode(node)) continue;
              const todoHosts = [];
              if (node.matches?.(".rm-checkbox.rm-todo")) todoHosts.push(node);
              node.querySelectorAll?.(".rm-checkbox.rm-todo")?.forEach((el) => todoHosts.push(el));
              for (const host of todoHosts) {
                const uid = deriveUidFromMutationNode(host, target);
                if (uid) {
                  noteTodoRemoval(uid);
                  shouldBatchRefreshPills = true;
                }
              }
              // New blocks/checkboxes disappearing can invalidate pills.
              if (
                node.matches?.(".rm-block-main, .roam-block-container, .roam-block, .rm-checkbox") ||
                node.querySelector?.(".rm-block-main, .roam-block-container, .roam-block, .rm-checkbox")
              ) {
                shouldBatchRefreshPills = true;
              }
            }
          }

          if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;

          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (isBtPillMutationNode(node)) continue;
            const doneHosts = [];
            if (node.matches?.(".rm-checkbox.rm-done")) doneHosts.push(node);
            node.querySelectorAll?.(".rm-checkbox.rm-done")?.forEach((el) => doneHosts.push(el));

            for (const host of doneHosts) {
              const checkbox = host.querySelector?.("input[type='checkbox']") || null;
              const uid = deriveUidFromMutationNode(host, target);
              if (uid) {
                noteDoneAddition(uid, checkbox);
                shouldBatchRefreshPills = true;
              }
            }
            // New blocks/checkboxes appearing are the main case for pill decoration (scroll/render).
            if (
              node.matches?.(".rm-block-main, .roam-block-container, .roam-block, .rm-checkbox") ||
              node.querySelector?.(".rm-block-main, .roam-block-container, .roam-block, .rm-checkbox")
            ) {
              shouldBatchRefreshPills = true;
            }
          }
        }
        // Batch refresh pills once per mutation batch instead of per node to reduce churn.
        if (shouldBatchRefreshPills) schedulePillRefreshAll(120);

        sweepCompletionPairs();
        sweepProcessed();
      };

      let mutationQueue = [];
      let mutationScheduled = false;
      const flushMutationQueue = () => {
        if (!mutationQueue.length) {
          mutationScheduled = false;
          return;
        }
        const batch = mutationQueue;
        mutationQueue = [];
        mutationScheduled = false;
        handleMutations(batch);
      };

      observer = new MutationObserver((mutationsList) => {
        if (!mutationsList || !mutationsList.length) return;
        mutationQueue.push(...mutationsList);
        if (mutationScheduled) return;
        mutationScheduled = true;
        setTimeout(flushMutationQueue, 0);
      });
      if (targetNode1) observer.observe(targetNode1, obsConfig);
      if (targetNode2) observer.observe(targetNode2, obsConfig);
      const surface = lastAttrSurface || enforceChildAttrSurface(extensionAPI);
      lastAttrSurface = surface;
      void syncPillsForSurface(surface);
    }

    async function processTaskCompletion(uid, options = {}) {
      if (!uid) return null;
      if (processedMap.has(uid)) {
        logCompletionDebug("skip-completion-duplicate", { uid });
        return null;
      }
      logCompletionDebug("process-completion-start", {
        uid,
        fromQueue: !!options?.checkbox || false,
        now: Date.now(),
      });
      const now = Date.now();
      processedMap.set(uid, now);
      const checkbox = options.checkbox || null;
      const userClickRecent = now - lastUserCheckboxInteraction <= USER_COMPLETION_BYPASS_MS;
      const userInitiated = !!options.userInitiated && userClickRecent;
      const detectedAt = typeof options.detectedAt === "number" ? options.detectedAt : null;
      try {
        const set = S();
        await flushChildAttrSync(uid);
        await delay(60);
        let block = await getBlock(uid);
        await delay(60);
        const refreshed = await getBlock(uid);
        if (refreshed) block = refreshed;
        if (!block) {
          processedMap.delete(uid);
          return null;
        }
        // If the block is no longer marked complete, skip any completion handling (e.g., user unchecked).
        if (!isBlockCompleted(block)) {
          processedMap.delete(uid);
          return null;
        }

        const meta = await readRecurringMeta(block, set);
        const hasTimingOnly = !!meta?.hasTimingAttrs;
        if (!meta.repeat && !hasTimingOnly) {
          processedMap.delete(uid);
          return null;
        }

        const detectionTs = detectedAt || now;
        const recentNavigation =
          !!lastNavigationAt && detectionTs - lastNavigationAt <= NAV_COMPLETION_BLOCK_MS;
        if (!userInitiated && recentNavigation) {
          processedMap.delete(uid);
          logCompletionDebug("skip-completion-nav", {
            uid,
            detectedAt: detectionTs,
            lastNavigationAt,
            windowMs: NAV_COMPLETION_BLOCK_MS,
          });
          return null;
        }

        if (!userInitiated && meta.processedTs) {
          processedMap.delete(uid);
          logCompletionDebug("skip-completion-meta-processed", {
            uid,
            metaProcessed: meta.processedTs,
            now,
          });
          return null;
        }

        if (meta.processedTs && now - meta.processedTs < 4000) {
          processedMap.delete(uid);
          logCompletionDebug("skip-completion-recent-meta", { uid, metaProcessed: meta.processedTs, now });
          return null;
        }

        if (!userInitiated) {
          const staleProcessed = meta.processedTs && now - meta.processedTs > COMPLETION_STALE_WINDOW_MS;
          // Allow keyboard completions (cmd/ctrl+Enter) which won't mark userInitiated,
          // but still block re-processing when a completed child attr already exists.
          const completedEntry = pickChildAttr(meta.childAttrMap, set.attrNames.completedAliases, { allowFallback: true });
          if (completedEntry || staleProcessed) {
            processedMap.delete(uid);
            logCompletionDebug("skip-completion-stale", {
              uid,
              processedTs: meta.processedTs || null,
              completedValue: completedEntry?.value || null,
              staleProcessed,
              detectedAt,
              now,
            });
            return null;
          }
        }

        const isOneOff = !meta.repeat && hasTimingOnly;
        if (isOneOff) {
          const snapshot = captureBlockSnapshot(block);
          try {
            const completion = await markCompleted(block, meta, set);
            processedMap.set(uid, completion.processedAt);
            const anchor =
              pickPlacementDate({ start: meta.start, defer: meta.defer, due: meta.due }) || meta.due || null;
            registerUndoAction({
              blockUid: uid,
              snapshot,
              completion,
              newBlockUid: null,
              nextDue: meta.due || null,
              nextAnchor: anchor,
              set,
              overrideEntry: null,
              toastMessage: "Task completion recorded",
            });
            repeatOverrides.delete(uid);
            void syncPillsForSurface(lastAttrSurface);
            activeDashboardController?.notifyBlockChange?.(uid);
            logCompletionDebug("completion-one-off", { uid, processedAt: completion.processedAt });
            return { type: "one-off" };
          } catch (err) {
            console.error("[RecurringTasks] one-off completion failed", err);
            await revertBlockCompletion(block);
            processedMap.delete(uid);
            logCompletionDebug("completion-one-off-error", { uid, error: err?.message });
            return null;
          }
        }

        if (set.confirmBeforeSpawn && !options.skipConfirmation) {
          const confirmed = await requestSpawnConfirmation(meta, set);
          if (!confirmed) {
            processedMap.delete(uid);
            logCompletionDebug("skip-completion-user-cancel", { uid });
            return null;
          }
        }

        const snapshot = captureBlockSnapshot(block);
        const overrideEntry = normalizeOverrideEntry(repeatOverrides.get(uid));
        const overrideRepeat = overrideEntry?.repeat || null;
        const overrideDue = overrideEntry?.due || null;
        if (overrideRepeat) {
          meta.repeat = overrideRepeat;
          meta.props = { ...(meta.props || {}), repeat: overrideRepeat };
        }
        if (overrideDue) {
          meta.due = overrideDue;
          meta.props = { ...(meta.props || {}), due: formatDate(overrideDue, set) };
        }
        const advanceMode = await ensureAdvancePreference(uid, block, meta, set, checkbox);
        if (!advanceMode) {
          processedMap.delete(uid);
          return null;
        }
        meta.advanceFrom = advanceMode;
        const setWithAdvance = { ...set, advanceFrom: advanceMode };
        const completion = await markCompleted(block, meta, setWithAdvance);
        processedMap.set(uid, completion.processedAt);
        logCompletionDebug("completion-recurring-marked", { uid, processedAt: completion.processedAt });

        const { meta: resolvedMeta, block: resolvedBlock } = await resolveMetaAfterCompletion(
          snapshot,
          uid,
          meta,
          setWithAdvance
        );
        if (overrideRepeat) {
          resolvedMeta.repeat = overrideRepeat;
          resolvedMeta.props = { ...(resolvedMeta.props || {}), repeat: overrideRepeat };
        }
        if (overrideDue) {
          resolvedMeta.due = overrideDue;
          resolvedMeta.props = { ...(resolvedMeta.props || {}), due: formatDate(overrideDue, set) };
        }
        const overrideRule = overrideRepeat ? parseRuleText(overrideRepeat, setWithAdvance) : null;
        const nextDueCandidate =
          overrideDue && overrideDue instanceof Date && !Number.isNaN(overrideDue.getTime()) ? overrideDue : null;
        const nextDue = nextDueCandidate || computeNextDue(resolvedMeta, setWithAdvance, 0, overrideRule);
        if (!nextDue) {
          processedMap.delete(uid);
          return null;
        }
        const startOffsetMs =
          resolvedMeta.start instanceof Date && resolvedMeta.due instanceof Date
            ? resolvedMeta.start.getTime() - resolvedMeta.due.getTime()
            : null;
        const deferOffsetMs =
          resolvedMeta.defer instanceof Date && resolvedMeta.due instanceof Date
            ? resolvedMeta.defer.getTime() - resolvedMeta.due.getTime()
            : null;
        const nextStartDate = startOffsetMs != null ? applyOffsetToDate(nextDue, startOffsetMs) : null;
        const nextDeferDate = deferOffsetMs != null ? applyOffsetToDate(nextDue, deferOffsetMs) : null;
        const parentForSpawn = resolvedBlock || (await getBlock(uid)) || block;
        const newUid = await spawnNextOccurrence(parentForSpawn, resolvedMeta, nextDue, setWithAdvance);
        registerUndoAction({
          blockUid: uid,
          snapshot,
          completion,
          newBlockUid: newUid,
          nextDue,
          nextAnchor: pickPlacementDate({ start: nextStartDate, defer: nextDeferDate, due: nextDue }) || nextDue,
          set: setWithAdvance,
          overrideEntry: overrideEntry
            ? {
              ...(overrideEntry.repeat ? { repeat: overrideEntry.repeat } : {}),
              ...(overrideEntry.due ? { due: new Date(overrideEntry.due.getTime()) } : {}),
            }
            : null,
        });
        repeatOverrides.delete(uid);
        void syncPillsForSurface(lastAttrSurface);
        activeDashboardController?.notifyBlockChange?.(uid);
        if (newUid) {
          activeDashboardController?.notifyBlockChange?.(newUid);
        }
        logCompletionDebug("completion-recurring-spawned", { uid, nextUid: newUid, nextDue: nextDue?.toISOString?.() });
        return { type: "recurring", nextUid: newUid };
      } catch (err) {
        console.error("[RecurringTasks] error:", err);
        processedMap.delete(uid);
        logCompletionDebug("completion-error", { uid, error: err?.message });
        return null;
      }
    }

    const BLOCK_CACHE_TTL_MS = 800;
    const BLOCK_CACHE_MAX = 5000;
    let blockCache = new Map();

    function ensureBlockCache() {
      if (!blockCache || typeof blockCache.get !== "function" || typeof blockCache.set !== "function") {
        blockCache = new Map();
      }
      return blockCache;
    }

    function invalidateBlockCache(uid) {
      if (!uid) return;
      ensureBlockCache().delete(uid);
    }

    function pruneBlockCache(now) {
      const cache = ensureBlockCache();
      if (blockCache.size <= BLOCK_CACHE_MAX) return;
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0));
      const overflow = entries.length - BLOCK_CACHE_MAX;
      for (let i = 0; i < overflow; i++) {
        cache.delete(entries[i][0]);
      }
    }

    async function getBlock(uid) {
      if (!uid) return null;
      const now = Date.now();
      const cache = ensureBlockCache();
      const cached = cache.get(uid);
      if (cached && now - cached.at < BLOCK_CACHE_TTL_MS) {
        return cached.block || null;
      }
      if (cached) cache.delete(uid);
      const safeUid = escapeDatalogString(uid);
      const res = await window.roamAlphaAPI.q(`
        [:find
          (pull ?b [:block/uid :block/string :block/props :block/order :block/open
                    {:block/children [:block/uid :block/string]}
                    {:block/page [:block/uid :node/title]}
                    {:block/parents [:block/uid]}])
         :where [?b :block/uid "${safeUid}"]]`);
      const block = res?.[0]?.[0] || null;
      if (block) {
        cache.set(uid, { block, at: now });
        pruneBlockCache(now);
      }
      return block;
    }

    function clonePlain(value) {
      if (value == null || typeof value !== "object") return value;
      if (value instanceof Date) return new Date(value.getTime());
      if (Array.isArray(value)) return value.map((item) => clonePlain(item));
      const out = {};
      for (const key of Object.keys(value)) {
        out[key] = clonePlain(value[key]);
      }
      return out;
    }

    function captureBlockSnapshot(block) {
      const props = parseProps(block?.props);
      return {
        string: block?.string || "",
        props: props && typeof props === "object" ? clonePlain(props) : {},
        childAttrs: parseAttrsFromChildBlocks(block?.children || []),
      };
    }

    function syncActiveTextarea(uid, string) {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (!active || typeof string !== "string") return false;
      const host = active.closest?.(".rm-block-main");
      if (!host) return false;
      const hostUid = host.getAttribute("data-uid");
      if (hostUid !== uid) return false;
      if (typeof active.value === "string" && active.value !== string) {
        active.value = string;
        active.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    }

    async function updateBlockString(uid, string) {
      if (PARENT_WRITE_DELAY_MS > 0) {
        await delay(PARENT_WRITE_DELAY_MS);
      }
      const result = await window.roamAlphaAPI.updateBlock({ block: { uid, string } });
      try {
        if (typeof string === "string") {
          const synced = syncActiveTextarea(uid, string);
          if (!synced) {
            const blockMain = document.querySelector(`.rm-block-main[data-uid="${uid}"]`);
            const textarea =
              blockMain?.querySelector?.("textarea.rm-block-input") ||
              blockMain?.querySelector?.("textarea.rm-block__input") ||
              document.querySelector(`textarea.rm-block-input[data-roamjs-block-uid="${uid}"]`);
            if (textarea && textarea.value !== string) {
              textarea.value = string;
              textarea.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
        }
      } catch (_) { }
      invalidateBlockCache(uid);
      return result;
    }

    async function updateBlockProps(uid, merge) {
      const attrSnapshot = lastAttrNames || resolveAttributeNames();
      const enrichedMerge = { ...(merge || {}) };
      if (attrSnapshot) {
        enrichedMerge.rt = {
          ...(enrichedMerge.rt || {}),
          attrRepeat: attrSnapshot.repeatAttr,
          attrDue: attrSnapshot.dueAttr,
          attrRepeatLabel: attrSnapshot.repeatAttr,
          attrDueLabel: attrSnapshot.dueAttr,
          attrStart: attrSnapshot.startAttr,
          attrStartLabel: attrSnapshot.startAttr,
          attrDefer: attrSnapshot.deferAttr,
          attrDeferLabel: attrSnapshot.deferAttr,
          attrCompleted: attrSnapshot.completedAttr,
          attrCompletedLabel: attrSnapshot.completedAttr,
        };
      }
      const safeUid = escapeDatalogString(uid);
      const current = await window.roamAlphaAPI.q(
        `[:find ?p :where [?b :block/uid "${safeUid}"] [?b :block/props ?p]]`
      );
      const props = parseProps(current?.[0]?.[0]);
      const next = { ...props, ...enrichedMerge };
      if (props.rt && enrichedMerge?.rt) {
        next.rt = { ...props.rt, ...enrichedMerge.rt };
      }
      for (const key of Object.keys(next)) {
        if (next[key] === undefined) delete next[key];
      }
      const result = await window.roamAlphaAPI.updateBlock({ block: { uid, props: next } });
      invalidateBlockCache(uid);
      return result;
    }

    async function setBlockProps(uid, propsObject) {
      const nextProps = propsObject && typeof propsObject === "object" ? { ...propsObject } : {};
      if (nextProps.repeat !== undefined) delete nextProps.repeat;
      if (nextProps.due !== undefined) delete nextProps.due;
      if (nextProps.start !== undefined) delete nextProps.start;
      if (nextProps.defer !== undefined) delete nextProps.defer;
      const result = await window.roamAlphaAPI.updateBlock({ block: { uid, props: nextProps } });
      invalidateBlockCache(uid);
      return result;
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function delayWithSignal(ms, signal) {
      if (!signal) return delay(ms);
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
          return;
        }
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    async function deleteBlock(uid) {
      const result = await window.roamAlphaAPI.deleteBlock({ block: { "uid": uid.toString() } });
      invalidateBlockCache(uid);
      return result;
    }

    async function createBlock(parentUid, order, string, uid) {
      const result = await window.roamAlphaAPI.createBlock({
        location: { "parent-uid": parentUid, order },
        block: uid ? { uid, string } : { string },
      });
      invalidateBlockCache(parentUid);
      if (uid) invalidateBlockCache(uid);
      return result;
    }

    function escapeDatalogString(value) {
      return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    async function getPageUidByTitle(title) {
      if (!title) return null;
      try {
        const safeTitle = escapeDatalogString(title);
        const found = await window.roamAlphaAPI.q(
          `[:find ?u :where [?p :node/title "${safeTitle}"] [?p :block/uid ?u]]`
        );
        return found?.[0]?.[0] || null;
      } catch (err) {
        debugLog("getPageUidByTitle failed", err);
        return null;
      }
    }

    const pendingPageUidByTitle = new Map();

    async function ensurePageUid(title) {
      if (!title) return null;
      const existing = await getPageUidByTitle(title);
      if (existing) return existing;
      if (pendingPageUidByTitle.has(title)) return pendingPageUidByTitle.get(title);
      const promise = (async () => {
        const uid = window.roamAlphaAPI.util.generateUID();
        try {
          await window.roamAlphaAPI.createPage({ page: { title, uid } });
        } catch (err) {
          const msg = String(err?.message || "");
          if (!/already exists/i.test(msg)) {
            console.warn("[BetterTasks] createPage failed", { title, uid, err });
          }
        }
        for (let i = 0; i < 8; i++) {
          const retry = await getPageUidByTitle(title);
          if (retry) return retry;
          await delay(40 * (i + 1));
        }
        return await getPageUidByTitle(title);
      })();
      pendingPageUidByTitle.set(title, promise);
      try {
        return await promise;
      } finally {
        pendingPageUidByTitle.delete(title);
      }
    }

    async function getOrCreatePageUid(title) {
      return ensurePageUid(title);
    }

    async function getOrCreateChildUnderHeading(parentUid, headingText) {
      const safeParentUid = escapeDatalogString(parentUid);
      const children = await window.roamAlphaAPI.q(`
        [:find (pull ?c [:block/uid :block/string])
         :where [?p :block/uid "${safeParentUid}"] [?c :block/parents ?p]]`);
      const hit = children?.map((r) => r[0]).find((c) => (c.string || "").trim() === headingText.trim());
      if (hit) return hit.uid;
      const uid = window.roamAlphaAPI.util.generateUID();
      await createBlock(parentUid, 0, headingText, uid);
      return uid;
    }

    // ========================= Metadata =========================
    const ATTR_RE = /^([\p{L}\p{N}_\-\/\s]+)::\s*(.+)$/u;

    async function readRecurringMeta(block, set) {
      const attrSurface = set?.attributeSurface || "Child";
      const attrNames = set?.attrNames || resolveAttributeNames();
      const props = parseProps(block.props);
      const normalizeRt = (raw = {}) => {
        const out = {};
        for (const [k, v] of Object.entries(raw)) {
          const key = typeof k === "string" ? k.replace(/^:/, "") : k;
          out[key] = v;
        }
        return out;
      };
      const rt = normalizeRt(props.rt || props[":rt"] || {});
      const childAttrMap = parseAttrsFromChildBlocks(block?.children || []);
      const repeatChild = pickChildAttr(childAttrMap, attrNames.repeatAliases, {
        allowFallback: false,
      });
      const dueChild = pickChildAttr(childAttrMap, attrNames.dueAliases, {
        allowFallback: false,
      });
      const startChild = pickChildAttr(childAttrMap, attrNames.startAliases, {
        allowFallback: false,
      });
      const deferChild = pickChildAttr(childAttrMap, attrNames.deferAliases, {
        allowFallback: false,
      });
      const processedChild = childAttrMap["rt-processed"];
      const inlineAttrs = parseAttrsFromBlockText(block.string || "");
      const inlineRepeat = pickInlineAttr(inlineAttrs, attrNames.repeatAliases, { allowFallback: false });
      const inlineDue = pickInlineAttr(inlineAttrs, attrNames.dueAliases, { allowFallback: false });
      const inlineStart = pickInlineAttr(inlineAttrs, attrNames.startAliases, { allowFallback: false });
      const inlineDefer = pickInlineAttr(inlineAttrs, attrNames.deferAliases, { allowFallback: false });

      const canonicalRepeatKey = DEFAULT_REPEAT_ATTR.toLowerCase();
      const canonicalDueKey = DEFAULT_DUE_ATTR.toLowerCase();
      const canonicalStartKey = DEFAULT_START_ATTR.toLowerCase();
      const canonicalDeferKey = DEFAULT_DEFER_ATTR.toLowerCase();
      const hasCanonicalRepeatSignal =
        !!childAttrMap[canonicalRepeatKey] || inlineAttrs[canonicalRepeatKey] != null;
      const hasCanonicalDueSignal =
        !!childAttrMap[canonicalDueKey] || inlineAttrs[canonicalDueKey] != null;
      const hasCanonicalStartSignal =
        !!childAttrMap[canonicalStartKey] || inlineAttrs[canonicalStartKey] != null;
      const hasCanonicalDeferSignal =
        !!childAttrMap[canonicalDeferKey] || inlineAttrs[canonicalDeferKey] != null;
      const hasCustomRepeatSignal =
        !!childAttrMap[attrNames.repeatKey] || inlineAttrs[attrNames.repeatKey] != null;
      const hasCustomDueSignal =
        !!childAttrMap[attrNames.dueKey] || inlineAttrs[attrNames.dueKey] != null;
      const hasCustomStartSignal =
        !!childAttrMap[attrNames.startKey] || inlineAttrs[attrNames.startKey] != null;
      const hasCustomDeferSignal =
        !!childAttrMap[attrNames.deferKey] || inlineAttrs[attrNames.deferKey] != null;
      const propsRepeatMatches = attrNames.repeatAttr === DEFAULT_REPEAT_ATTR || rt.attrRepeat === attrNames.repeatAttr;
      const propsDueMatches = attrNames.dueAttr === DEFAULT_DUE_ATTR || rt.attrDue === attrNames.dueAttr;
      const propsStartMatches = attrNames.startAttr === DEFAULT_START_ATTR || rt.attrStart === attrNames.startAttr;
      const propsDeferMatches = attrNames.deferAttr === DEFAULT_DEFER_ATTR || rt.attrDefer === attrNames.deferAttr;
      const allowPropsRepeat = propsRepeatMatches || hasCustomRepeatSignal;
      const allowPropsDue = propsDueMatches || hasCustomDueSignal;
      const allowPropsStart = propsStartMatches || hasCustomStartSignal || hasCanonicalStartSignal;
      const allowPropsDefer = propsDeferMatches || hasCustomDeferSignal || hasCanonicalDeferSignal;

      const startSignals = [
        startChild?.value,
        inlineStart,
        allowPropsStart ? props.start : null,
      ];
      const deferSignals = [
        deferChild?.value,
        inlineDefer,
        allowPropsDefer ? props.defer : null,
      ];
      const dueSignals = [
        dueChild?.value,
        inlineDue,
        allowPropsDue ? props.due : null,
      ];
      const hasTimingSignal =
        startSignals.some((value) => !!value) ||
        deferSignals.some((value) => !!value) ||
        dueSignals.some((value) => !!value);
      const richMeta = parseRichMetadata(childAttrMap, attrNames);
      const hasMetadataSignal =
        !!(
          richMeta.project ||
          richMeta.waitingFor ||
          (richMeta.context || []).length ||
          richMeta.priority ||
          richMeta.energy ||
          richMeta.gtd
        );

      let repeatText = null;
      let dueDate = null;
      let startDate = null;
      let deferDate = null;
      let processedTs = rt.processed ? Number(rt.processed) : null;

      if (attrSurface === "Child") {
        repeatText = repeatChild?.value || inlineRepeat || null;
        dueDate = null;
        const dueSource = dueChild?.value || inlineDue || null;
        if (dueSource) {
          const parsed = parseRoamDate(dueSource);
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            dueDate = parsed;
            clearDueParseFailure(block?.uid || null);
          } else if (dueChild?.value) {
            noteDueParseFailure(block?.uid || null);
          }
        } else {
          clearDueParseFailure(block?.uid || null);
        }
        const startSource = startChild?.value || inlineStart || null;
        if (startSource) {
          const parsed = parseRoamDate(startSource);
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            startDate = parsed;
          }
        }
        const deferSource = deferChild?.value || inlineDefer || null;
        if (deferSource) {
          const parsed = parseRoamDate(deferSource);
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            deferDate = parsed;
          }
        }
        if (processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      } else {
        if (allowPropsRepeat && typeof props.repeat === "string" && props.repeat) {
          repeatText = props.repeat;
        } else if (inlineRepeat) {
          repeatText = inlineRepeat;
        } else if (repeatChild?.value) {
          repeatText = repeatChild.value;
        }
        let dueSource = null;
        if (allowPropsDue && typeof props.due === "string" && props.due) {
          dueSource = props.due;
        } else if (inlineDue) {
          dueSource = inlineDue;
        } else if (dueChild?.value) {
          dueSource = dueChild.value;
        }
        if (dueSource) {
          const parsed = parseRoamDate(dueSource);
          if (parsed) dueDate = parsed;
        }
        let startSource = null;
        if (allowPropsStart && typeof props.start === "string" && props.start) {
          startSource = props.start;
        } else if (inlineStart) {
          startSource = inlineStart;
        } else if (startChild?.value) {
          startSource = startChild.value;
        }
        if (startSource) {
          const parsed = parseRoamDate(startSource);
          if (parsed) startDate = parsed;
        }
        let deferSource = null;
        if (allowPropsDefer && typeof props.defer === "string" && props.defer) {
          deferSource = props.defer;
        } else if (inlineDefer) {
          deferSource = inlineDefer;
        } else if (deferChild?.value) {
          deferSource = deferChild.value;
        }
        if (deferSource) {
          const parsed = parseRoamDate(deferSource);
          if (parsed) deferDate = parsed;
        }
        if (!processedTs && processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      }

      const overrideEntry = normalizeOverrideEntry(repeatOverrides.get(block.uid));
      const overrideRepeat = overrideEntry?.repeat || null;
      if (overrideRepeat) {
        repeatText = normalizeRepeatRuleText(overrideRepeat) || overrideRepeat;
      } else {
        repeatText = normalizeRepeatRuleText(repeatText);
      }
      if (overrideEntry?.due) {
        dueDate = overrideEntry.due;
      }

      const hasTimingValue = !!(startDate || deferDate || dueDate);
      const hasRepeat = !!repeatText;
      const hasTimingAttrs = hasTimingSignal || hasTimingValue;
      const isOneOff = !hasRepeat && hasTimingAttrs;

      const advanceEntry = childAttrMap[ADVANCE_ATTR.toLowerCase()];
      const advanceFrom = normalizeAdvanceValue(advanceEntry?.value) || null;

      return {
        uid: block.uid,
        repeat: repeatText,
        due: dueDate,
        start: startDate,
        defer: deferDate,
        childAttrMap,
        processedTs: processedTs || null,
        rtId: rt.id || null,
        rtParent: rt.parent || null,
        pageUid: block.page?.uid || null,
        props,
        advanceFrom,
        hasRepeat,
        hasTimingAttrs,
        hasMetadata: hasMetadataSignal,
        isRecurring: hasRepeat,
        isOneOff,
        metadata: richMeta,
      };
    }

    async function resolveMetaAfterCompletion(snapshot, uid, baseMeta, set, attempts = 3) {
      let lastBlock = null;
      let metaCandidate = baseMeta;
      for (let i = 0; i < attempts; i++) {
        const block = await getBlock(uid);
        if (!block) break;
        lastBlock = block;
        const candidate = await readRecurringMeta(block, set);
        if (candidate?.repeat) {
          return { meta: candidate, block };
        }
        metaCandidate = candidate;
        await delay(60 * (i + 1));
      }

      const fallbackMeta = { ...(metaCandidate || baseMeta || {}) };
      const inlineAttrs = parseAttrsFromBlockText(snapshot.string || "");
      const attrNames = set?.attrNames || resolveAttributeNames();
      const inlineRepeat = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const inlineDue = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineStart = pickInlineAttr(inlineAttrs, attrNames.startAliases);
      const inlineDefer = pickInlineAttr(inlineAttrs, attrNames.deferAliases);
      const valueSources = [
        inlineRepeat,
        metaCandidate?.props?.repeat,
        baseMeta?.props?.repeat,
        baseMeta?.repeat,
      ];
      for (const value of valueSources) {
        if (value) {
          fallbackMeta.repeat = normalizeRepeatRuleText(value);
          break;
        }
      }
      const dueSources = [
        inlineDue,
        metaCandidate?.props?.due,
        baseMeta?.props?.due,
        baseMeta?.due,
      ];
      for (const value of dueSources) {
        if (value) {
          const parsed = parseRoamDate(value);
          if (parsed) {
            fallbackMeta.due = parsed;
            break;
          }
        }
      }
      const startSources = [
        inlineStart,
        metaCandidate?.props?.start,
        baseMeta?.props?.start,
        baseMeta?.start,
      ];
      for (const value of startSources) {
        if (value) {
          const parsed = parseRoamDate(value);
          if (parsed) {
            fallbackMeta.start = parsed;
            break;
          }
        }
      }
      const deferSources = [
        inlineDefer,
        metaCandidate?.props?.defer,
        baseMeta?.props?.defer,
        baseMeta?.defer,
      ];
      for (const value of deferSources) {
        if (value) {
          const parsed = parseRoamDate(value);
          if (parsed) {
            fallbackMeta.defer = parsed;
            break;
          }
        }
      }
      fallbackMeta.childAttrMap = metaCandidate?.childAttrMap || baseMeta?.childAttrMap || {};
      fallbackMeta.rtId = metaCandidate?.rtId || baseMeta?.rtId || null;
      fallbackMeta.rtParent = metaCandidate?.rtParent || baseMeta?.rtParent || null;
      fallbackMeta.props = metaCandidate?.props || baseMeta?.props || {};
      return { meta: fallbackMeta, block: lastBlock };
    }

    function parseProps(propsJson) {
      if (!propsJson) return {};
      try {
        return typeof propsJson === "string" ? JSON.parse(propsJson) : propsJson;
      } catch {
        return {};
      }
    }

    function parseAttrsFromBlockText(text) {
      if (!text) return {};
      const out = {};
      const attrNames = resolveAttributeNames();
      const repeatAliases = new Set(attrNames.repeatAliases || []);
      const dueAliases = new Set(attrNames.dueAliases || []);
      const startAliases = new Set(attrNames.startAliases || []);
      const deferAliases = new Set(attrNames.deferAliases || []);
      const completedAliases = new Set(attrNames.completedAliases || []);
      const lines = text.split("\n").slice(0, 12);
      for (const line of lines) {
        const inlineRegex =
          /(?:^|\s)([\p{L}\p{N}_\-\/]+)::\s*([^\n]*?)(?=(?:\s+[\p{L}\p{N}_\-\/]+::)|$)/gu;
        let match;
        while ((match = inlineRegex.exec(line)) !== null) {
          const key = match[1].trim().toLowerCase();
          const value = match[2].trim();
          if (!(key in out)) out[key] = value;
          if (repeatAliases.has(key) && out.repeat == null) {
            out.repeat = value;
          } else if (dueAliases.has(key) && out.due == null) {
            out.due = value;
          } else if (startAliases.has(key) && out.start == null) {
            out.start = value;
          } else if (deferAliases.has(key) && out.defer == null) {
            out.defer = value;
          } else if (completedAliases.has(key) && out.completed == null) {
            out.completed = value;
          }
        }
      }
      return out;
    }

    function parseAttrsFromChildBlocks(children) {
      if (!Array.isArray(children)) return {};
      const out = {};
      const attrNames = resolveAttributeNames();
      const repeatAliases = new Set(attrNames.repeatAliases || []);
      const dueAliases = new Set(attrNames.dueAliases || []);
      const startAliases = new Set(attrNames.startAliases || []);
      const deferAliases = new Set(attrNames.deferAliases || []);
      const completedAliases = new Set(attrNames.completedAliases || []);
      const projectAliases = new Set(attrNames.projectAliases || []);
      const gtdAliases = new Set(attrNames.gtdAliases || []);
      const waitingAliases = new Set(attrNames.waitingForAliases || []);
      const contextAliases = new Set(attrNames.contextAliases || []);
      const priorityAliases = new Set(attrNames.priorityAliases || []);
      const energyAliases = new Set(attrNames.energyAliases || []);
      for (const child of children) {
        const text = typeof child?.string === "string" ? child.string : null;
        if (!text) continue;
        const m = text.match(ATTR_RE);
        if (m) {
          const originalKey = m[1].trim();
          const key = originalKey.toLowerCase();
          if (!(key in out)) {
            out[key] = {
              value: m[2].trim(),
              uid: child?.uid || null,
              originalKey: originalKey,
            };
          }
          if (repeatAliases.has(key) && out.repeat == null) {
            out.repeat = out[key];
          } else if (dueAliases.has(key) && out.due == null) {
            out.due = out[key];
          } else if (startAliases.has(key) && out.start == null) {
            out.start = out[key];
          } else if (deferAliases.has(key) && out.defer == null) {
            out.defer = out[key];
          } else if (completedAliases.has(key) && out.completed == null) {
            out.completed = out[key];
          } else if (projectAliases.has(key) && out.project == null) {
            out.project = out[key];
          } else if (gtdAliases.has(key) && out.gtd == null) {
            out.gtd = out[key];
          } else if (waitingAliases.has(key) && out.waitingFor == null) {
            out.waitingFor = out[key];
          } else if (contextAliases.has(key) && out.context == null) {
            out.context = out[key];
          } else if (priorityAliases.has(key) && out.priority == null) {
            out.priority = out[key];
          } else if (energyAliases.has(key) && out.energy == null) {
            out.energy = out[key];
          }
        }
      }
      return out;
    }

    function stripLinkOrTag(value) {
      if (typeof value !== "string") return "";
      let v = value.trim();
      if (v.startsWith("#")) v = v.slice(1).trim();
      const pageMatch = v.match(/^\[\[(.*)\]\]$/);
      if (pageMatch) return pageMatch[1].trim();
      return v;
    }

    function normalizeContextList(value) {
      if (typeof value !== "string") return [];
      return value
        .split(",")
        .map((token) => stripLinkOrTag(token))
        .map((token) => token.replace(/^@+/, "").trim())
        .filter(Boolean);
    }

    function normalizeFromLocalized(raw, keys) {
      if (!raw || typeof raw !== "string" || !Array.isArray(keys)) return null;
      const input = raw.trim().toLowerCase();
      const langs = Array.from(
        new Set([currentLanguage, getLanguageSetting(), ...(SUPPORTED_LANGUAGES || [])].filter(Boolean))
      );
      for (const key of keys) {
        for (const lang of langs) {
          const localized = t(["dashboard", "filterValues", key], lang);
          if (typeof localized === "string" && localized.trim().toLowerCase() === input) return key;
        }
        if (input === key.toLowerCase()) return key;
      }
      return null;
    }

    function normalizePriorityValue(raw) {
      if (!raw || typeof raw !== "string") return null;
      const s = raw.trim().toLowerCase();
      const localized = normalizeFromLocalized(s, ["low", "medium", "high"]);
      if (localized) return localized;
      if (["high", "h", "p1", "urgent", "important", "critical"].includes(s)) return "high";
      if (["medium", "med", "m", "p2", "normal", "standard"].includes(s)) return "medium";
      if (["low", "l", "p3", "minor"].includes(s)) return "low";
      return null;
    }

    function normalizeEnergyValue(raw) {
      if (!raw || typeof raw !== "string") return null;
      const s = raw.trim().toLowerCase();
      const localized = normalizeFromLocalized(s, ["low", "medium", "high"]);
      if (localized) return localized;
      if (["high", "h", "p1", "full"].includes(s)) return "high";
      if (["medium", "med", "m", "p2", "normal"].includes(s)) return "medium";
      if (["low", "l", "p3", "tired"].includes(s)) return "low";
      return null;
    }

    function normalizeGtdStatus(raw) {
      if (!raw || typeof raw !== "string") return null;
      const stripped = stripLinkOrTag(raw).replace(/:+$/, "");
      const s = stripped.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const localized = normalizeFromLocalized(s, ["next action", "delegated", "deferred", "someday"]);
      if (localized) return localized;
      const aliases = {
        "next action": "next action",
        "next": "next action",
        "na": "next action",
        "nextaction": "next action",
        "delegated": "delegated",
        "waiting for": "delegated",
        "waiting": "delegated",
        "deferred": "deferred",
        "defer": "deferred",
        "someday": "someday",
        "someday maybe": "someday",
        "maybe": "someday",
      };
      const match = aliases[s];
      if (match) return match;
      const orderedHit = GTD_STATUS_ORDER.find((status) => status === s);
      return orderedHit || null;
    }

    function formatGtdStatusDisplay(value, lang = getLanguageSetting()) {
      const normalized = normalizeGtdStatus(value);
      const source = normalized || (typeof value === "string" ? value.trim().toLowerCase() : "");
      if (!source) return "";
      const translated = t(["dashboard", "filterValues", source], lang);
      if (translated) return translated;
      return source
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }

    function cycleGtdStatus(current) {
      const normalized = current ? normalizeGtdStatus(current) : null;
      const order = [...GTD_STATUS_ORDER, null];
      const idx = order.indexOf(normalized ?? null);
      const next = order[(idx + 1) % order.length];
      return next;
    }

    function formatPriorityEnergyDisplay(value, lang = getLanguageSetting()) {
      if (!value || typeof value !== "string") return "";
      const v = value.trim().toLowerCase();
      const translated = t(["dashboard", "filterValues", v], lang);
      if (translated) return translated;
      if (v === "low" || v === "medium" || v === "high") {
        return v.charAt(0).toUpperCase() + v.slice(1);
      }
      return value;
    }

    function parseRichMetadata(childAttrMap, attrNames = resolveAttributeNames()) {
      const projectEntry = pickChildAttr(childAttrMap, attrNames.projectAliases || [], { allowFallback: true });
      const waitingEntry = pickChildAttr(childAttrMap, attrNames.waitingForAliases || [], { allowFallback: true });
      const contextEntry = pickChildAttr(childAttrMap, attrNames.contextAliases || [], { allowFallback: true });
      const priorityEntry = pickChildAttr(childAttrMap, attrNames.priorityAliases || [], { allowFallback: true });
      const energyEntry = pickChildAttr(childAttrMap, attrNames.energyAliases || [], { allowFallback: true });
      const gtdEntry = pickChildAttr(childAttrMap, attrNames.gtdAliases || [], { allowFallback: true });

      const project = projectEntry?.value ? stripLinkOrTag(projectEntry.value) || null : null;
      const waitingFor = waitingEntry?.value ? stripLinkOrTag(waitingEntry.value) || null : null;
      const context = contextEntry?.value ? normalizeContextList(contextEntry.value) : [];
      const priority = normalizePriorityValue(priorityEntry?.value || null);
      const energy = normalizeEnergyValue(energyEntry?.value || null);
      const gtd = normalizeGtdStatus(gtdEntry?.value || null);
      return { project, waitingFor, context, priority, energy, gtd };
    }

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function hasInlineAttrLabel(text, label) {
      if (!text || !label) return false;
      const escaped = escapeRegExp(label.trim());
      if (!escaped) return false;
      const regex = new RegExp(`(^|\\s)${escaped}::`, "i");
      return regex.test(text);
    }

    function hasChildAttrLabel(children, label) {
      if (!Array.isArray(children) || !label) return false;
      const escaped = escapeRegExp(label.trim());
      if (!escaped) return false;
      const regex = new RegExp(`^\\s*${escaped}::`, "i");
      return children.some((child) => regex.test((child?.string || "").trim()));
    }

    function hasAnyAttributeChild(children) {
      if (!Array.isArray(children)) return false;
      return children.some((child) => {
        const text = (child?.string || "").trim();
        return ATTR_RE.test(text);
      });
    }

    function sanitizeAttrName(value, fallback) {
      if (value == null) return fallback;
      const trimmed = String(value).trim().replace(/:+$/, "");
      return trimmed || fallback;
    }

    function normalizeAttrLabel(value) {
      if (typeof value !== "string") return "";
      return value.trim().replace(/:+$/, "").toLowerCase();
    }

    const ATTR_NAME_HISTORY_KEY = "bt-attr-name-history";
    let attrNameHistory = null;

    function loadAttrNameHistory() {
      if (attrNameHistory) return;
      attrNameHistory = {};
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage?.getItem(ATTR_NAME_HISTORY_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          attrNameHistory = parsed;
        }
      } catch (_) {
        attrNameHistory = {};
      }
    }

    function saveAttrNameHistory() {
      if (typeof window === "undefined") return;
      try {
        window.localStorage?.setItem(ATTR_NAME_HISTORY_KEY, JSON.stringify(attrNameHistory || {}));
      } catch (_) {
        // ignore storage errors
      }
    }

    function getAttrNameHistory(settingId) {
      loadAttrNameHistory();
      const list = attrNameHistory?.[settingId];
      return Array.isArray(list) ? list : [];
    }

    function rememberAttrName(settingId, name) {
      const normalized = normalizeAttrLabel(name);
      if (!normalized) return;
      loadAttrNameHistory();
      const list = Array.isArray(attrNameHistory?.[settingId]) ? attrNameHistory[settingId] : [];
      if (!list.includes(normalized)) {
        attrNameHistory[settingId] = [...list, normalized];
        saveAttrNameHistory();
      }
    }

    function updateAttrNameHistory(prev, next) {
      const map = [
        { type: "repeat", settingId: "rt-repeat-attr" },
        { type: "due", settingId: "rt-due-attr" },
        { type: "start", settingId: "rt-start-attr" },
        { type: "defer", settingId: "rt-defer-attr" },
        { type: "completed", settingId: "rt-completed-attr" },
        { type: "project", settingId: "bt-attr-project" },
        { type: "gtd", settingId: "bt-attr-gtd" },
        { type: "waitingFor", settingId: "bt-attr-waitingFor" },
        { type: "context", settingId: "bt-attr-context" },
        { type: "priority", settingId: "bt-attr-priority" },
        { type: "energy", settingId: "bt-attr-energy" },
      ];
      map.forEach(({ type, settingId }) => {
        const prevLabel = prev?.[`${type}Attr`];
        const nextLabel = next?.[`${type}Attr`];
        if (prevLabel && prevLabel !== nextLabel) {
          rememberAttrName(settingId, prevLabel);
        }
      });
    }

    function isChildrenVisible(el) {
      if (!el) return false;
      if (el.childElementCount === 0) return false;
      if (el.style?.display === "none" || el.style?.visibility === "hidden") return false;
      const computed = typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (computed && (computed.display === "none" || computed.visibility === "hidden")) return false;
      return el.offsetHeight > 0;
    }

    function buildAttrConfig(settingId, defaultName) {
      const attr = sanitizeAttrName(extensionAPI.settings.get(settingId) || defaultName, defaultName);
      const key = attr.toLowerCase();
      const defaultKey = defaultName.toLowerCase();
      const history = getAttrNameHistory(settingId);
      const aliasKeys = Array.from(new Set([key, defaultKey, ...history])).filter(Boolean);
      return {
        attr,
        key,
        aliases: aliasKeys,
        removalKeys: Array.from(new Set([attr, defaultName, ...history])).filter(Boolean),
        defaultName,
        canonicalKey: defaultKey,
        isDefault: key === defaultKey,
      };
    }

    function resolveAttributeNames() {
      const repeat = buildAttrConfig("rt-repeat-attr", DEFAULT_REPEAT_ATTR);
      const due = buildAttrConfig("rt-due-attr", DEFAULT_DUE_ATTR);
      const start = buildAttrConfig("rt-start-attr", DEFAULT_START_ATTR);
      const defer = buildAttrConfig("rt-defer-attr", DEFAULT_DEFER_ATTR);
      const completed = buildAttrConfig("rt-completed-attr", DEFAULT_COMPLETED_ATTR);
      const project = buildAttrConfig("bt-attr-project", DEFAULT_PROJECT_ATTR);
      const gtd = buildAttrConfig("bt-attr-gtd", DEFAULT_GTD_ATTR);
      const waitingFor = buildAttrConfig("bt-attr-waitingFor", DEFAULT_WAITING_FOR_ATTR);
      const context = buildAttrConfig("bt-attr-context", DEFAULT_CONTEXT_ATTR);
      const priority = buildAttrConfig("bt-attr-priority", DEFAULT_PRIORITY_ATTR);
      const energy = buildAttrConfig("bt-attr-energy", DEFAULT_ENERGY_ATTR);
      const attrByType = {
        repeat,
        due,
        start,
        defer,
        completed,
        project,
        gtd,
        waitingFor,
        context,
        priority,
        energy,
      };
      return {
        repeatAttr: repeat.attr,
        repeatKey: repeat.key,
        repeatAliases: repeat.aliases,
        repeatRemovalKeys: repeat.removalKeys,
        dueAttr: due.attr,
        dueKey: due.key,
        dueAliases: due.aliases,
        dueRemovalKeys: due.removalKeys,
        startAttr: start.attr,
        startKey: start.key,
        startAliases: start.aliases,
        startRemovalKeys: start.removalKeys,
        deferAttr: defer.attr,
        deferKey: defer.key,
        deferAliases: defer.aliases,
        deferRemovalKeys: defer.removalKeys,
        completedAttr: completed.attr,
        completedKey: completed.key,
        completedAliases: completed.aliases,
        completedRemovalKeys: completed.removalKeys,
        projectAttr: project.attr,
        projectKey: project.key,
        projectAliases: project.aliases,
        projectRemovalKeys: project.removalKeys,
        gtdAttr: gtd.attr,
        gtdKey: gtd.key,
        gtdAliases: gtd.aliases,
        gtdRemovalKeys: gtd.removalKeys,
        waitingForAttr: waitingFor.attr,
        waitingForKey: waitingFor.key,
        waitingForAliases: waitingFor.aliases,
        waitingForRemovalKeys: waitingFor.removalKeys,
        contextAttr: context.attr,
        contextKey: context.key,
        contextAliases: context.aliases,
        contextRemovalKeys: context.removalKeys,
        priorityAttr: priority.attr,
        priorityKey: priority.key,
        priorityAliases: priority.aliases,
        priorityRemovalKeys: priority.removalKeys,
        energyAttr: energy.attr,
        energyKey: energy.key,
        energyAliases: energy.aliases,
        energyRemovalKeys: energy.removalKeys,
        attrByType,
      };
    }

    function pickInlineAttr(inlineMap, aliases, options = {}) {
      if (!inlineMap) return null;
      const { allowFallback = true } = options;
      const [primary, ...fallbacks] = aliases;
      if (primary && inlineMap[primary] != null && inlineMap[primary] !== "") {
        return inlineMap[primary];
      }
      if (!allowFallback) return null;
      for (const key of fallbacks) {
        if (inlineMap[key] != null && inlineMap[key] !== "") {
          return inlineMap[key];
        }
      }
      return null;
    }

    function pickChildAttr(childMap, aliases, options = {}) {
      if (!childMap) return null;
      const { allowFallback = true } = options;
      const [primary, ...fallbacks] = aliases;
      if (primary && childMap[primary]) return childMap[primary];
      if (!allowFallback) return null;
      for (const key of fallbacks) {
        if (childMap[key]) return childMap[key];
      }
      return null;
    }

    const CHILD_ATTR_ORDER = {
      completed: 0,
      repeat: 1,
      advance: 2,
      start: 3,
      defer: 4,
      due: 5,
      project: 6,
      gtd: 7,
      waitingfor: 8,
      context: 9,
      priority: 10,
      energy: 11,
    };

    function getChildOrderForType(type) {
      if (!type) return 0;
      const key = String(type).toLowerCase();
      return Number.isFinite(CHILD_ATTR_ORDER[key]) ? CHILD_ATTR_ORDER[key] : 0;
    }

    function buildOrderedChildAttrLabels(attrNames = resolveAttributeNames()) {
      return [
        { type: "completed", label: getAttrLabel("completed", attrNames) || "completed" },
        { type: "repeat", label: getAttrLabel("repeat", attrNames) },
        { type: "advance", label: ADVANCE_ATTR },
        { type: "start", label: getAttrLabel("start", attrNames) },
        { type: "defer", label: getAttrLabel("defer", attrNames) },
        { type: "due", label: getAttrLabel("due", attrNames) },
        { type: "project", label: getAttrLabel("project", attrNames) },
        { type: "gtd", label: getAttrLabel("gtd", attrNames) },
        { type: "waitingFor", label: getAttrLabel("waitingFor", attrNames) },
        { type: "context", label: getAttrLabel("context", attrNames) },
        { type: "priority", label: getAttrLabel("priority", attrNames) },
        { type: "energy", label: getAttrLabel("energy", attrNames) },
      ].filter((entry) => typeof entry.label === "string" && entry.label.trim());
    }

    async function enforceChildAttrOrder(parentUid, attrNames = resolveAttributeNames()) {
      if (!parentUid) return;
      const parent = await getBlock(parentUid);
      if (!parent) return;
      const children = Array.isArray(parent.children) ? parent.children : [];
      if (!children.length) return;
      const orderedLabels = buildOrderedChildAttrLabels(attrNames);
      const labelToIndex = new Map(
        orderedLabels.map((entry, idx) => [entry.label.trim().toLowerCase(), idx])
      );
      const managed = [];
      for (const child of children) {
        const text = typeof child?.string === "string" ? child.string : "";
        const match = text.match(/^\s*([^:]+)::/);
        if (!match) continue;
        const label = match[1].trim().toLowerCase();
        if (!labelToIndex.has(label)) continue;
        managed.push({ uid: child.uid, desiredIndex: labelToIndex.get(label) });
      }
      if (managed.length <= 1) return;
      managed.sort((a, b) => a.desiredIndex - b.desiredIndex);
      let nextOrder = 0;
      for (const entry of managed) {
        if (!entry.uid) continue;
        try {
          await window.roamAlphaAPI.moveBlock({
            location: { "parent-uid": parentUid, order: nextOrder },
            block: { uid: entry.uid },
          });
        } catch (err) {
          console.warn("[RecurringTasks] enforceChildAttrOrder move failed", err);
        }
        nextOrder += 1;
      }
    }

    function getAttrMeta(type, attrNames) {
      if (!type || !attrNames) return null;
      if (attrNames.attrByType && attrNames.attrByType[type]) {
        return attrNames.attrByType[type];
      }
      switch (type) {
        case "repeat":
          return {
            attr: attrNames.repeatAttr,
            key: attrNames.repeatKey,
            aliases: attrNames.repeatAliases,
            removalKeys: attrNames.repeatRemovalKeys,
          };
        case "due":
          return {
            attr: attrNames.dueAttr,
            key: attrNames.dueKey,
            aliases: attrNames.dueAliases,
            removalKeys: attrNames.dueRemovalKeys,
          };
        case "start":
          return {
            attr: attrNames.startAttr,
            key: attrNames.startKey,
            aliases: attrNames.startAliases,
            removalKeys: attrNames.startRemovalKeys,
          };
        case "defer":
          return {
            attr: attrNames.deferAttr,
            key: attrNames.deferKey,
            aliases: attrNames.deferAliases,
            removalKeys: attrNames.deferRemovalKeys,
          };
        case "completed":
          return {
            attr: attrNames.completedAttr,
            key: attrNames.completedKey,
            aliases: attrNames.completedAliases,
            removalKeys: attrNames.completedRemovalKeys,
          };
        case "project":
          return {
            attr: attrNames.projectAttr,
            key: attrNames.projectKey,
            aliases: attrNames.projectAliases,
            removalKeys: attrNames.projectRemovalKeys,
          };
        case "gtd":
          return {
            attr: attrNames.gtdAttr,
            key: attrNames.gtdKey,
            aliases: attrNames.gtdAliases,
            removalKeys: attrNames.gtdRemovalKeys,
          };
        case "waitingFor":
        case "waitingfor":
          return {
            attr: attrNames.waitingForAttr,
            key: attrNames.waitingForKey,
            aliases: attrNames.waitingForAliases,
            removalKeys: attrNames.waitingForRemovalKeys,
          };
        case "context":
          return {
            attr: attrNames.contextAttr,
            key: attrNames.contextKey,
            aliases: attrNames.contextAliases,
            removalKeys: attrNames.contextRemovalKeys,
          };
        case "priority":
          return {
            attr: attrNames.priorityAttr,
            key: attrNames.priorityKey,
            aliases: attrNames.priorityAliases,
            removalKeys: attrNames.priorityRemovalKeys,
          };
        case "energy":
          return {
            attr: attrNames.energyAttr,
            key: attrNames.energyKey,
            aliases: attrNames.energyAliases,
            removalKeys: attrNames.energyRemovalKeys,
          };
        default:
          return null;
      }
    }

    function getAttrLabel(type, attrNames) {
      return getAttrMeta(type, attrNames)?.attr || "";
    }

    function getAttrKey(type, attrNames) {
      return getAttrMeta(type, attrNames)?.key || "";
    }

    function getAttrRemovalKeys(type, attrNames) {
      return getAttrMeta(type, attrNames)?.removalKeys || [];
    }

    function getAttrAliases(type, attrNames) {
      return getAttrMeta(type, attrNames)?.aliases || [];
    }

    async function ensureChildAttrForType(uid, type, value, attrNames) {
      const order = getChildOrderForType(type);
      const result = await ensureChildAttr(uid, getAttrLabel(type, attrNames), value, order);
      await enforceChildAttrOrder(uid, attrNames);
      return result;
    }

    async function setRichAttribute(uid, type, value, attrNames = resolveAttributeNames()) {
      if (!uid) return;
      const hasValue =
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === "string" && value.trim()) ||
        value != null;
      if (!hasValue) {
        await removeChildAttrsForType(uid, type, attrNames);
        if (type === "project") {
          if (value) removeProjectOption(value);
          // Refresh the project index so stale entries drop quickly
          void refreshProjectOptions(true);
        } else if (type === "waitingFor") {
          if (value) removeWaitingOption(value);
          void refreshWaitingOptions(true);
        } else if (type === "context") {
          if (Array.isArray(value)) {
            value.forEach((ctx) => removeContextOption(ctx));
          } else if (value) {
            removeContextOption(value);
          }
          void refreshContextOptions(true);
        }
        return;
      }
      let writeValue = value;
      if (Array.isArray(value)) {
        writeValue = value.join(", ");
      } else if (typeof value === "string") {
        writeValue = value.trim();
        if (type === "project") {
          writeValue = normalizeProjectValue(writeValue);
        }
        if (type === "priority" || type === "energy") {
          writeValue = formatPriorityEnergyDisplay(writeValue);
        } else if (type === "gtd") {
          const normalized = normalizeGtdStatus(writeValue);
          if (!normalized) {
            await removeChildAttrsForType(uid, type, attrNames);
            return;
          }
          writeValue = formatGtdStatusDisplay(normalized);
        }
      } else if (value && typeof value === "object" && value.label) {
        writeValue = String(value.label).trim();
      }
      if (
        writeValue == null ||
        (typeof writeValue === "string" && !writeValue.trim())
      ) {
        await removeChildAttrsForType(uid, type, attrNames);
        if (type === "project") {
          void refreshProjectOptions(true);
        }
        return;
      }
      await ensureChildAttrForType(uid, type, writeValue, attrNames);
      if (type === "project" && writeValue) {
        addProjectOption(writeValue);
      }
    }

    async function ensurePageAndOpen(title, options = {}) {
      const name = typeof title === "string" ? title.trim() : "";
      if (!name) return;
      const uid = await getOrCreatePageUid(name);
      if (!uid) return;
      try {
        if (options.inSidebar) {
          window.roamAlphaAPI?.ui?.rightSidebar?.addWindow?.({
            window: { type: "outline", "page-uid": uid, "block-uid": uid },
          });
        } else {
          window.roamAlphaAPI?.ui?.mainWindow?.openPage?.({ page: { uid } });
        }
      } catch (err) {
        console.warn("[BetterTasks] open page failed", err);
      }
    }

    async function handleMetadataClick(uid, type, payload = {}, event = null, controllerRef = null) {
      if (!uid || !type) return;
      const rawList = Array.isArray(payload.list) ? payload.list : [];
      const rawValue = typeof payload.value === "string" ? payload.value : rawList[0] || "";
      const title = stripLinkOrTag(rawValue);
      const attrNames = resolveAttributeNames();
      const isMeta = !!(event?.metaKey || event?.ctrlKey);
      const inSidebar = !!event?.shiftKey;
      if (isMeta) {
        const next = await promptForValue({
          title: "Better Tasks",
          message: `Set ${type}`,
          placeholder: type,
          initial: rawValue || "",
        });
        if (next == null) return;
        const trimmed = String(next).trim();
        if (type === "context") {
          const contexts = trimmed
            ? trimmed
              .split(",")
              .map((t) => t.replace(/^#/, "").replace(/^@/, "").replace(/^\[\[(.*)\]\]$/, "$1").trim())
              .filter(Boolean)
            : [];
          await setRichAttribute(uid, "context", contexts, attrNames);
        } else if (type === "project") {
          await setRichAttribute(uid, "project", trimmed || null, attrNames);
        } else if (type === "waitingFor") {
          await setRichAttribute(uid, "waitingFor", trimmed || null, attrNames);
        } else if (type === "priority" || type === "energy") {
          await setRichAttribute(uid, type, trimmed || null, attrNames);
        }
        const notifier =
          controllerRef?.notifyBlockChange || activeDashboardController?.notifyBlockChange;
        if (typeof notifier === "function") {
          await notifier(uid, { bypassFilters: true });
        }
        if (typeof window !== "undefined") {
          window.__btInlineMetaCache?.delete(uid);
        }
        void syncPillsForSurface(lastAttrSurface);
        return;
      }
      if (!title) return;
      await ensurePageAndOpen(title, { inSidebar });
    }

    async function removeChildAttrsForType(uid, type, attrNames) {
      for (const key of getAttrRemovalKeys(type, attrNames)) {
        await removeChildAttr(uid, key);
      }
    }

    async function clearAttrForType(uid, type, options = {}) {
      if (!uid) return false;
      const allowed = new Set(["repeat", "start", "defer", "due"]);
      if (!allowed.has(type)) return false;
      const set = options.set || S();
      const attrNames = set?.attrNames || resolveAttributeNames();
      const block = options.block || (await getBlock(uid));
      if (!block) return false;
      await updateBlockProps(uid, { [type]: undefined });
      await removeChildAttrsForType(uid, type, attrNames);
      const removalKeys = getAttrRemovalKeys(type, attrNames);
      if (removalKeys.length) {
        const cleaned = removeInlineAttributes(block.string || "", removalKeys);
        if (cleaned !== (block.string || "")) {
          await updateBlockString(uid, cleaned);
        }
      }
      if (type === "repeat") {
        repeatOverrides.delete(uid);
      } else if (type === "due") {
        mergeRepeatOverride(uid, { due: null });
      }
      return true;
    }

    async function ensureInlineAttrForType(block, type, value, attrNames) {
      const label = getAttrLabel(type, attrNames);
      const aliases = getAttrRemovalKeys(type, attrNames).filter((name) => name !== label);
      await ensureInlineAttribute(block, label, value, { aliases });
    }

    function replaceInlineAttrForType(text, type, value, attrNames) {
      if (!text) return text;
      const keys = getAttrRemovalKeys(type, attrNames);
      let current = text;
      for (const key of keys) {
        const next = replaceAttributeInString(current, key, value);
        if (next !== current) {
          current = next;
          break;
        }
      }
      return current;
    }

    function getMetaChildAttr(meta, type, attrNames, options = {}) {
      if (!meta) return null;
      return pickChildAttr(meta.childAttrMap || {}, getAttrAliases(type, attrNames), options);
    }

    function setMetaChildAttr(meta, type, entry, attrNames) {
      if (!meta) return;
      meta.childAttrMap = meta.childAttrMap || {};
      const label = getAttrLabel(type, attrNames);
      meta.childAttrMap[label] = entry;
      if (label === type) {
        meta.childAttrMap[type] = entry;
      } else {
        delete meta.childAttrMap[type];
      }
    }

    function clearMetaChildAttr(meta, type, attrNames) {
      if (!meta || !meta.childAttrMap) return;
      delete meta.childAttrMap[getAttrLabel(type, attrNames)];
      const label = getAttrLabel(type, attrNames);
      if (label === type) delete meta.childAttrMap[type];
    }

    function normalizeAdvanceValue(value) {
      if (!value) return null;
      const v = String(value).trim().toLowerCase();
      if (v === "completion" || v === "completion date") return "completion";
      if (v === "due" || v === "due date") return "due";
      return null;
    }

    function advanceLabelForMode(mode) {
      return mode === "completion" ? "completion date" : "due date";
    }

    async function ensureAdvanceChildAttr(uid, mode, meta, attrNames = resolveAttributeNames()) {
      const label = advanceLabelForMode(mode);
      const order = getChildOrderForType("advance");
      const result = await ensureChildAttr(uid, ADVANCE_ATTR, label, order);
      await enforceChildAttrOrder(uid, attrNames);
      if (meta) {
        meta.childAttrMap = meta.childAttrMap || {};
        meta.childAttrMap[ADVANCE_ATTR.toLowerCase()] = { value: label, uid: result.uid };
      }
    }

    async function revertBlockCompletion(block) {
      if (!block) return;
      const uid = block.uid;
      const current = block.string || "";
      const reverted = current.replace(/{{\[\[DONE\]\]}}/i, "{{[[TODO]]}}");
      if (reverted !== current) {
        await updateBlockString(uid, reverted);
      }
    }

    function normalizeRepeatRuleText(value) {
      if (!value) return null;
      let s = String(value).trim();
      if (!s) return null;
      s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
      s = s.replace(/\{\{([^\}]+)\}\}/g, "$1");
      s = s.replace(/\(\(([^\)]+)\)\)/g, "$1");
      s = s.replace(/^\s*-/g, "").trim();
      return s || null;
    }

    // ========================= Completion + next spawn =========================
    async function withChildAttrLock(uid, key, fn) {
      if (!uid || !key) return fn();
      const token = `${uid}::${key}`.toLowerCase();
      const previous = childAttrLocks.get(token) || Promise.resolve();
      let release = null;
      const next = new Promise((resolve) => {
        release = resolve;
      });
      childAttrLocks.set(token, previous.then(() => next));
      try {
        await previous;
        return await fn();
      } finally {
        release?.();
        if (childAttrLocks.get(token) === next) {
          childAttrLocks.delete(token);
        }
      }
    }

    async function dedupeChildAttr(uid, key, keepUid) {
      const block = await getBlock(uid);
      if (!block) return;
      const children = Array.isArray(block?.children) ? block.children : [];
      const keyRegex = new RegExp(`^\\s*${escapeRegExp(String(key || "").trim())}::\\s*`, "i");
      const matches = children
        .filter((child) => keyRegex.test((child?.string || "").trim()))
        .map((child) => (typeof child?.uid === "string" ? child.uid.trim() : ""))
        .filter(Boolean);
      for (const matchUid of matches) {
        if (keepUid && matchUid === keepUid) continue;
        try {
          await deleteBlock(matchUid);
        } catch (err) {
          console.warn("[RecurringTasks] dedupeChildAttr failed", err);
        }
      }
    }

    async function ensureChildAttr(uid, key, value, order = 0) {
      return withChildAttrLock(uid, key, async () => {
        const parent = await getBlock(uid);
        if (!parent) {
          return { created: false, uid: null, previousValue: null };
        }
        const children = Array.isArray(parent.children) ? parent.children : [];
        const keyRegex = new RegExp(`^\\s*${escapeRegExp(String(key || "").trim())}::\\s*`, "i");
        const match = children.find((child) => keyRegex.test((child?.string || "").trim()));
        const matchUid = typeof match?.uid === "string" ? match.uid.trim() : "";
        if (!matchUid) {
          const newUid = window.roamAlphaAPI.util.generateUID();
          await createBlock(uid, order, `${key}:: ${value}`, newUid);
          await moveChildToOrder(uid, newUid, order);
          await dedupeChildAttr(uid, key, newUid);
          return { created: true, uid: newUid, previousValue: null };
        }
        const existingChild = await getBlock(matchUid);
        if (!existingChild) {
          const newUid = window.roamAlphaAPI.util.generateUID();
          await createBlock(uid, order, `${key}:: ${value}`, newUid);
          await moveChildToOrder(uid, newUid, order);
          await dedupeChildAttr(uid, key, newUid);
          return { created: true, uid: newUid, previousValue: null };
        }
        const curVal =
          existingChild.string?.replace(/^[^:]+::\s*/i, "")?.trim() ||
          match.string?.replace(/^[^:]+::\s*/i, "")?.trim() ||
          "";
        if (curVal !== value) {
          try {
            await window.roamAlphaAPI.updateBlock({ block: { uid: matchUid, string: `${key}:: ${value}` } });
          } catch (err) {
            console.warn("[RecurringTasks] ensureChildAttr update failed, recreating", err);
            const newUid = window.roamAlphaAPI.util.generateUID();
            await createBlock(uid, order, `${key}:: ${value}`, newUid);
            await moveChildToOrder(uid, newUid, order);
            await dedupeChildAttr(uid, key, newUid);
            return { created: true, uid: newUid, previousValue: curVal };
          }
        }
        await moveChildToOrder(uid, matchUid, order);
        await dedupeChildAttr(uid, key, matchUid);
        return { created: false, uid: matchUid, previousValue: curVal };
      });
    }

    async function moveChildToOrder(parentUid, childUid, order) {
      if (!parentUid || !childUid || !Number.isFinite(order)) return;
      const normalizedOrder = Math.max(0, Math.floor(order));
      try {
        await window.roamAlphaAPI.moveBlock({
          location: { "parent-uid": parentUid, order: normalizedOrder },
          block: { uid: childUid },
        });
        invalidateBlockCache(parentUid);
        invalidateBlockCache(childUid);
      } catch (err) {
        console.warn("[RecurringTasks] moveChildToOrder failed", err);
      }
    }

    async function removeChildAttr(uid, key) {
      return withChildAttrLock(uid, key, async () => {
        const token = `${uid}::${key}`.toLowerCase();
        if (deletingChildAttrs.has(token)) return;
        deletingChildAttrs.add(token);
        try {
          const block = await getBlock(uid);
          if (!block) return;
          const children = Array.isArray(block?.children) ? block.children : [];
          const keyRegex = new RegExp(`^\\s*${escapeRegExp(String(key || "").trim())}::\\s*`, "i");
          const matches = children.filter((entry) => keyRegex.test((entry?.string || "").trim()));
          if (!matches.length) return;
          for (const entry of matches) {
            const targetUid = typeof entry?.uid === "string" ? entry.uid.trim() : "";
            if (!targetUid) continue;
            try {
              const exists = await getBlock(targetUid);
              if (!exists) continue;
              await deleteBlock(targetUid);
            } catch (err) {
              console.warn("[RecurringTasks] removeChildAttr failed", err);
            }
          }
        } finally {
          deletingChildAttrs.delete(token);
        }
      });
    }

    async function markCompleted(block, meta, set) {
      const uid = block.uid;
      const beforeString = block.string || "";
      const processedAt = Date.now();
      const completedDate = formatDate(todayLocal(), set);
      let updatedString = beforeString;
      let stringChanged = false;
      let completedAttrChange = null;

      completedAttrChange = await ensureChildAttrForType(uid, "completed", completedDate, set.attrNames);
      await removeChildAttr(uid, "rt-processed");

      await updateBlockProps(uid, {
        rt: {
          lastCompleted: new Date(processedAt).toISOString(),
          processed: processedAt,
          tz: set.timezone,
        },
      });

      return {
        processedAt,
        completedDate,
        stringChanged,
        beforeString,
        updatedString,
        childChanges: {
          completed: completedAttrChange,
        },
      };
    }

    const undoRegistry = new Map();

    function registerUndoAction(data) {
      undoRegistry.set(data.blockUid, data);
      showUndoToast(data);
    }

    function showUndoToast(data) {
      const { nextAnchor, nextDue, toastMessage } = data;
      const displaySource = nextAnchor || nextDue;
      const displayDate = displaySource ? formatRoamDateTitle(displaySource) : "";
      const message = toastMessage
        ? toastMessage
        : displaySource
          ? translateString("Next occurrence scheduled for {{date}}", getLanguageSetting())?.replace(
            "{{date}}",
            displayDate
          ) || `Next occurrence scheduled for ${displayDate}`
          : translateString("Next occurrence scheduled", getLanguageSetting());
      iziToast.show({
        theme: "light",
        color: "black",
        class: "betterTasks bt-toast-undo",
        position: "center",
        message,
        timeout: 5000,
        close: true,
        closeOnEscape: true,
        closeOnClick: false,
        buttons: [
          [
            `<button>${escapeHtml(t(["buttons", "undo"], getLanguageSetting()) || "Undo")}</button>`,
            (instance, toastEl) => {
              instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
              performUndo(data).catch((err) =>
                console.error("[RecurringTasks] undo failed", err)
              );
            },
            true,
          ],
        ],
        onOpening: (_instance, toastEl) => {
          applyToastA11y(toastEl);
        },
        onClosed: () => {
          undoRegistry.delete(data.blockUid);
        },
      });
    }

    async function performUndo(data) {
      const { blockUid, snapshot, completion, newBlockUid, set, overrideEntry } = data;
      const attrNames = set?.attrNames || resolveAttributeNames();
      undoRegistry.delete(blockUid);
      try {
        const restoredString = normalizeToTodoMacro(snapshot.string);
        await updateBlockString(blockUid, restoredString);
      } catch (err) {
        console.warn("[RecurringTasks] undo string failed", err);
      }
      try {
        await setBlockProps(blockUid, snapshot.props);
      } catch (err) {
        console.warn("[RecurringTasks] undo props failed", err);
      }

      // === NEW: restore repeat/due depending on surface ===
      try {
        const hadRepeatChild = !!snapshot.childAttrs?.["repeat"];
        const hadDueChild = !!snapshot.childAttrs?.["due"];
        const hadStartChild = !!snapshot.childAttrs?.["start"];
        const hadDeferChild = !!snapshot.childAttrs?.["defer"];

        const restoreOrRemove = async (type, snapshotEntry) => {
          if (snapshotEntry) {
            await ensureChildAttrForType(blockUid, type, snapshotEntry.value || "", attrNames);
          } else {
            await removeChildAttrsForType(blockUid, type, attrNames);
          }
        };

        await restoreOrRemove("repeat", hadRepeatChild ? snapshot.childAttrs["repeat"] : null);
        await restoreOrRemove("due", hadDueChild ? snapshot.childAttrs["due"] : null);
        await restoreOrRemove("start", hadStartChild ? snapshot.childAttrs["start"] : null);
        await restoreOrRemove("defer", hadDeferChild ? snapshot.childAttrs["defer"] : null);
      } catch (err) {
        console.warn("[RecurringTasks] undo restore recurring attrs failed", err);
      }

      if (newBlockUid) {
        try {
          await deleteBlock(newBlockUid);
        } catch (err) {
          console.warn("[RecurringTasks] undo remove new block failed", err);
        }
      }

      await restoreChildAttr(
        blockUid,
        "completed",
        snapshot.childAttrs?.["completed"],
        completion.childChanges.completed,
        attrNames
      );
      const processedSnapshot = snapshot.childAttrs?.["rt-processed"];
      if (processedSnapshot?.uid) {
        try {
          await window.roamAlphaAPI.updateBlock({
            block: { uid: processedSnapshot.uid, string: `rt-processed:: ${processedSnapshot.value}` },
          });
        } catch (err) {
          console.warn("[RecurringTasks] restore processed attr failed", err);
        }
      } else {
        await removeChildAttr(blockUid, "rt-processed");
      }

      processedMap.set(blockUid, Date.now());
      setTimeout(() => processedMap.delete(blockUid), 750);
      if (overrideEntry) mergeRepeatOverride(blockUid, overrideEntry);
      if (activeDashboardController) {
        await activeDashboardController.notifyBlockChange?.(blockUid);
        if (newBlockUid) {
          activeDashboardController.removeTask?.(newBlockUid);
        }
        if (activeDashboardController.isOpen?.()) {
          await activeDashboardController.refresh?.({ reason: "undo" });
        }
      }
      toast(t(["toasts", "undoSuccess"], getLanguageSetting()) || "Changes un-done successfully");
      void syncPillsForSurface(lastAttrSurface);
    }

    async function restoreChildAttr(blockUid, type, beforeInfo, changeInfo, attrNames = resolveAttributeNames()) {
      const label = getAttrLabel(type, attrNames) || type;
      if (beforeInfo?.uid) {
        const value = beforeInfo.value || "";
        try {
          await window.roamAlphaAPI.updateBlock({
            block: { uid: beforeInfo.uid, string: `${label}:: ${value}` },
          });
        } catch (err) {
          console.warn("[RecurringTasks] restore child attr failed", err);
        }
        return;
      }
      if (changeInfo?.uid) {
        try {
          await deleteBlock(changeInfo.uid);
        } catch (err) {
          console.warn("[RecurringTasks] remove child attr failed", err);
        }
      } else {
        await removeChildAttr(blockUid, label);
      }
    }

    async function spawnNextOccurrence(prevBlock, meta, nextDueDate, set) {
      const nextDueStr = formatDate(nextDueDate, set);
      const startOffsetMs =
        meta?.start instanceof Date && meta?.due instanceof Date
          ? meta.start.getTime() - meta.due.getTime()
          : null;
      const deferOffsetMs =
        meta?.defer instanceof Date && meta?.due instanceof Date
          ? meta.defer.getTime() - meta.due.getTime()
          : null;
      const nextStartDate =
        startOffsetMs != null ? applyOffsetToDate(nextDueDate, startOffsetMs) : null;
      const nextDeferDate =
        deferOffsetMs != null ? applyOffsetToDate(nextDueDate, deferOffsetMs) : null;
      const nextStartStr = nextStartDate ? formatDate(nextStartDate, set) : null;
      const nextDeferStr = nextDeferDate ? formatDate(nextDeferDate, set) : null;
      const removalKeys = [
        ...new Set([
          ...set.attrNames.repeatRemovalKeys,
          ...set.attrNames.dueRemovalKeys,
          ...set.attrNames.startRemovalKeys,
          ...set.attrNames.deferRemovalKeys,
          "completed",
        ]),
      ];
      const prevText = removeInlineAttributes(prevBlock.string || "", removalKeys);

      const seriesId = meta.rtId || shortId();
      if (!meta.rtId) await updateBlockProps(prevBlock.uid, { rt: { id: seriesId, tz: set.timezone } });

      const placementDate =
        pickPlacementDate({ start: nextStartDate, defer: nextDeferDate, due: nextDueDate }) || nextDueDate;
      const projectValue = meta?.metadata?.project || null;
      let targetPageUid = await chooseTargetPageUid(placementDate, prevBlock, set, projectValue);
      let parentBlock = await getBlock(targetPageUid);
      if (!parentBlock) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        parentBlock = await getBlock(targetPageUid);
      }
      if (!parentBlock) {
        if (set.destination === "DNP under heading" && set.dnpHeading) {
          const dnpTitle = toDnpTitle(placementDate);
          const dnpUid = await getOrCreatePageUid(dnpTitle);
          targetPageUid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
          parentBlock = await getBlock(targetPageUid);
        } else if (set.destination === "Project Page" && projectValue) {
          targetPageUid = await chooseTargetPageUid(placementDate, prevBlock, set, projectValue);
          parentBlock = await getBlock(targetPageUid);
        } else if (set.destination === "Same Page") {
          const parent = prevBlock.page?.uid || (await getOrCreatePageUid("Misc"));
          targetPageUid = parent;
          parentBlock = await getBlock(targetPageUid);
        } else {
          const dnpTitle = toDnpTitle(placementDate);
          targetPageUid = await getOrCreatePageUid(dnpTitle);
          parentBlock = await getBlock(targetPageUid);
        }
      }
      if (!parentBlock) {
        throw new Error(`Parent entity ${targetPageUid} unavailable`);
      }

      const taskLine = normalizeToTodoMacro(prevText).trim();
      const newUid = window.roamAlphaAPI.util.generateUID();
      await createBlock(targetPageUid, 0, taskLine, newUid);

      await ensureChildAttrForType(newUid, "repeat", meta.repeat, set.attrNames);
      await ensureChildAttrForType(newUid, "due", nextDueStr, set.attrNames);
      if (nextStartStr) {
        await ensureChildAttrForType(newUid, "start", nextStartStr, set.attrNames);
      } else {
        await removeChildAttrsForType(newUid, "start", set.attrNames);
      }
      if (nextDeferStr) {
        await ensureChildAttrForType(newUid, "defer", nextDeferStr, set.attrNames);
      } else {
        await removeChildAttrsForType(newUid, "defer", set.attrNames);
      }
      const advanceEntry = meta.childAttrMap?.[ADVANCE_ATTR.toLowerCase()];
      if (advanceEntry?.value) {
        await ensureChildAttr(newUid, ADVANCE_ATTR, advanceEntry.value, getChildOrderForType("advance"));
        await enforceChildAttrOrder(newUid, set.attrNames);
      }

      await updateBlockProps(newUid, {
        repeat: meta.repeat,
        due: nextDueStr,
        start: nextStartStr || undefined,
        defer: nextDeferStr || undefined,
        rt: { id: shortId(), parent: seriesId, tz: set.timezone },
      });

      return newUid;
    }

    // ========================= Destination helpers =========================
    async function chooseTargetPageUid(anchorDate, prevBlock, set, projectValue) {
      if (set.destination === "Same Page") {
        return prevBlock.page?.uid || (await getOrCreatePageUid("Misc"));
      }
      const projectPageName =
        typeof projectValue === "string" ? projectValue.replace(/^\[\[|\]\]$/g, "").trim() : "";
      if (set.destination === "Project Page" && projectPageName) {
        return await getOrCreatePageUid(projectPageName);
      }
      // "Project Page" without a project value falls through to DNP
      const targetDate = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? anchorDate : todayLocal();
      const dnpTitle = toDnpTitle(targetDate);
      const dnpUid = await getOrCreatePageUid(dnpTitle);
      if (set.destination === "DNP under heading" && set.dnpHeading) {
        const headingUid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
        return headingUid || dnpUid;
      }
      return dnpUid;
    }

    function toDnpTitle(d) {
      const util = window.roamAlphaAPI?.util;
      if (util?.dateToPageTitle) {
        try {
          return util.dateToPageTitle(d);
        } catch (err) {
          console.warn("[RecurringTasks] dateToPageTitle failed, falling back to ISO", err);
        }
      }
      // Fallback: ISO style
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function parseDateFromText(value, set) {
      if (typeof value !== "string" || !value.trim()) return { date: null, text: null };
      const original = value.trim();
      const cleaned = stripTimeFromDateText(original);
      let dt = parseRoamDate(cleaned) || parseRelativeDateText(cleaned, set.weekStartCode);
      if (!dt && hasTimeOnlyHint(original)) {
        dt = pickAnchorDateFromTimeHint(original, set);
      }
      if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return { date: null, text: null };
      return { date: dt, text: formatDate(dt, set) };
    }

    async function createQuickTaskFromParsed(parsed, rawInput = "") {
      if (!parsed) return false;
      const set = S();
      const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
      if (!title) return false;
      const cleanedTitle = stripSchedulingFromTitle(title, parsed);
      const todoString = normalizeToTodoMacro(cleanedTitle);

      let repeatVal = "";
      if (typeof parsed.repeatRule === "string" && parsed.repeatRule.trim()) {
        const normalized = normalizeRepeatRuleText(parsed.repeatRule) || parsed.repeatRule.trim();
        if (parseRuleText(normalized, set)) {
          repeatVal = normalized;
        }
      }

      const dueInfo = parseDateFromText(parsed.dueDateText || "", set);
      const startInfo = parseDateFromText(parsed.startDateText || "", set);
      const deferInfo = parseDateFromText(parsed.deferDateText || "", set);

      const anchorDate = dueInfo.date || deferInfo.date || startInfo.date || todayLocal();
      let targetPageUid = await ensureTargetReady(anchorDate, { page: { uid: null } }, set);
      if (!targetPageUid) {
        targetPageUid = await chooseTargetPageUid(anchorDate, { page: { uid: null } }, set);
      }
      if (!targetPageUid) {
        console.warn("[BetterTasks] quick add parsed task missing target page");
        toast(t(["toasts", "pageNotFound"], getLanguageSetting()) || "Couldn't find a page to create that task.");
        return false;
      }
      const newUid = window.roamAlphaAPI.util.generateUID();
      await createBlock(targetPageUid, 0, todoString, newUid);

      const props = { rt: { id: shortId(), tz: set.timezone } };
      await updateBlockProps(newUid, props);

      if (repeatVal) await ensureChildAttrForType(newUid, "repeat", repeatVal, set.attrNames);
      else await removeChildAttrsForType(newUid, "repeat", set.attrNames);
      if (dueInfo.text) await ensureChildAttrForType(newUid, "due", dueInfo.text, set.attrNames);
      else await removeChildAttrsForType(newUid, "due", set.attrNames);
      if (startInfo.text) await ensureChildAttrForType(newUid, "start", startInfo.text, set.attrNames);
      else await removeChildAttrsForType(newUid, "start", set.attrNames);
      if (deferInfo.text) await ensureChildAttrForType(newUid, "defer", deferInfo.text, set.attrNames);
      else await removeChildAttrsForType(newUid, "defer", set.attrNames);
      const hasAiMeta = !!(
        (parsed.project || "").trim() ||
        (parsed.context || "").trim() ||
        (parsed.priority || "").trim() ||
        (parsed.energy || "").trim()
      );
      if (hasAiMeta) {
        await applyMetadataFromPrompt(
          newUid,
          {
            project: parsed.project || "",
            context: parsed.context || "",
            priority: parsed.priority || "",
            energy: parsed.energy || "",
          },
          set.attrNames
        );
      }

      scheduleSurfaceSync(set.attributeSurface);
      activeDashboardController?.notifyBlockChange?.(newUid, { bypassFilters: true });
      return true;
    }

    async function createQuickTaskFromPrompt(promptResult) {
      if (!promptResult) return false;
      const set = S();
      const attrNames = set.attrNames;
      const title =
        (typeof promptResult.taskText === "string" && promptResult.taskText.trim()) ||
        (typeof promptResult.taskTextRaw === "string" && promptResult.taskTextRaw.trim()) ||
        "";
      if (!title) {
        toast(t(["toasts", "taskTextRequired"], getLanguageSetting()) || "Task text is required.");
        return false;
      }
      const cleanedTitle = stripSchedulingFromTitle(title, null);
      const todoString = normalizeToTodoMacro(cleanedTitle);

      const repeatVal = promptResult.repeat || "";
      if (repeatVal && !parseRuleText(repeatVal, set)) {
        toast(t(["toasts", "unableUnderstandRepeat"], getLanguageSetting()) || "Unable to understand that repeat rule.");
        return false;
      }

      const dueDate =
        promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
          ? promptResult.dueDate
          : promptResult.due
            ? parseRoamDate(promptResult.due)
            : null;
      const startDate =
        promptResult.startDate instanceof Date && !Number.isNaN(promptResult.startDate.getTime())
          ? promptResult.startDate
          : promptResult.start
            ? parseRoamDate(promptResult.start)
            : null;
      const deferDate =
        promptResult.deferDate instanceof Date && !Number.isNaN(promptResult.deferDate.getTime())
          ? promptResult.deferDate
          : promptResult.defer
            ? parseRoamDate(promptResult.defer)
            : null;

      const dueStr = dueDate ? formatDate(dueDate, set) : null;
      const startStr = startDate ? formatDate(startDate, set) : null;
      const deferStr = deferDate ? formatDate(deferDate, set) : null;

      const anchorDate = dueDate || deferDate || startDate || todayLocal();
      let targetPageUid = await ensureTargetReady(anchorDate, { page: { uid: null } }, set);
      if (!targetPageUid) {
        targetPageUid = await chooseTargetPageUid(anchorDate, { page: { uid: null } }, set);
      }
      if (!targetPageUid) {
        console.warn("[BetterTasks] quick add prompt task missing target page");
        toast(t(["toasts", "pageNotFound"], getLanguageSetting()) || "Couldn't find a page to create that task.");
        return false;
      }
      const newUid = window.roamAlphaAPI.util.generateUID();
      await createBlock(targetPageUid, 0, todoString, newUid);

      const props = { rt: { id: shortId(), tz: set.timezone } };
      await updateBlockProps(newUid, { rt: props.rt });

      if (repeatVal) await ensureChildAttrForType(newUid, "repeat", repeatVal, attrNames);
      else await removeChildAttrsForType(newUid, "repeat", attrNames);
      if (dueStr) await ensureChildAttrForType(newUid, "due", dueStr, attrNames);
      else await removeChildAttrsForType(newUid, "due", attrNames);
      if (startStr) await ensureChildAttrForType(newUid, "start", startStr, attrNames);
      else await removeChildAttrsForType(newUid, "start", attrNames);
      if (deferStr) await ensureChildAttrForType(newUid, "defer", deferStr, attrNames);
      else await removeChildAttrsForType(newUid, "defer", attrNames);
      await applyMetadataFromPrompt(newUid, promptResult, attrNames);

      scheduleSurfaceSync(set.attributeSurface);
      activeDashboardController?.notifyBlockChange?.(newUid, { bypassFilters: true });
      return true;
    }

    // === Merged + extended parser ===
    function parseRuleText(s, options = {}) {
      if (!s) return null;
      const t = s.trim().replace(/\s+/g, " ").toLowerCase();
      const weekStartCode = normalizeWeekStartCode(
        options.weekStartCode || options.weekStart || getWeekStartSetting()
      );
      const ordinalHint = /\b(first|second|third|fourth|fifth|last|day|month)\b/.test(t) || /\d/.test(t);
      if (!ordinalHint) {
        const quickSet = parseAbbrevSet(t);
        if (quickSet) return { kind: "WEEKLY", interval: 1, byDay: quickSet };
        const looseDays = normalizeByDayList(t, weekStartCode);
        if (looseDays.length) return { kind: "WEEKLY", interval: 1, byDay: looseDays };
      }

      const keywordInterval = keywordIntervalFromText(t);
      if (keywordInterval) {
        return { kind: "MONTHLY_DAY", interval: keywordInterval };
      }

      // 0) Simple daily & weekday/weekend anchors
      if (t === "daily" || t === "every day") return { kind: "DAILY", interval: 1 };
      if (
        t === "every other day" || t === "every second day" ||
        t === "every two days" || t === "second daily"
      ) return { kind: "DAILY", interval: 2 };
      if (t === "every third day" || t === "every three days") return { kind: "DAILY", interval: 3 };
      if (t === "every fourth day" || t === "every four days") return { kind: "DAILY", interval: 4 };
      if (t === "every fifth day" || t === "every five days") return { kind: "DAILY", interval: 5 };

      if (t === "every weekday" || t === "weekdays" || t === "on weekdays" || t === "business days" || t === "workdays")
        return { kind: "WEEKDAY" };
      if (t === "every weekend" || t === "weekend" || t === "weekends")
        return { kind: "WEEKLY", interval: 1, byDay: ["SA", "SU"] };

      // 1) "every <dow>" (singular/plural) — use your DOW_MAP and aliases
      const singleDow = Object.keys(DOW_ALIASES).find(
        a => t === `every ${a}` || t === `every ${a}s`
      );
      if (singleDow) return { kind: "WEEKLY", interval: 1, byDay: [dowFromAlias(singleDow)] };

      // 2) "every N days"
      let m = t.match(/^every (\d+)\s*days?$/);
      if (m) return { kind: "DAILY", interval: parseInt(m[1], 10) };

      // 3) "every N weekdays/business days"
      m = t.match(/^every (\d+)\s*(?:weekdays?|business days?)$/);
      if (m) return { kind: "BUSINESS_DAILY", interval: parseInt(m[1], 10) };

      // 4) Weekly base words + biweekly/fortnightly
      if (t === "weekly" || t === "every week") return { kind: "WEEKLY", interval: 1, byDay: null };
      if (t === "every other week" || t === "every second week" || t === "biweekly" || t === "fortnightly" || t === "every fortnight")
        return { kind: "WEEKLY", interval: 2, byDay: null };
      m = t.match(/^every\s+(other|second|2nd)\s+([a-z]+)s?$/);
      if (m) {
        const dowCode = dowFromAlias(m[2]);
        if (dowCode) return { kind: "WEEKLY", interval: 2, byDay: [dowCode] };
      }
      m = t.match(/^every\s+(\d+)(?:st|nd|rd|th)?\s+([a-z]+)s?$/);
      if (m) {
        const intervalNum = parseInt(m[1], 10);
        const dowCode = dowFromAlias(m[2]);
        if (dowCode && intervalNum >= 1) {
          if (intervalNum === 1) return { kind: "WEEKLY", interval: 1, byDay: [dowCode] };
          return { kind: "WEEKLY", interval: intervalNum, byDay: [dowCode] };
        }
      }

      // 5) Weekly with "on …"
      let weeklyOn = t.match(/^(?:every week|weekly)\s+on\s+(.+)$/);
      if (weeklyOn) {
        const byDay = normalizeByDayList(weeklyOn[1], weekStartCode);
        return { kind: "WEEKLY", interval: 1, byDay: byDay.length ? byDay : null };
      }
      // 5b) "every N weeks (on …)?"
      m = t.match(/^every (\d+)\s*weeks?(?:\s*on\s*(.+))?$/);
      if (m) {
        const interval = parseInt(m[1], 10);
        const byDay = m[2] ? normalizeByDayList(m[2], weekStartCode) : null;
        return { kind: "WEEKLY", interval, byDay: (byDay && byDay.length) ? byDay : null };
      }
      // 5c) "weekly on …"
      m = t.match(/^weekly on (.+)$/);
      if (m) {
        const byDay = normalizeByDayList(m[1], weekStartCode);
        if (byDay.length) return { kind: "WEEKLY", interval: 1, byDay };
      }
      // 5d) Bare "every <list/range/shorthand>"
      if (t.startsWith("every ")) {
        const after = t.slice(6).trim();
        const byDay = normalizeByDayList(after, weekStartCode);
        if (byDay.length) return { kind: "WEEKLY", interval: 1, byDay };
        // also accept "every monday(s)" etc. via your earlier path already handled above
      }

      // 6) Monthly: explicit EOM
      if (
        t === "last day of the month" ||
        t === "last day of each month" ||
        t === "last day of every month" ||
        t === "last day each month" ||
        t === "last day every month" ||
        t === "eom"
      )
        return { kind: "MONTHLY_LAST_DAY" };

      // 7) Monthly: semimonthly / multi-day
      m = t.match(/^(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:,|and|&)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const d1 = parseInt(m[1], 10), d2 = parseInt(m[2], 10);
        return { kind: "MONTHLY_MULTI_DAY", days: [d1, d2] };
      }
      m = t.match(/^(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+and\s+last\s+day\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const d = parseInt(m[1], 10);
        return { kind: "MONTHLY_MIXED_DAY", days: [d], last: true };
      }
      m = t.match(/^on\s+the\s+(.+)\s+of\s+(?:each|every)\s+month$/);
      if (m) {
        const parts = splitList(m[1].replace(/\b(?:and|&)\b/g, ","));
        const days = parts
          .map(x => x.replace(/(st|nd|rd|th)$/i, ""))
          .map(x => parseInt(x, 10))
          .filter(n => Number.isInteger(n) && n >= 1 && n <= 31);
        if (days.length >= 1) return { kind: "MONTHLY_MULTI_DAY", days };
      }

      // 8) Monthly: your existing single-day variants
      if (t === "monthly") return { kind: "MONTHLY_DAY", day: todayLocal().getDate() };
      m = t.match(/^every month on day (\d{1,2})$/);
      if (m) return { kind: "MONTHLY_DAY", day: parseInt(m[1], 10) };
      m = t.match(/^(?:the\s+)?(\d{1,2}|1st|2nd|3rd|4th)\s+day\s+of\s+(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_DAY", day: ordFromText(m[1]) };
      m = t.match(/^day\s+(\d{1,2})\s+(?:of|in)?\s*(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_DAY", day: parseInt(m[1], 10) };

      // 9) Monthly: ordinal weekday (incl. compact), plus penultimate/weekday
      m = t.match(/^(?:every month on the|on the|every month the|the)\s+(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        if (dow) return { kind: "MONTHLY_NTH", nth, dow };
      }
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        if (dow) return { kind: "MONTHLY_NTH", nth, dow };
      }
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth)\s+and\s+(1st|first|2nd|second|3rd|third|4th|fourth)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const nths = [m[1].toLowerCase(), m[2].toLowerCase()];
        const dow = dowFromAlias(m[3]);
        if (dow) return { kind: "MONTHLY_MULTI_NTH", nths, dow };
      }
      m = t.match(/^(?:second\s+last|penultimate)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const dow = dowFromAlias(m[1]);
        if (dow) return { kind: "MONTHLY_NTH_FROM_END", nth: 2, dow };
      }
      m = t.match(/^(first|last)\s+weekday\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_NTH_WEEKDAY", nth: m[1].toLowerCase() };

      // 10) Every N months (date or ordinal weekday)
      m = t.match(/^every (\d+)\s*months?(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?$/);
      if (m) {
        const interval = parseInt(m[1], 10);
        const day = m[2] ? parseInt(m[2], 10) : todayLocal().getDate();
        return { kind: "MONTHLY_DAY", interval, day };
      }
      m = t.match(/^every (\d+)\s*months?\s+on\s+the\s+(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)$/);
      if (m) {
        const interval = parseInt(m[1], 10);
        const nth = m[2].toLowerCase();
        const dow = dowFromAlias(m[3]);
        if (dow) return { kind: "MONTHLY_NTH", interval, nth, dow };
      }

      // 11) Quarterly / semiannual / annual synonyms
      const yearlyKeyword = t.match(/^(annually|yearly|every year)$/);
      if (yearlyKeyword) {
        return { kind: "YEARLY" };
      }

      // 12) Yearly: explicit month/day or ordinal weekday-in-month
      m = t.match(/^(?:every|each)\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
      if (m) {
        const month = monthFromText(m[1]);
        const day = parseInt(m[2], 10);
        if (month) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^every\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = monthFromText(m[2]);
        if (month) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^on\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(?:every\s+year|annually|yearly)$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = monthFromText(m[2]);
        if (month) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
      if (m) {
        const month = monthFromText(m[1]);
        const day = parseInt(m[2], 10);
        if (month && day) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(?:every\s+year)?$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = monthFromText(m[2]);
        if (month && day) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)\s+of\s+([a-z]+)\s+(?:every\s+year|annually|yearly)?$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        const month = monthFromText(m[3]);
        if (dow && month) return { kind: "YEARLY_NTH", month, nth, dow };
      }

      // No match
      return null;
    }

    function resolveMonthlyInterval(rule) {
      const raw = Number.parseInt(rule?.interval, 10);
      return Number.isFinite(raw) && raw > 0 ? raw : 1;
    }

    function resolveMonthlyDay(rule, meta) {
      if (Number.isInteger(rule?.day) && rule.day >= 1) return rule.day;
      const due = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      if (due) return due.getDate();
      return todayLocal().getDate();
    }

    function computeNextDue(meta, set, depth = 0, ruleOverride = null) {
      const rule = ruleOverride || parseRuleText(meta.repeat, set);
      if (rule) {
        clearRepeatParseFailure(meta?.uid || null);
      }
      if (!rule) {
        console.warn(`[RecurringTasks] Unable to parse repeat rule "${meta.repeat}"`);
        noteRepeatParseFailure(meta?.uid || null);
        return null;
      }
      const base = set.advanceFrom === "completion" ? todayLocal() : meta.due || todayLocal();
      let next = null;
      switch (rule.kind) {
        case "DAILY":
          next = addDaysLocal(base, rule.interval || 1);
          break;
        case "WEEKDAY":
          next = nextWeekday(base);
          break;
        case "WEEKLY":
          next = nextWeekly(base, rule, set);
          break;
        case "MONTHLY_DAY": {
          const interval = resolveMonthlyInterval(rule);
          const day = resolveMonthlyDay(rule, meta);
          next = nextMonthOnDay(base, day, interval);
          break;
        }
        case "MONTHLY_NTH": {
          const interval = resolveMonthlyInterval(rule);
          next = nextMonthOnNthDow(base, rule.nth, rule.dow, interval);
          break;
        }
        case "MONTHLY_LAST_DAY":
          next = nextMonthLastDay(base);
          break;
        case "MONTHLY_MULTI_DAY":
          next = nextMonthlyMultiDay(base, rule);
          break;
        case "MONTHLY_MIXED_DAY":
          next = nextMonthlyMixedDay(base, rule);
          break;
        case "MONTHLY_MULTI_NTH":
          next = nextMonthlyMultiNth(base, rule);
          break;
        case "MONTHLY_NTH_FROM_END":
          next = nextMonthlyNthFromEnd(base, rule);
          break;
        case "MONTHLY_NTH_WEEKDAY":
          next = nextMonthlyWeekday(base, rule);
          break;
        case "YEARLY":
          next = nextYearlyOnDay(base, rule, meta);
          break;
        case "YEARLY_NTH":
          next = nextYearlyNthDow(base, rule, meta);
          break;
        default:
          next = null;
      }
      if (!next) return null;
      const today = todayLocal();
      if (next < today && depth < 36) {
        const updatedMeta = { ...meta, due: next };
        return computeNextDue(updatedMeta, set, depth + 1, ruleOverride);
      }
      return next;
    }

    function nextWeekday(d) {
      let x = addDaysLocal(d, 1);
      while (isWeekend(x)) x = addDaysLocal(x, 1);
      return x;
    }
    function nextWeekly(base, rule, set) {
      const interval = Math.max(1, rule.interval || 1);
      const weekStartCode =
        (set && (set.weekStartCode || normalizeWeekStartCode(set.weekStart))) || DEFAULT_WEEK_START_CODE;
      if (!rule.byDay || rule.byDay.length === 0) {
        return addDaysLocal(base, 7 * interval);
      }
      const offsets = getOrderedWeekdayOffsets(rule.byDay, weekStartCode);
      if (!offsets.length) return addDaysLocal(base, 7 * interval);
      const weekAnchor = startOfWeek(base, weekStartCode);
      for (const offset of offsets) {
        const candidate = addDaysLocal(weekAnchor, offset);
        if (candidate > base) return candidate;
      }
      const nextAnchor = addDaysLocal(weekAnchor, 7 * interval);
      return addDaysLocal(nextAnchor, offsets[0]);
    }
    function nextMonthOnDay(base, day, interval = 1) {
      const step = Number.isFinite(interval) && interval > 0 ? Math.trunc(interval) : 1;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      const currentMonthCandidate = new Date(year, monthIndex, clampDayInMonth(year, monthIndex, day), 12, 0, 0, 0);
      if (currentMonthCandidate > base && step === 1) return currentMonthCandidate;
      ({ year, month: monthIndex } = advanceMonth(year, monthIndex, step));
      const safeDay = clampDayInMonth(year, monthIndex, day);
      return new Date(year, monthIndex, safeDay, 12, 0, 0, 0);
    }
    function nextMonthOnNthDow(base, nthText, dowCode, interval = 1) {
      const nthValue = ordFromText(nthText);
      if (nthValue == null) return null;
      const step = Number.isFinite(interval) && interval > 0 ? Math.trunc(interval) : 1;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      let candidate = computeNthDowForMonth(year, monthIndex, nthValue, dowCode);
      if (candidate && candidate > base && step === 1) {
        return candidate;
      }
      for (let attempts = 0; attempts < 48; attempts++) {
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, step));
        candidate = computeNthDowForMonth(year, monthIndex, nthValue, dowCode);
        if (candidate) return candidate;
      }
      return null;
    }

    function clampDayInMonth(year, monthIndex, desired) {
      const lastDay = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
      const numeric = Number.isFinite(desired) ? Math.trunc(desired) : lastDay;
      if (numeric < 1) return 1;
      if (numeric > lastDay) return lastDay;
      return numeric;
    }

    function applyOffsetToDate(base, offsetMs) {
      if (!(base instanceof Date) || Number.isNaN(base.getTime())) return null;
      if (!Number.isFinite(offsetMs)) return null;
      const next = new Date(base.getTime() + offsetMs);
      next.setHours(12, 0, 0, 0);
      return next;
    }

    function advanceMonth(year, monthIndex, step) {
      let nextMonth = monthIndex + step;
      let nextYear = year;
      while (nextMonth > 11) {
        nextMonth -= 12;
        nextYear += 1;
      }
      while (nextMonth < 0) {
        nextMonth += 12;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    }

    function nextMonthLastDay(base) {
      const y = base.getFullYear();
      const m = base.getMonth();
      const thisMonthEom = new Date(y, m + 1, 0, 12, 0, 0, 0);
      const isAtOrAfterEom = base.getDate() >= thisMonthEom.getDate();
      const targetMonth = isAtOrAfterEom ? m + 2 : m + 1;
      return new Date(y, targetMonth, 0, 12, 0, 0, 0);
    }

    function resolveYearlyMonth(rule, meta) {
      if (Number.isInteger(rule?.month) && rule.month >= 1 && rule.month <= 12) {
        return Math.trunc(rule.month);
      }
      const due = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      if (due) return due.getMonth() + 1;
      return todayLocal().getMonth() + 1;
    }

    function resolveYearlyDay(rule, meta) {
      if (Number.isInteger(rule?.day) && rule.day >= 1 && rule.day <= 31) {
        return Math.trunc(rule.day);
      }
      const due = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      if (due) return due.getDate();
      return todayLocal().getDate();
    }

    function nextYearlyOnDay(base, rule, meta) {
      const month = resolveYearlyMonth(rule, meta);
      const day = resolveYearlyDay(rule, meta);
      if (!month || !day) return null;
      const monthIndex = month - 1;
      let year = base.getFullYear();
      const candidate = new Date(year, monthIndex, clampDayInMonth(year, monthIndex, day), 12, 0, 0, 0);
      if (candidate > base) return candidate;
      year += 1;
      return new Date(year, monthIndex, clampDayInMonth(year, monthIndex, day), 12, 0, 0, 0);
    }

    function nextYearlyNthDow(base, rule, meta) {
      const month = resolveYearlyMonth(rule, meta);
      const nthValue = ordFromText(rule?.nth);
      const dow = rule?.dow;
      if (!month || nthValue == null || !dow) return null;
      const monthIndex = month - 1;
      let year = base.getFullYear();
      let candidate = computeNthDowForMonth(year, monthIndex, nthValue, dow);
      if (candidate && candidate > base) return candidate;
      for (let i = 0; i < 5; i++) {
        year += 1;
        candidate = computeNthDowForMonth(year, monthIndex, nthValue, dow);
        if (candidate) return candidate;
      }
      return null;
    }

    function nextMonthlyMultiNth(base, rule) {
      const dow = rule?.dow;
      const nths = Array.isArray(rule?.nths) ? rule.nths : [];
      if (!dow || !nths.length) return null;
      const ordinalValues = nths
        .map((token) => ordFromText(token))
        .filter((value) => value != null)
        .sort((a, b) => a - b);
      if (!ordinalValues.length) return null;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      for (let attempts = 0; attempts < 48; attempts++) {
        const monthCandidates = ordinalValues
          .map((nth) => computeNthDowForMonth(year, monthIndex, nth, dow))
          .filter(Boolean)
          .sort((a, b) => a - b);
        for (const candidate of monthCandidates) {
          if (attempts > 0 || candidate > base) {
            return candidate;
          }
        }
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, 1));
      }
      return null;
    }

    function nextMonthlyNthFromEnd(base, rule) {
      const nth = Number.isInteger(rule?.nth) ? rule.nth : Number.parseInt(rule?.nth, 10);
      const dow = rule?.dow;
      if (!nth || !dow) return null;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      for (let attempts = 0; attempts < 48; attempts++) {
        const candidate = nthDowFromEnd(year, monthIndex, dow, nth);
        if (candidate && (attempts > 0 || candidate > base)) return candidate;
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, 1));
      }
      return null;
    }

    function nextMonthlyWeekday(base, rule) {
      const nth = (rule?.nth || "").toString().toLowerCase();
      if (nth !== "first" && nth !== "last") return null;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      for (let attempts = 0; attempts < 48; attempts++) {
        const candidate =
          nth === "first" ? firstWeekdayOfMonth(year, monthIndex) : lastWeekdayOfMonth(year, monthIndex);
        if (candidate && (attempts > 0 || candidate > base)) return candidate;
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, 1));
      }
      return null;
    }

    function firstWeekdayOfMonth(year, monthIndex) {
      let d = new Date(year, monthIndex, 1, 12, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        if (!isWeekend(d)) return d;
        d = addDaysLocal(d, 1);
      }
      return null;
    }

    function lastWeekdayOfMonth(year, monthIndex) {
      let d = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        if (!isWeekend(d)) return d;
        d = addDaysLocal(d, -1);
      }
      return null;
    }

    function nextMonthlyMultiDay(base, rule) {
      const list = Array.isArray(rule.days) ? rule.days : [];
      if (!list.length) return null;
      const normalized = list
        .map((token) => (typeof token === "string" ? token.toUpperCase() : token))
        .map((token) => (token === "LAST" ? "LAST" : Number(token)))
        .filter((token) => token === "LAST" || (Number.isInteger(token) && token >= 1 && token <= 31))
        .sort((a, b) => {
          if (a === "LAST") return 1;
          if (b === "LAST") return -1;
          return a - b;
        });
      if (!normalized.length) return null;
      const y = base.getFullYear();
      const m = base.getMonth();
      const day = base.getDate();
      for (const token of normalized) {
        if (token === "LAST") {
          const candidate = new Date(y, m + 1, 0, 12, 0, 0, 0);
          if (candidate.getDate() > day) return candidate;
        } else if (token > day) {
          return new Date(y, m, token, 12, 0, 0, 0);
        }
      }
      const nextMonthBase = new Date(y, m + 1, 1, 12, 0, 0, 0);
      return nextMonthlyMultiDay(nextMonthBase, rule);
    }

    function nextMonthlyMixedDay(base, rule) {
      const days = Array.isArray(rule.days) ? rule.days : [];
      const includeLast = !!rule.last;
      const combined = [...days];
      if (includeLast) combined.push("LAST");
      return nextMonthlyMultiDay(base, { days: combined });
    }
    function nthDowOfMonth(first, dowCode, nth) {
      const target = DOW_IDX.indexOf(dowCode);
      if (target < 0) return null;
      let d = new Date(first.getTime());
      while (d.getDay() !== target) d = addDaysLocal(d, 1);
      d = addDaysLocal(d, 7 * (nth - 1));
      if (d.getMonth() !== first.getMonth()) return null;
      return d;
    }
    function nthDowFromEnd(year, monthIndex, dowCode, nthFromEnd) {
      const target = DOW_IDX.indexOf(dowCode);
      if (target < 0) return null;
      let x = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
      let count = 0;
      while (x.getMonth() === monthIndex) {
        if (x.getDay() === target) {
          count += 1;
          if (count === nthFromEnd) return new Date(x.getTime());
        }
        x = addDaysLocal(x, -1);
      }
      return null;
    }

    function computeNthDowForMonth(year, monthIndex, nthValue, dowCode) {
      if (nthValue == null) return null;
      if (nthValue > 0) {
        return nthDowOfMonth(new Date(year, monthIndex, 1, 12, 0, 0, 0), dowCode, nthValue);
      }
      return nthDowFromEnd(year, monthIndex, dowCode, Math.abs(nthValue));
    }

    // ========================= Date utils & formatting =========================
    function todayLocal() {
      const d = new Date();
      d.setHours(12, 0, 0, 0); // noon to dodge DST edges
      return d;
    }
    function startOfDayLocal(d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    }
    function addDaysLocal(d, n) {
      const x = new Date(d.getTime());
      x.setDate(x.getDate() + n);
      return x;
    }
    function startOfWeek(date, weekStartCode) {
      const target = weekStartCode && DOW_IDX.includes(weekStartCode) ? weekStartCode : DEFAULT_WEEK_START_CODE;
      let cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
      for (let i = 0; i < 7 && DOW_IDX[cursor.getDay()] !== target; i++) {
        cursor = addDaysLocal(cursor, -1);
      }
      return cursor;
    }
    function isWeekend(d) {
      const w = d.getDay(); // 0 Sun .. 6 Sat
      return w === 0 || w === 6;
    }
    function parseRoamDate(s) {
      if (!s) return null;
      const raw = String(s).trim();

      // 1) [[YYYY-MM-DD]] or bare YYYY-MM-DD
      let m = raw.match(/^\[\[(\d{4})-(\d{2})-(\d{2})\]\]$/);
      if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T12:00:00`);

      // 2) [[DNP title]] e.g. [[November 5th, 2025]] or bare DNP title "November 5th, 2025"
      const dnpTitle = raw.startsWith("[[") && raw.endsWith("]]") ? raw.slice(2, -2) : raw;

      // Prefer Roam's converter if available
      const util = window.roamAlphaAPI?.util;
      if (util?.pageTitleToDate) {
        try {
          const dt = util.pageTitleToDate(dnpTitle);
          if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
            // Normalize to noon to dodge DST edges
            dt.setHours(12, 0, 0, 0);
            return dt;
          }
        } catch (_) { }
      }

      // Fallback: strip ordinal ("st/nd/rd/th") and parse "Month Day, Year"
      const cleaned = dnpTitle.replace(/\b(\d{1,2})(st|nd|rd|th)\b/i, "$1");
      const parsed = new Date(`${cleaned} 12:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;

      return null;
    }
    function stripTimeFromDateText(text) {
      if (!text || typeof text !== "string") return text;
      let t = text.trim();
      // strip "at 3pm" or "at 15:30"
      t = t.replace(/\s+at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, "");
      // strip trailing "3pm" or "15:30"
      t = t.replace(/\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, "");
      // strip time-of-day words
      t = t
        .replace(/\b(morning|afternoon|evening|night)\b/gi, "")
        .replace(/\b(before|by)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, "")
        .replace(/\b(before|by)\s+lunch\b/gi, "")
        .replace(/\blunch\b/gi, "")
        .replace(/\b(noon|midnight)\b/gi, "")
        .replace(/\b(end of day|eod)\b/gi, "")
        .replace(/\bat\b\s*$/gi, "")
        .trim();
      // strip leading "every "
      t = t.replace(/^\s*every\s+/i, "").trim();
      return t.trim();
    }
    function hasTimeOnlyHint(text) {
      if (!text || typeof text !== "string") return false;
      const raw = text.toLowerCase();
      return (
        /\b(before|by)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/.test(raw) ||
        /\b\d{1,2}(:\d{2})?\s*(am|pm)?\b/.test(raw) ||
        /\b(morning|afternoon|evening|night|end of day|eod|lunch)\b/.test(raw) ||
        /\b(before|by)\s+lunch\b/.test(raw) ||
        /\b(noon|midnight)\b/.test(raw)
      );
    }

    function pickAnchorDateFromTimeHint(text, set) {
      if (!text || typeof text !== "string") return todayLocal();
      const raw = text.toLowerCase();
      const m =
        raw.match(/(before|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ||
        (/\bmorning\b/.test(raw) ? ["", "", "9", "00", "am"] : null) ||
        (/\bafternoon\b/.test(raw) ? ["", "", "14", "00", ""] : null) ||
        (/\bevening\b/.test(raw) ? ["", "", "18", "00", ""] : null) ||
        (/\bnight\b/.test(raw) ? ["", "", "20", "00", ""] : null) ||
        (/\b(end of day|eod)\b/.test(raw) ? ["", "", "17", "00", ""] : null) ||
        (/\blunch\b/.test(raw) ? ["", "", "12", "30", ""] : null) ||
        (/\bnoon\b/.test(raw) ? ["", "", "12", "00", ""] : null) ||
        (/\bmidnight\b/.test(raw) ? ["", "", "00", "00", ""] : null);
      if (!m) return todayLocal();
      let hour = parseInt(m[2], 10);
      const minute = m[3] ? parseInt(m[3], 10) : 0;
      const suffix = m[4]?.toLowerCase();
      if (suffix === "pm" && hour < 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      const anchor = now.getTime() <= target.getTime() ? todayLocal() : addDaysLocal(todayLocal(), 1);
      return anchor;
    }

    function parseWeekSpan(text, set) {
      if (!text || typeof text !== "string") return null;
      const raw = text.toLowerCase();
      if (!/\b(this week|sometime this week|later this week|start of this week|end of the week|end of week|before the end of the week)\b/.test(raw))
        return null;
      const start = startOfWeek(todayLocal(), set?.weekStartCode);
      const due = addDaysLocal(start, 6);
      return { start, due };
    }

    function parseWeekendSpan(text, set) {
      if (!text || typeof text !== "string") return null;
      const raw = text.toLowerCase();
      if (!/\b(this weekend|next weekend)\b/.test(raw)) return null;
      const now = new Date();
      const dow = now.getDay(); // 0 Sun .. 6 Sat
      const baseStart = startOfWeek(todayLocal(), set?.weekStartCode);
      const isLateSunday = raw.includes("this weekend") && dow === 0 && now.getHours() >= 12;
      const weekOffset = raw.includes("next weekend") || isLateSunday ? 7 : 0;
      const saturday = addDaysLocal(baseStart, weekOffset + 5);
      const sunday = addDaysLocal(saturday, 1);
      return { start: saturday, due: sunday };
    }
    function parseRelativeDateText(s, weekStartCode = DEFAULT_WEEK_START_CODE) {
      if (!s || typeof s !== "string") return null;
      let raw = s.trim().toLowerCase();
      if (!raw) return null;
      if (raw.startsWith("[[") && raw.endsWith("]]")) {
        raw = raw.slice(2, -2).trim();
      }
      if (raw === "today") return todayLocal();
      if (/^tomor+ow$/.test(raw) || raw === "tmr" || raw === "tmrw") {
        return addDaysLocal(todayLocal(), 1);
      }
      if (raw === "tonight") {
        return todayLocal();
      }
      if (raw === "next month") {
        const now = todayLocal();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = new Date(y, m + 1, 1, 12, 0, 0, 0);
        return d;
      }
      const nextMonthMatch = raw.match(/^(early|mid|late)\s+next\s+([a-z]+)$/);
      if (nextMonthMatch) {
        const descriptor = nextMonthMatch[1];
        const monthName = nextMonthMatch[2];
        const monthIndex = MONTH_MAP[monthName];
        if (monthIndex != null) {
          const now = todayLocal();
          const year = now.getFullYear() + (monthIndex - 1 < now.getMonth() ? 1 : 0);
          const day = descriptor === "early" ? 5 : descriptor === "mid" ? 15 : 25;
          return new Date(year, monthIndex - 1, day, 12, 0, 0, 0);
        }
      }
      const earlyMonthMatch = raw.match(/^(?:early|mid|late)\s+([a-z]+)$/);
      if (earlyMonthMatch) {
        const monthName = earlyMonthMatch[1];
        const monthIndex = MONTH_MAP[monthName];
        if (monthIndex != null) {
          const now = todayLocal();
          const year = now.getFullYear() + (monthIndex - 1 < now.getMonth() ? 1 : 0);
          const day = raw.startsWith("early") ? 5 : raw.startsWith("mid") ? 15 : 25;
          return new Date(year, monthIndex - 1, day, 12, 0, 0, 0);
        }
      }
      const nextWeekMatch = raw.match(/^(early|mid|late)\s+next\s+week$/);
      if (nextWeekMatch) {
        const descriptor = nextWeekMatch[1];
        const anchor = addDaysLocal(startOfWeek(todayLocal(), weekStartCode), 7);
        if (descriptor === "early") return anchor;
        if (descriptor === "mid") return addDaysLocal(anchor, 3);
        return addDaysLocal(anchor, 5);
      }
      if (raw === "next week") {
        const anchor = todayLocal();
        const thisWeekStart = startOfWeek(anchor, weekStartCode);
        return addDaysLocal(thisWeekStart, 7);
      }
      const thisWeekMatch = raw.match(/^(?:sometime|later|early)\s+this\s+week$/);
      if (thisWeekMatch) {
        const anchor = startOfWeek(todayLocal(), weekStartCode);
        if (/early/.test(raw)) return anchor;
        if (/later/.test(raw)) return addDaysLocal(anchor, 4);
        return anchor;
      }
      const thisDowMatch = raw.match(/^this\s+([a-z]+)$/);
      if (thisDowMatch) {
        const dowCode = dowFromAlias(thisDowMatch[1]);
        if (dowCode) {
          const today = todayLocal();
          const todayIdx = today.getDay(); // 0 Sun .. 6 Sat
          const targetIdx = DOW_IDX.indexOf(dowCode);
          let delta = targetIdx - todayIdx;
          if (delta <= 0) delta += 7;
          return addDaysLocal(today, delta);
        }
      }
      const theFirstMatch = raw.match(/^the\s+first(?:\s+of)?\s+every\s+month$/);
      if (theFirstMatch) {
        const now = todayLocal();
        const y = now.getFullYear();
        const m = now.getMonth();
        const todayDay = now.getDate();
        // if past the first, move to next month
        const targetMonth = todayDay > 1 ? m + 1 : m;
        return new Date(y, targetMonth, 1, 12, 0, 0, 0);
      }
      const nextDowMatch = raw.match(/^next\s+([a-z]+)$/);
      if (nextDowMatch) {
        const dowCode = dowFromAlias(nextDowMatch[1]);
        if (dowCode) return nextDowDate(todayLocal(), dowCode);
      }
      const weekdayCode = dowFromAlias(raw);
      if (weekdayCode) return nextDowDate(todayLocal(), weekdayCode);
      if (raw === "this weekend") {
        const now = new Date();
        const dow = now.getDay(); // 0 Sun .. 6 Sat
        if (dow === 0 && now.getHours() >= 12) {
          const anchorNext = addDaysLocal(startOfWeek(todayLocal(), weekStartCode), 7);
          return addDaysLocal(anchorNext, 5);
        }
        const anchor = startOfWeek(todayLocal(), weekStartCode);
        // weekend = Saturday of this week
        return addDaysLocal(anchor, 5);
      }
      if (raw === "next weekend") {
        const anchor = addDaysLocal(startOfWeek(todayLocal(), weekStartCode), 7);
        return addDaysLocal(anchor, 5);
      }
      return null;
    }
    function nextDowDate(anchor, dowCode) {
      if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) return null;
      if (!dowCode || !DOW_IDX.includes(dowCode)) return null;
      const current = DOW_IDX[anchor.getDay()];
      const curIdx = DOW_IDX.indexOf(current);
      const targetIdx = DOW_IDX.indexOf(dowCode);
      let delta = targetIdx - curIdx;
      if (delta <= 0) delta += 7;
      return addDaysLocal(anchor, delta);
    }
    function formatDate(d, set) {
      if (set.dateFormat === "ISO") {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      }
      // ROAM: always link to the Daily Note Page title, e.g. [[November 5th, 2025]]
      const title = toDnpTitle(d);
      return `[[${title}]]`;
    }

    // ========================= Render helpers =========================
    const TODO_MACRO_PREFIX_RE = /^\s*\{\{\s*(?:\[\[\s*TODO\s*\]\]|TODO)\s*\}\}\s*/i;
    const TODO_WORD_PREFIX_RE = /^\s*TODO\s+/i;
    const DONE_MACRO_PREFIX_RE = /^\s*\{\{\s*(?:\[\[\s*(?:DONE)\s*\]\]|DONE)\s*\}\}\s*/i;
    const DONE_WORD_PREFIX_RE = /^\s*DONE\s+/i;

    function normalizeToTodoMacro(s) {
      var t = s.replace(/^\s+/, "");
      if (/^\-\s+/.test(t)) t = t.replace(/^\-\s+/, "");
      // Match {{[[TODO]]}}, {{TODO}}, {{ [[DONE]] }}, etc.
      t = t.replace(/^\{\{\s*(?:\[\[(?:TODO|DONE)\]\]|(?:TODO|DONE))\s*\}\}\s*/i, "");
      t = t.replace(/^(?:TODO|DONE)\s+/i, "");
      return "{{[[TODO]]}} " + t;
    }

    function isBlockCompleted(block) {
      const text = (block?.string || "").trim();
      if (!text) return false;
      return DONE_MACRO_PREFIX_RE.test(text) || DONE_WORD_PREFIX_RE.test(text);
    }

    function isTaskBlock(block) {
      const text = (block?.string || "").trim();
      if (!text) return false;
      return (
        TODO_MACRO_PREFIX_RE.test(text) ||
        TODO_WORD_PREFIX_RE.test(text) ||
        DONE_MACRO_PREFIX_RE.test(text) ||
        DONE_WORD_PREFIX_RE.test(text)
      );
    }

    function formatTodoStateString(text, state = "TODO") {
      const base = normalizeToTodoMacro(text || "");
      if (state === "DONE") {
        return base.replace("{{[[TODO]]}}", "{{[[DONE]]}}");
      }
      return base;
    }

    async function setTaskTodoState(uid, state = "TODO") {
      const block = await getBlock(uid);
      if (!block) return;
      const alreadyDone = isBlockCompleted(block);
      if (state === "DONE" && alreadyDone) return;
      if (state === "TODO" && !alreadyDone) return;
      const next = formatTodoStateString(block.string || "", state);
      if (next === block.string) return;
      await updateBlockString(uid, next);
    }

    function removeInlineAttributes(text, keys) {
      if (!text) return text;
      const lower = keys.map((k) => k.toLowerCase());
      const cleanedLines = text.split("\n").map((line) => {
        let result = line;
        for (const key of lower) {
          const keyEsc = escapeRegExp(key);
          const inlinePattern = new RegExp(
            `(^|\\s)(${keyEsc}::\\s*[^\\n]*?)(?=(?:\\s+[\\p{L}\\p{N}_\\-/]+::)|$)`,
            "giu"
          );
          result = result.replace(inlinePattern, (match, leading) => leading || "");
        }
        return result;
      });
      return cleanedLines
        .filter((line) => {
          const trimmed = line.trim().toLowerCase();
          if (!trimmed) return false;
          return !lower.some((key) => trimmed.startsWith(`${key}::`));
        })
        .join("\n")
        .trimEnd();
    }

    function escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function replaceAttributeInString(text, key, value) {
      const source = typeof text === "string" ? text : "";
      const keyEsc = escapeRegExp(key);
      const regex = new RegExp(
        `(^|\\s)(${keyEsc}::\\s*)([^\\n]*?)(?=(?:\\s+[\\p{L}\\p{N}_\\-/]+::)|$)`,
        "iu"
      );
      if (regex.test(source)) {
        return source.replace(regex, (match, leading, prefix) => `${leading}${prefix}${value}`);
      }
      return source;
    }

    async function ensureInlineAttribute(block, key, value, options = {}) {
      if (!block || !block.uid) return;
      const original = block.string || "";
      const candidateKeys = Array.from(new Set([key, ...(options.aliases || [])]));
      let current = original;
      for (const candidate of candidateKeys) {
        const keyEsc = escapeRegExp(candidate);
        const hasAttr = new RegExp(`${keyEsc}::`, "i").test(current);
        if (!hasAttr) continue;
        const next = replaceAttributeInString(current, candidate, value);
        if (next && next !== current) {
          await updateBlockString(block.uid, next);
          block.string = next;
          current = next;
        }
        return;
      }
    }

    function shortId() {
      return Math.random().toString(36).slice(2, 8);
    }

    function requestSpawnConfirmation(meta, set) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const lang = getLanguageSetting();
        const titleText = translateString("Better Tasks", lang);
        const messageText = translateString("Spawn next occurrence?", lang);
        const yesLabel = t("buttons.yes", lang) || "Yes";
        const noLabel = t("buttons.no", lang) || "No";
        iziToast.question({
          theme: 'light',
          color: 'black',
          layout: 2,
          class: 'betterTasks bt-toast-strong-icon',
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          icon: "icon-check",
          iconText: "✓",
          iconColor: "#1f7a34",
          title: titleText,
          message: messageText,
          position: 'center',
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
          buttons: [
            [`<button>${escapeHtml(yesLabel)}</button>`, function (instance, toast, button, e, inputs) {
              instance.hide({ transitionOut: 'fadeOut' }, toast, 'button');
              finish(true);
            }, true], // true to focus
            [
              `<button>${escapeHtml(noLabel)}</button>`,
              function (instance, toast, button, e) {
                instance.hide({ transitionOut: "fadeOut" }, toast, "button");
                finish(false);
              },
            ],
          ],
          onClosed: () => finish(false),
        });
      });
    }

    function applyToastA11y(toastEl) {
      if (!toastEl) return;
      toastEl.setAttribute("role", "alert");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.setAttribute("aria-atomic", "true");
    }

    function toast(msg, timer = 3000, className = "betterTasks bt-toast-info") {
      const lang = getLanguageSetting();
      const message =
        typeof msg === "string"
          ? translateString(msg, lang)
          : msg;
      iziToast.show({
        theme: 'light',
        color: 'black',
        message: message,
        class: className,
        position: 'center',
        close: false,
        closeOnEscape: true,
        timeout: timer,
        closeOnClick: true,
        displayMode: 2,
        onOpening: (_instance, toastEl) => {
          applyToastA11y(toastEl);
        },
      });
    }

    function showPersistentToast(msg, opts = {}) {
      const lang = getLanguageSetting();
      const message = typeof msg === "string" ? translateString(msg, lang) : msg;
      try {
        return iziToast.show({
          theme: "light",
          color: "black",
          message,
          class: "betterTasks",
          position: "center",
          id: "betterTasks-ai-pending",
          close: true,
          closeOnEscape: true,
          timeout: false,
          closeOnClick: true,
          displayMode: 2,
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
          onClosed: () => {
            if (typeof opts.onClosed === "function") {
              opts.onClosed();
            }
          },
        });
      } catch (err) {
        console.warn("[BetterTasks] showPersistentToast failed", err);
        return null;
      }
    }

    function hideToastInstance(instance) {
      const fallbackId = "betterTasks-ai-pending";
      const targetEl =
        (instance && instance.toastRef) ||
        (instance && instance.toast) ||
        (instance && instance.el) ||
        (typeof instance === "string" ? document.getElementById(instance) : null) ||
        document.getElementById(fallbackId);
      if (!targetEl) return;
      try {
        iziToast.hide({ transitionOut: "fadeOut" }, targetEl);
      } catch (err) {
        console.warn("[BetterTasks] hideToastInstance failed", err);
      }
      try {
        if (targetEl.id) {
          iziToast.destroy(targetEl.id);
        }
      } catch (_) {
        // best effort cleanup
      }
    }

    function pruneSetMax(set, maxSize) {
      if (!set || maxSize <= 0) return;
      while (set.size > maxSize) {
        const oldest = set.values().next().value;
        if (oldest === undefined) break;
        set.delete(oldest);
      }
    }

    function noteRepeatParseFailure(uid) {
      if (!uid || invalidRepeatToasted.has(uid)) return;
      invalidRepeatToasted.add(uid);
      pruneSetMax(invalidRepeatToasted, MAX_INVALID_PARSE_TOASTED);
      toast(t(["toasts", "couldNotParseRecurrence"], getLanguageSetting()) || "Could not parse the task recurrence pattern. Please check your task and review the README for supported patterns.");
    }

    function clearRepeatParseFailure(uid) {
      if (!uid) return;
      invalidRepeatToasted.delete(uid);
    }

    function noteDueParseFailure(uid) {
      if (!uid || invalidDueToasted.has(uid)) return;
      invalidDueToasted.add(uid);
      pruneSetMax(invalidDueToasted, MAX_INVALID_PARSE_TOASTED);
      toast(t(["toasts", "cannotParseDue"], getLanguageSetting()) || "Could not parse the task due date. Please ensure it uses Roam's standard date format (e.g. [[November 8th, 2025]]).");
    }

    function clearDueParseFailure(uid) {
      if (!uid) return;
      invalidDueToasted.delete(uid);
    }

    // ========================= Pill UI helpers =========================
    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function promptForValue({ title, message, placeholder, initial }) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const lang = getLanguageSetting();
        const titleText = translateString(title, lang);
        const messageText = translateString(message, lang);
        const placeholderText = translateString(placeholder || "", lang);
        const saveLabel = t("buttons.save", lang) || "Save";
        const cancelLabel = t("buttons.cancel", lang) || "Cancel";
        const inputClass = `rt-prompt-input-${Date.now()}`;
        const inputHtml = `<input type="text" class="${inputClass}" placeholder="${escapeHtml(
          placeholderText || ""
        )}" value="${escapeHtml(initial || "")}" />`;
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks bt-toast-strong-icon",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          icon: "icon-check",
          iconText: "✓",
          iconColor: "#1f7a34",
          title: titleText,
          message: messageText,
          inputs: [
            [
              inputHtml,
              "keyup",
              function (_instance, _toast, input) {
                initial = input.value;
              },
            ],
          ],
          buttons: [/*
            [
              "<button>Today</button>",
              (instance, toastInstance) => {
                const today = todayLocal();
                const formatted = formatDate(today, S());
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(formatted);
              },
            ],
            [
              "<button>Tomorrow</button>",
              (instance, toastInstance) => {
                const tomorrow = addDaysLocal(todayLocal(), 1);
                const formatted = formatDate(tomorrow, S());
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(formatted);
              },
            ],*/
            [
              `<button>${escapeHtml(saveLabel)}</button>`,
              (instance, toastInstance, _button, _e, inputs) => {
                const val = inputs?.[0]?.value?.trim();
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(val || null);
              },
              true,
            ],
            [
              `<button>${escapeHtml(cancelLabel)}</button>`,
              (instance, toastInstance) => {
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(null);
              },
            ],
          ],
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
          onOpened: (_instance, toastEl) => {
            const input = toastEl.querySelector?.(`.${inputClass}`);
            input?.focus?.();
            if (input && typeof input.selectionStart === "number") {
              const len = input.value.length;
              input.setSelectionRange(len, len);
            }
          },
          onClosed: () => finish(null),
        });
      });
    }

    let projectPickerStylesInjected = false;
    function ensureProjectPickerStyles() {
      if (projectPickerStylesInjected || typeof document === "undefined") return;
      projectPickerStylesInjected = true;
      const style = document.createElement("style");
      style.id = "rt-project-picker-style";
      style.textContent = `
        .rt-project-picker {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-width: 360px;
        }
        .rt-project-picker__list {
          max-height: 220px;
          overflow-y: auto;
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 6px;
          padding: 4px;
          background: #fff;
        }
        .rt-project-picker__option {
          all: unset;
          display: block;
          width: 100%;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .rt-project-picker__option:hover {
          background: rgba(0,0,0,0.06);
        }
        .rt-project-picker__empty {
          color: rgba(0,0,0,0.6);
          padding: 6px 8px;
        }
        .rt-project-picker__input {
          width: 100%;
          padding: 6px 8px;
          border-radius: 4px;
          border: 1px solid rgba(0,0,0,0.2);
        }
      `;
      document.head.appendChild(style);
    }

    function promptForDashView({ title = "Better Tasks", placeholder = "Filter views", views = [], initialId = null } = {}) {
      const options = Array.isArray(views) ? views : [];
      const lang = getLanguageSetting();
      const titleText = translateString(title, lang);
      const placeholderText = translateString(placeholder, lang);
      const cancelLabel = t("buttons.cancel", lang) || "Cancel";
      const inputClass = `bt-view-input-${Date.now()}`;
      const listId = `bt-view-list-${Date.now()}`;
      ensureProjectPickerStyles();
      const sortByName = (a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
      const sorted = options.slice().sort(sortByName);
      return new Promise((resolve) => {
        let settled = false;
        let toastElement = null;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(typeof value === "string" ? value : null);
        };
        const hideToast = () => {
          if (toastElement) {
            iziToast.hide({}, toastElement);
          }
        };
        const renderOptions = (container, filterText) => {
          if (!container) return;
          container.textContent = "";
          const filter = (filterText || "").trim().toLowerCase();
          const matches = sorted.filter((v) =>
            filter ? String(v?.name || "").toLowerCase().includes(filter) : true
          );
          if (!matches.length) {
            const empty = document.createElement("div");
            empty.className = "rt-project-picker__empty";
            empty.textContent = "No views";
            container.appendChild(empty);
            return;
          }
          matches.forEach((v) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "rt-project-picker__option";
            btn.textContent = v.name;
            if (initialId && v.id === initialId) {
              btn.style.background = "rgba(0,0,0,0.08)";
              btn.style.fontWeight = "600";
            }
            btn.addEventListener("click", () => {
              hideToast();
              finish(v.id);
            });
            container.appendChild(btn);
          });
        };
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks bt-toast-strong-icon",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          icon: "icon-check",
          iconText: "✓",
          title: titleText,
          message: `
            <div class="rt-project-picker">
              <input type="text" class="rt-project-picker__input ${inputClass}" placeholder="${escapeHtml(
            placeholderText
          )}" value="" />
              <div class="rt-project-picker__list" id="${listId}"></div>
            </div>
          `,
          buttons: [
            [
              `<button>${escapeHtml(cancelLabel)}</button>`,
              (_instance, toastEl) => {
                toastElement = toastEl || toastElement;
                hideToast();
                finish(null);
              },
            ],
          ],
          onOpening: (_instance, toastEl) => {
            toastElement = toastEl;
            applyToastA11y(toastEl);
            const input = toastEl.querySelector?.(`.${inputClass}`);
            const list = toastEl.querySelector?.(`#${listId}`);
            renderOptions(list, "");
            if (input) {
              input.addEventListener("input", () => renderOptions(list, input.value));
              input.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  hideToast();
                  finish(null);
                }
              });
              input.focus();
            }
          },
          onClosed: () => finish(null),
        });
      });
    }

    const ATTR_PICKER_CONFIG = {
      project: {
        refresh: refreshProjectOptions,
        getOptions: getProjectOptions,
        addOption: addProjectOption,
        normalize: normalizeProjectValue,
        stringsKey: "projectPicker",
        emptyKey: "projectPicker",
      },
      waitingFor: {
        refresh: refreshWaitingOptions,
        getOptions: getWaitingOptions,
        addOption: addWaitingOption,
        normalize: normalizeWaitingValue,
        stringsKey: "waitingPicker",
        emptyKey: "waitingPicker",
      },
      context: {
        refresh: refreshContextOptions,
        getOptions: getContextOptions,
        addOption: addContextOption,
        normalize: normalizeContextValue,
        stringsKey: "contextPicker",
        emptyKey: "contextPicker",
      },
    };

    async function promptForAttribute(type = "project", { initialValue = "", allowMulti = false } = {}) {
      const cfg = ATTR_PICKER_CONFIG[type] || ATTR_PICKER_CONFIG.project;
      await cfg.refresh?.(true);
      const lang = getLanguageSetting();
      const pickerStrings = t(cfg.stringsKey, lang) || {};
      const titleText = translateString(pickerStrings.title || "Select", lang);
      const placeholderText = translateString(pickerStrings.placeholder || "Search or create", lang);
      const noItemsText = translateString(pickerStrings.noItems || "No options yet — type to create one", lang);
      const saveLabel = t("buttons.save", lang) || "Save";
      const cancelLabel = t("buttons.cancel", lang) || "Cancel";
      const inputClass = `rt-attr-input-${Date.now()}`;
      const listId = `rt-attr-list-${Date.now()}`;
      ensureProjectPickerStyles();
      const normalize = cfg.normalize || ((v) => (typeof v === "string" ? v.trim() : ""));
      const initialList = allowMulti
        ? Array.isArray(initialValue)
          ? initialValue.map(normalize).filter(Boolean)
          : typeof initialValue === "string" && initialValue.includes(",")
            ? initialValue.split(",").map(normalize).filter(Boolean)
            : initialValue
              ? [normalize(initialValue)]
              : []
        : [initialValue].filter(Boolean).map(normalize);
      return new Promise((resolve) => {
        let settled = false;
        let current = allowMulti ? initialList : initialList[0] || "";
        let toastElement = null;
        const hideToast = () => {
          if (toastElement) {
            iziToast.hide({}, toastElement);
          }
        };
        const finish = (value) => {
          if (settled) return;
          settled = true;
          if (allowMulti) {
            const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
            const normalizedList = list.map(normalize).filter(Boolean);
            resolve(normalizedList.length ? normalizedList : null);
          } else {
            const normalized = normalize(value);
            resolve(normalized || null);
          }
        };
        const renderOptions = (container, filterText, onSelect, selectedSet) => {
          if (!container) return;
          container.textContent = "";
          const filter = (filterText || "").trim().toLowerCase();
          const options = cfg.getOptions ? cfg.getOptions() : [];
          const matches = options.filter((opt) => (filter ? opt.toLowerCase().includes(filter) : true));
          if (!matches.length) {
            const empty = document.createElement("div");
            empty.className = "rt-project-picker__empty";
            empty.textContent = noItemsText;
            container.appendChild(empty);
            return;
          }
          matches.forEach((opt) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "rt-project-picker__option";
            btn.textContent = opt;
            if (allowMulti && selectedSet?.has(opt)) {
              btn.style.background = "rgba(0,0,0,0.08)";
              btn.style.fontWeight = "600";
            }
            btn.addEventListener("click", () => onSelect(opt));
            container.appendChild(btn);
          });
        };
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks bt-toast-strong-icon",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          icon: "icon-check",
          iconText: "✓",
          title: titleText,
          message: `
            <div class="rt-project-picker">
              <input type="text" class="rt-project-picker__input ${inputClass}" placeholder="${escapeHtml(
            placeholderText
          )}" value="${allowMulti ? "" : escapeHtml(current || "")}" />
              <div class="rt-project-picker__list" id="${listId}"></div>
            </div>
          `,
          buttons: [
            [
              `<button>${escapeHtml(saveLabel)}</button>`,
              (_instance, toastEl) => {
                toastElement = toastEl || toastElement;
                const input = toastEl?.querySelector(`.${inputClass}`);
                const domVal = typeof input?.value === "string" ? input.value : "";
                if (allowMulti) {
                  const selected = new Set(Array.isArray(current) ? current : []);
                  if (domVal && domVal.trim()) selected.add(normalize(domVal));
                  finish(Array.from(selected));
                } else {
                  finish(domVal || current || "");
                }
                hideToast();
              },
              true,
            ],
            [
              `<button>${escapeHtml(cancelLabel)}</button>`,
              (_instance, toastEl) => {
                toastElement = toastEl || toastElement;
                hideToast();
                finish(null);
              },
            ],
          ],
          onOpening: (_instance, toastEl) => {
            toastElement = toastEl;
            applyToastA11y(toastEl);
            const input = toastEl.querySelector(`.${inputClass}`);
            const list = toastEl.querySelector(`#${listId}`);
            const selectAndClose = (val) => {
              if (allowMulti) {
                const selected = new Set(Array.isArray(current) ? current : []);
                selected.add(normalize(val));
                const next = Array.from(selected);
                current = next;
                finish(next);
                hideToast();
              } else {
                if (toastElement) {
                  iziToast.hide({}, toastElement);
                }
                finish(val);
              }
            };
            const selectedSet = new Set(Array.isArray(current) ? current : []);
            renderOptions(list, "", selectAndClose, selectedSet);
            if (input) {
              input.addEventListener("input", () => {
                const filterVal = input.value;
                renderOptions(list, filterVal, selectAndClose, selectedSet);
              });
              input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  selectAndClose(input.value);
                }
              });
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            }
          },
          onClosed: () => finish(null),
        });
      });
    }

    const promptForProject = (opts = {}) => promptForAttribute("project", { ...opts, allowMulti: false });
    const promptForWaiting = (opts = {}) => promptForAttribute("waitingFor", { ...opts, allowMulti: false });
    const promptForContext = (opts = {}) => promptForAttribute("context", { ...opts, allowMulti: true });

    function promptForDate({ title, message, initial }) {
      return new Promise((resolve) => {
        let settled = false;
        let current = typeof initial === "string" ? initial : "";
        let inputEl = null;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const lang = getLanguageSetting();
        const titleText = translateString(title, lang);
        const messageText = translateString(message, lang);
        const saveLabel = t("buttons.save", lang) || "Save";
        const cancelLabel = t("buttons.cancel", lang) || "Cancel";
        const dateInputClass = `rt-inline-date-${Date.now()}`;
        const inputHtml = `<input type="date" class="${dateInputClass}" value="${escapeHtml(current)}" />`;
        const shortcutSet = S();
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks bt-toast-strong-icon",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          icon: "icon-check",
          iconText: "✓",
          iconColor: "#1f7a34",
          title: titleText,
          message: messageText,
          inputs: [
            [
              inputHtml,
              "input",
              function (_instance, _toast, input) {
                current = input.value;
              },
              true,
            ],
          ],
          buttons: [
            [
              `<button>${escapeHtml(saveLabel)}</button>`,
              (instance, toastInstance, _button, _e, inputs) => {
                const raw =
                  inputEl?.value ??
                  inputs?.[0]?.value ??
                  current ??
                  "";
                const val = raw.trim();
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(val || null);
              },
              true,
            ],
            [
              `<button>${escapeHtml(cancelLabel)}</button>`,
              (instance, toastInstance) => {
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(null);
              },
            ],
          ],
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
            const input = toastEl.querySelector(`.${dateInputClass}`);
            if (!input) return;
            inputEl = input;
            let row = input.parentElement;
            if (!row || !row.classList.contains("rt-date-inline-wrap")) {
              row = document.createElement("div");
              row.className = "rt-date-inline-wrap";
              input.parentNode?.insertBefore(row, input);
              row.appendChild(input);
            }
            const shortcutWrap = document.createElement("div");
            shortcutWrap.className = "rt-date-shortcuts-inline";
            const makeBtn = (label, offsetDays) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.textContent = label;
              btn.addEventListener("click", () => {
                const date = addDaysLocal(todayLocal(), offsetDays);
                const iso = formatIsoDate(date, shortcutSet);
                input.value = iso;
                current = iso;
                input.dispatchEvent(new Event("input", { bubbles: true }));
              });
              return btn;
            };
            shortcutWrap.appendChild(makeBtn("Today", 0));
            shortcutWrap.appendChild(makeBtn("Tomorrow", 1));
            row.appendChild(shortcutWrap);
          },
          onClosed: () => finish(null),
        });
      });
    }

    async function promptForRepeatAndDue(initial = {}) {
      const includeTaskText = true;
      const setSnapshot = S();
      const snapshot = {
        repeat: typeof initial.repeat === "string" && initial.repeat ? initial.repeat : initial.repeatRaw || "",
        due:
          typeof initial.due === "string" && initial.due
            ? initial.due
            : initial.dueText || initial.rawDue || "",
        task:
          includeTaskText && typeof initial.taskText === "string" && initial.taskText
            ? initial.taskText
            : includeTaskText && typeof initial.taskTextRaw === "string"
              ? initial.taskTextRaw
              : "",
        start:
          typeof initial.start === "string" && initial.start
            ? initial.start
            : initial.startText || initial.rawStart || "",
        defer:
          typeof initial.defer === "string" && initial.defer
            ? initial.defer
            : initial.deferText || initial.rawDefer || "",
        project: typeof initial.project === "string" ? initial.project : "",
        waitingFor: typeof initial.waitingFor === "string" ? initial.waitingFor : "",
        context: Array.isArray(initial.context) ? initial.context.join(", ") : typeof initial.context === "string" ? initial.context : "",
        priority: typeof initial.priority === "string" ? initial.priority : "",
        energy: typeof initial.energy === "string" ? initial.energy : "",
        gtd: typeof initial.gtd === "string" ? initial.gtd : "",
      };
      const initialDueDate = snapshot.due ? parseRoamDate(snapshot.due) : null;
      const initialDueIso =
        initialDueDate instanceof Date && !Number.isNaN(initialDueDate.getTime())
          ? formatIsoDate(initialDueDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.due || "")
            ? snapshot.due
            : "";
      snapshot.dueIso = initialDueIso;
      const initialStartDate = snapshot.start ? parseRoamDate(snapshot.start) : null;
      const initialStartIso =
        initialStartDate instanceof Date && !Number.isNaN(initialStartDate.getTime())
          ? formatIsoDate(initialStartDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.start || "")
            ? snapshot.start
            : "";
      snapshot.startIso = initialStartIso;
      const initialDeferDate = snapshot.defer ? parseRoamDate(snapshot.defer) : null;
      const initialDeferIso =
        initialDeferDate instanceof Date && !Number.isNaN(initialDeferDate.getTime())
          ? formatIsoDate(initialDeferDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.defer || "")
            ? snapshot.defer
            : "";
      snapshot.deferIso = initialDeferIso;
      await refreshProjectOptions();
      await refreshWaitingOptions();
      await refreshContextOptions();
      const projectOptions = getProjectOptions();
      const projectDatalistId = `rt-project-options-${Date.now()}`;
      const projectDatalistOptions = projectOptions
        .map((opt) => `<option value="${escapeHtml(opt)}"></option>`)
        .join("");
      const projectPickerLabel = t(["projectPicker", "button"], getLanguageSetting()) || "Select";
      const waitingPickerLabel = t(["waitingPicker", "button"], getLanguageSetting()) || projectPickerLabel;
      const contextPickerLabel = t(["contextPicker", "button"], getLanguageSetting()) || projectPickerLabel;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const lang = getLanguageSetting();
        const formStrings = t("prompts.form", lang) || {};
        const metaStrings = t("metadata", lang) || {};
        const filterValues = t("dashboard.filterValues", lang) || {};
        const labelOr = (key, fallback) => formStrings[key] || metaStrings[key] || fallback;
        const placeholderOr = (key, fallback) => formStrings[key] || fallback;
        const optionLabel = (group, val, fallback) => {
          const grp = formStrings[group] || {};
          if (grp && grp[val]) return grp[val];
          if (filterValues && filterValues[val]) return filterValues[val];
          return fallback;
        };
        const taskInputHtml = `<label class="rt-input-wrap">${escapeHtml(
          formStrings.taskLabel || "Task *"
        )}<br/><input data-rt-field="task" type="text" placeholder="${escapeHtml(
          formStrings.taskPlaceholder || "Task text"
        )}" value="${escapeHtml(snapshot.task || "")}" /></label>`;
        const repeatInputHtml = `<label class="rt-input-wrap">${escapeHtml(
          formStrings.repeatLabel || "Repeat"
        )}<br/><input data-rt-field="repeat" type="text" placeholder="${escapeHtml(
          formStrings.repeatPlaceholder || "Repeat rule (optional)"
        )}" value="${escapeHtml(snapshot.repeat || "")}" /></label>`;
        const dateInputClass = `rt-date-input-${Date.now()}`;
        const startInputHtml = `<label class="rt-input-wrap">${escapeHtml(
          formStrings.startLabel || "Start"
        )}<br/><input data-rt-field="start" type="date" value="${escapeHtml(snapshot.startIso || "")}" /></label>`;
        const deferInputHtml = `<label class="rt-input-wrap">${escapeHtml(
          formStrings.deferLabel || "Defer"
        )}<br/><input data-rt-field="defer" type="date" value="${escapeHtml(snapshot.deferIso || "")}" /></label>`;
        const dueInputHtml = `<label class="rt-input-wrap">${escapeHtml(
          formStrings.dueLabel || "Due"
        )}<br/><input data-rt-field="due" type="date" class="${dateInputClass}" value="${escapeHtml(
          snapshot.dueIso || ""
        )}" /></label>`;
        const projectLabel = formStrings.projectLabel || metaStrings.project || "Project";
        const gtdLabel = formStrings.gtdLabel || metaStrings.gtd || "GTD status";
        const waitingLabel = formStrings.waitingLabel || metaStrings.waitingFor || "Waiting-for";
        const priorityLabel = formStrings.priorityLabel || metaStrings.priority || "Priority";
        const energyLabel = formStrings.energyLabel || metaStrings.energy || "Energy";
        const contextLabel = formStrings.contextLabel || metaStrings.context || "Context(s)";
        const metadataHtml = `
          <div class="rt-meta-section">
            <div class="rt-meta-grid">
              <label class="rt-input-wrap">${escapeHtml(projectLabel)}<br/>
                <div class="rt-project-inline-row">
                  <input data-rt-field="project" type="text" list="${projectDatalistId}" placeholder="${escapeHtml(
          placeholderOr("projectPlaceholder", "Project")
        )}" value="${escapeHtml(snapshot.project || "")}" />
                  <button type="button" class="rt-project-inline-btn" data-rt-action="project-picker">${escapeHtml(
          projectPickerLabel
        )}</button>
                </div>
                <datalist id="${projectDatalistId}">${projectDatalistOptions}</datalist>
              </label>
              <label class="rt-input-wrap">${escapeHtml(gtdLabel)}<br/>
                <select data-rt-field="gtd">
                  <option value=""></option>
                  <option value="next action"${snapshot.gtd === "next action" ? " selected" : ""
          }>${escapeHtml(optionLabel("gtdOptions", "next action", "Next Action"))}</option>
                  <option value="delegated"${snapshot.gtd === "delegated" ? " selected" : ""
          }>${escapeHtml(optionLabel("gtdOptions", "delegated", "Delegated"))}</option>
                  <option value="deferred"${snapshot.gtd === "deferred" ? " selected" : ""
          }>${escapeHtml(optionLabel("gtdOptions", "deferred", "Deferred"))}</option>
                  <option value="someday"${snapshot.gtd === "someday" ? " selected" : ""
          }>${escapeHtml(optionLabel("gtdOptions", "someday", "Someday"))}</option>
                </select>
              </label>
              <label class="rt-input-wrap">${escapeHtml(waitingLabel)}<br/>
                <div class="rt-project-inline-row">
                  <input data-rt-field="waitingFor" type="text" placeholder="${escapeHtml(
            placeholderOr("waitingPlaceholder", "Waiting-for")
          )}" value="${escapeHtml(snapshot.waitingFor || "")}" />
                  <button type="button" class="rt-project-inline-btn" data-rt-action="waiting-picker">${escapeHtml(
            waitingPickerLabel
          )}</button>
                </div>
              </label>
              <label class="rt-input-wrap">${escapeHtml(priorityLabel)}<br/>
                <select data-rt-field="priority">
                  <option value=""></option>
                  <option value="low"${snapshot.priority === "low" ? " selected" : ""
          }>${escapeHtml(optionLabel("priorityOptions", "low", "Low"))}</option>
                  <option value="medium"${snapshot.priority === "medium" ? " selected" : ""
          }>${escapeHtml(optionLabel("priorityOptions", "medium", "Medium"))}</option>
                  <option value="high"${snapshot.priority === "high" ? " selected" : ""
          }>${escapeHtml(optionLabel("priorityOptions", "high", "High"))}</option>
                </select>
              </label>
              <label class="rt-input-wrap">${escapeHtml(contextLabel)}<br/>
                <div class="rt-project-inline-row">
                  <input data-rt-field="context" type="text" placeholder="${escapeHtml(
            placeholderOr("contextPlaceholder", "@home, @work")
          )}" value="${escapeHtml(snapshot.context || "")}" />
                  <button type="button" class="rt-project-inline-btn" data-rt-action="context-picker">${escapeHtml(
            contextPickerLabel
          )}</button>
                </div>
              </label>
              <label class="rt-input-wrap">${escapeHtml(energyLabel)}<br/>
                <select data-rt-field="energy">
                  <option value=""></option>
                  <option value="low"${snapshot.energy === "low" ? " selected" : ""
          }>${escapeHtml(optionLabel("energyOptions", "low", "Low"))}</option>
                  <option value="medium"${snapshot.energy === "medium" ? " selected" : ""
          }>${escapeHtml(optionLabel("energyOptions", "medium", "Medium"))}</option>
                  <option value="high"${snapshot.energy === "high" ? " selected" : ""
          }>${escapeHtml(optionLabel("energyOptions", "high", "High"))}</option>
                </select>
              </label>
            </div>
          </div>
        `;
        const fieldSelectors = {
          task: '[data-rt-field="task"]',
          repeat: '[data-rt-field="repeat"]',
          due: '[data-rt-field="due"]',
          start: '[data-rt-field="start"]',
          defer: '[data-rt-field="defer"]',
          project: '[data-rt-field="project"]',
          waitingFor: '[data-rt-field="waitingFor"]',
          context: '[data-rt-field="context"]',
          priority: '[data-rt-field="priority"]',
          energy: '[data-rt-field="energy"]',
          gtd: '[data-rt-field="gtd"]',
        };
        const promptMessage = includeTaskText
          ? formStrings.messageWithTask || "Enter the task text, optional repeat rule, dates, and metadata."
          : formStrings.messageWithoutTask || "Enter an optional repeat rule, dates, and metadata.";
        const messageHtml = promptMessage;
        const inputs = [];
        if (includeTaskText) {
          inputs.push([
            taskInputHtml,
            "input",
            function (_instance, _toast, input) {
              snapshot.task = input.value;
            },
            true,
          ]);
        }
        const repeatConfig = [
          repeatInputHtml,
          "input",
          function (_instance, _toast, input) {
            snapshot.repeat = input.value;
          },
        ];
        if (!includeTaskText) repeatConfig.push(true);
        inputs.push(repeatConfig);
        inputs.push([
          startInputHtml,
          "input",
          function (_instance, _toast, input) {
            if (input?.type === "date") {
              snapshot.startIso = input.value;
            }
          },
        ]);
        inputs.push([
          deferInputHtml,
          "input",
          function (_instance, _toast, input) {
            if (input?.type === "date") {
              snapshot.deferIso = input.value;
            }
          },
        ]);
        inputs.push([
          dueInputHtml,
          "input",
          function (_instance, _toast, input) {
            if (input?.type === "date") {
              snapshot.dueIso = input.value;
            }
          },
        ]);
        const titleText = translateString("Better Tasks", lang);
        const saveLabel = t("buttons.save", lang) || "Save";
        const cancelLabel = t("buttons.cancel", lang) || "Cancel";
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks2 bt-toast-strong-icon",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          title: titleText,
          icon: "icon-check",
          iconText: "✓",
          iconColor: "#3a7c2b",
          message: translateString(messageHtml, lang),
          inputs,
          buttons: [
            [
              `<button type="button">${escapeHtml(saveLabel)}</button>`,
              async (instance, toastEl, _btn, _event, inputsArray) => {
                const getFieldValue = (name) => {
                  const el = toastEl?.querySelector(fieldSelectors[name]);
                  const domVal = typeof el?.value === "string" ? el.value : "";
                  if (domVal && domVal.trim()) return domVal.trim();
                  if (Array.isArray(inputsArray)) {
                    const indexMap = includeTaskText
                      ? { task: 0, repeat: 1, start: 2, defer: 3, due: 4 }
                      : { repeat: 0, start: 1, defer: 2, due: 3 };
                    const idx = indexMap[name];
                    if (idx != null && inputsArray[idx]?.value) {
                      const v = String(inputsArray[idx].value).trim();
                      if (v) return v;
                    }
                  }
                  switch (name) {
                    case "task":
                      return (snapshot.task || "").trim();
                    case "repeat":
                      return (snapshot.repeat || "").trim();
                    case "start":
                      return snapshot.startIso || "";
                    case "defer":
                      return snapshot.deferIso || "";
                    case "due":
                      return snapshot.dueIso || "";
                    case "project":
                      return snapshot.project || "";
                    case "waitingFor":
                      return snapshot.waitingFor || "";
                    case "context":
                      return snapshot.context || "";
                    case "priority":
                      return snapshot.priority || "";
                    case "energy":
                      return snapshot.energy || "";
                    case "gtd":
                      return snapshot.gtd || "";
                    default:
                      return "";
                  }
                };
                const taskValueRaw = includeTaskText ? getFieldValue("task") : "";
                if (includeTaskText) snapshot.task = taskValueRaw;
                const taskValue = taskValueRaw.trim();
                if (includeTaskText && !taskValue) {
                  toast("Task text is required.");
                  toastEl?.querySelector(fieldSelectors.task)?.focus?.();
                  return;
                }
                const repeatValue = getFieldValue("repeat");
                const dueIso = getFieldValue("due");
                const startIso = getFieldValue("start");
                const deferIso = getFieldValue("defer");
                const projectVal = normalizeProjectValue(getFieldValue("project"));
                const waitingVal = getFieldValue("waitingFor");
                const contextVal = getFieldValue("context");
                const priorityVal = getFieldValue("priority");
                const energyVal = getFieldValue("energy");
                const gtdVal = getFieldValue("gtd");
                const normalizedRepeat =
                  repeatValue ? normalizeRepeatRuleText(repeatValue) || repeatValue : "";
                let dueText = null;
                let dueDate = null;
                if (dueIso) {
                  dueDate = parseRoamDate(dueIso);
                  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
                    toast("Couldn't parse that date.");
                    toastEl?.querySelector(fieldSelectors.due)?.focus?.();
                    return;
                  }
                  dueText = dueIso;
                }
                let startText = null;
                let startDate = null;
                if (startIso) {
                  startDate = parseRoamDate(startIso);
                  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
                    toast("Couldn't parse that date.");
                    toastEl?.querySelector(fieldSelectors.start)?.focus?.();
                    return;
                  }
                  startText = startIso;
                }
                let deferText = null;
                let deferDate = null;
                if (deferIso) {
                  deferDate = parseRoamDate(deferIso);
                  if (!(deferDate instanceof Date) || Number.isNaN(deferDate.getTime())) {
                    toast("Couldn't parse that date.");
                    toastEl?.querySelector(fieldSelectors.defer)?.focus?.();
                    return;
                  }
                  deferText = deferIso;
                }
                await delay(TOAST_HIDE_DELAY_MS);
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                if (projectVal) addProjectOption(projectVal);
                finish({
                  repeat: normalizedRepeat || "",
                  repeatRaw: repeatValue,
                  due: dueText,
                  dueDate,
                  start: startText,
                  startDate,
                  defer: deferText,
                  deferDate,
                  taskText: includeTaskText ? taskValue : undefined,
                  taskTextRaw: includeTaskText ? taskValueRaw : undefined,
                  project: projectVal || "",
                  waitingFor: waitingVal || "",
                  context: contextVal || "",
                  priority: priorityVal || "",
                  energy: energyVal || "",
                  gtd: gtdVal || "",
                });
              },
              true,
            ],
            [
              `<button type="button">${escapeHtml(cancelLabel)}</button>`,
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish(null);
              },
            ],
          ],
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
          onOpened: (_instance, toastEl) => {
            if (!toastEl) return;
            const inputsContainer = toastEl.querySelector(".iziToast-inputs");
            if (inputsContainer) {
              inputsContainer.querySelector(".rt-meta-section")?.remove();
              const frag = document.createElement("div");
              frag.innerHTML = metadataHtml;
              const section = frag.firstElementChild;
              if (section) inputsContainer.appendChild(section);
            }
            // Ensure metadata fields reflect current snapshot values (e.g., after back navigation)
            const assignIfPresent = (selector, value) => {
              const el = toastEl.querySelector(selector);
              if (el) el.value = value;
            };
            assignIfPresent(fieldSelectors.gtd, snapshot.gtd || "");
            assignIfPresent(fieldSelectors.project, snapshot.project || "");
            assignIfPresent(fieldSelectors.waitingFor, snapshot.waitingFor || "");
            assignIfPresent(fieldSelectors.context, snapshot.context || "");
            assignIfPresent(fieldSelectors.priority, snapshot.priority || "");
            assignIfPresent(fieldSelectors.energy, snapshot.energy || "");

            const projectButton = toastEl.querySelector('[data-rt-action="project-picker"]');
            if (projectButton) {
              projectButton.addEventListener("click", async (event) => {
                event.preventDefault();
                await refreshProjectOptions();
                const currentVal =
                  toastEl.querySelector(fieldSelectors.project)?.value || snapshot.project || "";
                const selection = await promptForProject({ initialValue: currentVal });
                if (selection != null) {
                  const normalized = normalizeProjectValue(selection);
                  snapshot.project = normalized;
                  const projectInput = toastEl.querySelector(fieldSelectors.project);
                  if (projectInput) projectInput.value = normalized;
                  addProjectOption(normalized);
                }
              });
            }
            const waitingButton = toastEl.querySelector('[data-rt-action="waiting-picker"]');
            if (waitingButton) {
              waitingButton.addEventListener("click", async (event) => {
                event.preventDefault();
                await refreshWaitingOptions();
                const currentVal =
                  toastEl.querySelector(fieldSelectors.waitingFor)?.value || snapshot.waitingFor || "";
                const selection = await promptForWaiting({ initialValue: currentVal });
                if (selection != null) {
                  snapshot.waitingFor = selection;
                  const input = toastEl.querySelector(fieldSelectors.waitingFor);
                  if (input) input.value = selection;
                  addWaitingOption(selection);
                }
              });
            }

            const contextButton = toastEl.querySelector('[data-rt-action="context-picker"]');
            if (contextButton) {
              contextButton.addEventListener("click", async (event) => {
                event.preventDefault();
                await refreshContextOptions();
                const currentVal =
                  toastEl.querySelector(fieldSelectors.context)?.value || snapshot.context || "";
                const initialContexts = currentVal
                  ? currentVal.split(",").map((v) => v.trim()).filter(Boolean)
                  : [];
                const selection = await promptForContext({ initialValue: initialContexts });
                if (selection != null) {
                  const val = Array.isArray(selection) ? selection.join(", ") : selection || "";
                  snapshot.context = val;
                  const input = toastEl.querySelector(fieldSelectors.context);
                  if (input) input.value = val;
                  (Array.isArray(selection) ? selection : [val]).forEach((ctx) => addContextOption(ctx));
                }
              });
            }

            const focusPrimaryInput = () => {
              const selectors = includeTaskText
                ? ["input[data-rt-field=\"task\"]", "input[data-rt-field=\"repeat\"]"]
                : ["input[data-rt-field=\"repeat\"]"];
              for (const selector of selectors) {
                const field = toastEl.querySelector(selector);
                if (field) {
                  field.focus();
                  if (field.setSelectionRange && typeof field.value === "string") {
                    const len = field.value.length;
                    field.setSelectionRange(len, len);
                  }
                  return true;
                }
              }
              return false;
            };
            let attempts = 0;
            const tryFocus = () => {
              attempts += 1;
              if (focusPrimaryInput()) return;
              if (attempts < 5) requestAnimationFrame(tryFocus);
            };
            requestAnimationFrame(tryFocus);

            const handleArrowToPicker = (event) => {
              if (event.key !== "ArrowDown") return;
              const input = event.currentTarget;
              if (!input) return;
              event.preventDefault();
              if (typeof input.showPicker === "function") {
                try {
                  input.showPicker();
                  return;
                } catch (_) { }
              }
              try {
                input.focus();
                input.click();
              } catch (_) { }
            };
            for (const key of ["start", "defer", "due"]) {
              toastEl.querySelectorAll(fieldSelectors[key])?.forEach((input) => {
                input.addEventListener("keydown", handleArrowToPicker);
              });
            }
          },
          onClosed: () => finish(null),
        });
      });
    }

    async function ensureAdvancePreference(uid, block, meta, set, checkbox) {
      const existing = normalizeAdvanceValue(meta.advanceFrom);
      if (existing) return existing;
      // In bulk mode, default to "due" without prompting to avoid multiple dialogs
      if (bulkOperationInProgress) {
        const defaultChoice = "due";
        await ensureAdvanceChildAttr(uid, defaultChoice, meta, set.attrNames);
        meta.advanceFrom = defaultChoice;
        return defaultChoice;
      }
      const choice = await promptAdvanceModeSelection(meta, set);
      if (!choice) {
        await revertBlockCompletion(block);
        if (checkbox) checkbox.checked = false;
        toast("Better Task completion cancelled.");
        if (activeDashboardController) {
          await activeDashboardController.notifyBlockChange?.(uid);
          if (activeDashboardController.isOpen?.()) {
            await activeDashboardController.refresh?.({ reason: "advance-cancel" });
          }
        }
        return null;
      }
      await ensureAdvanceChildAttr(uid, choice, meta, set.attrNames);
      meta.advanceFrom = choice;
      return choice;
    }

    async function promptAdvanceModeSelection(meta, set) {
      const rule = parseRuleText(meta.repeat, set);
      const dueSet = { ...set, advanceFrom: "due" };
      const completionSet = { ...set, advanceFrom: "completion" };
      const previewLimit = determineAdvancePreviewLimit(rule);
      const duePreview = previewOccurrences(meta, dueSet, previewLimit);
      const completionPreview = previewOccurrences(meta, completionSet, previewLimit);
      const message = `
        <div class="rt-advance-choice">
          <p>Select how this series should schedule future occurrences.</p>
          <p><strong>Due date</strong>: ${escapeHtml(formatPreviewDates(duePreview, set))}</p>
          <p><strong>Completion date</strong>: ${escapeHtml(formatPreviewDates(completionPreview, set))}</p>
          <p class="rt-note">You can change this later by editing the <code>${ADVANCE_ATTR}</code> child block.</p>
        </div>
      `;
      return new Promise((resolve) => {
        let resolved = false;
        const finish = (value) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks bt-toast-strong-icon",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          icon: "icon-check",
          iconText: "✓",
          iconColor: "#1f7a34",
          title: translateString("Choose scheduling mode", getLanguageSetting()),
          message,
          buttons: [
            [
              `<button>${escapeHtml(t(["buttons", "dueDate"], getLanguageSetting()) || "Due date")}</button>`,
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish("due");
              },
              true,
            ],
            [
              `<button>${escapeHtml(t(["buttons", "completionDate"], getLanguageSetting()) || "Completion date")}</button>`,
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish("completion");
              },
            ],
            [
              `<button>${escapeHtml(t(["buttons", "cancel"], getLanguageSetting()) || "Cancel")}</button>`,
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish(null);
              },
            ],
          ],
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
          onClosed: () => finish(null),
        });
      });
    }

    function determineAdvancePreviewLimit(rule) {
      if (!rule) return 1;
      if (rule.kind === "WEEKLY" && Array.isArray(rule.byDay) && rule.byDay.length > 1) {
        return Math.min(rule.byDay.length, 3);
      }
      return 1;
    }

    function previewOccurrences(meta, setOverride, limit = 1) {
      const clone = cloneMetaForPreview(meta);
      const dates = [];
      for (let i = 0; i < limit; i++) {
        const next = computeNextDue(clone, setOverride);
        if (!(next instanceof Date)) break;
        dates.push(new Date(next.getTime()));
        clone.due = new Date(next.getTime());
      }
      return dates;
    }

    function cloneMetaForPreview(meta) {
      return {
        uid: meta.uid,
        repeat: meta.repeat,
        due: meta.due ? new Date(meta.due.getTime()) : null,
        start: meta.start ? new Date(meta.start.getTime()) : null,
        defer: meta.defer ? new Date(meta.defer.getTime()) : null,
        childAttrMap: clonePlain(meta.childAttrMap || {}),
        props: clonePlain(meta.props || {}),
        advanceFrom: meta.advanceFrom || null,
      };
    }

    function formatPreviewDates(dates, set) {
      if (!dates.length) return "Not available";
      if (dates.length === 1) return formatFriendlyDate(dates[0], set);
      return dates.map((d) => formatFriendlyDate(d, set)).join(" → ");
    }

    function handleAttributeNameChange() {
      const prev = lastAttrNames || resolveAttributeNames();
      const next = resolveAttributeNames();
      updateAttrNameHistory(prev, next);
      lastAttrNames = next;
      repeatOverrides.clear();
      scheduleSurfaceSync(lastAttrSurface);
      void refreshProjectOptions(true);
    }

    function scheduleSurfaceSync(surface) {
      if (pendingSurfaceSync) clearTimeout(pendingSurfaceSync);
      pendingSurfaceSync = setTimeout(() => {
        pendingSurfaceSync = null;
        const current = lastAttrSurface || surface || "Child";
        void syncPillsForSurface(current);
      }, 200);
    }

    function clearAllPills(removeStyle = true) {
      document.querySelectorAll?.(".rt-pill-wrap")?.forEach((el) => el.remove());
      if (removeStyle) {
        const style = document.getElementById("rt-pill-style");
        if (style?.parentNode) style.parentNode.removeChild(style);
        const menuStyle = document.getElementById("rt-pill-menu-style");
        if (menuStyle?.parentNode) menuStyle.parentNode.removeChild(menuStyle);
      }
    }

    function ensurePillStyles() {
      if (document.getElementById("rt-pill-style")) return;
      const style = document.createElement("style");
      style.id = "rt-pill-style";
      style.textContent = `
        .rt-pill-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-left: 12px;
          flex-wrap: wrap;
        }
        .rt-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 12px;
          border: 1px solid var(--rt-pill-border, #ccc);
          font-size: 12px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s ease, border-color 0.15s ease;
          background: var(--rt-pill-bg, rgba(0, 0, 0, 0.03));
        }
        .rt-pill:hover {
          background: rgba(0,0,0,0.08);
          border-color: var(--rt-pill-border-hover, #bbb);
        }
        .rt-pill-inline {
          float: right;
        }
        .rt-pill-repeat,
        .rt-pill-due,
        .rt-pill-start,
        .rt-pill-defer {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .rt-pill-meta {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }
        .rt-pill-icon {
          font-size: 11px;
          line-height: 1;
          opacity: 0.8;
        }
        .rt-pill-text {
          line-height: 1.2;
        }
        .rt-pill-menu-btn {
          margin-left: 6px;
          font-weight: 600;
          cursor: pointer;
          padding: 0 4px;
        }
        .rt-pill-menu-btn:hover {
          background: rgba(0,0,0,0.12);
        }
      `;
      document.head.appendChild(style);
    }

    function ensureTodayPanelStyles() {
      if (document.getElementById("bt-today-style")) return;
      const style = document.createElement("style");
      style.id = "bt-today-style";
      style.textContent = `
        .bt-today-panel-root {
          width: 100%;
          box-sizing: border-box;
          padding: 6px 8px;
          margin-left: 14px;
        }
        .bt-today-panel__header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .bt-today-panel__section {
          margin-bottom: 6px;
        }
        .bt-today-panel__section-header {
          font-weight: 600;
          cursor: default;
          margin-bottom: 4px;
        }
        .bt-today-panel__list {
          list-style: none;
          padding-left: 14px;
          margin: 0;
        }
        .bt-today-panel__row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }
        .bt-today-panel__row-title {
          background: transparent;
          border: none;
          padding: 0;
          text-align: left;
          cursor: pointer;
          font: inherit;
          color: inherit;
        }
        .bt-today-panel__item--completed .bt-today-panel__row-title {
          text-decoration: line-through;
          opacity: 0.6;
        }
        .bt-today-panel__row-actions {
          display: flex;
          gap: 6px;
        }
        .bt-today-panel__icon-btn {
          border: 1px solid var(--bt-border, rgba(0,0,0,0.22));
          border-radius: 6px;
          background: var(--bt-panel-bg, #fff);
          padding: 2px 6px;
          cursor: pointer;
          color: var(--bt-panel-text, inherit);
          box-shadow: 0 1px 2px rgba(0,0,0,0.14);
        }
      `;
      document.head.appendChild(style);
    }

    function getTodaySetting(settingId) {
      return extensionAPI.settings.get(settingId);
    }

    function getLanguageSetting(override = null) {
      const normalizeLanguageValue = (raw) => {
        let val = normalizeTodaySettingValue(raw);
        if (val && typeof val === "object" && "value" in val) {
          val = val.value;
        }
        if (typeof val !== "string") return null;
        const cleaned = val.trim();
        if (!cleaned) return null;
        const lower = cleaned.toLowerCase();
        if (lower === "zh-hant" || lower === "zh_hant" || lower === "zh-tw" || lower === "zh-hk") {
          return "zhHant";
        }
        if (lower === "zh-hans" || lower === "zh_hans" || lower === "zh-cn") {
          return "zh";
        }
        return cleaned;
      };
      const candidates = [override, extensionAPI?.settings?.get?.(LANGUAGE_SETTING), currentLanguage];
      for (const raw of candidates) {
        const normalized = normalizeLanguageValue(raw);
        if (normalized && SUPPORTED_LANGUAGES.includes(normalized)) {
          currentLanguage = normalized;
          return currentLanguage;
        }
      }
      currentLanguage = "en";
      return currentLanguage;
    }

    function t(path, lang = "en") {
      const parts = Array.isArray(path) ? path : String(path || "").split(".");
      const resolve = (obj) =>
        parts.reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), obj);
      const primary = resolve(I18N_MAP?.[lang]);
      if (primary !== undefined) return primary;
      if (lang !== "en") {
        const fallback = resolve(I18N_MAP?.en);
        if (fallback !== undefined) return fallback;
      }
      return undefined;
    }

    function translateString(raw, lang = getLanguageSetting()) {
      if (typeof raw !== "string") return raw;
      const path = EN_STRING_PATH_MAP.get(raw);
      if (path) {
        const translated = t(path, lang);
        if (typeof translated === "string") return translated;
      }
      return raw;
    }

    function translateMetaValue(type, value, lang = getLanguageSetting()) {
      if (!value) return "";
      const key = String(value).trim().toLowerCase();
      const val =
        t(["dashboard", "filterValues", key], lang) ||
        t(["metadata", type], lang) ||
        null;
      if (val) return val;
      if (type === "gtd") return formatGtdStatusDisplay(value);
      if (type === "priority" || type === "energy") return formatPriorityEnergyDisplay(value);
      return value;
    }

    function normalizeTodayWidgetEnabled(raw) {
      if (raw === undefined || raw === null) return false; // default off (first install)
      if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
      if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
      const norm = typeof raw === "string" ? raw.trim().toLowerCase() : raw;
      if (norm === "off" || norm === "no") return false;
      return !!raw;
    }

    function getTodayWidgetEnabled() {
      if (todayEnabledOverride !== null && todayEnabledOverride !== undefined) {
        return !!todayEnabledOverride;
      }
      const raw = getTodaySetting(TODAY_WIDGET_ENABLE_SETTING);
      return normalizeTodayWidgetEnabled(raw);
    }

    function normalizeTodaySettingValue(raw) {
      if (raw && typeof raw === "object" && raw.target) {
        const t = raw.target;
        if (t.type === "checkbox" && "checked" in t) return t.checked;
        if ("value" in t) return t.value;
        if ("checked" in t) return t.checked;
      }
      return raw;
    }

    function setTodayEnabledOverride(value) {
      todayEnabledOverride = value;
      const clearIfPersisted = () => {
        const stored = normalizeTodayWidgetEnabled(extensionAPI.settings.get(TODAY_WIDGET_ENABLE_SETTING));
        if (stored === normalizeTodayWidgetEnabled(value)) {
          todayEnabledOverride = null;
        }
      };
      setTimeout(clearIfPersisted, 6000);
      setTimeout(clearIfPersisted, 12000);
    }

    async function handleTodaySettingChange(settingId = null, value = undefined) {
      const prevAnchorText =
        settingId === TODAY_WIDGET_TITLE_SETTING ? getTodayAnchorText() : null;
      const prevAnchorNormalized = prevAnchorText ? normalizeMatchText(prevAnchorText) : "";
      const normalizedValue = normalizeTodaySettingValue(value);
      if (settingId) {
        try {
          extensionAPI.settings.set(settingId, normalizedValue);
        } catch (err) {
          console.warn("[BetterTasks] failed to persist Today setting", settingId, err);
        }
      }
      // Force next render to bypass caches/snapshots when settings change.
      dashboardTaskCache?.clear?.();
      lastTodayWidgetSignature = null;
      lastTodayInlineSignature = null;
      if (settingId === TODAY_WIDGET_ENABLE_SETTING && !normalizeTodayWidgetEnabled(normalizedValue)) {
        setTodayEnabledOverride(normalizedValue);
        rebuildSettingsPanel(false);
        await disableTodayWidgetUI();
        return;
      }
      if (settingId === TODAY_WIDGET_ENABLE_SETTING) {
        setTodayEnabledOverride(normalizedValue);
        rebuildSettingsPanel(normalizeTodayWidgetEnabled(normalizedValue), currentLanguage, getTodayBadgeEnabled());
      }
      if (todayWidgetRenderTimer) {
        clearTimeout(todayWidgetRenderTimer);
        todayWidgetRenderTimer = null;
      }
      if (settingId === TODAY_WIDGET_TITLE_SETTING) {
        if (todayTitleChangeDebounceTimer) {
          clearTimeout(todayTitleChangeDebounceTimer);
          todayTitleChangeDebounceTimer = null;
        }
        // Debounce title changes to avoid creating/moving anchors while the user types.
        todayTitleChangeDebounceTimer = setTimeout(() => {
          todayTitleChangeDebounceTimer = null;
          const nextAnchorNormalized = normalizeMatchText(getTodayAnchorText());
          if (prevAnchorNormalized && prevAnchorNormalized !== nextAnchorNormalized) {
            todayAnchorTextHistory.delete(prevAnchorNormalized);
            void removeAllTodayAnchorsByQuery({
              includeHeading: false,
              textsOverride: [prevAnchorNormalized],
            });
          }
          scheduleTodayWidgetRender(120, true);
          scheduleTodayBadgeRefresh(120, true);
        }, 450);
        return;
      }
      // Single forced render using the override to avoid flicker from double renders.
      scheduleTodayWidgetRender(40, true);
      scheduleTodayBadgeRefresh(80, true);
    }

    async function handleTodayBadgeSettingChange(settingId = null, value = undefined) {
      const normalizedValue = normalizeTodaySettingValue(value);
      if (settingId) {
        try {
          extensionAPI.settings.set(settingId, normalizedValue);
        } catch (err) {
          console.warn("[BetterTasks] failed to persist Today badge setting", settingId, err);
        }
      }
      if (settingId === TODAY_BADGE_ENABLE_SETTING) {
        rebuildSettingsPanel(getTodayWidgetEnabled(), currentLanguage, !!normalizedValue);
        if (!normalizedValue) {
          removeTodayBadge();
          return;
        }
      }
      const isVisualChange =
        settingId === TODAY_BADGE_BG_SETTING ||
        settingId === TODAY_BADGE_FG_SETTING ||
        settingId === TODAY_BADGE_LABEL_SETTING;
      if (isVisualChange) {
        lastTodayBadgeSignature = null; // force DOM update for visual changes
        const currentCount = todayBadgeCountNode ? parseInt(todayBadgeCountNode.textContent || "0", 10) || 0 : 0;
        const existingColors = getTodayBadgeColors();
        const sanitizeColor = (val) => {
          if (typeof val !== "string") return null;
          const trimmed = val.trim();
          if (!trimmed) return null; // empty means fall back to default
          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) return trimmed;
          if (/^rgba?\(/i.test(trimmed)) return trimmed;
          if (/^hsla?\(/i.test(trimmed)) return trimmed;
          if (/^[a-zA-Z]+$/.test(trimmed)) return trimmed; // allow named colors
          return null;
        };
        const nextBg =
          settingId === TODAY_BADGE_BG_SETTING
            ? sanitizeColor(normalizedValue)
            : existingColors.bg;
        const nextFg =
          settingId === TODAY_BADGE_FG_SETTING
            ? sanitizeColor(normalizedValue)
            : existingColors.fg;
        const nextLabel =
          settingId === TODAY_BADGE_LABEL_SETTING && typeof normalizedValue === "string"
            ? normalizedValue
            : null;
        if (settingId === TODAY_BADGE_BG_SETTING) {
          todayBadgeOverrides.bg = nextBg;
        }
        if (settingId === TODAY_BADGE_FG_SETTING) {
          todayBadgeOverrides.fg = nextFg;
        }
        if (settingId === TODAY_BADGE_LABEL_SETTING && typeof normalizedValue === "string") {
          todayBadgeOverrides.label = normalizedValue;
        }
        ensureTodayBadgeDom(currentCount, {
          colors: { bg: nextBg || null, fg: nextFg || null },
          labelText: nextLabel || undefined,
        });
        if (todayBadgeCountNode) {
          todayBadgeCountNode.style.backgroundColor = nextBg || "";
          todayBadgeCountNode.style.color = nextFg || "";
        }
        if (todayBadgeLabelNode && nextLabel) {
          todayBadgeLabelNode.textContent = nextLabel;
        }
      }
      scheduleTodayBadgeRefresh(0, true);
    }

    function handleLanguageChange(nextValue = null) {
      const raw =
        nextValue?.value ??
        nextValue?.target?.value ??
        nextValue;
      if (typeof raw === "string" && SUPPORTED_LANGUAGES.includes(raw)) {
        currentLanguage = raw;
      } else {
        currentLanguage = getLanguageSetting();
      }
      rebuildSettingsPanel(getTodayWidgetEnabled(), currentLanguage, getTodayBadgeEnabled());
      try {
        activeDashboardController?.refreshLanguage?.();
      } catch (err) {
        console.warn("[BetterTasks] failed to refresh dashboard for language change", err);
      }
      scheduleTodayWidgetRender(100, true);
      scheduleSurfaceSync(lastAttrSurface || "Child");
    }

    function getTodayWidgetLayout() {
      const raw = getTodaySetting(TODAY_WIDGET_LAYOUT_SETTING);
      if (raw === "Panel") return "panel";
      if (raw === "Roam-style inline") return "roamInline";
      const norm = typeof raw === "string" ? raw.trim().toLowerCase() : String(raw ?? "").toLowerCase();
      if (norm === "panel") return "panel";
      if (norm === "roam-style inline" || norm === "inline") return "roamInline";
      if (raw === 1 || raw === "1") return "roamInline";
      if (raw === 0 || raw === "0") return "panel";
      return "roamInline";
    }

    function getTodayWidgetIncludeOverdue() {
      const raw = getTodaySetting(TODAY_WIDGET_OVERDUE_SETTING);
      if (raw === undefined || raw === null) return false; // default off (first install)
      if (raw === false) return false;
      const norm = typeof raw === "string" ? raw.trim().toLowerCase() : String(raw ?? "").toLowerCase();
      if (["false", "0", "off", "no"].includes(norm)) return false;
      return true;
    }

    function getTodayWidgetShowCompleted() {
      return !!getTodaySetting(TODAY_WIDGET_COMPLETED_SETTING);
    }

    function getTodayWidgetPlacement() {
      const raw = getTodaySetting(TODAY_WIDGET_PLACEMENT_SETTING);
      return raw === "Bottom" ? "Bottom" : "Top";
    }

    function getTodayBadgeEnabled() {
      return !!extensionAPI.settings.get(TODAY_BADGE_ENABLE_SETTING);
    }

    function getTodayBadgeLabel() {
      if (todayBadgeOverrides.label) return todayBadgeOverrides.label;
      const raw = extensionAPI.settings.get(TODAY_BADGE_LABEL_SETTING);
      const configured = typeof raw === "string" && raw.trim() ? raw.trim() : null;
      return configured || getTodayAnchorText();
    }

    function getTodayBadgeIncludeOverdue() {
      const raw = extensionAPI.settings.get(TODAY_BADGE_OVERDUE_SETTING);
      if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
      return true;
    }

    function getTodayBadgeColors() {
      const bg = todayBadgeOverrides.bg || extensionAPI.settings.get(TODAY_BADGE_BG_SETTING);
      const fg = todayBadgeOverrides.fg || extensionAPI.settings.get(TODAY_BADGE_FG_SETTING);
      return {
        bg: (typeof bg === "string" && bg.trim()) || null,
        fg: (typeof fg === "string" && fg.trim()) || null,
      };
    }

    function getTodayWidgetHeadingLevel() {
      const raw = getTodaySetting(TODAY_WIDGET_HEADING_SETTING);
      if (raw === 1 || raw === "1" || raw === "H1") return 1;
      if (raw === 2 || raw === "2" || raw === "H2") return 2;
      if (raw === 3 || raw === "3" || raw === "H3") return 3;
      if (typeof raw === "string") {
        const norm = raw.trim().toLowerCase();
        if (norm === "h1" || norm === "heading 1") return 1;
        if (norm === "h2" || norm === "heading 2") return 2;
        if (norm === "h3" || norm === "heading 3") return 3;
      }
      return 0; // None / default
    }

    function readTodayConfig() {
      const layout = getTodayWidgetLayout();
      const includeOverdue = getTodayWidgetIncludeOverdue();
      const showCompleted = getTodayWidgetShowCompleted();
      const placement = getTodayWidgetPlacement();
      const heading = getTodayWidgetHeadingLevel();
      const anchorText = getTodayAnchorText();
      const signature = [
        layout,
        includeOverdue ? "overdue" : "nooverdue",
        showCompleted ? "showdone" : "hidedone",
        placement,
        `h${heading}`,
        `t:${anchorText}`,
      ].join("|");
      return { layout, includeOverdue, showCompleted, placement, heading, anchorText, signature };
    }

    function getPillCheckboxThreshold() {
      const raw = extensionAPI.settings.get(PILL_THRESHOLD_SETTING);
      if (typeof raw === "string") {
        const match = raw.trim().match(/^\d+$/);
        if (match) {
          const parsed = parseInt(match[0], 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      }
      return DEFAULT_PILL_THRESHOLD;
    }

    function scheduleTodayWidgetRender(delayMs = 200, force = false) {
      if (!TODAY_WIDGET_ENABLED || !getTodayWidgetEnabled()) return;

      const now = Date.now();

      // If circuit breaker is tripped, ignore schedules until cooldown ends.
      if (todayWidgetCbTrippedUntil && now < todayWidgetCbTrippedUntil) {
        // Optional: once per cooldown, log a warning (avoid spamming console)
        if (!scheduleTodayWidgetRender._cbWarnedAt || now - scheduleTodayWidgetRender._cbWarnedAt > 1000) {
          scheduleTodayWidgetRender._cbWarnedAt = now;
          console.warn(
            `[BetterTasks] Today widget circuit breaker active; skipping render scheduling for ${Math.ceil(
              (todayWidgetCbTrippedUntil - now) / 1000
            )}s`
          );
        }
        return;
      }

      // Reset breaker window if needed
      if (!todayWidgetCbWindowStart || now - todayWidgetCbWindowStart > TODAY_WIDGET_CB_WINDOW_MS) {
        todayWidgetCbWindowStart = now;
        todayWidgetCbCount = 0;
      }

      todayWidgetCbCount++;

      // Trip breaker if too many schedules in the window
      if (todayWidgetCbCount > TODAY_WIDGET_CB_MAX) {
        todayWidgetCbTrippedUntil = now + TODAY_WIDGET_CB_COOLDOWN_MS;

        // Stop any pending timer; we’re bailing out.
        if (todayWidgetRenderTimer) {
          clearTimeout(todayWidgetRenderTimer);
          todayWidgetRenderTimer = null;
        }

        console.error(
          `[BetterTasks] Today widget circuit breaker TRIPPED (>${TODAY_WIDGET_CB_MAX} schedules in ${TODAY_WIDGET_CB_WINDOW_MS}ms). ` +
          `Pausing renders for ${Math.ceil(TODAY_WIDGET_CB_COOLDOWN_MS / 1000)}s.`
        );

        /*
        try {
          window.roamAlphaAPI?.ui?.showToast?.({
            message:
              "Better Tasks paused Today widget renders temporarily (safety circuit breaker). " +
              "If this persists, please disable/re-enable the Today widget in settings.",
            intent: "warning",
            timeout: 8000,
          });
        } catch (_) { }
        */
        return;
      }

      if (todayWidgetRenderTimer) clearTimeout(todayWidgetRenderTimer);
      todayWidgetRenderTimer = setTimeout(() => {
        todayWidgetRenderTimer = null;
        const idle = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
        if (idle) {
          idle(
            () => {
              void renderTodayWidget(force);
            },
            { timeout: 1200 }
          );
        } else {
          void renderTodayWidget(force);
        }
      }, delayMs);
    }

    function resetTodayWidgetCircuitBreaker() {
      todayWidgetCbWindowStart = 0;
      todayWidgetCbCount = 0;
      todayWidgetCbTrippedUntil = 0;
      scheduleTodayWidgetRender._cbWarnedAt = 0;
    }

    function attachTodayNavigationListener() {
      if (todayNavListenerAttached) return;
      if (typeof window === "undefined") return;
      todayNavListener = () => scheduleTodayWidgetRender(80, true);
      try {
        window.addEventListener("hashchange", todayNavListener, { passive: true });
        window.addEventListener("popstate", todayNavListener, { passive: true });
        todayNavListenerAttached = true;
      } catch (_) {
        // ignore
      }
    }

    function detachTodayNavigationListener() {
      if (!todayNavListenerAttached || typeof window === "undefined") return;
      const trigger = todayNavListener;
      try {
        window.removeEventListener("hashchange", trigger, { passive: true });
        window.removeEventListener("popstate", trigger, { passive: true });
      } catch (_) {
        // ignore
      } finally {
        todayNavListenerAttached = false;
        todayNavListener = null;
      }
    }
    detachTodayNavigationListenerGlobal = detachTodayNavigationListener;

    function scheduleTodayBadgeRefresh(delayMs = 120, force = false) {
      if (!getTodayBadgeEnabled()) return;
      if (todayBadgeRefreshTimer) clearTimeout(todayBadgeRefreshTimer);
      todayBadgeRefreshTimer = setTimeout(() => {
        todayBadgeRefreshTimer = null;
        void renderTodayBadge(force);
      }, delayMs);
    }

    async function disableTodayWidgetUI() {
      if (todayWidgetRenderTimer) {
        clearTimeout(todayWidgetRenderTimer);
        todayWidgetRenderTimer = null;
      }
      todayWidgetForceNext = false;
      lastTodayWidgetSignature = null;
      lastTodayInlineSignature = null;
      lastTodayRenderAt = 0;
      todayInlineChildUids.clear();
      todayHeadingRecheckPending = false;
      todayHeadingRetryCount = 0;
      try {
        await teardownTodayPanel();
      } catch (_) { }
      const anchorUid = lastTodayAnchorUid || (await findTodayAnchorUid());
      lastTodayAnchorUid = anchorUid || null;
      if (anchorUid) {
        await removeTodayAnchor(anchorUid);
      }
      // Retry cleanup shortly after to catch any late-rendered anchors.
      await delay(180);
      await removeTodayAnchor();
      await delay(600);
      await removeAllTodayAnchorsByQuery();
      await delay(600);
      await removeAllTodayAnchorsByQuery();
    }

    async function removeTodayAnchor(anchorUid = null, attempts = 3) {
      let uid = anchorUid || lastTodayAnchorUid || (await findTodayAnchorUid());
      if (!uid) {
        // Fall back to removing by scanning all matching anchors on the DNP.
        await removeAllTodayAnchorsByQuery();
        return;
      }
      const anchorIsHeading = lastTodayAnchorIsHeading;
      for (let i = 0; i < attempts; i++) {
        try {
          await clearTodayInlineChildren(uid);
        } catch (_) { }
        if (anchorIsHeading) {
          lastTodayAnchorUid = uid;
          return;
        }
        try {
          await deleteBlockAndDescendants(uid);
          lastTodayAnchorUid = null;
          return;
        } catch (_) { }
        // Fallback: try to blank the block so it disappears even if delete fails.
        try {
          await window.roamAlphaAPI.updateBlock({ block: { uid, string: "" } });
          lastTodayAnchorUid = null;
          return;
        } catch (_) { }
        await delay(120);
        uid = (await findTodayAnchorUid()) || uid;
      }
      lastTodayAnchorUid = null;
    }

    async function collectAnchorsUnder(uid, anchorTexts, ignoredUid = null, cache = null, depth = 0, maxDepth = 3) {
      if (!uid || depth > maxDepth) return [];
      if (ignoredUid && uid === ignoredUid) return [];
      const block = await getBlockCached(uid, cache);
      const matches = [];
      const text = (block?.string || "").trim().toLowerCase();
      if (text && anchorTexts.has(text)) {
        matches.push(uid);
      }
      const children = Array.isArray(block?.children) ? block.children : [];
      for (const child of children) {
        const childUid = child?.uid;
        if (childUid) {
          matches.push(...(await collectAnchorsUnder(childUid, anchorTexts, ignoredUid, cache, depth + 1, maxDepth)));
        }
      }
      return matches;
    }

    async function removeAllTodayAnchorsByQuery({ includeHeading = false, textsOverride = null } = {}) {
      try {
        const cache = createTodayRenderCache();
        const dnpUid = await getOrCreatePageUidCached(toDnpTitle(todayLocal()), cache);
        const { headingUid } = await getTodayParentInfo(cache);
        const baseTexts = Array.isArray(textsOverride)
          ? textsOverride
          : [getTodayAnchorText(), ...TODAY_WIDGET_ANCHOR_TEXT_LEGACY];
        const texts = new Set(baseTexts.map((s) => normalizeMatchText(s || "")));
        if (!textsOverride) {
          for (const t of todayAnchorTextHistory) texts.add(t);
        }
        const ignoreUid = includeHeading ? null : headingUid || null;
        const uids = await collectAnchorsUnder(dnpUid, texts, ignoreUid, cache, 0, 4);
        for (const u of uids) {
          await deleteBlockAndDescendants(u);
        }
        lastTodayAnchorUid = null;
      } catch (_) {
        // ignore errors
      }
    }

    async function deleteBlockAndDescendants(uid, depth = 0, maxDepth = 12) {
      if (!uid || depth > maxDepth) return;
      try {
        const safeUid = escapeDatalogString(uid);
        const children = await window.roamAlphaAPI.q(
          `[:find ?c :where [?c :block/parents ?p] [?p :block/uid "${safeUid}"]]`
        );
        const childUids = Array.isArray(children) ? children.map((r) => r?.[0]).filter(Boolean) : [];
        for (const child of childUids) {
          await deleteBlockAndDescendants(child, depth + 1, maxDepth);
        }
      } catch (_) { }
      try {
        await deleteBlock(uid);
      } catch (_) {
        try {
          await window.roamAlphaAPI.updateBlock({ block: { uid, string: "" } });
        } catch (_) { }
      }
    }

    function createTodayRenderCache() {
      return {
        blocks: new Map(),
        pages: new Map(),
      };
    }

    async function getBlockCached(uid, cache = null) {
      if (!uid) return null;
      if (cache?.blocks?.has(uid)) return cache.blocks.get(uid);
      const block = await getBlock(uid);
      cache?.blocks?.set(uid, block);
      return block;
    }

    async function getOrCreatePageUidCached(title, cache = null) {
      if (!title) return null;
      if (cache?.pages?.has(title)) return cache.pages.get(title);
      const uid = await getOrCreatePageUid(title);
      cache?.pages?.set(title, uid);
      return uid;
    }

    async function getOpenPageTitleSafe(cache = null) {
      try {
        const main = window.roamAlphaAPI?.ui?.mainWindow;
        const info = typeof main?.getOpenPageOrBlock === "function" ? main.getOpenPageOrBlock() : null;
        const pageUid = info?.["page-uid"] || info?.pageUid || info?.page?.uid || null;
        const blockUid = info?.["block-uid"] || info?.blockUid || info?.block?.uid || null;
        if (pageUid) {
          const page = await window.roamAlphaAPI.pull?.("[:node/title]", [":block/uid", pageUid]);
          const title = page?.[":node/title"] || page?.title;
          if (title) return title;
        }
        if (blockUid) {
          const block = await getBlockCached(blockUid, cache);
          return block?.page?.title || block?.page?.["node/title"] || null;
        }
      } catch (_) {
        // fall through
      }
      return null;
    }

    async function shouldRenderTodayWidgetNow(cache = null) {
      const todayTitle = toDnpTitle(todayLocal());
      const check = async () => {
        const currentTitle = await getOpenPageTitleSafe(cache);
        if (!currentTitle) return null;
        return currentTitle === todayTitle;
      };
      let match = await check();
      if (match === null || match === false) {
        await delay(160);
        match = await check();
      }
      if (match === null) return true;
      return !!match;
    }

    async function shouldRenderTodayWidgetNowCached(cache = null) {
      const now = Date.now();
      if (todayWidgetPageGuard.inFlight) return todayWidgetPageGuard.inFlight;
      if (todayWidgetPageGuard.at && now - todayWidgetPageGuard.at < TODAY_WIDGET_PAGE_GUARD_TTL_MS) {
        return todayWidgetPageGuard.value;
      }
      todayWidgetPageGuard.inFlight = (async () => {
        try {
          const value = await shouldRenderTodayWidgetNow(cache);
          todayWidgetPageGuard.at = Date.now();
          todayWidgetPageGuard.value = !!value;
          return todayWidgetPageGuard.value;
        } catch (_) {
          // Fail open so we don't "break" rendering when Roam APIs are flaky.
          todayWidgetPageGuard.at = Date.now();
          todayWidgetPageGuard.value = true;
          return true;
        } finally {
          todayWidgetPageGuard.inFlight = null;
        }
      })();
      return todayWidgetPageGuard.inFlight;
    }

    function scheduleTodayWidgetRenderIfOnDnp(delayMs = 200, force = false) {
      if (!TODAY_WIDGET_ENABLED || !getTodayWidgetEnabled()) return;
      void (async () => {
        const ok = await shouldRenderTodayWidgetNowCached(null);
        if (!ok) return;
        scheduleTodayWidgetRender(delayMs, force);
      })();
    }

    function requestTodayWidgetRenderOnDnp(delayMs = 200, force = false) {
      if (!TODAY_WIDGET_ENABLED || !getTodayWidgetEnabled()) return;
      if (force) todayWidgetRefreshForcePending = true;
      if (todayWidgetRefreshTimer) return;
      todayWidgetRefreshTimer = setTimeout(() => {
        todayWidgetRefreshTimer = null;
        const shouldForce = todayWidgetRefreshForcePending;
        todayWidgetRefreshForcePending = false;
        scheduleTodayWidgetRenderIfOnDnp(0, shouldForce);
      }, Math.max(0, delayMs));
    }

    function renderPillDateSpan(span, { icon, date, set, label, tooltip }) {
      if (!span) return;
      span.textContent = "";
      if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "rt-pill-icon";
        iconEl.textContent = icon;
        iconEl.setAttribute("aria-hidden", "true");
        span.appendChild(iconEl);
      }
      const textEl = document.createElement("span");
      textEl.className = "rt-pill-text";
      const formatted = formatPillDateText(date, set);
      textEl.textContent = formatted;
      span.appendChild(textEl);
      if (tooltip) span.title = tooltip;
      if (label) span.setAttribute("aria-label", `${label}: ${formatted}`);
    }

    function formatPillDateText(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const today = todayLocal();
      const diffMs = date.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays >= 0 && diffDays <= 7) {
        return new Intl.DateTimeFormat(set.locale || undefined, { weekday: "short" }).format(date);
      }
      return new Intl.DateTimeFormat(set.locale || undefined, { month: "short", day: "numeric" }).format(date);
    }

    function schedulePillRefreshAll(delayMs = 120) {
      if (pillRefreshTimer) return;
      const now = Date.now();
      const MIN_INTERVAL = 500;
      const remaining = Math.max(0, MIN_INTERVAL - (now - lastPillDecorateRun));
      const effectiveDelay = Math.max(delayMs, remaining);
      pillRefreshTimer = setTimeout(async () => {
        pillRefreshTimer = null;
        try {
          const root = document.body || document;
          if (root) await decorateBlockPills(root);
        } catch (err) {
          console.warn("[BetterTasks] pill refresh failed", err);
        }
      }, effectiveDelay);
    }

    let pillDelegationAttached = false;
    let pillDelegationClickHandler = null;
    let pillDelegationPointerHandler = null;
    let pillDelegationLastClickAt = 0;
    let pillDelegationLastClickKey = "";
    const PILL_DELEGATION_GLOBAL_KEY = "__btPillDelegationV1";
    const PILL_DELEGATION_CLICK_GATE_KEY = "__btPillDelegationClickGateV1";
    const activeDatePrompts = new Set();

    function getGlobalPillClickGate() {
      if (typeof window === "undefined") return null;
      if (!window[PILL_DELEGATION_CLICK_GATE_KEY]) {
        window[PILL_DELEGATION_CLICK_GATE_KEY] = { lastKey: "", lastAt: 0 };
      }
      return window[PILL_DELEGATION_CLICK_GATE_KEY];
    }

    async function runDatePromptOnce(key, fn) {
      if (!key || typeof fn !== "function") return null;
      if (activeDatePrompts.has(key)) return null;
      activeDatePrompts.add(key);
      try {
        return await fn();
      } finally {
        activeDatePrompts.delete(key);
      }
    }

    function getInlineMetaCache() {
      if (typeof window === "undefined") return null;
      return window.__btInlineMetaCache || (window.__btInlineMetaCache = new Map());
    }

    function readInlineMetaCache(uid) {
      const metaCache = getInlineMetaCache();
      if (!metaCache || !uid) return null;
      const entry = metaCache.get(uid);
      if (!entry) return null;
      if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "metadata")) {
        const at = entry.at || 0;
        if (at && Date.now() - at > INLINE_META_CACHE_TTL_MS) {
          metaCache.delete(uid);
          return null;
        }
        return entry.metadata || null;
      }
      return entry;
    }

    function writeInlineMetaCache(uid, metadata, now = Date.now()) {
      const metaCache = getInlineMetaCache();
      if (!metaCache || !uid) return;
      metaCache.set(uid, { metadata, at: now });
      if (metaCache.size > INLINE_META_CACHE_MAX) {
        const entries = Array.from(metaCache.entries());
        entries.sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0));
        const overflow = entries.length - INLINE_META_CACHE_MAX;
        for (let i = 0; i < overflow; i++) {
          metaCache.delete(entries[i][0]);
        }
      }
      for (const [cacheUid, entry] of metaCache.entries()) {
        const at = entry?.at || 0;
        if (at && now - at > INLINE_META_CACHE_TTL_MS) {
          metaCache.delete(cacheUid);
        }
      }
    }

    function attachPillEventDelegation() {
      if (pillDelegationAttached || typeof document === "undefined") return;
      // Ensure only one delegated handler is attached globally (Roam can load/reload extensions without clean unload).
      try {
        const prev = typeof window !== "undefined" ? window[PILL_DELEGATION_GLOBAL_KEY] : null;
        if (prev?.attached && prev?.doc === document) {
          if (typeof prev.pointerHandler === "function") {
            document.removeEventListener("pointerdown", prev.pointerHandler, true);
          }
          if (typeof prev.clickHandler === "function") {
            document.removeEventListener("click", prev.clickHandler, true);
          }
        }
      } catch (_) {
        // ignore
      }

      pillDelegationPointerHandler = (event) => {
        try {
          const target = event?.target instanceof Element ? event.target : null;
          if (!target) return;
          const wrap = target.closest?.(".rt-pill-wrap");
          if (!wrap) return;
          event.preventDefault();
          event.stopPropagation();
        } catch (_) {
          // ignore
        }
      };

      pillDelegationClickHandler = async (event) => {
        try {
          const target = event?.target instanceof Element ? event.target : null;
          if (!target) return;
          const wrap = target.closest?.(".rt-pill-wrap");
          if (!wrap) return;
          const uid = wrap.dataset?.btUid || null;
          if (!uid) return;
          event.preventDefault();
          event.stopPropagation();

          const actionEl = target.closest?.("[data-bt-pill-action]") || null;
          const action = actionEl?.dataset?.btPillAction || null;
          // Debounce to avoid double/triple triggers from Roam/DOM churn or multiple event sources.
          // Keyed by UID + action so different pill targets can still be clicked rapidly.
          const clickKey = `${uid}|${action || "menu"}`;
          const now = Date.now();
          const globalGate = getGlobalPillClickGate();
          if (globalGate && clickKey === globalGate.lastKey && now - globalGate.lastAt < 350) {
            return;
          }
          if (clickKey === pillDelegationLastClickKey && now - pillDelegationLastClickAt < 350) {
            return;
          }
          pillDelegationLastClickKey = clickKey;
          pillDelegationLastClickAt = now;
          if (globalGate) {
            globalGate.lastKey = clickKey;
            globalGate.lastAt = now;
          }

          const set = S();
          const attrNames = set.attrNames;
          const metadataInfo = readInlineMetaCache(uid);

          const isRecurring = wrap.dataset?.btIsRecurring === "1";

          const removeSpanAndSeparator = (el) => {
            if (!(el instanceof Element)) return;
            const prev = el.previousElementSibling;
            if (prev && prev.classList?.contains("rt-pill-separator")) {
              prev.remove();
            } else {
              const next = el.nextElementSibling;
              if (next && next.classList?.contains("rt-pill-separator")) {
                next.remove();
              }
            }
            el.remove();
          };

          if (!action || action === "menu") {
            showPillMenu({ uid, set, isRecurring, metadata: metadataInfo || undefined });
            return;
          }

          if (action === "repeat") {
            await handleRepeatEdit(event, { uid, set, span: actionEl });
            return;
          }
          if (action === "start") {
            await handleStartClick(event, { uid, set, span: actionEl, allowCreate: true });
            return;
          }
          if (action === "defer") {
            await handleDeferClick(event, { uid, set, span: actionEl, allowCreate: true });
            return;
          }
          if (action === "due") {
            await handleDueClick(event, { uid, set, span: actionEl, allowCreate: true });
            return;
          }

          const notifyDashboardIfOpen = async (opts = {}) => {
            try {
              if (!activeDashboardController?.isOpen?.()) return;
            } catch (_) {
              return;
            }
            try {
              await activeDashboardController?.notifyBlockChange?.(uid, opts);
            } catch (_) {
              // ignore
            }
          };

          if (action === "meta-project" && metadataInfo?.project) {
            handleMetadataClick(uid, "project", { value: metadataInfo.project }, event, activeDashboardController);
            return;
          }
          if (action === "meta-waitingFor" && metadataInfo?.waitingFor) {
            handleMetadataClick(uid, "waitingFor", { value: metadataInfo.waitingFor }, event, activeDashboardController);
            return;
          }
          if (action === "meta-context" && metadataInfo?.context?.length) {
            const first = metadataInfo.context[0];
            handleMetadataClick(uid, "context", { value: first, list: metadataInfo.context }, event, activeDashboardController);
            return;
          }

          if (action === "cycle-gtd") {
            const current = actionEl?.dataset?.metaValue || null;
            const next = cycleGtdStatus(current);
            await setRichAttribute(uid, "gtd", next, attrNames);
            pillSkipDecorate.add(uid);
            setTimeout(() => pillSkipDecorate.delete(uid), 800);
            if (typeof window !== "undefined") {
              window.__btInlineMetaCache?.delete?.(uid);
            }
            await notifyDashboardIfOpen({ bypassFilters: true });
            if (next) {
              const display = formatGtdStatusDisplay(next, getLanguageSetting());
              actionEl.dataset.metaValue = next || "";
              actionEl.textContent = `➡ ${display}`;
              const metaLabels = t(["metadata"], getLanguageSetting()) || {};
              actionEl.title = `${metaLabels.gtdLabel || metaLabels.gtd || "GTD"}: ${display}`;
            } else {
              removeSpanAndSeparator(actionEl);
            }
            return;
          }

          if (action === "cycle-priority" || action === "cycle-energy") {
            const type = action === "cycle-priority" ? "priority" : "energy";
            const order = [null, "low", "medium", "high"];
            const current = actionEl?.dataset?.metaValue ? actionEl.dataset.metaValue.toLowerCase() : null;
            const idx = order.indexOf(current);
            const next = order[(idx + 1) % order.length];
            await setRichAttribute(uid, type, next, attrNames);
            pillSkipDecorate.add(uid);
            setTimeout(() => pillSkipDecorate.delete(uid), 800);
            await notifyDashboardIfOpen({ bypassFilters: true });
            if (next) {
              const display = formatPriorityEnergyDisplay(next, getLanguageSetting());
              actionEl.dataset.metaValue = next || "";
              actionEl.textContent = `${type === "priority" ? "!" : "🔋"} ${display}`;
              const metaLabels = t(["metadata"], getLanguageSetting()) || {};
              const labelKey = type === "priority" ? (metaLabels.priorityLabel || metaLabels.priority || "Priority") : (metaLabels.energyLabel || metaLabels.energy || "Energy");
              const cycleHint =
                type === "priority"
                  ? (t(["pillMenu", "cyclePriority"], getLanguageSetting()) || "Click to cycle")
                  : (t(["pillMenu", "cycleEnergy"], getLanguageSetting()) || "Click to cycle");
              actionEl.title = `${labelKey}: ${display} (${cycleHint})`;
            } else {
              removeSpanAndSeparator(actionEl);
            }
            return;
          }
        } catch (err) {
          console.warn("[BetterTasks] pill delegated click failed", err);
        }
      };

      document.addEventListener("pointerdown", pillDelegationPointerHandler, true);
      document.addEventListener("click", pillDelegationClickHandler, true);
      pillDelegationAttached = true;
      try {
        if (typeof window !== "undefined") {
          window[PILL_DELEGATION_GLOBAL_KEY] = {
            attached: true,
            doc: document,
            pointerHandler: pillDelegationPointerHandler,
            clickHandler: pillDelegationClickHandler,
          };
        }
      } catch (_) {
        // ignore
      }
    }

    function detachPillEventDelegation() {
      if (!pillDelegationAttached || typeof document === "undefined") return;
      try {
        document.removeEventListener("pointerdown", pillDelegationPointerHandler, true);
        document.removeEventListener("click", pillDelegationClickHandler, true);
      } catch (_) {
        // ignore
      } finally {
        pillDelegationAttached = false;
        pillDelegationPointerHandler = null;
        pillDelegationClickHandler = null;
        pillDelegationLastClickAt = 0;
        pillDelegationLastClickKey = "";
        try {
          if (typeof window !== "undefined") {
            const prev = window[PILL_DELEGATION_GLOBAL_KEY];
            if (prev?.doc === document) {
              delete window[PILL_DELEGATION_GLOBAL_KEY];
            }
          }
        } catch (_) {
          // ignore
        }
      }
    }

    async function syncPillsForSurface(surface) {
      if (!surface) return;
      ensurePillStyles();
      const root = document.body || document;
      if (!root) return;
      try {
        attachPillEventDelegation();
        const once = () => Promise.resolve(decorateBlockPills(root));
        await once();
        await new Promise((resolve) => requestAnimationFrame(() => once().then(resolve, resolve)));
        await new Promise((resolve) => setTimeout(() => once().then(resolve, resolve), 50));
      } catch (err) {
        console.warn("[RecurringTasks] pill decoration failed", err);
      }
    }

    async function decorateBlockPills(rootEl) {
      if (!rootEl) return;
      const now = Date.now();
      if (now - lastPillDecorateRun < 500) return;
      lastPillDecorateRun = now;
      const sliceNow =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? () => performance.now()
          : () => Date.now();
      const yieldToBrowser = () =>
        new Promise((resolve) => {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
      const SLICE_BUDGET_MS = 12;
      let sliceStart = sliceNow();
      let pillSigCache = (() => {
        if (typeof window === "undefined") return new Map();
        const existing = window.__btPillSignatureCache;
        if (existing && typeof existing.get === "function" && typeof existing.set === "function") {
          return existing;
        }
        const fresh = new Map();
        window.__btPillSignatureCache = fresh;
        return fresh;
      })();
      if (!pillSigCache || typeof pillSigCache.get !== "function" || typeof pillSigCache.set !== "function") {
        pillSigCache = new Map();
        if (typeof window !== "undefined") {
          window.__btPillSignatureCache = pillSigCache;
        }
      }
      const PILL_SIG_CACHE_MAX = 5000;
      const PILL_SIG_CACHE_TTL_MS = 10 * 60 * 1000;
      if (!pillScrollHandlerAttached && typeof document !== "undefined") {
        pillScrollHandler = (() => {
          let t = null;
          return () => {
            if (t) clearTimeout(t);
            t = setTimeout(() => {
              t = null;
              // Only refresh once scrolling has paused.
              schedulePillRefreshAll(0);
            }, pillScrollDebounceMs);
          };
        })();
        try {
          // Roam scrolls inside nested containers; use capture so we receive non-bubbling scroll events.
          document.addEventListener("scroll", pillScrollHandler, { passive: true, capture: true });
          pillScrollHandlerAttached = true;
        } catch (_) {
          // ignore attach errors
        }
      }
      const canUseGlobalCounts =
        typeof document !== "undefined" &&
        (rootEl === document || rootEl === document.body) &&
        typeof document.querySelectorAll === "function";
      const nowCounts = Date.now();
      const hasFreshCounts =
        canUseGlobalCounts &&
        pillDomCountsCache.at &&
        (nowCounts - pillDomCountsCache.at < PILL_DOM_COUNT_TTL_MS);
      let globalBlockCount = hasFreshCounts ? pillDomCountsCache.blockCount : null;
      let globalCheckboxCount = hasFreshCounts ? pillDomCountsCache.checkboxCount : null;
      let restrictToVisible = false;

      try {
        const blockCount =
          typeof globalBlockCount === "number"
            ? globalBlockCount
            : (document.querySelectorAll?.(".rm-block-main, .roam-block-container, .roam-block")?.length || 0);
        globalBlockCount = blockCount;
        if (blockCount > MAX_BLOCKS_FOR_PILLS) {
          if (canUseGlobalCounts && !hasFreshCounts) {
            pillDomCountsCache = { at: nowCounts, blockCount, checkboxCount: globalCheckboxCount };
          }
          restrictToVisible = true;
        }
      } catch (_) {
        // ignore count errors
      }
      const checkboxThreshold = getPillCheckboxThreshold();
      if (checkboxThreshold > 0) {
        try {
          const checkboxRoot =
            rootEl === document || rootEl === document.body ? document : rootEl;
          const canUseGlobalCheckboxCount = checkboxRoot === document && typeof document.querySelectorAll === "function";
          const hasFreshCheckboxCount = !!(canUseGlobalCheckboxCount && hasFreshCounts);
          const checkboxCount = hasFreshCheckboxCount
            ? (typeof globalCheckboxCount === "number" ? globalCheckboxCount : 0)
            : (checkboxRoot.querySelectorAll?.(".rm-checkbox")?.length || 0);
          globalCheckboxCount = checkboxCount;
          if (checkboxCount > checkboxThreshold) {
            /*
            console.warn(
              `[BetterTasks] Skipping pill decoration: ${checkboxCount} checkboxes exceed threshold ${checkboxThreshold}`
            );
            */
            if (canUseGlobalCheckboxCount && !hasFreshCheckboxCount) {
              pillDomCountsCache = { at: nowCounts, blockCount: globalBlockCount, checkboxCount };
            }
            return;
          }
          if ((canUseGlobalCounts || canUseGlobalCheckboxCount) && !hasFreshCounts) {
            pillDomCountsCache = {
              at: nowCounts,
              blockCount: canUseGlobalCounts ? globalBlockCount : pillDomCountsCache.blockCount,
              checkboxCount: canUseGlobalCheckboxCount ? globalCheckboxCount : pillDomCountsCache.checkboxCount,
            };
          }
        } catch (_) {
          // ignore counting errors
        }
      }

      const selector = restrictToVisible
        ? ".rm-block-main"
        : ".rm-block-main, .roam-block-container, .roam-block";
      const nodes = rootEl.matches?.(selector)
        ? [rootEl]
        : Array.from(rootEl.querySelectorAll?.(selector) || []);
      const viewport = (() => {
        try {
          const rect = (document.documentElement || document.body)?.getBoundingClientRect?.();
          const height = typeof window !== "undefined" ? window.innerHeight || rect?.height || 0 : 0;
          return { height };
        } catch (_) {
          return null;
        }
      })();
      let decoratedThisPass = 0;
      const MAX_DECORATIONS_PER_PASS = restrictToVisible ? 120 : 300;
      const seen = new Set();
      const set = S();
      const attrNames = set.attrNames;
      ensurePillMenuStyles();
      for (const node of nodes) {
        if (sliceNow() - sliceStart > SLICE_BUDGET_MS) {
          await yieldToBrowser();
          sliceStart = sliceNow();
        }
        try {
          if (MAX_DECORATIONS_PER_PASS && decoratedThisPass >= MAX_DECORATIONS_PER_PASS) {
            schedulePillRefresh(rootEl, null, 80);
            break;
          }
          const mainCandidate =
            node.classList?.contains("rm-block-main")
              ? node
              : node.closest?.(".rm-block-main") || node.querySelector?.(".rm-block-main");
          const main = mainCandidate || document.querySelector(`.rm-block-main[data-uid="${normalizeUid(node.getAttribute?.("data-uid") || node.dataset?.uid)}"]`);
          if (!main) continue;
          if (main.closest?.(".rm-code-block")) continue;
          if (viewport) {
            try {
              const r = main.getBoundingClientRect?.();
              if (r && (r.bottom < -120 || r.top > viewport.height + 120)) {
                continue;
              }
            } catch (_) {
              // ignore viewport failures
            }
          }
          if (restrictToVisible && !viewport) {
            continue;
          }

          const uid =
            findBlockUidFromElement(main) ||
            findBlockUidFromElement(node) ||
            normalizeUid(node.getAttribute?.("data-uid") || node.dataset?.uid);
          if (!uid) continue;
          if (pillSkipDecorate.has(uid)) {
            continue;
          }
          clearPendingPillTimer(uid);

          if (seen.has(uid)) {
            continue;
          }
          seen.add(uid);

          const isFocused = !!main.querySelector?.(".rm-block__input--active, .rm-block__input--focused");
          if (isFocused) {
            schedulePillRefresh(main, uid, 120);
          }

          const block = await getBlock(uid);
          if (!block) continue;
          if (isTaskInCodeBlock(block)) continue;

          const originalString = block.string;
          const isAttrLine = ATTR_RE.test((originalString || "").trim());
          if (isAttrLine) {
            main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
            continue;
          }
          const meta = await readRecurringMeta(block, set);
          const hasTiming = !!meta.hasTimingAttrs;
          const isRecurring = !!meta.repeat;
          const isBetterTask = isBetterTasksTask(meta);
          if (isBetterTask) enqueueDashboardNotifyBlockChange(uid);
          const metadataInfo = meta.metadata || parseRichMetadata(meta.childAttrMap || {}, attrNames);
          writeInlineMetaCache(uid, metadataInfo, now);
          const hasMetadataSignal =
            !!(
              metadataInfo?.project ||
              metadataInfo?.waitingFor ||
              (metadataInfo?.context || []).length ||
              metadataInfo?.priority ||
              metadataInfo?.energy ||
              metadataInfo?.gtd
            );
          if (!isBetterTask && !hasMetadataSignal) {
            main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
            if (typeof window !== "undefined") {
              window.__btInlineMetaCache?.delete?.(uid);
            }
            activeDashboardController?.removeTask?.(uid);
            continue;
          }
          if (!isRecurring && !hasTiming && !hasMetadataSignal) {
            main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
            continue;
          }
          if (isBlockCompleted(block)) {
            main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
            continue;
          }
          const inlineAttrs = parseAttrsFromBlockText(block.string || "");
          const inlineRepeatVal = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
          const inlineDueVal = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
          const inlineStartVal = pickInlineAttr(inlineAttrs, attrNames.startAliases);
          const inlineDeferVal = pickInlineAttr(inlineAttrs, attrNames.deferAliases);

          const caret = main.querySelector?.(".rm-caret");
          const caretClosed = caret?.classList?.contains("rm-caret-right");
          const caretOpen = caret?.classList?.contains("rm-caret-down");
          const inlineCaretOpen = caret?.getAttribute?.("aria-expanded") === "true";
          const inlineCaretClosed = caret?.getAttribute?.("aria-expanded") === "false";
          const blockContainer = main.closest?.(".roam-block-container, .roam-block") || null;
          const childrenContainer =
            blockContainer?.querySelector?.(":scope > .rm-block__children, :scope > .rm-block-children") || null;
          const childrenVisible = isChildrenVisible(childrenContainer);
          // Use DOM state for this specific instance; ignore persisted block.open to avoid cross-pane bleed.
          const isOpen =
            inlineCaretOpen || caretOpen || childrenVisible
              ? true
              : inlineCaretClosed || caretClosed
                ? false
                : childrenContainer
                  ? childrenVisible
                  : block.open === true;

          main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
          if (isOpen) {
            continue;
          }

          const humanRepeat = meta.repeat || inlineRepeatVal || "";
          const startDate = meta.start || (inlineStartVal ? parseRoamDate(inlineStartVal) : null);
          const deferDate = meta.defer || (inlineDeferVal ? parseRoamDate(inlineDeferVal) : null);
          const dueDate =
            meta.due ||
            (inlineDueVal ? parseRoamDate(inlineDueVal) : null);
          const startDisplay = startDate ? formatFriendlyDate(startDate, set) : null;
          const deferDisplay = deferDate ? formatFriendlyDate(deferDate, set) : null;
          const dueDisplay = dueDate ? formatFriendlyDate(dueDate, set) : null;
          const lang = getLanguageSetting();
          const metaLabels = t(["metadata"], lang) || {};
          const tooltipParts = [];
          if (startDate) tooltipParts.push(`${metaLabels.start || "Start"}: ${formatIsoDate(startDate, set)}`);
          if (deferDate) tooltipParts.push(`${metaLabels.defer || "Defer"}: ${formatIsoDate(deferDate, set)}`);
          if (dueDate) tooltipParts.push(`${metaLabels.next || metaLabels.due || "Next"}: ${formatIsoDate(dueDate, set)}`);
          const tooltip = tooltipParts.length
            ? tooltipParts.join(" • ")
            : isRecurring
              ? metaLabels.repeatingTask || "Repeating Better Task"
              : metaLabels.scheduledTask || "Scheduled Better Task";

          const contextSig = Array.isArray(metadataInfo?.context)
            ? [...metadataInfo.context].sort().join(",")
            : "";
          const signatureParts = [
            humanRepeat || "",
            startDate instanceof Date ? startDate.getTime() : "",
            deferDate instanceof Date ? deferDate.getTime() : "",
            dueDate instanceof Date ? dueDate.getTime() : "",
            metadataInfo?.project || "",
            metadataInfo?.waitingFor || "",
            contextSig,
            metadataInfo?.priority || "",
            metadataInfo?.energy || "",
            metadataInfo?.gtd || "",
          ];
          const signature = signatureParts.join("|");
          const existingPill = main.querySelector(".rt-pill-wrap");
          const prevEntry = pillSigCache.get(uid);
          const prevSig = prevEntry && typeof prevEntry === "object" ? prevEntry.sig : prevEntry;
          if (prevSig === signature && existingPill) {
            continue;
          }
          if (existingPill) existingPill.remove();

          const pillWrap = document.createElement("span");
          pillWrap.className = "rt-pill-wrap";
          pillWrap.dataset.btUid = uid;
          pillWrap.dataset.btIsRecurring = isRecurring ? "1" : "0";

          let repeatSpan = null;
          let startSpan = null;
          let deferSpan = null;
          let dueSpan = null;

          const pill = document.createElement("span");
          pill.className = "rt-pill";
          pill.title = tooltip;

          if (isRecurring && humanRepeat) {
            repeatSpan = document.createElement("span");
            repeatSpan.className = "rt-pill-repeat";
            repeatSpan.textContent = `↻ ${humanRepeat}`;
            repeatSpan.title = `${t(["metadata", "repeatRule"], getLanguageSetting()) || "Repeat rule"}: ${humanRepeat}`;
            repeatSpan.dataset.btPillAction = "repeat";

            pill.appendChild(repeatSpan);
          }

          const addSeparator = () => {
            const sep = document.createElement("span");
            sep.className = "rt-pill-separator";
            sep.textContent = " · ";
            pill.appendChild(sep);
          };

          if (startDisplay) {
            if (repeatSpan) addSeparator();
            else if (pill.childElementCount > 0) addSeparator();

            startSpan = document.createElement("span");
            startSpan.className = "rt-pill-start";
            renderPillDateSpan(startSpan, {
              icon: START_ICON,
              date: startDate,
              set,
              label: metaLabels.start || "Start",
              tooltip: `${metaLabels.start || "Start"}: ${formatIsoDate(startDate, set)}`,
            });
            startSpan.dataset.btPillAction = "start";
            pill.appendChild(startSpan);
          }

          if (deferDisplay) {
            if (repeatSpan || startSpan) addSeparator();
            else if (pill.childElementCount > 0) addSeparator();

            deferSpan = document.createElement("span");
            deferSpan.className = "rt-pill-defer";
            renderPillDateSpan(deferSpan, {
              icon: DEFER_ICON,
              date: deferDate,
              set,
              label: metaLabels.defer || "Defer",
              tooltip: `${metaLabels.defer || "Defer"}: ${formatIsoDate(deferDate, set)}`,
            });
            deferSpan.dataset.btPillAction = "defer";
            pill.appendChild(deferSpan);
          }

          if (dueDisplay) {
            if (repeatSpan || startSpan || deferSpan) addSeparator();
            else if (pill.childElementCount > 0) addSeparator();

            dueSpan = document.createElement("span");
            dueSpan.className = "rt-pill-due";
            renderPillDateSpan(dueSpan, {
              icon: DUE_ICON,
              date: dueDate,
              set,
              label: metaLabels.due || "Due",
              tooltip: `${metaLabels.due || "Due"}: ${formatIsoDate(dueDate, set)}`,
            });
            dueSpan.dataset.btPillAction = "due";
            pill.appendChild(dueSpan);
          }

          const appendMetaSpan = (icon, text, title) => {
            if (!text) return null;
            if (pill.childElementCount > 0) addSeparator();
            const span = document.createElement("span");
            span.className = "rt-pill-meta";
            span.textContent = `${icon} ${text}`;
            span.title = title;
            pill.appendChild(span);
            return span;
          };

          if (metadataInfo?.project) {
            const span = appendMetaSpan(
              "📁",
              metadataInfo.project,
              `${metaLabels.projectLabel || metaLabels.project || "Project"}: ${metadataInfo.project}`
            );
            if (span) span.dataset.btPillAction = "meta-project";
          }
          if (metadataInfo?.waitingFor) {
            const span = appendMetaSpan(
              "⌛",
              metadataInfo.waitingFor,
              `${metaLabels.waitingLabel || metaLabels.waitingFor || "Waiting for"}: ${metadataInfo.waitingFor}`
            );
            if (span) span.dataset.btPillAction = "meta-waitingFor";
          }
          if (metadataInfo?.context?.length) {
            const first = metadataInfo.context[0];
            const extra =
              metadataInfo.context.length > 1
                ? ` (+${metadataInfo.context.length - 1})`
                : "";
            const display = `${first}${extra}`;
            const span = appendMetaSpan(
              "@",
              display,
              `${metaLabels.contextLabel || metaLabels.context || "Context"}: ${metadataInfo.context.join(", ")}`
            );
            if (span) span.dataset.btPillAction = "meta-context";
          }
          if (metadataInfo?.gtd) {
            const display = formatGtdStatusDisplay(metadataInfo.gtd, getLanguageSetting());
            const tooltip = `${metaLabels.gtdLabel || metaLabels.gtd || "GTD"}: ${display}`;
            const span = appendMetaSpan(
              "➡",
              display,
              tooltip
            );
            if (span) {
              span.dataset.metaValue = metadataInfo.gtd || "";
              span.dataset.btPillAction = "cycle-gtd";
            }
          }
          if (metadataInfo?.priority) {
            const span = appendMetaSpan(
              "!",
              formatPriorityEnergyDisplay(metadataInfo.priority, getLanguageSetting()),
              `${metaLabels.priorityLabel || metaLabels.priority || "Priority"}: ${formatPriorityEnergyDisplay(
                metadataInfo.priority,
                getLanguageSetting()
              )} (${t(["pillMenu", "cyclePriority"], getLanguageSetting()) || "Click to cycle"})`
            );
            if (span) {
              span.dataset.metaValue = metadataInfo.priority || "";
              span.dataset.btPillAction = "cycle-priority";
            }
          }
          if (metadataInfo?.energy) {
            const span = appendMetaSpan(
              "🔋",
              formatPriorityEnergyDisplay(metadataInfo.energy, getLanguageSetting()),
              `${metaLabels.energyLabel || metaLabels.energy || "Energy"}: ${formatPriorityEnergyDisplay(
                metadataInfo.energy,
                getLanguageSetting()
              )} (${t(["pillMenu", "cycleEnergy"], getLanguageSetting()) || "Click to cycle"})`
            );
            if (span) {
              span.dataset.metaValue = metadataInfo.energy || "";
              span.dataset.btPillAction = "cycle-energy";
            }
          }

          const menuBtn = document.createElement("span");
          menuBtn.className = "rt-pill-menu-btn";
          menuBtn.textContent = "⋯";
          menuBtn.title = "More task actions";
          menuBtn.setAttribute("aria-label", "More task actions");
          menuBtn.dataset.btPillAction = "menu";
          pill.appendChild(menuBtn);

          pillWrap.appendChild(pill);
          pillWrap.dataset.btSig = signature;
          pillSigCache.set(uid, { sig: signature, lastSeen: now });
          decoratedThisPass += 1;

          const check = main.querySelector?.(".check-container, .rm-checkbox") || main.firstElementChild;
          insertPillWrap(main, check, pillWrap);
        } catch (err) {
          console.warn("[RecurringTasks] decorate pill failed", err);
        }
      }
      if (pillSigCache.size > PILL_SIG_CACHE_MAX) {
        const entries = Array.from(pillSigCache.entries());
        entries.sort((a, b) => {
          const aSeen = a[1]?.lastSeen || 0;
          const bSeen = b[1]?.lastSeen || 0;
          return aSeen - bSeen;
        });
        const overflow = entries.length - PILL_SIG_CACHE_MAX;
        for (let i = 0; i < overflow; i++) {
          pillSigCache.delete(entries[i][0]);
        }
      }
      if (PILL_SIG_CACHE_TTL_MS > 0) {
        for (const [uid, entry] of pillSigCache.entries()) {
          const lastSeen = entry?.lastSeen || 0;
          if (lastSeen && now - lastSeen > PILL_SIG_CACHE_TTL_MS) {
            pillSigCache.delete(uid);
          }
        }
      }
    }

    async function handleRepeatEdit(event, context) {
      const { uid, set, span } = context;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const attrNames = set.attrNames;
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const current = meta.repeat || "";
      const priorDue = contextSnapshot.previousDueDate;
      if (event.altKey) {
        try {
          await navigator.clipboard?.writeText?.(current);
          toast("Repeat copied");
        } catch (err) {
          console.warn("[RecurringTasks] copy repeat failed", err);
        }
        return;
      }
      const next = await promptForValue({
        title: "Edit Repeat",
        message: "Update repeat rule",
        placeholder: "e.g. every Friday",
        initial: current,
      });
      if (!next || next === current) return;
      const normalized = normalizeRepeatRuleText(next) || next.trim();
      const dueDateToPersist = priorDue || null;
      const updates = { repeat: normalized };
      if (dueDateToPersist) {
        updates.due = formatDate(dueDateToPersist, set);
      }
      await updateBlockProps(uid, updates);
      const repeatRes = await ensureChildAttrForType(uid, "repeat", normalized, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      setMetaChildAttr(meta, "repeat", { uid: repeatRes.uid, value: normalized }, attrNames);
      if (dueDateToPersist) {
        const dueRes = await ensureChildAttrForType(uid, "due", updates.due, attrNames);
        setMetaChildAttr(meta, "due", { uid: dueRes.uid, value: updates.due }, attrNames);
      } else {
        await removeChildAttrsForType(uid, "due", attrNames);
        clearMetaChildAttr(meta, "due", attrNames);
      }
      await ensureInlineAttrForType(block, "repeat", normalized, attrNames);
      if (dueDateToPersist) {
        await ensureInlineAttrForType(block, "due", updates.due, attrNames);
      }
      meta.repeat = normalized;
      meta.due = dueDateToPersist || null;
      mergeRepeatOverride(uid, { repeat: normalized, due: dueDateToPersist || null });
      const currentLocation = captureBlockLocation(block);
      const relocation = {
        moved: false,
        targetUid: currentLocation.parentUid,
      };
      if (span) {
        span.textContent = `↻ ${normalized}`;
        span.title = `${t(["metadata", "repeatRule"], getLanguageSetting()) || "Repeat rule"}: ${normalized}`;
        const pill = span.closest(".rt-pill");
        if (pill) {
          const dueSpanEl = pill.querySelector(".rt-pill-due");
          if (dueDateToPersist && dueSpanEl) {
            const friendly = formatFriendlyDate(dueDateToPersist, set);
            const tooltip = `${t(["metadata", "due"], getLanguageSetting()) || "Due"}: ${formatIsoDate(dueDateToPersist, set)}`;
            renderPillDateSpan(dueSpanEl, {
              icon: DUE_ICON,
              date: dueDateToPersist,
              set,
              label: t(["metadata", "due"], getLanguageSetting()) || "Due",
              tooltip,
            });
            pill.title = tooltip;
          } else {
            const repeatLabel = t(["metadata", "repeatRule"], getLanguageSetting()) || "Repeat rule";
            pill.title = `${repeatLabel}: ${normalized}`;
          }
        }
      }
      const repeatMsgTemplate = t(["toasts", "repeatUpdated"], getLanguageSetting());
      const repeatMsg = repeatMsgTemplate
        ? repeatMsgTemplate.replace("{{value}}", normalized)
        : `Repeat \u2192 ${normalized}`;
      toast(repeatMsg);
      const dueChanged =
        (priorDue ? priorDue.getTime() : null) !== (dueDateToPersist ? dueDateToPersist.getTime() : null);
      if (dueChanged || relocation.moved) {
        const nextTemplate = t(["toasts", "nextOccurrenceTo"], getLanguageSetting());
        const cleared = translateString("Next occurrence cleared", getLanguageSetting()) || "Next occurrence cleared";
        const message = dueDateToPersist
          ? nextTemplate
            ? nextTemplate.replace("{{date}}", formatRoamDateTitle(dueDateToPersist))
            : `Next occurrence \u2192 [[${formatRoamDateTitle(dueDateToPersist)}]]`
          : cleared;
        registerDueUndoAction({
          blockUid: uid,
          message,
          setSnapshot: { ...set },
          previousDueDate: priorDue ? new Date(priorDue.getTime()) : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: dueDateToPersist ? new Date(dueDateToPersist.getTime()) : null,
          newDueStr: dueDateToPersist ? formatDate(dueDateToPersist, set) : null,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
      return normalized;
    }

    async function handleStartClick(event, context) {
      await handleFlexibleDateAttrClick(event, { ...context, type: "start" });
    }

    async function handleDeferClick(event, context) {
      await handleFlexibleDateAttrClick(event, { ...context, type: "defer" });
    }

    async function handleFlexibleDateAttrClick(event, context) {
      const { type, uid, set, span, forcePrompt = false, allowCreate = false } = context;
      if (!type || !uid || !set) return;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const attrNames = set.attrNames;
      const currentDate = type === "start" ? meta.start : meta.defer;
      const hasDate = currentDate instanceof Date && !Number.isNaN(currentDate.getTime());
      if (!hasDate && !allowCreate) return;

      const label = type === "start" ? "Start" : "Defer";
      if (event.shiftKey && hasDate && !forcePrompt) {
        await openDatePage(currentDate, { inSidebar: true });
        return;
      }
      const shouldPrompt = forcePrompt || !hasDate || event.altKey || event.metaKey || event.ctrlKey;
      if (shouldPrompt) {
        const existing = hasDate ? formatIsoDate(currentDate, set) : "";
        const promptKey = `datePrompt:${uid}:${type}`;
        const nextIso = await runDatePromptOnce(promptKey, () =>
          promptForDate({
            title: translateString(`Edit ${label} Date`, getLanguageSetting()),
            message: translateString(`Select the ${label.toLowerCase()} date`, getLanguageSetting()),
            initial: existing,
          })
        );
        if (!nextIso) return;
        const parsed = parseRoamDate(nextIso);
        if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
          toast(t(["toasts", "cannotParseDate"], getLanguageSetting()) || "Couldn't parse that date.");
          return;
        }
        const nextStr = formatDate(parsed, set);
        await updateBlockProps(uid, { [type]: nextStr });
        const childInfo = await ensureChildAttrForType(uid, type, nextStr, attrNames);
        await ensureInlineAttrForType(block, type, nextStr, attrNames);
        meta.childAttrMap = meta.childAttrMap || {};
        const existingEntry = getMetaChildAttr(meta, type, attrNames, { allowFallback: false });
        const storedUid = childInfo?.uid || existingEntry?.uid || null;
        setMetaChildAttr(meta, type, { value: nextStr, uid: storedUid }, attrNames);
        meta[type] = parsed;
        if (span) {
          const labelStr = type === "start" ? (t(["metadata", "start"], getLanguageSetting()) || "Start") : (t(["metadata", "defer"], getLanguageSetting()) || "Defer");
          renderPillDateSpan(span, {
            icon: type === "start" ? START_ICON : DEFER_ICON,
            date: parsed,
            set,
            label: labelStr,
            tooltip: `${labelStr}: ${formatIsoDate(parsed, set)}`,
          });
        }
        if (type === "start" || !isValidDateValue(meta.start)) {
          await relocateBlockForPlacement(block, meta, set);
        }
        toast(
          `${(type === "start" ? t(["metadata", "start"], getLanguageSetting()) || "Start" : t(["metadata", "defer"], getLanguageSetting()) || "Defer")} \u2192 [[${formatRoamDateTitle(parsed)}]]`
        );
        void syncPillsForSurface(lastAttrSurface);
        return parsed;
      }

      if (hasDate) {
        await openDatePage(currentDate);
      }
    }

    async function handleDueClick(event, context) {
      const { uid, set, span, forcePrompt = false, allowCreate = false } = context;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const attrNames = set.attrNames;
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const due = meta.due;
      const hasDue = due instanceof Date && !Number.isNaN(due?.getTime?.());
      if (!hasDue && !allowCreate) return;
      if (!forcePrompt && event.altKey && (event.metaKey || event.ctrlKey)) {
        await snoozeDeferByDays(uid, set, 1);
        return;
      }
      if (event.shiftKey && hasDue && !forcePrompt) {
        await openDatePage(due, { inSidebar: true });
        return;
      }
      const shouldPrompt = forcePrompt || !hasDue || event.altKey || event.metaKey || event.ctrlKey;
      if (shouldPrompt) {
        const existing = hasDue ? formatIsoDate(due, set) : "";
        const promptKey = `datePrompt:${uid}:due`;
        const nextIso = await runDatePromptOnce(promptKey, () =>
          promptForDate({
            title: "Edit Due Date",
            message: "Select the next due date",
            initial: existing,
          })
        );
        if (!nextIso) return;
        const parsed = parseRoamDate(nextIso);
        if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
          toast("Couldn't parse that date.");
          return;
        }
        const nextStr = formatDate(parsed, set);
        await updateBlockProps(uid, { due: nextStr });
        const dueChildInfo = await ensureChildAttrForType(uid, "due", nextStr, attrNames);
        await ensureInlineAttrForType(block, "due", nextStr, attrNames);
        meta.due = parsed;
        meta.childAttrMap = meta.childAttrMap || {};
        const existingEntry = getMetaChildAttr(meta, "due", attrNames, { allowFallback: false });
        const storedUid = dueChildInfo?.uid || existingEntry?.uid || null;
        setMetaChildAttr(meta, "due", { value: nextStr, uid: storedUid }, attrNames);
        mergeRepeatOverride(uid, { due: parsed });
        if (span) {
          renderPillDateSpan(span, {
            icon: DUE_ICON,
            date: parsed,
            set,
            label: t(["metadata", "due"], getLanguageSetting()) || "Due",
            tooltip: `${t(["metadata", "due"], getLanguageSetting()) || "Due"}: ${formatIsoDate(parsed, set)}`,
          });
          const pill = span.closest?.(".rt-pill");
          if (pill) pill.title = span.title;
        }
        const dueChanged =
          (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== parsed.getTime();
        if (dueChanged) {
          registerDueUndoAction({
            blockUid: uid,
            message:
              translateString("Due date changed to {{date}}", getLanguageSetting())?.replace(
                "{{date}}",
                formatRoamDateTitle(parsed)
              ) || `Due date changed to ${formatRoamDateTitle(parsed)}`,
            setSnapshot: { ...set },
            previousDueDate: contextSnapshot.previousDueDate
              ? new Date(contextSnapshot.previousDueDate.getTime())
              : null,
            previousDueStr: contextSnapshot.previousDueStr || null,
            previousInlineDue: contextSnapshot.previousInlineDue,
            hadInlineDue: contextSnapshot.hadInlineDue,
            previousInlineRepeat: contextSnapshot.previousInlineRepeat,
            hadInlineRepeat: contextSnapshot.hadInlineRepeat,
            previousChildDue: contextSnapshot.previousChildDue,
            previousChildDueUid: contextSnapshot.previousChildDueUid || null,
            hadChildDue: contextSnapshot.hadChildDue,
            previousChildRepeat: contextSnapshot.previousChildRepeat,
            previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
            previousParentUid: contextSnapshot.previousParentUid,
            previousOrder: contextSnapshot.previousOrder,
            newDue: new Date(parsed.getTime()),
            newDueStr: nextStr,
            newParentUid: contextSnapshot.previousParentUid,
            wasMoved: false,
            snapshot: contextSnapshot.snapshot,
          });
        }
        void syncPillsForSurface(lastAttrSurface);
        return parsed;
      }
      if (hasDue) {
        await openDatePage(due);
      }
    }

    async function openDatePage(date, options = {}) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
      const dnpTitle = toDnpTitle(date);
      const { inSidebar = false } = options;
      // When creating a page then immediately navigating, Roam can be briefly inconsistent.
      // Poll for the page UID (by title) and retry navigation a few times.
      for (let i = 0; i < 4; i++) {
        const uid = await ensurePageUid(dnpTitle);
        if (!uid) {
          await delay(60 * (i + 1));
          continue;
        }
        try {
          if (inSidebar) {
            window.roamAlphaAPI.ui.rightSidebar.addWindow({
              window: { type: "outline", "page-uid": uid, "block-uid": uid },
            });
          } else {
            window.roamAlphaAPI.ui.mainWindow.openPage({ page: { uid } });
          }
          return;
        } catch (_) {
          await delay(80 * (i + 1));
        }
      }
    }

    function ensurePillMenuStyles() {
      if (document.getElementById("rt-pill-menu-style")) return;
      const style = document.createElement("style");
      style.id = "rt-pill-menu-style";
      style.textContent = `
        .rt-pill-menu {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 220px;
        }
        .rt-pill-menu button {
          all: unset;
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 6px;
          background: rgba(0,0,0,0.05);
          transition: background 0.15s ease;
        }
        .rt-pill-menu button:hover {
          background: rgba(0,0,0,0.1);
        }
        .rt-pill-menu button[data-danger="1"] {
          color: #b00020;
          background: rgba(176,0,32,0.08);
        }
        .rt-pill-menu button[data-danger="1"]:hover {
          background: rgba(176,0,32,0.16);
        }
        .rt-pill-menu small {
          color: rgba(0,0,0,0.6);
        }
      `;
      document.head.appendChild(style);
    }

    function showPillMenu({ uid, set, isRecurring = true, metadata = null }) {
      // Ensure at most one pill menu toast is visible (defensive against multiple event handlers).
      try {
        const now = Date.now();
        const k = `pillMenu:${uid}`;
        if (typeof window !== "undefined") {
          const last = window.__btLastPillMenuOpen || { at: 0, key: "" };
          if (last.key === k && now - last.at < 350) return;
          window.__btLastPillMenuOpen = { at: now, key: k };
        }
        document.querySelectorAll?.(".bt-pill-menu-toast")?.forEach((toastEl) => {
          try {
            iziToast.hide?.({}, toastEl);
          } catch (_) {
            // ignore
          }
        });
      } catch (_) {
        // ignore
      }
      const menuId = `rt-pill-menu-${uid}-${Date.now()}`;
      const lang = getLanguageSetting();
      const pmStrings = t("pillMenu", lang) || {};
      const metaStrings = t("metadata", lang) || {};
      const labelOr = (key, fallback) => escapeHtml(pmStrings[key] || fallback);
      let metadataInfo =
        metadata ||
        readInlineMetaCache(uid) ||
        activeDashboardController?.getTaskMetadata?.(uid) ||
        null;
      metadataInfo = metadataInfo || {};
      const contexts = Array.isArray(metadataInfo.context) ? metadataInfo.context : [];
      const hasProject = !!metadataInfo.project;
      const hasWaiting = !!metadataInfo.waitingFor;
      const hasContext = contexts.length > 0;
      const attrNamesForMenu = set.attrNames || resolveAttributeNames();
      const applyMetadataPatch = async (patch) => {
        if (!patch) return;
        if (activeDashboardController?.updateMetadata) {
          await activeDashboardController.updateMetadata(uid, patch);
          return;
        }
        if ("project" in patch) {
          await setRichAttribute(uid, "project", patch.project ?? null, attrNamesForMenu);
          if (patch.project) addProjectOption(patch.project);
        }
        if ("waitingFor" in patch) {
          await setRichAttribute(uid, "waitingFor", patch.waitingFor ?? null, attrNamesForMenu);
        }
        if ("context" in patch) {
          const ctx = Array.isArray(patch.context) ? patch.context : [];
          await setRichAttribute(uid, "context", ctx, attrNamesForMenu);
        }
        if ("priority" in patch) {
          await setRichAttribute(uid, "priority", patch.priority ?? null, attrNamesForMenu);
        }
        if ("energy" in patch) {
          await setRichAttribute(uid, "energy", patch.energy ?? null, attrNamesForMenu);
        }
        if ("gtd" in patch) {
          await setRichAttribute(uid, "gtd", patch.gtd ?? null, attrNamesForMenu);
        }
        if (typeof window !== "undefined") {
          window.__btInlineMetaCache?.delete(uid);
        }
        try {
          const notifier = activeDashboardController?.notifyBlockChange || notifyBlockChange;
          if (typeof notifier === "function") {
            await notifier(uid, { bypassFilters: true });
          }
        } catch (err) {
          console.warn("[BetterTasks] notifyBlockChange (menu) failed", err);
        }
        void syncPillsForSurface(lastAttrSurface);
      };

      const metaHeading = t(["pillMenu", "metaHeading"], lang) || "Metadata";
      const metaSection = `
        <small>${escapeHtml(metaHeading)}</small>
        <button data-action="meta-gtd-cycle">${labelOr("cycleGtd", "Cycle GTD")}</button>
        ${hasProject
          ? `<button data-action="meta-project-remove" data-danger="1">${labelOr("removeProject", "Remove project")}</button>`
          : `<button data-action="meta-project-add">${labelOr("addProject", "Add project")}</button>`
        }
        ${hasContext
          ? `<button data-action="meta-context-remove" data-danger="1">${labelOr("removeContext", "Remove context")}</button>`
          : `<button data-action="meta-context-add">${labelOr("addContext", "Add context")}</button>`
        }
        ${hasWaiting
          ? `<button data-action="meta-waiting-remove" data-danger="1">${labelOr("removeWaiting", "Remove waiting-for")}</button>`
          : `<button data-action="meta-waiting-add">${labelOr("addWaiting", "Add waiting-for")}</button>`
        }
        <button data-action="meta-priority-cycle">${labelOr("cyclePriority", "Cycle priority")}</button>
        <button data-action="meta-energy-cycle">${labelOr("cycleEnergy", "Cycle energy")}</button>
      `;
      const recurringBlock = isRecurring
        ? `
         <button data-action="skip">${labelOr("skipOccurrence", "Skip this occurrence")}</button>
         <button data-action="generate">${labelOr("generateNext", "Generate next now")}</button>
          <button data-action="end" data-danger="1">${labelOr("endRecurrence", "End recurrence")}</button>
        `
        : "";
      const html = `
        <div class="rt-pill-menu" id="${menuId}">
         <button data-action="snooze-1">${labelOr("snoozePlus1", "Snooze +1 day")}</button>
         <button data-action="snooze-3">${labelOr("snoozePlus3", "Snooze +3 days")}</button>
         <button data-action="snooze-next-mon">${labelOr("snoozeNextMon", "Snooze to next Monday")}</button>
         <button data-action="snooze-pick">${labelOr("snoozePick", "Snooze (pick date)")}</button>
         ${recurringBlock}
         ${metaSection}
        </div>
      `;
      iziToast.show({
        theme: "light",
        color: "black",
        class: "betterTasks bt-toast-strong-icon bt-pill-menu-toast",
        overlay: true,
        timeout: false,
        close: true,
        closeOnEscape: true,
        drag: false,
        icon: "icon-check",
        iconText: "✓",
        iconColor: "#1f7a34",
        message: html,
        position: "center",
        onOpening: (_instance, toastEl) => {
          applyToastA11y(toastEl);
          const root = toastEl.querySelector(`#${menuId}`);
          if (!root) return;
          const cleanup = () => iziToast.hide({}, toastEl);
          const attach = (selector, handler) => {
            const btn = root.querySelector(selector);
            if (!btn) return;
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              cleanup();
              await handler();
            });
          };
          attach('[data-action="snooze-1"]', () => snoozeDeferByDays(uid, set, 1));
          attach('[data-action="snooze-3"]', () => snoozeDeferByDays(uid, set, 3));
          attach('[data-action="snooze-next-mon"]', () => snoozeDeferToNextMonday(uid, set));
          attach('[data-action="snooze-pick"]', () => snoozePickDeferDate(uid, set));
          attach('[data-action="skip"]', () => skipOccurrence(uid, set));
          attach('[data-action="generate"]', () => generateNextNow(uid, set));
          attach('[data-action="end"]', () => endRecurrence(uid, set));
          attach('[data-action="meta-gtd-cycle"]', async () => {
            const next = cycleGtdStatus(metadataInfo?.gtd || null);
            await applyMetadataPatch({ gtd: next });
          });
          attach('[data-action="meta-project-add"]', async () => {
            await refreshProjectOptions();
            const val = await promptForProject({
              initialValue: metadataInfo?.project || "",
            });
            if (!val || !val.trim()) return;
            await applyMetadataPatch({ project: val.trim() });
          });
          attach('[data-action="meta-project-remove"]', () => applyMetadataPatch({ project: null }));
          attach('[data-action="meta-context-add"]', async () => {
            await refreshContextOptions();
            const selection = await promptForContext({
              initialValue: metadataInfo?.context || [],
            });
            if (!selection || !selection.length) return;
            await applyMetadataPatch({ context: selection });
          });
          attach('[data-action="meta-context-remove"]', () => applyMetadataPatch({ context: [] }));
          attach('[data-action="meta-waiting-add"]', async () => {
            await refreshWaitingOptions();
            const val = await promptForWaiting({
              initialValue: metadataInfo?.waitingFor || "",
            });
            if (!val || !val.trim()) return;
            await applyMetadataPatch({ waitingFor: val.trim() });
          });
          attach('[data-action="meta-waiting-remove"]', () => applyMetadataPatch({ waitingFor: null }));
          attach('[data-action="meta-priority-cycle"]', async () => {
            const order = [null, "low", "medium", "high"];
            const current = (metadataInfo?.priority || "").toLowerCase() || null;
            const idx = order.indexOf(current);
            const next = order[(idx + 1) % order.length];
            await applyMetadataPatch({ priority: next });
          });
          attach('[data-action="meta-energy-cycle"]', async () => {
            const order = [null, "low", "medium", "high"];
            const current = (metadataInfo?.energy || "").toLowerCase() || null;
            const idx = order.indexOf(current);
            const next = order[(idx + 1) % order.length];
            await applyMetadataPatch({ energy: next });
          });
        },
      });
    }

    async function updateStartDate(uid, set, targetDate, options = {}) {
      if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return;
      const block = options.block || (await getBlock(uid));
      if (!block) return;
      const meta = options.meta || (await readRecurringMeta(block, set));
      const attrNames = set.attrNames;
      const nextStr = formatDate(targetDate, set);
      await updateBlockProps(uid, { start: nextStr });
      const startChildInfo = await ensureChildAttrForType(uid, "start", nextStr, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      const existingEntry = getMetaChildAttr(meta, "start", attrNames, { allowFallback: false });
      const storedUid = startChildInfo?.uid || existingEntry?.uid || null;
      setMetaChildAttr(meta, "start", { value: nextStr, uid: storedUid }, attrNames);
      await ensureInlineAttrForType(block, "start", nextStr, attrNames);
      meta.start = targetDate;
      await relocateBlockForPlacement(block, meta, set);
      void syncPillsForSurface(lastAttrSurface);
    }

    async function updateDeferDate(uid, set, targetDate, options = {}) {
      if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return;
      const block = options.block || (await getBlock(uid));
      if (!block) return;
      const meta = options.meta || (await readRecurringMeta(block, set));
      const attrNames = set.attrNames;
      const nextStr = formatDate(targetDate, set);
      await updateBlockProps(uid, { defer: nextStr });
      const deferChildInfo = await ensureChildAttrForType(uid, "defer", nextStr, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      const existingEntry = getMetaChildAttr(meta, "defer", attrNames, { allowFallback: false });
      const storedUid = deferChildInfo?.uid || existingEntry?.uid || null;
      setMetaChildAttr(meta, "defer", { value: nextStr, uid: storedUid }, attrNames);
      await ensureInlineAttrForType(block, "defer", nextStr, attrNames);
      meta.defer = targetDate;
      if (!isValidDateValue(meta.start)) {
        await relocateBlockForPlacement(block, meta, set);
      }
      if (!bulkOperationInProgress) {
        toast(options.toastMessage || `Snoozed to [[${formatRoamDateTitle(targetDate)}]]`);
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    function diffDaysLocal(a, b) {
      if (!(a instanceof Date) || !(b instanceof Date)) return 0;
      const aStart = startOfDayLocal(a).getTime();
      const bStart = startOfDayLocal(b).getTime();
      return Math.round((aStart - bStart) / (24 * 60 * 60 * 1000));
    }

    async function shiftExistingDatesByDays(uid, set, days, options = {}) {
      if (typeof days !== "number" || !Number.isFinite(days)) return;
      const block = options.block || (await getBlock(uid));
      if (!block) return;
      const meta = options.meta || (await readRecurringMeta(block, set));
      const hasStart = meta.start instanceof Date && !Number.isNaN(meta.start.getTime());
      const hasDefer = meta.defer instanceof Date && !Number.isNaN(meta.defer.getTime());
      const hasDue = meta.due instanceof Date && !Number.isNaN(meta.due.getTime());
      if (!hasStart && !hasDefer && !hasDue) {
        const next = addDaysLocal(todayLocal(), days);
        await updateDeferDate(uid, set, next, { block, meta });
        return;
      }
      const minTarget = addDaysLocal(todayLocal(), days);
      const clampToMin = (date) => {
        const shifted = addDaysLocal(date, days);
        return shifted.getTime() < minTarget.getTime() ? minTarget : shifted;
      };
      if (hasStart) await updateStartDate(uid, set, clampToMin(meta.start), { block, meta });
      if (hasDefer) await updateDeferDate(uid, set, clampToMin(meta.defer), { block, meta });
      if (hasDue) await updateDueDate(uid, set, clampToMin(meta.due), { block, meta });
    }

    async function updateDueDate(uid, set, targetDate, options = {}) {
      if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return;
      const block = options.block || (await getBlock(uid));
      if (!block) return;
      const meta = options.meta || (await readRecurringMeta(block, set));
      const attrNames = set.attrNames;
      const nextStr = formatDate(targetDate, set);
      await updateBlockProps(uid, { due: nextStr });
      const dueChildInfo = await ensureChildAttrForType(uid, "due", nextStr, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      const existingEntry = getMetaChildAttr(meta, "due", attrNames, { allowFallback: false });
      const storedUid = dueChildInfo?.uid || existingEntry?.uid || null;
      setMetaChildAttr(meta, "due", { value: nextStr, uid: storedUid }, attrNames);
      await ensureInlineAttrForType(block, "due", nextStr, attrNames);
      meta.due = targetDate;
      void syncPillsForSurface(lastAttrSurface);
    }

    async function snoozeDeferByDays(uid, set, days) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      await shiftExistingDatesByDays(uid, set, days, { block, meta });
    }

    async function snoozeDeferToNextMonday(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const anchor =
        pickPlacementDate({ start: meta.start, defer: meta.defer, due: meta.due }) ||
        meta.due ||
        meta.defer ||
        meta.start ||
        todayLocal();
      let cursor = anchor;
      for (let i = 0; i < 7; i++) {
        cursor = addDaysLocal(cursor, 1);
        if (cursor.getDay() === 1) break;
      }
      const days = diffDaysLocal(cursor, anchor);
      await shiftExistingDatesByDays(uid, set, days, { block, meta });
    }

    async function snoozePickDeferDate(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const initial = meta.defer ? formatIsoDate(meta.defer, set) : "";
      const nextIso = await promptForDate({
        title: "Snooze until",
        message: "Select the date to resume this task",
        initial,
      });
      if (!nextIso) return;
      const parsed = parseRoamDate(nextIso);
      if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        toast("Couldn't parse that date.");
        return;
      }
      const anchor =
        pickPlacementDate({ start: meta.start, defer: meta.defer, due: meta.due }) ||
        meta.due ||
        meta.defer ||
        meta.start ||
        null;
      if (!anchor) {
        await updateDeferDate(uid, set, parsed, { block, meta });
        return;
      }
      const days = diffDaysLocal(parsed, anchor);
      await shiftExistingDatesByDays(uid, set, days, { block, meta });
    }

    async function skipOccurrence(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      if (!meta.repeat) {
        toast("No repeat rule to skip.");
        return;
      }
      const nextDue = computeNextDue(meta, set);
      if (!nextDue) {
        toast("Could not compute the next occurrence.");
        return;
      }
      const startOffsetMs =
        meta.start instanceof Date && meta.due instanceof Date ? meta.start.getTime() - meta.due.getTime() : null;
      const deferOffsetMs =
        meta.defer instanceof Date && meta.due instanceof Date ? meta.defer.getTime() - meta.due.getTime() : null;
      const nextStartDate = startOffsetMs != null ? applyOffsetToDate(nextDue, startOffsetMs) : null;
      const nextDeferDate = deferOffsetMs != null ? applyOffsetToDate(nextDue, deferOffsetMs) : null;
      const nextStr = formatDate(nextDue, set);
      const nextStartStr = nextStartDate ? formatDate(nextStartDate, set) : null;
      const nextDeferStr = nextDeferDate ? formatDate(nextDeferDate, set) : null;
      await updateBlockProps(uid, {
        due: nextStr,
        start: nextStartStr || undefined,
        defer: nextDeferStr || undefined,
      });
      const attrNames = set.attrNames;
      const dueChildInfo = await ensureChildAttrForType(uid, "due", nextStr, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      const existingEntry = getMetaChildAttr(meta, "due", attrNames, { allowFallback: false });
      const storedUid = dueChildInfo?.uid || existingEntry?.uid || null;
      setMetaChildAttr(meta, "due", { value: nextStr, uid: storedUid }, attrNames);
      if (nextStartStr) {
        const startChildInfo = await ensureChildAttrForType(uid, "start", nextStartStr, attrNames);
        setMetaChildAttr(meta, "start", { value: nextStartStr, uid: startChildInfo.uid }, attrNames);
      } else {
        await removeChildAttrsForType(uid, "start", attrNames);
        clearMetaChildAttr(meta, "start", attrNames);
      }
      if (nextDeferStr) {
        const deferChildInfo = await ensureChildAttrForType(uid, "defer", nextDeferStr, attrNames);
        setMetaChildAttr(meta, "defer", { value: nextDeferStr, uid: deferChildInfo.uid }, attrNames);
      } else {
        await removeChildAttrsForType(uid, "defer", attrNames);
        clearMetaChildAttr(meta, "defer", attrNames);
      }
      await ensureInlineAttrForType(block, "due", nextStr, attrNames);
      if (nextStartStr) await ensureInlineAttrForType(block, "start", nextStartStr, attrNames);
      if (nextDeferStr) await ensureInlineAttrForType(block, "defer", nextDeferStr, attrNames);
      meta.due = nextDue;
      meta.start = nextStartDate;
      meta.defer = nextDeferDate;
      mergeRepeatOverride(uid, { due: nextDue });
      const skipAnchor = pickPlacementDate({ start: nextStartDate, defer: nextDeferDate, due: nextDue }) || nextDue;
      const relocation = await relocateBlockForPlacement(
        block,
        { start: nextStartDate, defer: nextDeferDate, due: nextDue },
        set
      );
      const dueChanged =
        (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== nextDue.getTime();
      if (dueChanged || relocation.moved) {
        registerDueUndoAction({
          blockUid: uid,
          message: `Skipped to ${formatRoamDateTitle(skipAnchor)}`,
          setSnapshot: { ...set },
          previousDueDate: contextSnapshot.previousDueDate ? new Date(contextSnapshot.previousDueDate.getTime()) : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: new Date(nextDue.getTime()),
          newDueStr: nextStr,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function generateNextNow(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      if (!meta.repeat) {
        toast("No repeat rule found.");
        return;
      }
      const nextDue = computeNextDue(meta, set);
      if (!nextDue) {
        toast("Could not compute the next occurrence.");
        return;
      }
      const newUid = await spawnNextOccurrence(block, meta, nextDue, set);
      const nextStart =
        meta.start instanceof Date && meta.due instanceof Date
          ? applyOffsetToDate(nextDue, meta.start.getTime() - meta.due.getTime())
          : null;
      const nextDefer =
        meta.defer instanceof Date && meta.due instanceof Date
          ? applyOffsetToDate(nextDue, meta.defer.getTime() - meta.due.getTime())
          : null;
      const anchor = pickPlacementDate({ start: nextStart, defer: nextDefer, due: nextDue }) || nextDue;
      if (!bulkOperationInProgress) {
        toast(`Next occurrence created (${formatRoamDateTitle(anchor)})`);
      }
      void syncPillsForSurface(lastAttrSurface);
      return newUid;
    }

    async function endRecurrence(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const props = parseProps(block.props);
      delete props.repeat;
      delete props.due;
      if (props.rt) {
        delete props.rt.id;
        delete props.rt.parent;
        delete props.rt.lastCompleted;
        delete props.rt.processed;
        delete props.rt.tz;
      }
      await setBlockProps(uid, props);
      const childMap = parseAttrsFromChildBlocks(block.children || []);
      const removalKeys = [set.attrNames.repeatKey, set.attrNames.dueKey, "rt-processed"];
      for (const key of removalKeys) {
        const info = childMap[key];
        if (info?.uid) {
          try {
            const targetUid = info.uid.trim();
            if (!targetUid) continue;
            const exists = await getBlock(targetUid);
            if (!exists) continue;
            await deleteBlock(targetUid);
          } catch (err) {
            console.warn("[RecurringTasks] failed to remove child attr", err);
          }
        }
      }
      const cleaned = removeInlineAttributes(block.string || "", [
        ...new Set([...set.attrNames.repeatRemovalKeys, ...set.attrNames.dueRemovalKeys]),
      ]);
      if (cleaned !== block.string) {
        await updateBlockString(uid, cleaned);
      }
      repeatOverrides.delete(uid);
      registerDueUndoAction({
        blockUid: uid,
        message: "Recurrence ended",
        setSnapshot: { ...set },
        previousDueDate: contextSnapshot.previousDueDate || null,
        previousDueStr: contextSnapshot.previousDueStr || null,
        previousInlineDue: contextSnapshot.previousInlineDue,
        hadInlineDue: contextSnapshot.hadInlineDue,
        previousInlineRepeat: contextSnapshot.previousInlineRepeat,
        hadInlineRepeat: contextSnapshot.hadInlineRepeat,
        previousChildDue: contextSnapshot.previousChildDue,
        previousChildDueUid: contextSnapshot.previousChildDueUid || null,
        hadChildDue: contextSnapshot.hadChildDue,
        previousChildRepeat: contextSnapshot.previousChildRepeat,
        previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
        previousParentUid: contextSnapshot.previousParentUid,
        previousOrder: contextSnapshot.previousOrder,
        newDue: null,
        newDueStr: null,
        newParentUid: contextSnapshot.previousParentUid,
        wasMoved: false,
        snapshot: contextSnapshot.snapshot,
      });
      void syncPillsForSurface(lastAttrSurface);
    }

    // possible future feature: view series history
    /* 
    async function openSeriesHistory(uid, set) {
      const history = await fetchSeriesHistory(uid);
      if (!history.length) {
        toast("No series history available.");
        return;
      }
      const html = history
        .map((item) => {
          const pageTitle = item.page?.title || item.page?.["node/title"] || "Unknown page";
          const snippet = (item.string || "").replace(/\n+/g, " ").slice(0, 120);
          const props = parseProps(item.props);
          const due = props.due || "";
          return `<button data-uid="${item.uid}">${escapeHtml(snippet)}<br/><small>${escapeHtml(
            pageTitle
          )}${due ? " · Due " + escapeHtml(due) : ""}</small></button>`;
        })
        .join("");
      const menuId = `rt-series-${uid}-${Date.now()}`;
      iziToast.show({
        theme: "light",
        color: "black",
        class: "betterTasks",
        overlay: true,
        timeout: false,
        close: true,
        message: `<div class="rt-pill-menu" id="${menuId}">${html}</div>`,
        position: "center",
        onOpening: (_instance, toastEl) => {
          const root = toastEl.querySelector(`#${menuId}`);
          if (!root) return;
          root.querySelectorAll("button[data-uid]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const targetUid = btn.getAttribute("data-uid");
              if (targetUid) {
                window.roamAlphaAPI.ui.mainWindow.openBlock({ block: { uid: targetUid } });
              }
            });
          });
        },
      });
    }

    async function fetchSeriesHistory(uid) {
      const out = [];
      const visited = new Set();
      let current = uid;
      while (current && !visited.has(current)) {
        visited.add(current);
        const block = await getBlock(current);
        if (!block) break;
        out.push(block);
        const props = parseProps(block.props);
        const parent = props.rt?.parent || null;
        current = parent;
      }
      return out;
    }
    */

    function formatFriendlyDate(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      try {
        const fmt = new Intl.DateTimeFormat(set.locale || undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: set.timezone || undefined,
        });
        return fmt.format(date);
      } catch {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate()
        ).padStart(2, "0")}`;
      }
    }

    function formatIsoDate(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const tzDate = new Date(date.getTime());
      if (set.timezone && typeof Intl === "object" && Intl.DateTimeFormat) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: set.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(tzDate);
        const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        if (map.year && map.month && map.day) {
          return `${map.year}-${map.month}-${map.day}`;
        }
      }
      return `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, "0")}-${String(
        tzDate.getDate()
      ).padStart(2, "0")}`;
    }

    function formatRoamDateTitle(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const util = window.roamAlphaAPI?.util;
      if (util?.dateToPageTitle) {
        try {
          return util.dateToPageTitle(date);
        } catch (err) {
          console.warn("[RecurringTasks] dateToPageTitle failed, falling back to friendly", err);
        }
      }
      const year = date.getFullYear();
      const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
      return `${month} ${ordinalSuffix(date.getDate())}, ${year}`;
    }

    function ordinalSuffix(n) {
      const rem10 = n % 10;
      const rem100 = n % 100;
      if (rem10 === 1 && rem100 !== 11) return `${n}st`;
      if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
      if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
      return `${n}th`;
    }

    function isTaskInCodeBlock(block) {
      const text = (block?.string || "").trim();
      if (!text) return false;
      if (text.startsWith("```") || text.startsWith("{{[[code]]}}") || text.startsWith("<code")) {
        return true;
      }
      return false;
    }

    function insertPillWrap(main, check, pillWrap) {
      const inputContainer = main.querySelector?.(".rm-block__input");
      const inlineText =
        inputContainer && inputContainer.tagName !== "TEXTAREA"
          ? inputContainer.firstElementChild
          : null;
      const autocompleteWrapper = main.querySelector?.(".rm-autocomplete__wrapper");
      const blockSelf = main.querySelector?.(".rm-block__self");
      const blockText = main.querySelector?.(".rm-block-text");
      if (inlineText && inlineText.nodeType === 1) {
        inlineText.appendChild(pillWrap);
        pillWrap.classList.add("rt-pill-inline");
        return;
      }
      if (inputContainer && inputContainer.tagName !== "TEXTAREA" && !pillWrap.isConnected) {
        inputContainer.appendChild(pillWrap);
        pillWrap.classList.add("rt-pill-inline");
        return;
      }
      if (blockText && !pillWrap.isConnected) {
        blockText.appendChild(pillWrap);
        pillWrap.classList.add("rt-pill-inline");
        return;
      }
      if (blockSelf?.parentNode && !pillWrap.isConnected) {
        blockSelf.parentNode.insertBefore(pillWrap, blockSelf.nextSibling);
        return;
      }
      if (autocompleteWrapper?.parentNode && !pillWrap.isConnected) {
        autocompleteWrapper.parentNode.insertBefore(pillWrap, autocompleteWrapper.nextSibling);
        return;
      }
      if (check?.parentNode && !pillWrap.isConnected) {
        check.parentNode.appendChild(pillWrap);
        return;
      }
      if (!pillWrap.isConnected) {
        main.appendChild(pillWrap);
      }
    }

    // ========================= Child -> Props sync core =========================
    async function handleAnyEdit(evt) {
      const set = S();

      const uid = findBlockUidFromElement(evt.target);
      if (!uid) return;

      // Is this block a "repeat:: ..." or "due:: ..." child?
      const child = await getBlock(uid);
      const line = (child?.string || "").trim();
      const m = line.match(ATTR_RE);
      if (!m) return;

      const key = m[1].trim().toLowerCase();
      const attrNames = set.attrNames;
      let attrType = null;
      if (key === attrNames.repeatKey) attrType = "repeat";
      else if (key === attrNames.dueKey) attrType = "due";
      if (!attrType) return;

      // Get parent task uid
      const parentUid = await getParentUid(uid);
      if (!parentUid) return;

      // Debounce per parent to avoid thrashing while typing, remember source event
      if (childEditDebounce.has(parentUid)) clearTimeout(childEditDebounce.get(parentUid));
      const srcType = evt.type;
      childEditDebounce.set(parentUid, setTimeout(() => {
        childEditDebounce.delete(parentUid);
        void syncChildAttrToParent(parentUid, attrType, { sourceEvent: srcType, suppressToast: true });
      }, srcType === "blur" ? 0 : 250));
    }

    async function getParentUid(childUid) {
      const safeChildUid = escapeDatalogString(childUid);
      const res = await window.roamAlphaAPI.q(`
        [:find ?puid
         :where
         [?c :block/uid "${safeChildUid}"]
         [?c :block/parents ?p]
         [?p :block/uid ?puid]]`);
      return res?.[0]?.[0] || null;
    }

    async function syncChildAttrToParent(parentUid, attrType, opts = {}) {
      const sourceEvent = opts?.sourceEvent || "input";
      const suppressToast = !!opts?.suppressToast;
      const set = S();
      const parent = await getBlock(parentUid);
      if (!parent) return;
      const attrNames = set.attrNames;
      const attrKey = getAttrKey(attrType, attrNames);
      if (deletingChildAttrs.has(`${parentUid}::${attrKey}`)) {
        return;
      }

      // read current child values
      const childMap = parseAttrsFromChildBlocks(parent.children || []);
      const attrLabel = getAttrLabel(attrType, attrNames).toLowerCase();
      const info = childMap[attrLabel] || null;
      const rawValue = (info?.value || "").trim();

      // If empty, only remove after a blur (don't spam while user is typing).
      if (!rawValue) {
        if (sourceEvent !== "blur") {
          return; // wait until editing finishes
        }
        const props = parseProps(parent.props);
        if (props[attrType] !== undefined) {
          delete props[attrType];
          await setBlockProps(parentUid, props);
        }
        await ensureInlineAttrForType(parent, attrType, "", attrNames); // no-op unless inline exists
        // Quietly remove on blur; no toast to avoid noise.
        void syncPillsForSurface(lastAttrSurface);
        return;
      }

      // Normalize and write to props
      if (attrType === "repeat") {
        const normalized = normalizeRepeatRuleText(rawValue) || rawValue;
        const props = parseProps(parent.props);
        if (props.repeat !== normalized) {
          try {
            await updateBlockProps(parentUid, { repeat: normalized });
          } catch (err) {
            console.warn("[RecurringTasks] syncChildAttrToParent repeat update failed", err);
            return;
          }
          await ensureChildAttrForType(parentUid, "repeat", normalized, attrNames);
          await ensureInlineAttrForType(parent, "repeat", normalized, attrNames);
          if (!suppressToast) {
            toast(`Repeat → ${normalized}`);
          }
        }
      } else if (attrType === "due") {
        const props = parseProps(parent.props);
        if (props.due !== rawValue) {
          try {
            await updateBlockProps(parentUid, { due: rawValue });
          } catch (err) {
            console.warn("[RecurringTasks] syncChildAttrToParent due update failed", err);
            return;
          }
          await ensureChildAttrForType(parentUid, "due", rawValue, attrNames);
          await ensureInlineAttrForType(parent, "due", rawValue, attrNames);
          if (!suppressToast) {
            toast(`Due → ${rawValue}`);
          }
        }
      }

      // Refresh pills if needed (only relevant when pills are visible)
      if (!opts?.skipRefresh) {
        void syncPillsForSurface(lastAttrSurface || "Child");
      }
    }

    async function flushChildAttrSync(parentUid, options = {}) {
      if (childEditDebounce.has(parentUid)) {
        clearTimeout(childEditDebounce.get(parentUid));
        childEditDebounce.delete(parentUid);
      }
      const baseOpts = { sourceEvent: "flush", skipRefresh: true, suppressToast: true };
      await syncChildAttrToParent(parentUid, "repeat", { ...baseOpts, ...options });
      await syncChildAttrToParent(parentUid, "due", { ...baseOpts, ...options });
    }

    async function undoTaskCompletion(uid) {
      if (!uid) return;
      try {
        const block = await getBlock(uid);
        if (!block) return;
        const normalized = normalizeToTodoMacro(block.string || "");
        await updateBlockString(uid, normalized);
        const attrNames = lastAttrNames || resolveAttributeNames();
        await removeChildAttrsForType(uid, "completed", attrNames);
        await updateBlockProps(uid, {
          rt: {
            processed: null,
            lastCompleted: null,
          },
        });
        repeatOverrides.delete(uid);
        activeDashboardController?.notifyBlockChange?.(uid);
      } catch (err) {
        console.warn("[RecurringTasks] undoTaskCompletion failed", err);
      }
    }

    function createDashboardController(extensionAPI) {
      const DASHBOARD_FULLPAGE_KEY_BASE = "betterTasks.dashboard.fullPage";
      const reviewStepSettingMap = [
        { viewId: "bt_preset_next_actions", settingId: REVIEW_STEP_NEXT_ACTIONS_SETTING },
        { viewId: "bt_preset_waiting_for", settingId: REVIEW_STEP_WAITING_FOR_SETTING },
        { viewId: "bt_preset_completed_7d", settingId: REVIEW_STEP_COMPLETED_7D_SETTING },
        { viewId: "bt_preset_upcoming_7d", settingId: REVIEW_STEP_UPCOMING_7D_SETTING },
        { viewId: "bt_preset_overdue", settingId: REVIEW_STEP_OVERDUE_SETTING },
        { viewId: "bt_preset_someday", settingId: REVIEW_STEP_SOMEDAY_SETTING },
      ];
      const getDashboardFullPageKey = () => {
        if (typeof window === "undefined") return DASHBOARD_FULLPAGE_KEY_BASE;
        let graphName = "default";
        try {
          graphName = window.roamAlphaAPI?.graph?.name?.() || "default";
        } catch (_) {
          // ignore
        }
        return `${DASHBOARD_FULLPAGE_KEY_BASE}.${encodeURIComponent(String(graphName))}`;
      };
      const readDashboardFullPageSetting = () => {
        if (typeof window === "undefined") return false;
        try {
          const key = getDashboardFullPageKey();
          let raw = window.localStorage?.getItem(key);
          // Migrate from legacy global key (if present) to per-graph key.
          if (raw == null) {
            const legacy = window.localStorage?.getItem(DASHBOARD_FULLPAGE_KEY_BASE);
            if (legacy != null) {
              raw = legacy;
              window.localStorage?.setItem(key, legacy);
            }
          }
          const norm = typeof raw === "string" ? raw.trim().toLowerCase() : "";
          return norm === "true" || norm === "1";
        } catch (_) {
          return false;
        }
      };
      const writeDashboardFullPageSetting = (enabled) => {
        if (typeof window === "undefined") return;
        try {
          window.localStorage?.setItem(getDashboardFullPageKey(), enabled ? "true" : "false");
        } catch (_) {
          // ignore
        }
      };
      const getReviewStepSettings = () => {
        const out = {};
        reviewStepSettingMap.forEach(({ viewId, settingId }) => {
          const raw = extensionAPI?.settings?.get?.(settingId);
          out[viewId] = raw == null ? true : normalizeBooleanSetting(raw);
        });
        return out;
      };

      let isFullPage = typeof window !== "undefined" ? readDashboardFullPageSetting() : false;
      const initialState = {
        tasks: [],
        status: "idle",
        error: null,
        lastUpdated: null,
        isFullPage,
      };
      let state = { ...initialState };
      const subscribers = new Set();
      const dashViewRequestSubscribers = new Set();
      const dashViewsStoreSubscribers = new Set();
      const dashReviewRequestSubscribers = new Set();
      const reviewStepSettingsSubscribers = new Set();
      let dashReviewStartPending = false;
      let lastDashViewState = null;
      let container = null;
      let root = null;
      let refreshPromise = null;
      const DASHBOARD_POSITION_KEY = "betterTasks.dashboard.position";
      let savedPosition =
        typeof window !== "undefined" ? loadSavedDashboardPosition() : null;
      let dragHandle = null;
      let dragPointerId = null;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      let isDraggingDashboard = false;
      let resizeListenerAttached = false;
      let fullPagePrevStyleText = "";
      let fullPageHostEl = null;
      let fullPageObserver = null;
      let fullPageWindowListenerAttached = false;
      let fullPageRafPending = false;
      let lastFullPageRect = null;
      let didCloseLeftSidebarForMobile = false;
      let leftSidebarMql = null;
      let leftSidebarMqlListenerAttached = false;
      let leftSidebarMqlHandler = null;

      const controller = {
        getSnapshot: () => state,
        subscribe,
        getTasks: () => state.tasks.map((task) => ({ ...task })),
        ensureInitialLoad,
        refresh,
        open,
        close,
        toggle,
        quickAdd,
        toggleTask,
        snoozeTask,
        bulkToggleTask,
        bulkSnoozeTask,
        bulkUpdateMetadata,
        openBlock,
        openPage,
        notifyBlockChange,
        removeTask,
        openSettings,
        updateMetadata,
        handleMetadataClick,
        promptValue: promptForValue,
        promptProject: promptForProject,
        promptWaiting: promptForWaiting,
        promptContext: promptForContext,
        refreshWaitingOptions,
        refreshContextOptions,
        getWaitingOptions,
        getContextOptions,
        subscribeWaitingOptions: subscribeToWaitingOptions,
        subscribeContextOptions: subscribeToContextOptions,
        refreshProjectOptions,
        getProjectOptions,
        subscribeProjectOptions: subscribeToProjectOptions,
        getTaskMetadata,
        isOpen: () => !!root,
        editRepeat,
        editDate,
        openPillMenuForTask,
        removeTaskAttribute,
        refreshLanguage,
        loadViewsStore: () => loadViewsStore(extensionAPI),
        saveViewsStore: (store) => saveViewsStore(extensionAPI, store),
        subscribeDashViewRequests,
        requestApplyDashViewState,
        subscribeDashViewsStore,
        notifyDashViewsStoreChanged,
        reportDashViewState,
        getDashViewState,
        getReviewStepSettings,
        subscribeDashReviewRequests,
        subscribeReviewStepSettings,
        notifyReviewStepSettingsChanged,
        requestStartDashReview,
        isDashboardFullPage: () => !!isFullPage,
        setDashboardFullPage,
        toggleDashboardFullPage: () => setDashboardFullPage(!isFullPage),
        dispose,
      };
      // Ensure prompt helpers are always present for dashboard consumers.
      if (!controller.promptProject) controller.promptProject = (opts = {}) => promptForAttribute("project", { ...opts, allowMulti: false });
      if (!controller.promptWaiting) controller.promptWaiting = (opts = {}) => promptForAttribute("waitingFor", { ...opts, allowMulti: false });
      if (!controller.promptContext) controller.promptContext = (opts = {}) => promptForAttribute("context", { ...opts, allowMulti: true });

      function emit() {
        const snapshot = {
          ...state,
          tasks: state.tasks.map((task) => ({ ...task })),
        };
        subscribers.forEach((callback) => {
          try {
            callback(snapshot);
          } catch (err) {
            console.warn("[BetterTasks] dashboard subscriber failed", err);
          }
        });
      }

      function subscribe(listener) {
        if (typeof listener === "function") {
          subscribers.add(listener);
          listener({ ...state, tasks: state.tasks.map((task) => ({ ...task })) });
        }
        return () => subscribers.delete(listener);
      }

      function subscribeDashViewRequests(listener) {
        if (typeof listener === "function") dashViewRequestSubscribers.add(listener);
        return () => dashViewRequestSubscribers.delete(listener);
      }

      function requestApplyDashViewState(nextState) {
        dashViewRequestSubscribers.forEach((listener) => {
          try {
            listener(nextState || null);
          } catch (err) {
            console.warn("[BetterTasks] dashboard view request subscriber failed", err);
          }
        });
      }

      function subscribeDashViewsStore(listener) {
        if (typeof listener === "function") dashViewsStoreSubscribers.add(listener);
        return () => dashViewsStoreSubscribers.delete(listener);
      }

      function notifyDashViewsStoreChanged(nextStore = null) {
        dashViewsStoreSubscribers.forEach((listener) => {
          try {
            listener(nextStore);
          } catch (err) {
            console.warn("[BetterTasks] dashboard views store subscriber failed", err);
          }
        });
      }

      function reportDashViewState(next) {
        if (!next || typeof next !== "object") return;
        lastDashViewState = clonePlain(next);
      }

      function getDashViewState() {
        return lastDashViewState ? clonePlain(lastDashViewState) : null;
      }

      function subscribeDashReviewRequests(listener) {
        if (typeof listener === "function") {
          dashReviewRequestSubscribers.add(listener);
          if (dashReviewStartPending) {
            dashReviewStartPending = false;
            try {
              listener({ type: "start" });
            } catch (err) {
              console.warn("[BetterTasks] dashboard review request subscriber failed", err);
            }
          }
        }
        return () => dashReviewRequestSubscribers.delete(listener);
      }
      function subscribeReviewStepSettings(listener) {
        if (typeof listener === "function") reviewStepSettingsSubscribers.add(listener);
        return () => reviewStepSettingsSubscribers.delete(listener);
      }
      function notifyReviewStepSettingsChanged() {
        reviewStepSettingsSubscribers.forEach((listener) => {
          try {
            listener();
          } catch (err) {
            console.warn("[BetterTasks] review step settings subscriber failed", err);
          }
        });
      }

      function requestStartDashReview() {
        dashReviewStartPending = true;
        dashReviewRequestSubscribers.forEach((listener) => {
          try {
            listener({ type: "start" });
          } catch (err) {
            console.warn("[BetterTasks] dashboard review request subscriber failed", err);
          }
        });
      }

      function getTaskMetadata(uid) {
        if (!uid) return null;
        const task = state.tasks.find((entry) => entry.uid === uid);
        return task?.metadata || null;
      }

      function ensureInitialLoad() {
        if (state.status === "idle" && !refreshPromise) {
          void refresh({ reason: "initial" });
        }
      }

      async function refresh({ reason = "manual" } = {}) {
        if (refreshPromise) return refreshPromise;
        state = {
          ...state,
          status: state.tasks.length ? "refreshing" : "loading",
          error: null,
        };
        emit();
        const attachWatches = controller.isOpen();
        const cacheKey = "dash:withDone";
        const bypassCache = reason === "force";
        refreshPromise = collectDashboardTasks({ attachWatches, cacheKey, bypassCache })
          .then((tasks) => {
            state = {
              ...state,
              tasks,
              status: "ready",
              error: null,
              lastUpdated: Date.now(),
              lastReason: reason,
            };
            emit();
          })
          .catch((err) => {
            console.error("[BetterTasks] dashboard refresh failed", err);
            state = {
              ...state,
              status: "error",
              error: err,
            };
            emit();
          })
          .finally(() => {
            refreshPromise = null;
          });
        return refreshPromise;
      }

      async function quickAdd(inputText) {
        const rawInput = typeof inputText === "string" ? inputText : "";
        const trimmed = rawInput.trim();
        if (!trimmed) {
          toast("Enter some task text.");
          return;
        }
        const aiSettings = getAiSettings();
        const aiEnabled = isAiEnabled(aiSettings);
        let parsedTask = null;
        if (aiEnabled) {
          const aiAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
          let suppressAiAbort = false;
          const pending = showPersistentToast("Parsing task with AI\u2026", {
            onClosed: () => {
              if (suppressAiAbort) return;
              aiAbort?.abort();
            },
          });
          let aiResult = null;
          try {
            aiResult = await parseTaskWithOpenAI(trimmed, aiSettings, { signal: aiAbort?.signal });
          } catch (err) {
            console.warn("[BetterTasks] AI parsing threw in quickAdd", err);
            aiResult = { ok: false, error: err };
          } finally {
            suppressAiAbort = true;
            hideToastInstance(pending);
          }
          if (aiResult?.reason === "aborted") {
            return;
          }
          if (aiResult?.ok) {
            parsedTask = aiResult.task;
          } else {
            console.warn("[BetterTasks] AI parsing unavailable in quickAdd", aiResult?.error || aiResult?.reason);
            toast("AI parsing unavailable, falling back to manual entry.");
          }
        }

        if (parsedTask) {
          const created = await createQuickTaskFromParsed(parsedTask, trimmed);
          if (created) {
            await refresh({ reason: "quick-add" });
            return;
          }
          toast("Couldn't create task from AI result; try manual.");
        }

        const promptResult = await promptForRepeatAndDue({
          includeTaskText: true,
          forceTaskInput: true,
          taskText: trimmed,
        });
        if (!promptResult) return;
        const createdManual = await createQuickTaskFromPrompt(promptResult);
        if (createdManual) {
          await refresh({ reason: "quick-add" });
        } else {
          toast("Couldn't create task from input.");
        }
      }

      function ensureContainer() {
        if (container && root) return;
        container = document.createElement("div");
        container.className = "bt-dashboard-host";
        document.body.appendChild(container);
        root = createRootCompat(container);
        if (!resizeListenerAttached && typeof window !== "undefined") {
          window.addEventListener("resize", handleWindowResize);
          resizeListenerAttached = true;
        }
      }

      function scheduleApplyFullPageRect() {
        if (fullPageRafPending) return;
        fullPageRafPending = true;
        requestAnimationFrame(() => {
          fullPageRafPending = false;
          applyFullPageRect();
        });
      }

      function attachFullPageObserver(host) {
        if (fullPageObserver) {
          try {
            fullPageObserver.disconnect();
          } catch (_) {
            // ignore
          }
          fullPageObserver = null;
        }
        if (!host || typeof ResizeObserver === "undefined") return;
        fullPageObserver = new ResizeObserver(() => scheduleApplyFullPageRect());
        try {
          fullPageObserver.observe(host);
        } catch (_) {
          // ignore
        }
      }

      function applyFullPageRect() {
        if (!isFullPage || !container || typeof document === "undefined") return;
        const host = document.querySelector(".roam-body-main");
        if (!host) return;
        if (host !== fullPageHostEl) {
          fullPageHostEl = host;
          attachFullPageObserver(host);
        }
        const rect = host.getBoundingClientRect();
        const next = {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        if (
          lastFullPageRect &&
          lastFullPageRect.top === next.top &&
          lastFullPageRect.left === next.left &&
          lastFullPageRect.width === next.width &&
          lastFullPageRect.height === next.height
        ) {
          return;
        }
        lastFullPageRect = next;
        container.style.position = "fixed";
        container.style.top = `${next.top}px`;
        container.style.left = `${next.left}px`;
        container.style.width = `${next.width}px`;
        container.style.height = `${next.height}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
      }

      function enableFullPage() {
        if (!container || !root || isDraggingDashboard) {
          cleanupDragListeners();
        }
        if (!container) return;
        if (container.classList.contains("bt-dashboard-host--fullpage")) return;
        fullPagePrevStyleText = container.getAttribute("style") || "";
        container.classList.add("bt-dashboard-host--fullpage");
        registerDragHandle(dragHandle);
        fullPageHostEl = null;
        lastFullPageRect = null;
        scheduleApplyFullPageRect();
        if (!fullPageWindowListenerAttached && typeof window !== "undefined") {
          window.addEventListener("resize", scheduleApplyFullPageRect);
          fullPageWindowListenerAttached = true;
        }
      }

      function disableFullPage({ restore = true } = {}) {
        if (fullPageObserver) {
          try {
            fullPageObserver.disconnect();
          } catch (_) {
            // ignore
          }
          fullPageObserver = null;
        }
        if (fullPageWindowListenerAttached && typeof window !== "undefined") {
          window.removeEventListener("resize", scheduleApplyFullPageRect);
          fullPageWindowListenerAttached = false;
        }
        fullPageHostEl = null;
        lastFullPageRect = null;
        if (!container) return;
        container.classList.remove("bt-dashboard-host--fullpage");
        if (restore) {
          if (fullPagePrevStyleText) {
            container.setAttribute("style", fullPagePrevStyleText);
          } else {
            container.removeAttribute("style");
          }
        }
        fullPagePrevStyleText = "";
        registerDragHandle(dragHandle);
        if (savedPosition) {
          requestAnimationFrame(() => applySavedPosition());
        }
      }

      function setDashboardFullPage(enabled) {
        const next = !!enabled;
        if (next === isFullPage) return;
        isFullPage = next;
        writeDashboardFullPageSetting(next);
        state = { ...state, isFullPage: next };
        emit();
        if (!root || !container) return;
        if (next) {
          enableFullPage();
        } else {
          disableFullPage({ restore: true });
        }
      }

      function setTopbarActive(active) {
        if (typeof document === "undefined") return;
        const button = document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID);
        if (!button) return;
        if (active) button.classList.add("bt-dashboard-button--active");
        else button.classList.remove("bt-dashboard-button--active");
      }

      function isMobileDashboardLayout() {
        if (typeof window === "undefined") return false;
        if (window.roamAlphaAPI?.platform?.isMobileApp) return true;
        if (typeof window.innerWidth === "number") {
          if (window.innerWidth <= 639) return true;
        }
        if (typeof window.matchMedia === "function") {
          return window.matchMedia("(max-width: 639px)").matches;
        }
        return false;
      }

      function isLeftSidebarOpen() {
        if (typeof document === "undefined") return false;
        if (document.querySelector(".bp3-button.bp3-minimal.bp3-icon-menu-closed")) return true;
        try {
          const sidebar =
            document.querySelector(".roam-sidebar-content") ||
            document.querySelector(".rm-left-sidebar") ||
            document.querySelector(".rm-left-sidebar__inner");
          if (!sidebar) return false;
          const rect = sidebar.getBoundingClientRect?.();
          return !!(rect && rect.width > 40);
        } catch (_) {
          return false;
        }
      }

      function closeLeftSidebarIfNeeded() {
        if (!isMobileDashboardLayout()) return;
        if (!isLeftSidebarOpen()) return;
        didCloseLeftSidebarForMobile = true;
        try {
          window.roamAlphaAPI?.ui?.leftSidebar?.close?.();
        } catch (_) {
          // ignore
        }
      }

      function restoreLeftSidebarIfNeeded() {
        if (!didCloseLeftSidebarForMobile) return;
        didCloseLeftSidebarForMobile = false;
        try {
          window.roamAlphaAPI?.ui?.leftSidebar?.open?.();
        } catch (_) {
          // ignore
        }
      }

      function attachLeftSidebarMqlWatcher() {
        if (leftSidebarMqlListenerAttached || typeof window === "undefined") return;
        if (typeof window.matchMedia !== "function") return;
        leftSidebarMql = window.matchMedia("(max-width: 639px)");
        leftSidebarMqlHandler = () => {
          if (!root) return;
          if (leftSidebarMql?.matches) {
            closeLeftSidebarIfNeeded();
          }
        };
        if (typeof leftSidebarMql.addEventListener === "function") {
          leftSidebarMql.addEventListener("change", leftSidebarMqlHandler);
        } else if (typeof leftSidebarMql.addListener === "function") {
          leftSidebarMql.addListener(leftSidebarMqlHandler);
        }
        leftSidebarMqlListenerAttached = true;
      }

      function detachLeftSidebarMqlWatcher() {
        if (!leftSidebarMqlListenerAttached || !leftSidebarMql) return;
        if (typeof leftSidebarMql.removeEventListener === "function") {
          leftSidebarMql.removeEventListener("change", leftSidebarMqlHandler);
        } else if (typeof leftSidebarMql.removeListener === "function") {
          leftSidebarMql.removeListener(leftSidebarMqlHandler);
        }
        leftSidebarMqlListenerAttached = false;
        leftSidebarMql = null;
        leftSidebarMqlHandler = null;
      }

      function open() {
        if (dashboardWatchClearTimer) {
          clearTimeout(dashboardWatchClearTimer);
          dashboardWatchClearTimer = null;
        }
        ensureContainer();
        closeLeftSidebarIfNeeded();
        attachLeftSidebarMqlWatcher();
        root.render(
          <DashboardRoot
            controller={controller}
            onRequestClose={close}
            onHeaderReady={registerDragHandle}
            language={getLanguageSetting()}
          />
        );
        ensureInitialLoad();
        setTopbarActive(true);
        if (isFullPage) {
          requestAnimationFrame(() => enableFullPage());
        } else if (savedPosition) {
          requestAnimationFrame(() => applySavedPosition());
        }
      }

      function refreshLanguage() {
        if (!root) return;
        ensureContainer();
        root.render(
          <DashboardRoot
            controller={controller}
            onRequestClose={close}
            onHeaderReady={registerDragHandle}
            language={getLanguageSetting()}
          />
        );
      }

      function close() {
        cleanupDragListeners();
        registerDragHandle(null);
        if (isFullPage) {
          disableFullPage({ restore: false });
        }
        setTopbarActive(false);
        restoreLeftSidebarIfNeeded();
        detachLeftSidebarMqlWatcher();
        if (dashboardWatchClearTimer) {
          clearTimeout(dashboardWatchClearTimer);
          dashboardWatchClearTimer = null;
        }
        clearDashboardWatches();
        if (root) {
          root.unmount();
          root = null;
        }
        if (container) {
          container.remove();
          container = null;
        }
        if (resizeListenerAttached && typeof window !== "undefined") {
          window.removeEventListener("resize", handleWindowResize);
          resizeListenerAttached = false;
        }
      }

      function toggle() {
        if (root) {
          close();
        } else {
          open();
        }
      }

      async function toggleTask(uid, action) {
        if (!uid) return;
        try {
          if (action === "complete") {
            await setTaskTodoState(uid, "DONE");
          } else {
            await setTaskTodoState(uid, "TODO");
            await undoTaskCompletion(uid);
          }
        } catch (err) {
          console.error("[BetterTasks] toggleTask failed", err);
          toast("Unable to update task.");
        }
        await refresh({ reason: "toggle" });
        // If the user is on the DNP, keep the Today widget in sync with dashboard completions.
        requestTodayWidgetRenderOnDnp(120, true);
      }

      async function updateMetadata(uid, patch) {
        if (!uid || !patch) return;
        const set = S();
        const attrNames = set.attrNames;
        try {
          if ("project" in patch) {
            await setRichAttribute(uid, "project", patch.project, attrNames);
            if (patch.project) addProjectOption(patch.project);
          }
          if ("waitingFor" in patch) {
            await setRichAttribute(uid, "waitingFor", patch.waitingFor, attrNames);
            if (patch.waitingFor) {
              addWaitingOption(patch.waitingFor);
            } else {
              void refreshWaitingOptions(true);
            }
          }
          if ("context" in patch) {
            const ctxArr = Array.isArray(patch.context) ? patch.context : [];
            await setRichAttribute(uid, "context", ctxArr, attrNames);
            if (ctxArr.length) {
              ctxArr.forEach((ctx) => addContextOption(ctx));
            } else {
              await removeChildAttrsForType(uid, "context", attrNames);
              void refreshContextOptions(true);
            }
          }
          if ("priority" in patch) {
            await setRichAttribute(uid, "priority", patch.priority, attrNames);
          }
          if ("energy" in patch) {
            await setRichAttribute(uid, "energy", patch.energy, attrNames);
          }
          if ("gtd" in patch) {
            await setRichAttribute(uid, "gtd", patch.gtd, attrNames);
          }
        } catch (err) {
          console.warn("[BetterTasks] updateMetadata failed", err);
          toast("Could not update metadata.");
        }
        if (typeof window !== "undefined") {
          window.__btInlineMetaCache?.delete(uid);
        }
        try {
          const notifier = activeDashboardController?.notifyBlockChange || notifyBlockChange;
          if (typeof notifier === "function") {
            await notifier(uid, { bypassFilters: true });
          }
        } catch (err) {
          console.warn("[BetterTasks] notifyBlockChange (inline meta) failed", err);
        }
        void syncPillsForSurface(lastAttrSurface);
      }

      async function snoozeTask(uid, preset) {
        if (!uid) return;
        try {
          const set = S();
          if (preset === "pick") {
            await snoozePickDeferDate(uid, set);
          } else if (typeof preset === "number") {
            await snoozeDeferByDays(uid, set, preset);
          } else {
            await snoozeDeferByDays(uid, set, 1);
          }
          activeDashboardController?.notifyBlockChange?.(uid);
        } catch (err) {
          console.error("[BetterTasks] snoozeTask failed", err);
          toast("Could not snooze task.");
        }
        await refresh({ reason: "snooze" });
        requestTodayWidgetRenderOnDnp(120, true);
      }

      // ────────────────────────────────────────────────────────────────────────
      // Bulk Operations
      // ────────────────────────────────────────────────────────────────────────

      async function readTaskMetadataFromBlock(uid, set) {
        const block = await getBlock(uid);
        if (!block) return null;
        const children = block.children || [];
        const childAttrMap = parseAttrsFromChildBlocks(children);
        const attrNames = set.attrNames;
        // Read start date (capture both value and original key for case preservation)
        const startChild = pickChildAttr(childAttrMap, attrNames.startAliases, { allowFallback: false });
        const startText = startChild?.value || null;
        const startOriginalKey = startChild?.originalKey || null;
        // Read defer date (capture both value and original key for case preservation)
        const deferChild = pickChildAttr(childAttrMap, attrNames.deferAliases, { allowFallback: false });
        const deferText = deferChild?.value || null;
        const deferOriginalKey = deferChild?.originalKey || null;
        // Read due date (capture both value and original key for case preservation)
        const dueChild = pickChildAttr(childAttrMap, attrNames.dueAliases, { allowFallback: false });
        const dueText = dueChild?.value || null;
        const dueOriginalKey = dueChild?.originalKey || null;
        // Read rich metadata
        const richMeta = parseRichMetadata(childAttrMap, attrNames);
        return {
          startText,
          startOriginalKey,
          deferText,
          deferOriginalKey,
          dueText,
          dueOriginalKey,
          project: richMeta.project,
          waitingFor: richMeta.waitingFor,
          context: richMeta.context,
          priority: richMeta.priority,
          energy: richMeta.energy,
          gtd: richMeta.gtd,
        };
      }

      async function bulkToggleTask(uids, action) {
        if (!Array.isArray(uids) || !uids.length) return;
        // Clear any prior cooldown to prevent race with consecutive bulk ops
        if (bulkOperationCooldownTimer) {
          clearTimeout(bulkOperationCooldownTimer);
          bulkOperationCooldownTimer = null;
        }
        bulkOperationInProgress = true;
        try {
          const previousStates = [];
          // Capture previous states for undo
          for (const uid of uids) {
            try {
              const block = await getBlock(uid);
              const wasCompleted = isBlockCompleted(block);
              previousStates.push({ uid, wasCompleted });
            } catch (err) {
              previousStates.push({ uid, wasCompleted: false });
            }
          }
          // Apply action
          const errors = [];
          for (const uid of uids) {
            try {
              if (action === "complete") {
                await setTaskTodoState(uid, "DONE");
              } else {
                await setTaskTodoState(uid, "TODO");
                await undoTaskCompletion(uid);
              }
            } catch (err) {
              errors.push({ uid, err });
            }
          }
          // Show undo toast
          const successCount = uids.length - errors.length;
          const lang = getLanguageSetting();
          const bulkStrings = t(["dashboard", "bulk"], lang) || {};
          const msg = action === "complete"
            ? (typeof bulkStrings.completedCount === "function"
                ? bulkStrings.completedCount(successCount)
                : `Completed ${successCount} task${successCount === 1 ? "" : "s"}`)
            : (typeof bulkStrings.reopenedCount === "function"
                ? bulkStrings.reopenedCount(successCount)
                : `Reopened ${successCount} task${successCount === 1 ? "" : "s"}`);
          showBulkUndoToast({
            message: msg,
            undo: async () => {
              // Clear any prior cooldown to prevent race
              if (bulkOperationCooldownTimer) {
                clearTimeout(bulkOperationCooldownTimer);
                bulkOperationCooldownTimer = null;
              }
              bulkOperationInProgress = true;
              try {
                for (const { uid, wasCompleted } of previousStates) {
                  try {
                    if (wasCompleted) {
                      await setTaskTodoState(uid, "DONE");
                    } else {
                      await setTaskTodoState(uid, "TODO");
                      await undoTaskCompletion(uid);
                    }
                  } catch (err) {
                    console.warn("[BetterTasks] bulk undo item failed", uid, err);
                  }
                }
                await refresh({ reason: "force" });
                requestTodayWidgetRenderOnDnp(120, true);
              } finally {
                // Keep suppression active briefly to catch async pull watch callbacks
                if (bulkOperationCooldownTimer) clearTimeout(bulkOperationCooldownTimer);
                bulkOperationCooldownTimer = setTimeout(() => {
                  bulkOperationInProgress = false;
                  bulkOperationCooldownTimer = null;
                }, BULK_OPERATION_COOLDOWN_MS);
              }
            },
          });
          await refresh({ reason: "force" });
          requestTodayWidgetRenderOnDnp(120, true);
        } finally {
          // Keep toast suppression active briefly to catch async completion handlers
          if (bulkOperationCooldownTimer) clearTimeout(bulkOperationCooldownTimer);
          bulkOperationCooldownTimer = setTimeout(() => {
            bulkOperationInProgress = false;
            bulkOperationCooldownTimer = null;
          }, BULK_OPERATION_COOLDOWN_MS);
        }
      }

      async function bulkSnoozeTask(uids, days) {
        if (!Array.isArray(uids) || !uids.length) return;
        if (typeof days !== "number") return;
        // Clear any prior cooldown to prevent race with consecutive bulk ops
        if (bulkOperationCooldownTimer) {
          clearTimeout(bulkOperationCooldownTimer);
          bulkOperationCooldownTimer = null;
        }
        bulkOperationInProgress = true;
        try {
          const set = S();
          const attrNames = set.attrNames;
          const previousStates = [];
          // Capture previous start/defer/due dates for undo (snooze can shift all existing dates)
          // Also capture original keys to preserve case (e.g., BT_attrDefer vs bt_attrdefer)
          for (const uid of uids) {
            try {
              const meta = await readTaskMetadataFromBlock(uid, set);
              previousStates.push({
                uid,
                previousStart: meta?.startText || null,
                startKey: meta?.startOriginalKey || attrNames.startKey,
                previousDefer: meta?.deferText || null,
                deferKey: meta?.deferOriginalKey || attrNames.deferKey,
                previousDue: meta?.dueText || null,
                dueKey: meta?.dueOriginalKey || attrNames.dueKey,
              });
            } catch (err) {
              previousStates.push({
                uid,
                previousStart: null,
                startKey: attrNames.startKey,
                previousDefer: null,
                deferKey: attrNames.deferKey,
                previousDue: null,
                dueKey: attrNames.dueKey,
              });
            }
          }
          // Apply snooze
          const errors = [];
          for (const uid of uids) {
            try {
              await snoozeDeferByDays(uid, set, days);
            } catch (err) {
              errors.push({ uid, err });
            }
          }
          // Show undo toast
          const successCount = uids.length - errors.length;
          const lang = getLanguageSetting();
          const bulkStrings = t(["dashboard", "bulk"], lang) || {};
          const msg = typeof bulkStrings.snoozedCount === "function"
            ? bulkStrings.snoozedCount(successCount, days)
            : `Snoozed ${successCount} task${successCount === 1 ? "" : "s"} by ${days} day${days === 1 ? "" : "s"}`;
          showBulkUndoToast({
            message: msg,
            undo: async () => {
              // Clear any prior cooldown to prevent race
              if (bulkOperationCooldownTimer) {
                clearTimeout(bulkOperationCooldownTimer);
                bulkOperationCooldownTimer = null;
              }
              bulkOperationInProgress = true;
              try {
                for (const { uid, previousStart, startKey, previousDefer, deferKey, previousDue, dueKey } of previousStates) {
                  try {
                    // Restore start date using original key to preserve case
                    if (previousStart) {
                      await ensureChildAttr(uid, startKey, previousStart);
                    } else {
                      await removeChildAttrsForType(uid, "start", attrNames);
                    }
                    // Restore defer date using original key to preserve case
                    if (previousDefer) {
                      await ensureChildAttr(uid, deferKey, previousDefer);
                    } else {
                      // Remove defer using all known aliases to catch any casing variant
                      await removeChildAttrsForType(uid, "defer", attrNames);
                    }
                    // Restore due date using original key to preserve case (snooze may have shifted it)
                    if (previousDue) {
                      await ensureChildAttr(uid, dueKey, previousDue);
                    }
                    // Note: we don't remove due if it was null before, since snooze only shifts existing due dates
                  } catch (err) {
                    console.warn("[BetterTasks] bulk snooze undo item failed", uid, err);
                  }
                }
                await refresh({ reason: "force" });
                requestTodayWidgetRenderOnDnp(120, true);
              } finally {
                // Keep suppression active briefly to catch async pull watch callbacks
                if (bulkOperationCooldownTimer) clearTimeout(bulkOperationCooldownTimer);
                bulkOperationCooldownTimer = setTimeout(() => {
                  bulkOperationInProgress = false;
                  bulkOperationCooldownTimer = null;
                }, BULK_OPERATION_COOLDOWN_MS);
              }
            },
          });
          await refresh({ reason: "force" });
          requestTodayWidgetRenderOnDnp(120, true);
        } finally {
          // Keep toast suppression active briefly to catch async handlers
          if (bulkOperationCooldownTimer) clearTimeout(bulkOperationCooldownTimer);
          bulkOperationCooldownTimer = setTimeout(() => {
            bulkOperationInProgress = false;
            bulkOperationCooldownTimer = null;
          }, BULK_OPERATION_COOLDOWN_MS);
        }
      }

      async function bulkUpdateMetadata(uids, patch) {
        if (!Array.isArray(uids) || !uids.length || !patch) return;
        // Clear any prior cooldown to prevent race with consecutive bulk ops
        if (bulkOperationCooldownTimer) {
          clearTimeout(bulkOperationCooldownTimer);
          bulkOperationCooldownTimer = null;
        }
        bulkOperationInProgress = true;
        try {
          const set = S();
          const attrNames = set.attrNames;
          const field = Object.keys(patch)[0];
          if (!field) return;
          const previousStates = [];
          // Capture previous values for undo
          for (const uid of uids) {
            try {
              const meta = await readTaskMetadataFromBlock(uid, set);
              previousStates.push({ uid, previousValue: meta?.[field] || null });
            } catch (err) {
              previousStates.push({ uid, previousValue: null });
            }
          }
          // Apply patch
          const errors = [];
          for (const uid of uids) {
            try {
              if (field === "project") {
                await setRichAttribute(uid, "project", patch.project, attrNames);
              } else if (field === "waitingFor") {
                await setRichAttribute(uid, "waitingFor", patch.waitingFor, attrNames);
              } else if (field === "context") {
                const ctxArr = Array.isArray(patch.context) ? patch.context : [];
                await setRichAttribute(uid, "context", ctxArr, attrNames);
              } else if (field === "priority") {
                await setRichAttribute(uid, "priority", patch.priority, attrNames);
              } else if (field === "energy") {
                await setRichAttribute(uid, "energy", patch.energy, attrNames);
              } else if (field === "gtd") {
                await setRichAttribute(uid, "gtd", patch.gtd, attrNames);
              }
            } catch (err) {
              errors.push({ uid, err });
            }
          }
          // Show undo toast
          const successCount = uids.length - errors.length;
          const lang = getLanguageSetting();
          const bulkStrings = t(["dashboard", "bulk"], lang) || {};
          const fieldLabel = bulkStrings.fieldLabels?.[field] || field;
          const msg = typeof bulkStrings.updatedCount === "function"
            ? bulkStrings.updatedCount(fieldLabel, successCount)
            : `Updated ${fieldLabel} on ${successCount} task${successCount === 1 ? "" : "s"}`;
          showBulkUndoToast({
            message: msg,
            undo: async () => {
              // Clear any prior cooldown to prevent race
              if (bulkOperationCooldownTimer) {
                clearTimeout(bulkOperationCooldownTimer);
                bulkOperationCooldownTimer = null;
              }
              bulkOperationInProgress = true;
              try {
                for (const { uid, previousValue } of previousStates) {
                  try {
                    if (field === "project") {
                      await setRichAttribute(uid, "project", previousValue, attrNames);
                    } else if (field === "waitingFor") {
                      await setRichAttribute(uid, "waitingFor", previousValue, attrNames);
                    } else if (field === "context") {
                      const ctxArr = Array.isArray(previousValue) ? previousValue : [];
                      await setRichAttribute(uid, "context", ctxArr, attrNames);
                    } else if (field === "priority") {
                      await setRichAttribute(uid, "priority", previousValue, attrNames);
                    } else if (field === "energy") {
                      await setRichAttribute(uid, "energy", previousValue, attrNames);
                    } else if (field === "gtd") {
                      await setRichAttribute(uid, "gtd", previousValue, attrNames);
                    }
                  } catch (err) {
                    console.warn("[BetterTasks] bulk metadata undo item failed", uid, err);
                  }
                }
                await refresh({ reason: "force" });
                requestTodayWidgetRenderOnDnp(120, true);
              } finally {
                // Keep suppression active briefly to catch async pull watch callbacks
                if (bulkOperationCooldownTimer) clearTimeout(bulkOperationCooldownTimer);
                bulkOperationCooldownTimer = setTimeout(() => {
                  bulkOperationInProgress = false;
                  bulkOperationCooldownTimer = null;
                }, BULK_OPERATION_COOLDOWN_MS);
              }
            },
          });
          await refresh({ reason: "force" });
          requestTodayWidgetRenderOnDnp(120, true);
        } finally {
          // Keep toast suppression active briefly to catch async handlers
          if (bulkOperationCooldownTimer) clearTimeout(bulkOperationCooldownTimer);
          bulkOperationCooldownTimer = setTimeout(() => {
            bulkOperationInProgress = false;
            bulkOperationCooldownTimer = null;
          }, BULK_OPERATION_COOLDOWN_MS);
        }
      }

      function showBulkUndoToast({ message, undo }) {
        const lang = getLanguageSetting();
        const bulkStrings = t(["dashboard", "bulk"], lang) || {};
        iziToast.show({
          theme: "light",
          color: "black",
          class: "betterTasks bt-toast-undo",
          position: "center",
          message: message,
          timeout: 6000,
          close: true,
          closeOnEscape: true,
          closeOnClick: false,
          buttons: [
            [
              `<button>${escapeHtml(bulkStrings.undo || "Undo")}</button>`,
              async (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                try {
                  await undo();
                  iziToast.show({
                    theme: "light",
                    color: "black",
                    class: "betterTasks bt-toast-info",
                    message: bulkStrings.undoSuccess || "Changes undone",
                    position: "center",
                    timeout: 2000,
                    close: false,
                    closeOnEscape: true,
                    closeOnClick: true,
                    onOpening: (_instance, toastEl) => {
                      applyToastA11y(toastEl);
                    },
                  });
                } catch (err) {
                  console.error("[BetterTasks] bulk undo failed", err);
                  iziToast.show({
                    theme: "light",
                    color: "black",
                    class: "betterTasks bt-toast-info",
                    message: bulkStrings.undoFailed || "Undo failed",
                    position: "center",
                    timeout: 3000,
                    close: false,
                    closeOnEscape: true,
                    closeOnClick: true,
                    onOpening: (_instance, toastEl) => {
                      applyToastA11y(toastEl);
                    },
                  });
                }
              },
              true,
            ],
          ],
          onOpening: (_instance, toastEl) => {
            applyToastA11y(toastEl);
          },
        });
      }

      function removeTask(uid) {
        if (!uid) return;
        removeDashboardWatch(uid);
        const tasks = state.tasks.filter((task) => task.uid !== uid);
        if (tasks.length === state.tasks.length) return;
        state = { ...state, tasks };
        emit();
      }

      function openBlock(uid, options = {}) {
        if (!uid) return;
        if (options.skipCompletionToast) {
          processedMap.set(uid, Date.now());
          setTimeout(() => processedMap.delete(uid), 2000);
        }
        try {
          window.roamAlphaAPI?.ui?.mainWindow?.openBlock?.({ block: { uid } });
        } catch (err) {
          console.warn("[BetterTasks] openBlock failed", err);
        }
      }

      function openPage(pageUid, options = {}) {
        if (!pageUid) return;
        const { inSidebar = false } = options;
        try {
          if (inSidebar) {
            window.roamAlphaAPI?.ui?.rightSidebar?.addWindow?.({
              window: { type: "outline", "page-uid": pageUid, "block-uid": pageUid },
            });
          } else {
            window.roamAlphaAPI?.ui?.mainWindow?.openPage?.({ page: { uid: pageUid } });
          }
        } catch (err) {
          console.warn("[BetterTasks] openPage failed", err);
        }
      }

      function openSettings() {
        try {
          if (extensionAPI?.settings?.open) {
            extensionAPI.settings.open();
          } else {
            toast("Open the Roam Depot settings for Better Tasks to adjust options.");
          }
        } catch (err) {
          console.warn("[BetterTasks] openSettings failed", err);
        }
      }

      async function notifyBlockChange(uid, options = {}) {
        if (!uid) return;
        // Skip individual block change notifications during bulk operations
        // to avoid stale intermediate states from Roam's pull watchers
        if (bulkOperationInProgress) return;
        try {
          const set = S();
          const block = await getBlock(uid);
          if (!block) {
            removeTask(uid);
            return;
          }
          if (!isTaskBlock(block)) return;
          const meta = await readRecurringMeta(block, set);
          if (!isBetterTasksTask(meta)) {
            removeTask(uid);
            if (typeof window !== "undefined") {
              window.__btInlineMetaCache?.delete(uid);
            }
            repeatOverrides.delete(uid);
            scheduleSurfaceSync(lastAttrSurface || "Child");
            return;
          }
          const task = deriveDashboardTask(block, meta, set);
          if (!task) return;
          const tasks = state.tasks.slice();
          const index = tasks.findIndex((entry) => entry.uid === uid);
          if (index >= 0) {
            tasks[index] = task;
          } else {
            tasks.push(task);
          }
          state = { ...state, tasks: sortDashboardTasksList(tasks) };
          emit();
          if (controller.isOpen()) {
            ensureDashboardWatch(uid);
          } else {
            removeDashboardWatch(uid);
          }
          scheduleTodayBadgeRefresh(60, true);
          // When the dashboard is open, many edits can happen in quick succession.
          // Debounce Today widget refreshes to avoid tripping the circuit breaker.
          let dashOpen = false;
          try {
            dashOpen = !!activeDashboardController?.isOpen?.();
          } catch (_) {
            dashOpen = false;
          }
          requestTodayWidgetRenderOnDnp(dashOpen ? 900 : 160, false);
        } catch (err) {
          console.warn("[BetterTasks] notifyBlockChange failed", err);
        }
      }

      function dispose() {
        subscribers.clear();
        close();
        state = { ...initialState };
      }

      function registerDragHandle(node) {
        if (dragHandle) {
          dragHandle.removeEventListener("pointerdown", handlePointerDown);
          dragHandle.classList.remove("bt-dashboard__header--dragging");
          dragHandle.classList.remove("bt-dashboard__header--draggable");
        }
        dragHandle = node;
        if (dragHandle && !isFullPage) {
          dragHandle.classList.add("bt-dashboard__header--draggable");
          dragHandle.addEventListener("pointerdown", handlePointerDown);
        }
      }

      function handlePointerDown(event) {
        if (isFullPage) return;
        if (!container || !dragHandle) return;
        if (event.button !== undefined && event.button !== 0) return;
        const blocker = event.target?.closest?.("button, a, input, textarea, select");
        if (blocker) return;
        isDraggingDashboard = true;
        dragPointerId = event.pointerId;
        const rect = container.getBoundingClientRect();
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        container.classList.add("bt-dashboard-host--dragging");
        dragHandle.classList.add("bt-dashboard__header--dragging");
        if (dragHandle.setPointerCapture && dragPointerId != null) {
          try {
            dragHandle.setPointerCapture(dragPointerId);
          } catch (_) {
            // best effort only
          }
        }
        if (typeof window !== "undefined") {
          window.addEventListener("pointermove", handlePointerMove);
          window.addEventListener("pointerup", handlePointerUp);
        }
        event.preventDefault();
      }

      function handlePointerMove(event) {
        if (!isDraggingDashboard || event.pointerId !== dragPointerId) return;
        if (!container) return;
        const desired = {
          left: event.clientX - dragOffsetX,
          top: event.clientY - dragOffsetY,
        };
        const clamped = clampPosition(desired);
        if (!clamped) return;
        setContainerPosition(clamped);
      }

      function handlePointerUp(event) {
        if (!isDraggingDashboard || event.pointerId !== dragPointerId) return;
        if (dragHandle?.releasePointerCapture && dragPointerId != null) {
          try {
            dragHandle.releasePointerCapture(dragPointerId);
          } catch (_) {
            // ignore release failures
          }
        }
        isDraggingDashboard = false;
        dragPointerId = null;
        container?.classList?.remove("bt-dashboard-host--dragging");
        dragHandle?.classList?.remove("bt-dashboard__header--dragging");
        if (typeof window !== "undefined") {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
        }
        if (savedPosition) {
          persistDashboardPosition(savedPosition);
        }
      }

      function cleanupDragListeners() {
        if (typeof window !== "undefined") {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
        }
        isDraggingDashboard = false;
        dragPointerId = null;
        container?.classList?.remove("bt-dashboard-host--dragging");
        dragHandle?.classList?.remove("bt-dashboard__header--dragging");
      }

      function loadSavedDashboardPosition() {
        if (typeof window === "undefined") return null;
        try {
          const raw = window.localStorage?.getItem(DASHBOARD_POSITION_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed.top === "number" &&
            Number.isFinite(parsed.top) &&
            typeof parsed.left === "number" &&
            Number.isFinite(parsed.left)
          ) {
            return { top: parsed.top, left: parsed.left };
          }
        } catch (err) {
          console.warn("[BetterTasks] failed to read dashboard position", err);
        }
        return null;
      }

      function persistDashboardPosition(pos) {
        if (typeof window === "undefined" || !pos) return;
        try {
          window.localStorage?.setItem(DASHBOARD_POSITION_KEY, JSON.stringify(pos));
        } catch (err) {
          console.warn("[BetterTasks] failed to store dashboard position", err);
        }
      }

      function clampNumber(value, min, max) {
        if (!Number.isFinite(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
      }

      function clampPosition(pos) {
        if (!container || !pos || typeof window === "undefined") return null;
        const margin = 12;
        const rect = container.getBoundingClientRect();
        const width = rect.width || 600;
        const height = rect.height || Math.min(window.innerHeight - margin * 2, 700);
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const left = clampNumber(pos.left, margin, maxLeft);
        const top = clampNumber(pos.top, margin, maxTop);
        return { left, top };
      }

      function setContainerPosition(pos) {
        if (!container || !pos) return;
        container.style.left = `${pos.left}px`;
        container.style.top = `${pos.top}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
        savedPosition = pos;
      }

      function applySavedPosition(options = {}) {
        if (!savedPosition) return;
        const clamped = clampPosition(savedPosition);
        if (!clamped) return;
        setContainerPosition(clamped);
        if (options.persist) {
          persistDashboardPosition(clamped);
        }
      }

      function handleWindowResize() {
        if (!container) return;
        if (isFullPage) {
          scheduleApplyFullPageRect();
          return;
        }
        if (savedPosition) {
          applySavedPosition({ persist: true });
        }
      }

      return controller;
    }

    async function editRepeat(uid, event, options = {}) {
      if (!uid) return;
      const set = S();
      const result = await handleRepeatEdit(event || new MouseEvent("click"), { uid, set, span: null });
      if (typeof result === "string" && result) {
        await waitForRepeatState(uid, set, { expectedValue: result }, 6, getBlock, readRecurringMeta);
      }
      await delay(250);
      await activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
      await delay(120);
      await activeDashboardController?.refresh?.({ reason: "pill-repeat" });
    }

    async function editDate(uid, type, options = {}) {
      if (!uid || !["start", "defer", "due"].includes(type)) return;
      const set = S();
      const handler =
        type === "start"
          ? handleStartClick
          : type === "defer"
            ? handleDeferClick
            : handleDueClick;
      const intent = options.intent || "direct";
      const forcePrompt = intent === "menu-edit" || intent === "menu-add";
      const allowCreate = intent === "menu-add";
      const baseEvent = options.event || {};
      const syntheticEvent = {
        altKey: !!baseEvent.altKey,
        metaKey: !!baseEvent.metaKey,
        ctrlKey: !!baseEvent.ctrlKey,
        shiftKey: !!baseEvent.shiftKey,
      };
      const resultDate = await handler(syntheticEvent, {
        uid,
        set,
        span: null,
        forcePrompt,
        allowCreate,
      });
      if (resultDate instanceof Date) {
        await waitForAttrDate(uid, type, resultDate, set, 6, getBlock, readRecurringMeta);
      }
      await delay(120);
      await activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
      await activeDashboardController?.refresh?.({ reason: `pill-${type}` });
    }

    function parseMetadataFromPrompt(promptResult) {
      if (!promptResult) return {};
      const projectRaw = typeof promptResult.project === "string" ? promptResult.project.trim() : "";
      const project = normalizeProjectValue(projectRaw);
      const waitingFor = typeof promptResult.waitingFor === "string" ? promptResult.waitingFor.trim() : "";
      const contextRaw = typeof promptResult.context === "string" ? promptResult.context : "";
      const priority = typeof promptResult.priority === "string" ? promptResult.priority.trim().toLowerCase() : "";
      const energy = typeof promptResult.energy === "string" ? promptResult.energy.trim().toLowerCase() : "";
      const gtd = typeof promptResult.gtd === "string" ? promptResult.gtd.trim() : "";
      const contexts = contextRaw ? normalizeContextList(contextRaw) : [];
      return { project, waitingFor, contexts, priority, energy, gtd };
    }

    async function applyMetadataFromPrompt(uid, promptResult, attrNames, options = {}) {
      if (!uid || !promptResult) return;
      const initial = options.initial || {};
      const { project, waitingFor, contexts, priority, energy, gtd } = parseMetadataFromPrompt(promptResult);
      if (project || initial.project) {
        await setRichAttribute(uid, "project", project || null, attrNames);
        if (project) addProjectOption(project);
      }
      if (waitingFor || initial.waitingFor) {
        await setRichAttribute(uid, "waitingFor", waitingFor || null, attrNames);
      }
      if ((contexts && contexts.length) || (initial.context || []).length) {
        await setRichAttribute(uid, "context", contexts && contexts.length ? contexts : [], attrNames);
      }
      if (priority || initial.priority) {
        await setRichAttribute(uid, "priority", priority || null, attrNames);
      }
      if (energy || initial.energy) {
        await setRichAttribute(uid, "energy", energy || null, attrNames);
      }
      const gtdNormalized = gtd ? normalizeGtdStatus(gtd) : null;
      if (gtdNormalized || initial.gtd) {
        await setRichAttribute(uid, "gtd", gtdNormalized || null, attrNames);
      }
    }

    async function openPillMenuForTask(uid) {
      if (!uid) return;
      const set = S();
      let metadata = null;
      let isRecurring = true;
      try {
        const block = await getBlock(uid);
        if (block) {
          const meta = await readRecurringMeta(block, set);
          metadata = meta?.metadata || parseRichMetadata(meta?.childAttrMap || {}, set.attrNames);
          isRecurring = !!meta?.repeat;
          if (typeof window !== "undefined") {
            writeInlineMetaCache(uid, metadata || {});
          }
        }
      } catch (_) {
        // ignore metadata fetch failures
      }
      showPillMenu({ uid, set, isRecurring, metadata });
    }

    async function removeTaskAttribute(uid, type) {
      if (!uid || !["repeat", "start", "defer", "due"].includes(type)) return;
      try {
        const set = S();
        const cleared = await clearAttrForType(uid, type, { set });
        if (cleared) {
          await waitForAttrClear(uid, type, set, 6, getBlock, readRecurringMeta);
          void syncPillsForSurface(lastAttrSurface || "Child");
        }
        await delay(120);
        await activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
        await activeDashboardController?.refresh?.({ reason: `remove-${type}` });
        const labels = {
          repeat: "Repeat rule removed",
          start: "Start date removed",
          defer: "Defer date removed",
          due: "Due date removed",
        };
        toast(labels[type] || "Attribute removed");
      } catch (err) {
        console.error("[BetterTasks] removeTaskAttribute failed", err);
        toast("Unable to remove that attribute.");
      }
    }

    const dashboardTaskCache = (() => {
      let lastKey = null;
      let lastAt = 0;
      let lastValue = null;
      const TTL_MS = 5000;
      return {
        get(key) {
          const now = Date.now();
          if (lastKey === key && now - lastAt < TTL_MS) return lastValue;
          return null;
        },
        set(key, value) {
          lastKey = key;
          lastAt = Date.now();
          lastValue = value;
          return value;
        },
        clear() {
          lastKey = null;
          lastAt = 0;
          lastValue = null;
        },
      };
    })();

    async function collectDashboardTasks(options = {}) {
      const { includeCompleted = true, attachWatches = true, cacheKey = null, bypassCache = false } = options;
      const memoKey = cacheKey || `tasks:${includeCompleted ? "withDone" : "noDone"}`;
      if (!bypassCache) {
        const cached = dashboardTaskCache.get(memoKey);
        if (cached) return cached;
      }
      const set = S();
      const [todoRows, doneRows, attrRows] = await Promise.all([
        fetchBlocksByPageRef("TODO"),
        includeCompleted ? fetchBlocksByPageRef("DONE") : Promise.resolve([]),
        fetchBlocksByAttributes(set),
      ]);
      const blockMap = new Map();
      for (const rows of [todoRows, doneRows, attrRows]) {
        for (const row of rows || []) {
          const block = row?.[0];
          if (block?.uid) {
            blockMap.set(block.uid, block);
          }
        }
      }
      const tasks = [];
      for (const block of blockMap.values()) {
        try {
          if (!includeCompleted && isBlockCompleted(block)) continue;
          const meta = await readRecurringMeta(block, set);
          if (!isBetterTasksTask(meta) || !isTaskBlock(block)) continue;
          const task = deriveDashboardTask(block, meta, set);
          if (task) {
            tasks.push(task);
            if (attachWatches && !task.isCompleted) ensureDashboardWatch(task.uid);
          }
        } catch (err) {
          console.warn("[BetterTasks] deriveDashboardTask failed", err);
        }
      }
      return dashboardTaskCache.set(memoKey, sortDashboardTasksList(tasks));
    }

    async function fetchBlocksByPageRef(title) {
      const pull = `[:block/uid :block/string :block/props :block/order :block/open
        {:block/children [:block/uid :block/string]}
        {:block/page [:block/uid :node/title]}
        {:block/parents [:block/uid]}]`;
      const safeTitle = escapeDatalogString(title);
      const query = `
        [:find (pull ?b ${pull})
         :where
           [?b :block/refs ?ref]
           [?ref :node/title "${safeTitle}"]]`;
      try {
        return (await window.roamAlphaAPI.q(query)) || [];
      } catch (err) {
        console.warn("[BetterTasks] fetchBlocksByPageRef failed", err);
        return [];
      }
    }

    async function fetchBlocksByAttributes(set) {
      const attrNames = set?.attrNames || resolveAttributeNames();
      const labels = new Set(
        [
          getAttrLabel("repeat", attrNames),
          getAttrLabel("start", attrNames),
          getAttrLabel("defer", attrNames),
          getAttrLabel("due", attrNames),
          getAttrLabel("completed", attrNames),
          getAttrLabel("project", attrNames),
          getAttrLabel("gtd", attrNames),
          getAttrLabel("waitingFor", attrNames),
          getAttrLabel("context", attrNames),
          getAttrLabel("priority", attrNames),
          getAttrLabel("energy", attrNames),
        ].filter(Boolean)
      );
      if (!labels.size) return [];
      const pull = `[:block/uid :block/string :block/props :block/order :block/open
        {:block/children [:block/uid :block/string]}
        {:block/page [:block/uid :node/title]}
        {:block/parents [:block/uid]}]`;
      const safeLabels = Array.from(labels).map((label) => label.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
      const labelSet = safeLabels.map((l) => `"${l}"`).join(" ");
      const query = `
        [:find (pull ?b ${pull})
         :where
          [?attr :node/title ?title]
          [(contains? #{${labelSet}} ?title)]
          [?c :block/refs ?attr]
          [?b :block/children ?c]]`;
      try {
        const rows = await window.roamAlphaAPI.q(query);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.warn("[BetterTasks] fetchBlocksByAttributes failed", err);
        return [];
      }
    }

    function deriveDashboardTask(block, meta, set) {
      if (!block) return null;
      const title = formatDashboardTitle(block.string || "");
      const attrCompleted = meta?.completed || meta?.childAttrMap?.completed?.value || null;
      const isCompleted = isBlockCompleted(block) || !!attrCompleted;
      const completedAtRaw = meta?.childAttrMap?.completed?.value || null;
      const completedAtParsed = completedAtRaw ? parseRoamDate(completedAtRaw) : null;
      const completedAt =
        completedAtParsed instanceof Date && !Number.isNaN(completedAtParsed.getTime())
          ? completedAtParsed
          : null;
      const startAt = meta?.start instanceof Date && !Number.isNaN(meta.start.getTime()) ? meta.start : null;
      const deferUntil = meta?.defer instanceof Date && !Number.isNaN(meta.defer.getTime()) ? meta.defer : null;
      const dueAt = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      const now = new Date();
      const startBucket = startAt && now < startAt ? "not-started" : "started";
      const deferBucket = deferUntil && now < deferUntil ? "deferred" : "available";
      const dueBucket = computeDueBucket(dueAt, now);
      const recurrenceBucket = meta?.repeat ? "recurring" : "one-off";
      const availabilityLabel = isCompleted
        ? null
        : startBucket === "not-started"
          ? translateString("Not started", getLanguageSetting())
          : deferBucket === "deferred"
            ? translateString("Deferred", getLanguageSetting())
            : translateString("Available", getLanguageSetting());
      const richMeta = meta?.metadata || parseRichMetadata(meta?.childAttrMap || {}, set?.attrNames || resolveAttributeNames());
      const metaPills = buildDashboardPills(
        { startAt, deferUntil, dueAt, repeatText: meta?.repeat, metadata: richMeta },
        set
      );
      return {
        uid: block.uid,
        text: block.string || "",
        title,
        pageUid: block.page?.uid || null,
        pageTitle: block.page?.title || block.page?.["node/title"] || "",
        repeatText: meta?.repeat || "",
        isRecurring: !!meta?.repeat,
        isCompleted,
        startAt,
        deferUntil,
        dueAt,
        startBucket,
        deferBucket,
        dueBucket,
        recurrenceBucket,
        availabilityLabel,
        isCompleted,
        completedAt,
        startDisplay: formatDateDisplay(startAt, set),
        deferDisplay: formatDateDisplay(deferUntil, set),
        dueDisplay: formatDateDisplay(dueAt, set),
        metaPills,
        metadata: richMeta,
      };
    }

    function buildDashboardPills(info, set) {
      const pills = [];
      const lang = getLanguageSetting();
      const metaLabels = t(["metadata"], lang) || {};
      if (info.repeatText) {
        const label = metaLabels.repeatRule || metaLabels.repeat || "Repeat";
        pills.push({
          type: "repeat",
          icon: "↻",
          value: info.repeatText,
          label: `${label}: ${info.repeatText}`,
        });
      }
      if (info.startAt instanceof Date && !Number.isNaN(info.startAt.getTime())) {
        pills.push({
          type: "start",
          icon: START_ICON,
          value: formatPillDateText(info.startAt, set),
          label: `${metaLabels.start || "Start"}: ${formatIsoDate(info.startAt, set)}`,
        });
      }
      if (info.deferUntil instanceof Date && !Number.isNaN(info.deferUntil.getTime())) {
        pills.push({
          type: "defer",
          icon: DEFER_ICON,
          value: formatPillDateText(info.deferUntil, set),
          label: `${metaLabels.defer || "Defer"}: ${formatIsoDate(info.deferUntil, set)}`,
        });
      }
      if (info.dueAt instanceof Date && !Number.isNaN(info.dueAt.getTime())) {
        pills.push({
          type: "due",
          icon: DUE_ICON,
          value: formatPillDateText(info.dueAt, set),
          label: `${metaLabels.due || "Due"}: ${formatIsoDate(info.dueAt, set)}`,
        });
      }
      if (info.metadata?.project) {
        pills.push({
          type: "project",
          icon: "📁",
          value: info.metadata.project,
          label: `${metaLabels.projectLabel || metaLabels.project || "Project"}: ${info.metadata.project}`,
          raw: info.metadata.project,
        });
      }
      if (info.metadata?.waitingFor) {
        pills.push({
          type: "waitingFor",
          icon: "⌛",
          value: info.metadata.waitingFor,
          label: `${metaLabels.waitingLabel || metaLabels.waitingFor || "Waiting for"}: ${info.metadata.waitingFor}`,
          raw: info.metadata.waitingFor,
        });
      }
      if (info.metadata?.context?.length) {
        const display = info.metadata.context.slice(0, 1).join(", ");
        const more = info.metadata.context.length > 1 ? ` (+${info.metadata.context.length - 1})` : "";
        pills.push({
          type: "context",
          icon: "@",
          value: `${display}${more}`,
          label: `${metaLabels.contextLabel || metaLabels.context || "Context"}: ${info.metadata.context.join(", ")}`,
          rawList: info.metadata.context,
        });
      }
      if (info.metadata?.gtd) {
        const display = formatGtdStatusDisplay(info.metadata.gtd, lang);
        const next = cycleGtdStatus(info.metadata.gtd);
        pills.push({
          type: "gtd",
          icon: "➡",
          value: display,
          label: `${metaLabels.gtdLabel || metaLabels.gtd || "GTD"}: ${display}`,
          nextValue: next,
        });
      }
      if (info.metadata?.priority) {
        const order = ["low", "medium", "high", null];
        const currentIdx = order.indexOf(info.metadata.priority || null);
        const next = order[(currentIdx + 1) % order.length] || null;
        pills.push({
          type: "priority",
          icon: "!",
          value: formatPriorityEnergyDisplay(info.metadata.priority, lang),
          label: `${metaLabels.priorityLabel || metaLabels.priority || "Priority"}: ${formatPriorityEnergyDisplay(info.metadata.priority, lang)} (click to cycle)`,
          nextValue: next,
        });
      }
      if (info.metadata?.energy) {
        const order = ["low", "medium", "high", null];
        const currentIdx = order.indexOf(info.metadata.energy || null);
        const next = order[(currentIdx + 1) % order.length] || null;
        pills.push({
          type: "energy",
          icon: "🔋",
          value: formatPriorityEnergyDisplay(info.metadata.energy, lang),
          label: `${metaLabels.energyLabel || metaLabels.energy || "Energy"}: ${formatPriorityEnergyDisplay(info.metadata.energy, lang)} (click to cycle)`,
          nextValue: next,
        });
      }
      return pills;
    }

    function formatDashboardTitle(text) {
      if (!text) return "";
      return text
        .replace(/^\s*\{\{\s*\[\[\s*(?:TODO|DONE)\s*\]\]\s*\}\}\s*/i, "")
        .replace(/^\s*(?:TODO|DONE)\s+/i, "")
        .trim();
    }

    function formatDateDisplay(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      return formatFriendlyDate(date, set);
    }

    function computeDueBucket(dueDate, now = new Date()) {
      if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return "none";
      if (now > endOfDay(dueDate)) return "overdue";
      if (isSameDay(dueDate, now)) return "today";
      if (dueDate > endOfDay(now)) return "upcoming";
      return "none";
    }

    function endOfDay(date) {
      const d = new Date(date.getTime());
      d.setHours(23, 59, 59, 999);
      return d;
    }

    function isSameDay(a, b) {
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    }

    function isBetterTasksTask(meta) {
      if (!meta) return false;
      return !!(meta.repeat || meta.hasTimingAttrs || meta.hasMetadata);
    }

    function buildTodaySections(tasks, options = {}) {
      const includeOverdue = !!options.includeOverdue;
      const showCompleted = !!options.showCompleted;
      const today = todayLocal();
      const startToday = startOfDayLocal(today);
      const sections = {
        startingToday: [],
        deferredToToday: [],
        dueToday: [],
        overdue: [],
      };
      for (const task of Array.isArray(tasks) ? tasks : []) {
        if (!task) continue;
        if (task.isCompleted && !showCompleted) continue;
        const start = task.startAt instanceof Date ? task.startAt : null;
        const defer = task.deferUntil instanceof Date ? task.deferUntil : null;
        const due = task.dueAt instanceof Date ? task.dueAt : null;
        const isDueToday = due && isSameDay(due, today);
        const isDeferToday = defer && isSameDay(defer, today);
        const isStartToday = start && isSameDay(start, today);
        if (isDueToday) {
          sections.dueToday.push(task);
        } else if (isDeferToday) {
          sections.deferredToToday.push(task);
        } else if (isStartToday) {
          sections.startingToday.push(task);
        } else if (includeOverdue && !task.isCompleted && due && due < startToday) {
          sections.overdue.push(task);
        }
      }
      return sections;
    }

    function getTodayAnchorText() {
      const configured = getTodaySetting(TODAY_WIDGET_TITLE_SETTING);
      if (typeof configured === "string" && configured.trim()) {
        const t = configured.trim();
        noteTodayAnchorText(t);
        return t;
      }
      const lang = getLanguageSetting();
      const translated = t(["today", "title"], lang);
      const out = (typeof translated === "string" && translated.trim()) ? translated : TODAY_WIDGET_ANCHOR_TEXT_DEFAULT;
      noteTodayAnchorText(out);
      return out;
    }

    function stripMarkdownDecorations(text = "") {
      let s = String(text || "").trim();
      // Remove surrounding bold/italic/code markers, multiple times if nested.
      const stripEdge = (str) => str.replace(/^(?:\*+|_+|`+)+|(?:\*+|_+|`+)+$/g, "").trim();
      s = stripEdge(s);
      s = stripEdge(s); // run twice to catch combos like **_text_**
      // Remove wrapping Roam links [[...]]
      const linkMatch = s.match(/^\[\[(.*)\]\]$/);
      if (linkMatch) s = linkMatch[1].trim();
      return s.trim();
    }

    function normalizeMatchText(text = "") {
      return stripMarkdownDecorations(text).replace(/\s+/g, " ").trim().toLowerCase();
    }

    function noteTodayAnchorText(text = "") {
      const normalized = normalizeMatchText(text);
      if (normalized) {
        todayAnchorTextHistory.add(normalized);
        pruneSetMax(todayAnchorTextHistory, MAX_TODAY_ANCHOR_TEXT_HISTORY);
      }
    }

    function matchesTodayAnchor(str = "") {
      const anchorText = normalizeMatchText(getTodayAnchorText());
      const trimmed = normalizeMatchText(str);
      if (trimmed === anchorText) return true;
      if (todayAnchorTextHistory.has(trimmed)) return true;
      return TODAY_WIDGET_ANCHOR_TEXT_LEGACY.some((legacy) => trimmed === normalizeMatchText(legacy));
    }

    async function findHeadingBlockUid(dnpUid, headingText, cache = null) {
      if (!dnpUid || !headingText) return null;
      const target = normalizeMatchText(headingText);
      const visited = new Set();
      let checked = 0;
      const MAX_NODES = 200;
      const MAX_DEPTH = 6;

      async function dfs(uid, depth = 0) {
        if (!uid || depth > MAX_DEPTH || visited.has(uid) || checked >= MAX_NODES) return null;
        visited.add(uid);
        checked += 1;
        const block = await getBlockCached(uid, cache);
        if (!block) return null;
        const text = normalizeMatchText(block.string || "");
        if (text === target) return block.uid;
        const children = Array.isArray(block?.children) ? block.children : [];
        for (const child of children) {
          const hit = await dfs(child?.uid, depth + 1);
          if (hit) return hit;
        }
        return null;
      }

      // Start from top-level children of the DNP.
      const dnp = await getBlockCached(dnpUid, cache);
      const children = Array.isArray(dnp?.children) ? dnp.children : [];
      for (const child of children) {
        const hit = await dfs(child?.uid, 1);
        if (hit) return hit;
      }
      return null;
    }

    async function getTodayParentInfo(cache = null) {
      const dnpTitle = toDnpTitle(todayLocal());
      const dnpUid = await getOrCreatePageUidCached(dnpTitle, cache);
      const headingText = getTodayAnchorText();
      let headingUid = null;
      if (headingText) {
        headingUid = await findHeadingBlockUid(dnpUid, headingText, cache);
      }
      if (headingUid) {
        todayHeadingRecheckPending = false;
        todayHeadingRetryCount = 0;
      } else if (headingText && !todayHeadingRecheckPending && todayHeadingRetryCount < MAX_TODAY_HEADING_RETRIES) {
        todayHeadingRecheckPending = true;
        todayHeadingRetryCount += 1;
        setTimeout(() => {
          todayHeadingRecheckPending = false;
          scheduleTodayWidgetRender(40, true);
        }, 600 + 400 * todayHeadingRetryCount);
      }
      const parentUid = headingUid || dnpUid;
      const parent = await getBlockCached(parentUid, cache);
      const children = Array.isArray(parent?.children) ? parent.children : [];
      return { dnpUid, parentUid, parent, children, headingUid, headingText };
    }

    async function findTodayAnchorUid(cache = null) {
      const { dnpUid, parentUid, children, headingUid } = await getTodayParentInfo(cache);
      if (headingUid) return headingUid; // Use user heading as anchor.
      const anchor = children.find((c) => matchesTodayAnchor(c?.string || ""));
      if (anchor?.uid) return anchor.uid;
      // Fallback: look in the other parent (root vs heading) for legacy anchors.
      if (headingUid && parentUid === headingUid) {
        const root = await getBlockCached(dnpUid, cache);
        const rootChildren = Array.isArray(root?.children) ? root.children : [];
        const legacy = rootChildren.find((c) => matchesTodayAnchor(c?.string || ""));
        return legacy?.uid || null;
      } else if (headingUid) {
        const heading = await getBlockCached(headingUid, cache);
        const headingChildren = Array.isArray(heading?.children) ? heading.children : [];
        const legacy = headingChildren.find((c) => matchesTodayAnchor(c?.string || ""));
        return legacy?.uid || null;
      }
      return null;
    }

    async function ensureTodayWidgetAnchor(placement = "Top", heading = 0, cache = null, opts = {}) {
      const { allowMoves = true } = opts || {};
      const { dnpUid, parentUid, children, headingUid } = await getTodayParentInfo(cache);
      let anchorText = stripMarkdownDecorations(getTodayAnchorText());
      if (!anchorText) anchorText = TODAY_WIDGET_ANCHOR_TEXT_DEFAULT;
      const existingIndex = children.findIndex((c) => matchesTodayAnchor(c?.string || ""));
      let existing = existingIndex >= 0 ? children[existingIndex] : null;

      // If an anchor exists on the alternate parent (root/heading), prefer to move it.
      if (!existing && headingUid) {
        const rootParentUid = parentUid === headingUid ? dnpUid : headingUid;
        const altParent = await getBlockCached(rootParentUid, cache);
        const altChildren = Array.isArray(altParent?.children) ? altParent.children : [];
        const altIndex = altChildren.findIndex((c) => matchesTodayAnchor(c?.string || ""));
        if (altIndex >= 0) {
          existing = altChildren[altIndex];
        }
      }

      const desiredOrder = placement === "Bottom" ? Math.max(children.length, 0) : 0;
      if (headingUid) {
        lastTodayAnchorIsHeading = true;
        return headingUid;
      }

      if (existing?.uid) {
        if ((existing.string || "").trim() !== anchorText) {
          try {
            await window.roamAlphaAPI.updateBlock({ block: { uid: existing.uid, string: anchorText } });
          } catch (_) { }
        }
        try {
          await window.roamAlphaAPI.updateBlock({ block: { uid: existing.uid, heading } });
        } catch (_) { }
        if (allowMoves) {
          const currentOrder =
            typeof existing.order === "number"
              ? existing.order
              : children.findIndex((c) => c?.uid === existing.uid);
          if (existing.parents?.[0]?.uid && existing.parents[0].uid !== parentUid) {
            try {
              await window.roamAlphaAPI.moveBlock({
                location: { "parent-uid": parentUid, order: desiredOrder },
                block: { uid: existing.uid },
              });
            } catch (_) { }
          } else if (typeof desiredOrder === "number" && desiredOrder >= 0 && currentOrder !== desiredOrder) {
            try {
              await window.roamAlphaAPI.moveBlock({
                location: { "parent-uid": parentUid, order: desiredOrder },
                block: { uid: existing.uid },
              });
            } catch (_) { }
          }
        }
        return existing.uid;
      }
      const order = desiredOrder;
      const uid = window.roamAlphaAPI.util.generateUID();
      await createBlock(parentUid, order, anchorText, uid);
      try {
        await window.roamAlphaAPI.updateBlock({ block: { uid, heading } });
      } catch (_) { }
      lastTodayAnchorIsHeading = false;
      return uid;
    }

    async function clearTodayInlineChildren(anchorUid, panelChildUid = null, cache = null) {
      const targets = new Set(todayInlineChildUids);
      if (anchorUid) {
        const block = await getBlockCached(anchorUid, cache);
        const children = Array.isArray(block?.children) ? block.children : [];
        for (const child of children) {
          if (panelChildUid && child?.uid === panelChildUid) continue;
          if (child?.uid) targets.add(child.uid);
        }
      }
      for (const uid of targets) {
        try {
          await deleteBlock(uid);
        } catch (err) {
          try {
            await window.roamAlphaAPI.updateBlock({ block: { uid, string: "" } });
          } catch (_) {
            console.warn("[BetterTasks] failed to clear Today widget child", err);
          }
        } finally {
          todayInlineChildUids.delete(uid);
        }
      }
    }

    async function findBlockHost(uid, attempts = 120, delayMs = 120) {
      if (!uid || typeof document === "undefined") return null;
      for (let i = 0; i < attempts; i++) {
        let host =
          document.querySelector(`.rm-sidebar-window [data-uid="${uid}"]`) ||
          document.querySelector(`.rm-sidebar-window [block-uid="${uid}"]`) ||
          document.querySelector(`.rm-sidebar-window [data-block-uid="${uid}"]`) ||
          document.querySelector(`.rm-sidebar-outline [data-uid="${uid}"]`) ||
          document.querySelector(`.rm-sidebar-outline [block-uid="${uid}"]`) ||
          document.querySelector(`.rm-sidebar-outline [data-block-uid="${uid}"]`) ||
          document.querySelector(`.rm-block-main[data-uid="${uid}"]`) ||
          document.querySelector(`.roam-block[data-uid="${uid}"]`) ||
          document.querySelector(`.rm-block__self[data-uid="${uid}"]`) ||
          document.querySelector(`div[block-uid="${uid}"]`) ||
          document.querySelector(`[data-uid="${uid}"]`) ||
          document.querySelector(`.roam-block-container[data-block-uid="${uid}"]`) ||
          document.querySelector(`.block-outline[block-uid="${uid}"]`) ||
          document.querySelector(`.block-outline[data-uid="${uid}"]`) ||
          document.querySelector(`[data-block-uid="${uid}"]`) ||
          document.querySelector(`.rm-reference-item[data-link-uid="${uid}"]`);
        if (!host) {
          const inputNode =
            document.querySelector(`div[id^="block-input-${uid}"]`) ||
            document.querySelector(`div[id$="-${uid}"]`);
          if (inputNode) {
            host = inputNode.closest(".roam-block-container") || inputNode.closest(".rm-block-main") || inputNode.closest(".rm-block__self");
          }
        }
        if (host) return host;
        await delay(delayMs);
      }
      return null;
    }

    async function getTodayPanelContainer(blockUid, opts = {}) {
      if (!blockUid || typeof document === "undefined") return null;
      const attempts = typeof opts.attempts === "number" ? opts.attempts : 60;
      const delayMs = typeof opts.delayMs === "number" ? opts.delayMs : 120;
      const host = await findBlockHost(blockUid, attempts, delayMs);
      if (!host) {
        return null;
      }
      host.classList.add("bt-today-panel-block");

      // Prefer to render inside the children area so the panel has full width and normal block spacing.
      const children =
        host.querySelector?.(".rm-block-children") ||
        host.querySelector?.(".rm-block__children") ||
        host.querySelector?.(".rm-children") ||
        null;
      const mountPoint = children || host;

      let container = mountPoint.querySelector?.(".bt-today-panel-root");
      if (!container) {
        container = document.createElement("div");
        container.className = "bt-today-panel-root";
        if (mountPoint.appendChild) mountPoint.appendChild(container);
        else if (mountPoint.insertBefore) mountPoint.insertBefore(container, mountPoint.firstChild || null);
        else {
          return null;
        }
      }
      return container;
    }

    async function teardownTodayPanel() {
      if (todayWidgetPanelRoot) {
        try {
          todayWidgetPanelRoot.unmount?.();
        } catch (_) { }
        todayWidgetPanelRoot = null;
      }
      if (todayWidgetPanelContainer?.parentNode) {
        todayWidgetPanelContainer.parentNode.removeChild(todayWidgetPanelContainer);
      }
      todayWidgetPanelContainer = null;
    }
    teardownTodayPanelGlobal = teardownTodayPanel;

    async function renderTodayInline(anchorUid, sections, options = {}, layoutSignature = "", cache = null) {
      if (todayInlineRenderInFlight) {
        scheduleTodayWidgetRender(120, true);
        return;
      }

      todayInlineRenderInFlight = true;

      try {
        if (!anchorUid) return;

        const perfInline = perfMark("renderTodayInline");
        await teardownTodayPanel();

        const lang = getLanguageSetting();
        const todayStrings = t(["today"], lang) || {};

        const signatureParts = [];
        const pushSection = (arr) =>
          signatureParts.push(...(arr || []).map((t) => `${t.uid}:${t.isCompleted ? "done" : "todo"}`));
        pushSection(sections.startingToday);
        pushSection(sections.deferredToToday);
        pushSection(sections.dueToday);
        if (options.includeOverdue) pushSection(sections.overdue);

        const signature = `${layoutSignature}|${signatureParts.join("|")}`;
        if (signature && signature === lastTodayInlineSignature) return;

        const isEmpty =
          !sections.startingToday.length &&
          !sections.deferredToToday.length &&
          !sections.dueToday.length &&
          !sections.overdue.length;

        if (isEmpty) {
          const emptyText = String(
            t(["today", "empty"], lang) ||
            todayStrings.empty ||
            "All clear for today. Enjoy your day!"
          ).trim();

          await clearTodayInlineChildren(anchorUid, null, cache);
          todayInlineChildUids.clear();

          const emptyUid = window.roamAlphaAPI.util.generateUID();
          await createBlock(anchorUid, 0, emptyText, emptyUid);
          todayInlineChildUids.add(emptyUid);

          lastTodayInlineSignature = `${layoutSignature}|empty`;
          lastTodayRenderAt = Date.now();
          return;
        }

        await clearTodayInlineChildren(anchorUid, null, cache);
        lastTodayInlineSignature = signature;
        todayInlineChildUids.clear();

        let order = 0;
        const trackUid = (uid) => {
          if (uid) todayInlineChildUids.add(uid);
        };

        const writeSection = async (label, tasks) => {
          if (!tasks?.length) return;
          const sectionUid = window.roamAlphaAPI.util.generateUID();
          await createBlock(anchorUid, order++, `**${label}**`, sectionUid);
          trackUid(sectionUid);

          let childOrder = 0;
          for (const task of tasks) {
            const childUid = window.roamAlphaAPI.util.generateUID();
            await createBlock(sectionUid, childOrder++, `((${task.uid}))`, childUid);
            trackUid(childUid);
          }
        };

        await writeSection(todayStrings.starting || "Starting Today", sections.startingToday);
        await writeSection(todayStrings.deferred || "Deferred Until Today", sections.deferredToToday);
        await writeSection(todayStrings.due || "Due Today", sections.dueToday);

        if (options.includeOverdue) {
          const label =
            typeof todayStrings.overdue === "function"
              ? todayStrings.overdue(sections.overdue.length)
              : `Overdue (${sections.overdue.length})`;
          await writeSection(label, sections.overdue);
        }

        perfLog(perfInline, `totalBlocks=${order}`);
        lastTodayRenderAt = Date.now();
      } finally {
        todayInlineRenderInFlight = false;
      }
    }

    async function renderTodayBadge(force = false) {
      if (!getTodayBadgeEnabled()) return;
      try {
        const { includeOverdue: widgetOverdue } = readTodayConfig();
        const includeOverdue = getTodayBadgeIncludeOverdue();
        const attachWatches = activeDashboardController?.isOpen?.() || false;
        const cacheKey = `badge:${includeOverdue ? "withOverdue" : "todayOnly"}`;
        const tasks = await collectDashboardTasks({ includeCompleted: false, attachWatches, cacheKey, bypassCache: force });
        const sections = buildTodaySections(tasks, { includeOverdue, showCompleted: false });
        const count =
          sections.startingToday.length +
          sections.deferredToToday.length +
          sections.dueToday.length +
          sections.overdue.length;
        const labelText = translateString(getTodayBadgeLabel(), getLanguageSetting()) || getTodayAnchorText();
        const colors = getTodayBadgeColors();
        const signature = `${includeOverdue ? "o" : "t"}|${labelText}|${colors.bg || ""}|${colors.fg || ""}|${count}`;
        const needsDom = !todayBadgeNode || !todayBadgeNode.parentNode;
        if (!force && !needsDom && signature === lastTodayBadgeSignature) return;
        ensureTodayBadgeDom(count, { labelText, colors });
        lastTodayBadgeSignature = signature;
      } catch (err) {
        console.warn("[BetterTasks] renderTodayBadge failed", err);
      }
    }

    function ensureTodayBadgeDom(count = 0, opts = {}) {
      if (typeof document === "undefined") return;
      const sidebar = document.querySelector(".roam-sidebar-content .roam-sidebar-container") ||
        document.querySelector(".roam-sidebar-content");
      const daily = document.querySelector(".rm-left-sidebar__daily-notes, .log-button.rm-left-sidebar__daily-notes");
      if (!sidebar || !daily) return;
      // Remove any stray copies we created earlier.
      document.querySelectorAll(".bt-today-badge").forEach((node) => {
        if (node !== todayBadgeNode && node.parentNode) node.parentNode.removeChild(node);
      });
      if (!todayBadgeNode) {
        const container = document.createElement("div");
        container.className = "log-button bt-today-badge";
        const icon = document.createElement("span");
        icon.className = "bp3-icon bp3-icon-small bp3-icon-time bt-today-badge__icon";
        const label = document.createElement("span");
        label.className = "bt-today-badge__label";
        const badge = document.createElement("span");
        badge.className = "bt-today-badge__count";
        container.appendChild(icon);
        container.appendChild(label);
        container.appendChild(badge);
        container.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            const anchorUid =
              lastTodayAnchorUid ||
              (await ensureTodayWidgetAnchor(getTodayWidgetPlacement(), getTodayWidgetHeadingLevel(), null, {
                allowMoves: true,
              }));
            const widgetEnabled = getTodayWidgetEnabled();
            if (widgetEnabled && anchorUid) {
              window.roamAlphaAPI?.ui?.mainWindow?.openBlock?.({ block: { uid: anchorUid } });
              await renderTodayWidget(true);
            } else {
              const { dnpUid } = await getTodayParentInfo();
              if (dnpUid) {
                window.roamAlphaAPI?.ui?.mainWindow?.openPage?.({ page: { uid: dnpUid } });
              }
            }
          } catch (err) {
            console.warn("[BetterTasks] today badge open failed", err);
          }
        });
        todayBadgeNode = container;
        todayBadgeLabelNode = label;
        todayBadgeCountNode = badge;
      }
      const labelText = opts.labelText || translateString(getTodayBadgeLabel(), getLanguageSetting()) || getTodayAnchorText();
      todayBadgeLabelNode.textContent = labelText;
      todayBadgeCountNode.textContent = String(count);
      todayBadgeCountNode.style.display = count > 0 ? "inline-flex" : "none";

      const colors = opts.colors || getTodayBadgeColors();
      todayBadgeCountNode.style.backgroundColor = colors.bg || "";
      todayBadgeCountNode.style.color = colors.fg || "";

      if (!todayBadgeNode.parentNode) {
        daily.parentNode?.insertBefore(todayBadgeNode, daily.nextSibling);
      }
    }

    async function renderTodayPanelDom(container, sections, options = {}, layoutSignature = "") {
      if (!container || typeof container.appendChild !== "function") return;
      const perfPanel = perfMark("renderTodayPanelDom");
      ensureTodayPanelStyles();
      container.style.display = "block";
      const hasAny =
        sections.startingToday.length ||
        sections.deferredToToday.length ||
        sections.dueToday.length ||
        (options.includeOverdue && sections.overdue.length);
      const signatureParts = [];
      const pushSection = (arr) =>
        signatureParts.push(...(arr || []).map((t) => `${t.uid}:${t.isCompleted ? "done" : "todo"}`));
      pushSection(sections.startingToday);
      pushSection(sections.deferredToToday);
      pushSection(sections.dueToday);
      if (options.includeOverdue) pushSection(sections.overdue);
      const signature = `${layoutSignature}|${signatureParts.join("|")}`;
      lastTodayWidgetSignature = signature;
      container.innerHTML = "";
      const lang = getLanguageSetting();
      const todayStrings = t(["today"], lang) || {};
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.textContent = todayStrings.empty || "No tasks for today.";
        empty.className = "bt-today-panel__empty";
        container.appendChild(empty);
        return;
      }
      const renderSection = (label, tasks, highlight) => {
        if (!tasks?.length) return;
        const section = document.createElement("div");
        section.className = "bt-today-panel__section";
        const h = document.createElement("div");
        h.className = "bt-today-panel__section-header";
        if (highlight === "due") h.classList.add("bt-today-panel__section-header--due");
        if (highlight === "overdue") h.classList.add("bt-today-panel__section-header--overdue");
        h.textContent = label;
        section.appendChild(h);
        const list = document.createElement("ul");
        list.className = "bt-today-panel__list";
        for (const task of tasks) {
          const li = document.createElement("li");
          li.className = "bt-today-panel__item";
          if (task.isCompleted) li.classList.add("bt-today-panel__item--completed");
          const row = document.createElement("div");
          row.className = "bt-today-panel__row";
          const titleBtn = document.createElement("button");
          titleBtn.type = "button";
          titleBtn.className = "bt-today-panel__row-title";
          titleBtn.textContent = task.title || todayStrings.untitled || "(Untitled)";
          titleBtn.addEventListener("click", (e) => {
            const openInSidebar = !!e?.shiftKey;
            if (openInSidebar) {
              try {
                window.roamAlphaAPI?.ui?.rightSidebar?.addWindow?.({
                  window: { type: "block", "block-uid": task.uid },
                });
                return;
              } catch (_) { /* fall through to main open */ }
            }
            if (activeDashboardController?.openBlock) {
              activeDashboardController.openBlock(task.uid);
            } else {
              try {
                window.roamAlphaAPI?.ui?.mainWindow?.openBlock?.({ block: { uid: task.uid } });
              } catch (_) { }
            }
          });
          row.appendChild(titleBtn);
          if (!task.isCompleted) {
            const actions = document.createElement("div");
            actions.className = "bt-today-panel__row-actions";
            const doneBtn = document.createElement("button");
            doneBtn.type = "button";
            doneBtn.className = "bt-today-panel__icon-btn";
            doneBtn.textContent = "✓";
            doneBtn.title = todayStrings.complete || "Complete";
            doneBtn.setAttribute("aria-label", doneBtn.title);
            const snoozeBtn = document.createElement("button");
            snoozeBtn.type = "button";
            snoozeBtn.className = "bt-today-panel__icon-btn";
            snoozeBtn.textContent = "⏱";
            snoozeBtn.title = todayStrings.snoozeShort || "Snooze +1d";
            snoozeBtn.setAttribute("aria-label", snoozeBtn.title);
            const snoozeWeekBtn = document.createElement("button");
            snoozeWeekBtn.type = "button";
            snoozeWeekBtn.className = "bt-today-panel__icon-btn";
            snoozeWeekBtn.textContent = "⏱+7";
            snoozeWeekBtn.title = todayStrings.snoozeWeek || "Snooze +7d";
            snoozeWeekBtn.setAttribute("aria-label", snoozeWeekBtn.title);
            const disableActions = () => {
              doneBtn.disabled = true;
              snoozeBtn.disabled = true;
              snoozeWeekBtn.disabled = true;
            };
            const reenableActions = () => {
              doneBtn.disabled = false;
              snoozeBtn.disabled = false;
              snoozeWeekBtn.disabled = false;
            };
            snoozeBtn.addEventListener("click", async () => {
              disableActions();
              try {
                await activeDashboardController?.snoozeTask?.(task.uid, 1);
              } finally {
                scheduleTodayWidgetRender(30, true);
                reenableActions();
              }
            });
            snoozeWeekBtn.addEventListener("click", async () => {
              disableActions();
              try {
                await activeDashboardController?.snoozeTask?.(task.uid, 7);
              } finally {
                scheduleTodayWidgetRender(30, true);
                reenableActions();
              }
            });
            doneBtn.addEventListener("click", async () => {
              disableActions();
              try {
                await activeDashboardController?.toggleTask?.(task.uid, "complete");
              } finally {
                scheduleTodayWidgetRender(30, true);
                reenableActions();
              }
            });
            actions.appendChild(doneBtn);
            actions.appendChild(snoozeBtn);
            actions.appendChild(snoozeWeekBtn);
            row.appendChild(actions);
          }
          li.appendChild(row);
          list.appendChild(li);
        }
        section.appendChild(list);
        container.appendChild(section);
      };

      renderSection(todayStrings.starting || "Starting Today", sections.startingToday);
      renderSection(todayStrings.deferred || "Deferred Until Today", sections.deferredToToday);
      renderSection(todayStrings.due || "Due Today", sections.dueToday, "due");
      if (options.includeOverdue) {
        const label =
          typeof todayStrings.overdue === "function"
            ? todayStrings.overdue(sections.overdue.length)
            : `Overdue (${sections.overdue.length})`;
        renderSection(label, sections.overdue, "overdue");
      }
      perfLog(perfPanel);
    }

    async function renderTodayWidget(force = false, options = {}) {
      const { bypassPageGuard = false, targetUid = null, source = "unknown", forceInline = false } = options || {};
      if (!TODAY_WIDGET_ENABLED || !getTodayWidgetEnabled()) return;
      try {
        const now = Date.now();
        const MIN_INTERVAL = 1200;
        if (!force && now - lastTodayRenderAt < MIN_INTERVAL) {
          scheduleTodayWidgetRender(MIN_INTERVAL - (now - lastTodayRenderAt), true);
          return;
        }
        if (force) todayWidgetForceNext = true;
        if (force) {
          lastTodayWidgetSignature = null;
          lastTodayInlineSignature = null;
          dashboardTaskCache?.clear?.();
        }
        const { layout, includeOverdue, showCompleted, placement, heading, signature: layoutSignature } = readTodayConfig();
        const perfRenderToday = perfMark(`renderTodayWidget ${layout}`);
        const perfTasks = perfMark("renderTodayWidget:collectTasks");
        const renderCache = createTodayRenderCache();
        const shouldRender = bypassPageGuard ? true : await shouldRenderTodayWidgetNow(renderCache);
        if (!shouldRender && !force) {
          todayWidgetForceNext = true;
          scheduleTodayWidgetRender(320, true);
          return;
        }
        const includeCompleted = !!showCompleted;
        let tasks = null;
        const dashSnapshot = activeDashboardController?.getSnapshot?.();
        const shouldBypassCache = force || todayWidgetForceNext;
        todayWidgetForceNext = false;
        if (!shouldBypassCache && dashSnapshot?.status === "ready" && Array.isArray(dashSnapshot.tasks)) {
          tasks = dashSnapshot.tasks.slice();
        } else {
          const attachWatches = activeDashboardController?.isOpen?.() || false;
          const cacheKey = `today:${includeCompleted ? "withDone" : "noDone"}`;
          tasks = await collectDashboardTasks({ includeCompleted, attachWatches, cacheKey, bypassCache: shouldBypassCache });
        }
        if (!includeCompleted && Array.isArray(tasks)) {
          tasks = tasks.filter((t) => !t?.isCompleted);
        }
        perfLog(perfTasks, `tasks=${Array.isArray(tasks) ? tasks.length : 0}`);
        if (!Array.isArray(tasks)) return;
        const sections = buildTodaySections(tasks, { includeOverdue, showCompleted });
        perfLog(perfMark("renderTodayWidget:sections"), "");
        scheduleTodayBadgeRefresh(10, true);
        const anchorUid =
          targetUid ||
          (await ensureTodayWidgetAnchor(placement, heading, renderCache, {
            allowMoves: !options?.bypassPageGuard,
          }));
        lastTodayAnchorUid = anchorUid || null;
        if (!anchorUid) return;
        try {
          await window.roamAlphaAPI.updateBlock({ block: { uid: anchorUid, open: true } });
        } catch (_) { }
        const isLegacyPanelLabel = (str = "") => {
          const trimmed = str.trim();
          if (trimmed === TODAY_WIDGET_PANEL_CHILD_TEXT) return true;
          return TODAY_WIDGET_PANEL_CHILD_TEXT_LEGACY.some((legacy) => trimmed === legacy);
        };

        if (layout === "roamInline" || forceInline) {
          try {
            const anchorBlock = await getBlockCached(anchorUid, renderCache);
            const panelChild = (anchorBlock?.children || []).find((c) => isLegacyPanelLabel(c?.string || ""));
            if (panelChild?.uid) {
              await deleteBlock(panelChild.uid);
            }
          } catch (_) { }
          const perfInline = perfMark("renderTodayWidget:inline");
          await renderTodayInline(anchorUid, sections, { includeOverdue }, layoutSignature, renderCache);
          perfLog(perfInline);
          perfLog(perfRenderToday);
          return;
        }
        await clearTodayInlineChildren(anchorUid, null, renderCache);
        const panelHost = await findBlockHost(anchorUid);
        panelHost?.classList.add("bt-today-panel-block");
        panelHost?.classList.remove("bt-today-panel-inline-hidden");
        const container = await getTodayPanelContainer(anchorUid, {
          attempts: options?.bypassPageGuard ? 60 : 60,
          delayMs: options?.bypassPageGuard ? 120 : 120,
        });
        if (!container) {
          if (options?.forceInline || options?.bypassPageGuard) {
            // Fallback to inline render inside the anchor when panel mount is unavailable (e.g., sidebar focus quirks).
            const perfInline = perfMark("renderTodayWidget:inline-fallback");
            await renderTodayInline(anchorUid, sections, { includeOverdue }, layoutSignature, renderCache);
            perfLog(perfInline);
            perfLog(perfRenderToday);
            lastTodayRenderAt = Date.now();
            return;
          }
          scheduleTodayWidgetRender(400, true);
          return;
        }
        todayWidgetPanelContainer = container;
        const perfPanel = perfMark("renderTodayWidget:panel");
        renderTodayPanelDom(container, sections, { includeOverdue }, layoutSignature);
        perfLog(perfPanel);
        perfLog(perfRenderToday);
        lastTodayRenderAt = Date.now();
      } catch (err) {
        console.warn("[BetterTasks] renderTodayWidget failed", err);
      }
    }


    // ========================= Housekeeping =========================
    function sweepProcessed() {
      const now = Date.now();
      if (now - lastSweep < 60_000) return; // once per minute
      lastSweep = now;
      for (const [k, v] of processedMap) {
        if (now - v > 5 * 60_000) processedMap.delete(k); // 5 min TTL
      }
    }

    function sortDashboardTasksList(tasks) {
      const bucketWeight = { overdue: 0, today: 1, upcoming: 2, none: 3 };
      return tasks
        .slice()
        .sort((a, b) => {
          const bucketDiff = (bucketWeight[a.dueBucket] ?? 99) - (bucketWeight[b.dueBucket] ?? 99);
          if (bucketDiff !== 0) return bucketDiff;
          const dueA = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
          const dueB = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
          if (dueA !== dueB) return dueA - dueB;
          return (a.title || "").localeCompare(b.title || "");
        });
    }
  },

  onunload: async () => {
    if (typeof window !== "undefined") {
      try {
        window.__RecurringTasksCleanup?.();
      } finally {
        delete window.__RecurringTasksCleanup;
      }
    }

    const slashCommandAPI = window.roamAlphaAPI?.ui?.slashCommand;
    slashCommandAPI?.removeCommand({
      label: "Create a Better Task",
    });
    slashCommandAPI?.removeCommand({
      label: "Convert TODO to Better Task",
    });

    removeDashboardTopbarButton();
    disconnectTopbarObserver();
    clearDashboardWatches();
    if (todayWidgetRenderTimer) clearTimeout(todayWidgetRenderTimer);
    todayWidgetRenderTimer = null;
    if (todayWidgetRefreshTimer) clearTimeout(todayWidgetRefreshTimer);
    todayWidgetRefreshTimer = null;
    todayWidgetRefreshForcePending = false;
    if (dashboardNotifyTimer) clearTimeout(dashboardNotifyTimer);
    dashboardNotifyTimer = null;
    if (dashboardRefreshTimer) {
      clearInterval(dashboardRefreshTimer);
      if (window.__btDebugRefreshTimer) {
        console.debug("[BetterTasks] dashboard refresh timer cleared");
      }
    }
    dashboardRefreshTimer = null;
    if (completionQueueTimer) {
      clearTimeout(completionQueueTimer);
      completionQueueTimer = null;
    }
    if (pillRefreshTimer) {
      clearTimeout(pillRefreshTimer);
      pillRefreshTimer = null;
    }
    if (todayTitleChangeDebounceTimer) {
      clearTimeout(todayTitleChangeDebounceTimer);
      todayTitleChangeDebounceTimer = null;
    }
    if (childEditDebounce && typeof childEditDebounce.forEach === "function") {
      childEditDebounce.forEach((timer) => clearTimeout(timer));
      childEditDebounce.clear();
    }
    if (bulkOperationCooldownTimer) {
      clearTimeout(bulkOperationCooldownTimer);
      bulkOperationCooldownTimer = null;
    }
    dashboardNotifyQueue.clear();
    try {
      detachTodayNavigationListenerGlobal?.();
    } catch (_) {
      // ignore
    } finally {
      detachTodayNavigationListenerGlobal = null;
    }
    try {
      await disableTodayWidgetUI();
    } catch (_) {
      // ignore widget teardown errors
    }
    removeTodayBadge();
    try {
      todayInlineChildUids.clear();
      lastTodayAnchorUid = null;
      lastTodayAnchorIsHeading = false;
      await removeAllTodayAnchorsByQuery({ includeHeading: true });
    } catch (_) {
      // ignore cleanup errors
    }
    if (typeof teardownTodayPanelGlobal === "function") {
      await teardownTodayPanelGlobal();
    }
    if (activeDashboardController) {
      try {
        activeDashboardController.dispose?.();
      } catch (_) {
        // ignore dispose errors
      }
      activeDashboardController = null;
    }

    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label: "Convert TODO to Better Task" });
    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label: "Create a Better Task" });
    // window.roamAlphaAPI.ui.blockContextMenu.removeCommand({label: "Convert Better Task to plain TODO",});
    disconnectThemeObserver();
    if (pillScrollHandlerAttached && pillScrollHandler && typeof document !== "undefined") {
      try {
        document.removeEventListener("scroll", pillScrollHandler, { passive: true, capture: true });
      } catch (_) {
        // ignore detach errors
      } finally {
        pillScrollHandlerAttached = false;
        pillScrollHandler = null;
      }
    }
  },
};

function ordFromText(value) {
  if (!value) return null;
  const numeric = Number(value.replace(/(st|nd|rd|th)$/i, ""));
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 31) return numeric;
  return ORD_MAP[value.toLowerCase()] ?? null;
}

function dowFromAlias(token) {
  if (!token) return null;
  const norm = (DOW_ALIASES[token.toLowerCase()] || token).toLowerCase();
  return DOW_MAP[norm] || null;
}

function tGlobal(path, lang = currentLanguage || "en") {
  const parts = Array.isArray(path) ? path : String(path || "").split(".");
  const resolve = (obj) =>
    parts.reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), obj);
  const primary = resolve(I18N_MAP?.[lang]);
  if (primary !== undefined) return primary;
  if (lang !== "en") {
    const fallback = resolve(I18N_MAP?.en);
    if (fallback !== undefined) return fallback;
  }
  return undefined;
}

function debugLog(message, err) {
  if (typeof window !== "undefined" && window.__btDebug) {
    if (err) console.debug("[BetterTasks]", message, err);
    else console.debug("[BetterTasks]", message);
    return;
  }
  if (!DEBUG_BT) return;
  if (err) console.debug("[BetterTasks]", message, err);
  else console.debug("[BetterTasks]", message);
}

function perfMark(label) {
  if (!DEBUG_BT_PERF || typeof performance === "undefined") return null;
  return { label, t: performance.now() };
}

function perfLog(mark, extra = "") {
  if (!DEBUG_BT_PERF || !mark || typeof performance === "undefined") return;
  const delta = performance.now() - mark.t;
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[BetterTasks][perf] ${mark.label}: ${delta.toFixed(1)}ms${suffix}`);
}

function normalizeWeekStartCode(value) {
  if (typeof value === "string") {
    const code = dowFromAlias(value);
    if (code) return code;
  }
  if (typeof value === "string" && DOW_ORDER.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return DEFAULT_WEEK_START_CODE;
}

function getDowOrderForWeekStart(weekStartCode) {
  const code = weekStartCode && DOW_ORDER.includes(weekStartCode) ? weekStartCode : DEFAULT_WEEK_START_CODE;
  const idx = DOW_ORDER.indexOf(code);
  if (idx <= 0) return DOW_ORDER;
  return [...DOW_ORDER.slice(idx), ...DOW_ORDER.slice(0, idx)];
}

function getOrderedWeekdayOffsets(byDay, weekStartCode) {
  const order = getDowOrderForWeekStart(weekStartCode);
  const seen = new Set();
  const offsets = [];
  for (const code of Array.isArray(byDay) ? byDay : []) {
    if (typeof code !== "string") continue;
    const idx = order.indexOf(code);
    if (idx === -1 || seen.has(code)) continue;
    seen.add(code);
    offsets.push(idx);
  }
  offsets.sort((a, b) => a - b);
  return offsets;
}

function monthFromText(x) {
  if (!x) return null;
  const m = MONTH_MAP[x.toLowerCase()];
  return m || null;
}

function expandDowRange(startISO, endISO, dowOrder = DOW_ORDER) {
  const s = dowOrder.indexOf(startISO), e = dowOrder.indexOf(endISO);
  if (s === -1 || e === -1) return [];
  if (s <= e) return dowOrder.slice(s, e + 1);
  return [...dowOrder.slice(s), ...dowOrder.slice(0, e + 1)]; // wrap
}

function splitList(str) {
  return str
    .replace(/&/g, ",")
    .replace(/\band\b/gi, ",")
    .split(/[,\s/]+/)
    .filter(Boolean);
}

function createRootCompat(container) {
  if (!container) throw new Error("Container required for dashboard");
  // Prefer global ReactDOM.createRoot if available (React 18); otherwise skip straight to legacy render.
  const createRootFn = ReactDOMGlobal && typeof ReactDOMGlobal.createRoot === "function" ? ReactDOMGlobal.createRoot : null;
  if (createRootFn) {
    try {
      return createRootFn(container);
    } catch (err) {
      console.warn("[BetterTasks] createRoot failed, falling back to legacy render", err);
    }
  }
  const dom = ReactDOMGlobal;
  if (!dom) throw new Error("ReactDOM not available in this environment");
  return {
    render: (node) => dom.render(node, container),
    unmount: () => dom.unmountComponentAtNode(container),
  };
}

// Recognize MWF / TTh sets
function parseAbbrevSet(token) {
  const t = token.toLowerCase();
  if (t === "mwf") return ["MO", "WE", "FR"];
  if (t === "tth" || t === "tu/th" || t === "t/th") return ["TU", "TH"];
  return null;
}

// Turn mixed text, ranges, and shorthands into ISO DOW array
function normalizeByDayList(raw, weekStartCode = DEFAULT_WEEK_START_CODE) {
  const tokens = splitList(raw.replace(/[-–—]/g, "-"));
  const dowOrder = getDowOrderForWeekStart(weekStartCode);
  let out = [];
  for (const tok of tokens) {
    if (tok.includes("-")) {
      const [a, b] = tok.split("-");
      const A = dowFromAlias(a), B = dowFromAlias(b);
      if (A && B) { out.push(...expandDowRange(A, B, dowOrder)); continue; }
    }
    const set = parseAbbrevSet(tok);
    if (set) { out.push(...set); continue; }
    const d = dowFromAlias(tok);
    if (d) { out.push(d); continue; }
  }
  const seen = new Set();
  return out.filter(d => (seen.has(d) ? false : (seen.add(d), true)));
}

function keywordIntervalFromText(text) {
  return MONTH_KEYWORD_INTERVAL_LOOKUP[text] || null;
}

function ensureDashboardTopbarButton(retry = true) {
  if (typeof document === "undefined") return;
  if (!activeDashboardController) return;

  let button = document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID);
  if (!button) {
    button = document.createElement("span");
    button.id = DASHBOARD_TOPBAR_BUTTON_ID;
    button.className = "bp3-button bp3-minimal bp3-small bp3-icon-form";
    button.setAttribute("role", "button");
    button.addEventListener("click", () => activeDashboardController?.toggle());
  }
  const lang = currentLanguage || "en";
  const topbarTitle = tGlobal(["dashboard", "topbarTitle"], lang) || "Better Tasks Dashboard";
  button.setAttribute("title", topbarTitle);
  button.setAttribute("aria-label", topbarTitle);

  let spacer = document.getElementById(DASHBOARD_TOPBAR_SPACER_ID);
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.id = DASHBOARD_TOPBAR_SPACER_ID;
    spacer.className = "rm-topbar__spacer-sm";
  }

  const placed = insertDashboardButton(button, spacer);
  if (!placed && retry) {
    setTimeout(() => ensureDashboardTopbarButton(false), 600);
  }
}

function insertDashboardButton(button, spacer) {
  const helpButtonWrapper = document.querySelector(".rm-topbar__help");
  if (helpButtonWrapper?.parentNode) {
    const parent = helpButtonWrapper.parentNode;
    const afterHelp = helpButtonWrapper.nextSibling;
    parent.insertBefore(spacer, afterHelp);
    parent.insertBefore(button, afterHelp);
    return true;
  }

  const sidebarBtn = document.querySelector(".rm-open-left-sidebar-btn");
  if (sidebarBtn?.parentNode) {
    sidebarBtn.parentNode.insertBefore(spacer, sidebarBtn.nextSibling);
    sidebarBtn.parentNode.insertBefore(button, spacer.nextSibling);
    return true;
  }
  const topbar = document.querySelector(".rm-topbar");
  if (topbar) {
    topbar.appendChild(spacer);
    topbar.appendChild(button);
    return true;
  }
  const mainTopbar = document.querySelector(
    "#app > div > div > div.flex-h-box > div.roam-main > div.rm-files-dropzone > div"
  );
  const row = mainTopbar?.childNodes?.[1];
  if (row?.parentNode) {
    row.parentNode.insertBefore(spacer, row);
    row.parentNode.insertBefore(button, row);
    return true;
  }
  return false;
}

function removeDashboardTopbarButton() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID);
  if (existing) existing.remove();
  const spacer = document.getElementById(DASHBOARD_TOPBAR_SPACER_ID);
  if (spacer) spacer.remove();
}

function removeTodayBadge() {
  if (todayBadgeRefreshTimer) {
    clearTimeout(todayBadgeRefreshTimer);
    todayBadgeRefreshTimer = null;
  }
  if (todayBadgeNode?.parentNode) {
    todayBadgeNode.parentNode.removeChild(todayBadgeNode);
  }
  todayBadgeNode = todayBadgeLabelNode = todayBadgeCountNode = null;
  lastTodayBadgeSignature = null;
}

function observeTopbarButton() {
  if (typeof document === "undefined") return;
  if (topbarButtonObserver) return;
  const target = document.querySelector(".rm-topbar") || document.body;
  if (!target) return;
  topbarButtonObserver = new MutationObserver(() => {
    if (!activeDashboardController) return;
    if (!document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID)) {
      ensureDashboardTopbarButton(false);
    }
  });
  try {
    topbarButtonObserver.observe(target, { childList: true, subtree: true });
  } catch (_) {
    topbarButtonObserver = null;
  }
}

function disconnectThemeObserver() {
  if (themeObserver) {
    try {
      themeObserver.disconnect();
    } catch (_) {
      // ignore
    }
    themeObserver = null;
  }
  if (themeSyncTimer) {
    clearTimeout(themeSyncTimer);
    themeSyncTimer = null;
  }
  if (typeof window !== "undefined" && window.__btThemeMediaQuery) {
    window.__btThemeMediaQuery.removeEventListener?.("change", syncDashboardThemeVars);
    window.__btThemeMediaQuery = null;
  }
}

function pickColorValue(defaultValue, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = typeof candidate === "function" ? candidate() : candidate;
    if (typeof value !== "string") {
      if (value != null) {
        const str = String(value).trim();
        if (str && str !== "initial" && str !== "inherit") return str;
      }
      continue;
    }
    const trimmed = value.trim();
    if (trimmed && trimmed !== "initial" && trimmed !== "inherit") return trimmed;
  }
  return defaultValue;
}

function syncDashboardThemeVars() {
  if (typeof document === "undefined") return;

  const body = document.body;
  const root = document.documentElement;
  if (!body || !root) return;

  const usingBlueprint = !!document.querySelector(".blueprint-dm-toggle");
  const usingRoamStudio = !!document.querySelector(".roamstudio-dm-toggle");

  const computed = window.getComputedStyle(body);

  const systemPrefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const explicitDark =
    body.classList.contains("bp3-dark") ||
    root.classList.contains("bp3-dark") ||
    body.dataset.theme === "dark" ||
    root.dataset.theme === "dark";

  const externalMode = getExternalAppearanceFromToggle(); // "dark" | "light" | "auto" | null
  let finalIsDark;
  if (externalMode === "dark") {
    finalIsDark = true;
  } else if (externalMode === "light") {
    finalIsDark = false;
  } else if (externalMode === "auto") {
    finalIsDark = explicitDark || systemPrefersDark;
  } else {
    finalIsDark = explicitDark || systemPrefersDark;
  }

  const layoutBg = sampleBackgroundColor([
    ".roam-main",
    ".roam-body .bp3-card",
    ".roam-body",
    "#app",
  ]);

  // Theme-specific dark fallback for the panel surface
  const darkFallbackSurface = usingBlueprint ? "#202B33" : "#1f2428";

  const baseSurfaceCandidate = pickColorValue(
    finalIsDark ? darkFallbackSurface : "#ffffff",
    computed.getPropertyValue("--bt-surface"),
    computed.getPropertyValue("--bp3-surface"),
    computed.getPropertyValue("--background-color"),
    layoutBg,
    computed.backgroundColor
  );

  if (
    !btPendingRoamStudioTheme &&
    baseSurfaceCandidate === (lastThemeSample?.surface || null)
  ) {
    return;
  }

  if (btPendingRoamStudioTheme) {
    btPendingRoamStudioTheme = false;
  }

  // Clamp overly-light surfaces in dark mode so the panel actually looks dark
  let baseSurface = baseSurfaceCandidate;
  let panelRgb = parseColorToRgb(baseSurfaceCandidate);
  if (finalIsDark && panelRgb) {
    const lum = computeLuminance(panelRgb);
    if (lum > 0.6) {
      baseSurface = darkFallbackSurface;
      panelRgb = parseColorToRgb(baseSurface);
    }
  }

  // Stronger defaults for Blueprint dark to improve legibility
  const fallbackTextDark = usingBlueprint ? "#F5F8FA" : "#f5f8fa";
  const fallbackBorderDark = usingBlueprint
    ? "rgba(255,255,255,0.24)"
    : "rgba(255,255,255,0.12)";
  const fallbackMutedDark = usingBlueprint
    ? "rgba(255,255,255,0.82)"
    : "rgba(255,255,255,0.65)";
  const fallbackPillBgDark = usingBlueprint
    ? "rgba(255,255,255,0.18)"
    : "rgba(255,255,255,0.08)";

  const textColor = pickColorValue(
    finalIsDark ? fallbackTextDark : "#111111",
    computed.getPropertyValue("--bt-text"),
    computed.getPropertyValue("--bp3-text-color"),
    computed.color
  );

  const borderColor = pickColorValue(
    finalIsDark ? fallbackBorderDark : "rgba(0,0,0,0.08)",
    computed.getPropertyValue("--bt-border-color"),
    computed.getPropertyValue("--bp3-border-color"),
    computed.getPropertyValue("--border-color")
  );

  const mutedColor = pickColorValue(
    finalIsDark ? fallbackMutedDark : "rgba(0,0,0,0.6)",
    computed.getPropertyValue("--bt-muted-color"),
    computed.getPropertyValue("--text-color-muted")
  );

  const pillBg = pickColorValue(
    finalIsDark ? fallbackPillBgDark : "rgba(0,0,0,0.07)",
    computed.getPropertyValue("--bt-pill-bg")
  );

  body.classList.toggle("bt-theme-dark", finalIsDark);
  body.classList.toggle("bt-theme-light", !finalIsDark);

  const adjustedPanel =
    adjustColor(panelRgb, finalIsDark ? -0.06 : 0.03) || baseSurface;
  const borderStrong =
    adjustColor(panelRgb, finalIsDark ? -0.22 : 0.15) || borderColor;

  root.style.setProperty("--bt-panel-bg", adjustedPanel);
  root.style.setProperty("--bt-panel-text", textColor);
  root.style.setProperty("--bt-border", borderColor);
  root.style.setProperty("--bt-border-strong", borderStrong);
  root.style.setProperty("--bt-muted", mutedColor);
  root.style.setProperty("--bt-pill-bg", pillBg);

  lastThemeSample = { surface: baseSurface, dark: finalIsDark };
}

function getExternalAppearanceFromToggle() {
  if (typeof document === "undefined") return null;

  // Try to find a concrete button/icon element for *either* theme
  let btn =
    // Roam Studio icon button
    document.querySelector(".bp3-button.roamstudio-dm-toggle") ||
    document.querySelector(".roamstudio-dm-toggle .bp3-button") ||
    // Blueprint icon button
    document.querySelector(".bp3-button.blueprint-dm-toggle") ||
    document.querySelector(".blueprint-dm-toggle .bp3-button");

  if (!btn) {
    // Debug info if needed
    const rsWrapper = document.querySelector(".roamstudio-dm-toggle");
    const bpWrapper = document.querySelector(".blueprint-dm-toggle");
    return null;
  }

  const className = btn.className || "";

  const hasMoon = btn.classList.contains("bp3-icon-moon");
  const hasFlash = btn.classList.contains("bp3-icon-flash");
  const hasClean = btn.classList.contains("bp3-icon-clean");

  // Order matters: if both clean+moon are present, treat as dark.
  if (hasFlash) {
    return "light";
  }
  if (hasMoon) {
    return "dark";
  }
  if (hasClean) {
    return "auto";
  }

  return null;
}

function parseColorToRgb(value) {
  if (!value || typeof value !== "string") return null;
  const str = value.trim();
  if (!str) return null;
  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      if (Number.isNaN(num)) return null;
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }
    return null;
  }
  const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  return null;
}

function computeLuminance(rgb) {
  if (!rgb) return null;
  const toLinear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function adjustColor(rgb, delta = 0) {
  if (!rgb || typeof delta !== "number" || delta === 0) return null;
  const mix = (channel) => {
    const target = delta > 0 ? 255 : 0;
    const ratio = Math.min(Math.abs(delta), 1);
    return Math.round(channel + (target - channel) * ratio);
  };
  const r = mix(rgb.r);
  const g = mix(rgb.g);
  const b = mix(rgb.b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function sampleBackgroundColor(selectors = []) {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    const node = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!node) continue;
    const style = window.getComputedStyle(node);
    const color = style?.backgroundColor;
    if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
      return color;
    }
  }
  return null;
}

async function waitForAttrDate(uid, attr, targetDate, set, retries = 6, getBlockFn, readMetaFn) {
  if (!uid || !(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return;
  if (typeof getBlockFn !== "function" || typeof readMetaFn !== "function") return;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < retries; i++) {
    await sleep(150);
    const block = await getBlockFn(uid);
    if (!block) break;
    const meta = await readMetaFn(block, set);
    const metaDate = meta?.[attr] instanceof Date ? meta[attr] : null;
    if (metaDate && !Number.isNaN(metaDate.getTime())) {
      if (Math.abs(metaDate.getTime() - targetDate.getTime()) < 1000) return;
    }
  }
}

async function waitForAttrClear(uid, attr, set, retries = 6, getBlockFn, readMetaFn) {
  if (!uid || typeof getBlockFn !== "function" || typeof readMetaFn !== "function") return;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < retries; i++) {
    await sleep(150);
    const block = await getBlockFn(uid);
    if (!block) break;
    const meta = await readMetaFn(block, set);
    if (!meta) break;
    let hasValue = false;
    if (attr === "repeat") {
      hasValue = !!meta.repeat;
    } else if (["start", "defer", "due"].includes(attr)) {
      const val = meta[attr];
      hasValue = val instanceof Date && !Number.isNaN(val.getTime());
    }
    if (!hasValue) return;
  }
}

async function waitForRepeatState(uid, set, options = {}, retries = 6, getBlockFn, readMetaFn) {
  if (!uid || typeof getBlockFn !== "function" || typeof readMetaFn !== "function") return;
  const expectValue =
    typeof options.expectedValue === "string" && options.expectedValue ? options.expectedValue.trim() : null;
  const expectPresence = typeof options.expectPresence === "boolean" ? options.expectPresence : null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < retries; i++) {
    await sleep(150);
    const block = await getBlockFn(uid);
    if (!block) break;
    const meta = await readMetaFn(block, set);
    const repeatVal = (meta?.repeat || "").trim();
    if (expectValue != null) {
      if (repeatVal === expectValue) return repeatVal;
    } else if (expectPresence != null) {
      if (!!repeatVal === expectPresence) return repeatVal;
    } else if (repeatVal) {
      return repeatVal;
    }
  }
}

function observeThemeChanges() {
  if (typeof document === "undefined") return;
  syncDashboardThemeVars();

  if (!document.body) return;

  if (!themeObserver) {
    const cb = () => triggerThemeResync(180);
    themeObserver = new MutationObserver(cb);
    try {
      const targets = [document.body, document.documentElement, document.head].filter(Boolean);
      for (const target of targets) {
        const opts =
          target === document.head
            ? { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "data-theme"] }
            : { attributes: true, attributeFilter: ["class", "data-theme"], subtree: true };
        themeObserver.observe(target, opts);
      }
    } catch (_) {
      themeObserver = null;
    }
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    if (!window.__btThemeMediaQuery) {
      window.__btThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      window.__btThemeMediaQuery.addEventListener?.("change", () => {
        triggerThemeResync(0);
      });
    }
  }

  observeThemeToggleClicks();
  observeRoamStudioToggleAttributes();
}

function triggerThemeResync(delay = 0) {
  if (themeSyncTimer) clearTimeout(themeSyncTimer);
  themeSyncTimer = setTimeout(() => {
    syncDashboardThemeVars();
    themeSyncTimer = null;
  }, Math.max(250, delay || 0));
}

function observeThemeToggleClicks() {
  if (typeof document === "undefined" || !document.body) return;
  if (window.__btThemeToggleClickHandlerAttached) return;

  const handler = (e) => {
    const toggle = e.target.closest(".roamstudio-dm-toggle, .blueprint-dm-toggle");
    if (!toggle) return;

    btPendingRoamStudioTheme = true;

    // Still give the theme extension time to rebuild CSS
    triggerThemeResync(650);
  };

  document.body.addEventListener("click", handler, true);
  window.__btThemeToggleClickHandlerAttached = true;
}

function observeRoamStudioToggleAttributes() {
  if (typeof document === "undefined") return;
  if (roamStudioToggleObserver) return;

  const toggle = document.querySelector(".roamstudio-dm-toggle");
  if (!toggle) {
    // Try again later – RS might not have injected the button yet
    setTimeout(observeRoamStudioToggleAttributes, 1000);
    return;
  }

  roamStudioToggleObserver = new MutationObserver((mutations) => {
    if (mutations.some(m => m.type === "attributes" && m.attributeName === "class")) {
      triggerThemeResync(120);
      const msg =
        t(["metadata", "themeChanged"], getLanguageSetting()) ||
        translateString("Detected change to themes. Reloading page to apply changes.", getLanguageSetting()) ||
        "Detected change to themes. Reloading page to apply changes.";
      toast(msg, 3500);
    }
  });

  roamStudioToggleObserver.observe(toggle, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function disconnectTopbarObserver() {
  if (!topbarButtonObserver) return;
  try {
    topbarButtonObserver.disconnect();
  } catch (_) {
    // ignore
  }
  topbarButtonObserver = null;
}

function ensureDashboardWatch(uid) {
  if (!uid || dashboardWatchers.has(uid)) return;
  if (!window.roamAlphaAPI?.data?.addPullWatch) return;
  const pattern = "[:block/uid]";
  const selector = [":block/uid", uid];
  try {
    window.roamAlphaAPI.data.addPullWatch(
      pattern,
      selector,
      (_, after) => {
        if (!after) {
          removeDashboardWatch(uid);
          activeDashboardController?.removeTask?.(uid);
        } else {
          activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
        }
      }
    );
    dashboardWatchers.set(uid, { pattern, selector });
  } catch (err) {
    console.warn("[BetterTasks] addPullWatch failed", err);
  }
}

function removeDashboardWatch(uid) {
  if (!uid) return;
  const entry = dashboardWatchers.get(uid);
  if (!entry) return;
  try {
    window.roamAlphaAPI?.data?.removePullWatch?.(entry.pattern, entry.selector);
  } catch (err) {
    console.warn("[BetterTasks] removePullWatch failed", err);
  }
  dashboardWatchers.delete(uid);
}

function clearDashboardWatches() {
  for (const uid of Array.from(dashboardWatchers.keys())) {
    removeDashboardWatch(uid);
  }
}
