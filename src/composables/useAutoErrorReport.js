import { reactive, readonly } from 'vue';
import { formatFeedbackReportReference } from '../../shared/feedbackReference.mjs';
import { useAppNotifications } from './useAppNotifications.js';
import { useFeedbackReport } from './useFeedbackReport.js';
import { useSettingsPreference } from './useSettingsPreference.js';

// Module singleton: main raises at most one pending severe-error report.
const state = reactive({ prompt: null, busy: false });
let initialized = false;

function bridge() {
  return globalThis.window?.Utawakui;
}

function notifySent({ reportId } = {}) {
  if (typeof reportId !== 'string') return;
  const reference = formatFeedbackReportReference(reportId);
  useAppNotifications().notify({
    key: 'auto-error-report',
    title: '已自動回報錯誤',
    message: `回報碼 ${reference}`,
    // One follow-up path for prompted and automatic sends alike.
    actionLabel: '補充說明',
    action: () =>
      useFeedbackReport().openReport({
        kind: 'bug',
        description: `補充自動回報（回報碼 ${reference}）：\n`,
      }),
  });
}

function showPrompt(prompt) {
  if (prompt && typeof prompt.reportId === 'string') state.prompt = prompt;
}

async function initialize() {
  const api = bridge();
  if (initialized || !api?.getPendingAutoReport) return;
  initialized = true;
  api.onAutoReportPrompt?.(showPrompt);
  api.onAutoReportSent?.(notifySent);
  try {
    showPrompt(await api.getPendingAutoReport());
  } catch {
    // A missing prompt only defers the question to the next launch.
  }
}

async function respond(decision) {
  const prompt = state.prompt;
  const api = bridge();
  if (!prompt || state.busy || !api?.respondAutoReport) return false;
  state.busy = true;
  try {
    const result = await api.respondAutoReport(prompt.reportId, decision);
    state.prompt = null;
    if (result?.sent) notifySent({ reportId: prompt.reportId });
    return Boolean(result?.ok);
  } catch {
    state.prompt = null;
    return false;
  } finally {
    state.busy = false;
  }
}

export function useAutoErrorReport() {
  return { state: readonly(state), initialize, respond };
}

export function useAutoErrorReportingSetting(options = {}) {
  const api = options.bridge ?? bridge();
  const preference = useSettingsPreference({
    scope: api,
    key: 'auto-error-reporting',
    initialValue: 'ask',
    read: () => api.getAutoErrorReporting(),
    write: (value) => api.setAutoErrorReporting(value),
    validate: (value) => ['ask', 'always', 'never'].includes(value),
    readMessage: '目前無法讀取自動回報設定，請重新讀取。',
    saveMessage: '目前無法儲存自動回報設定，已恢復原設定。',
  });
  return {
    reporting: preference.value,
    preferenceBusy: preference.busy,
    preferenceReading: preference.reading,
    preferenceLoaded: preference.loaded,
    preferenceReadError: preference.readError,
    preferenceSaveError: preference.saveError,
    refreshPreference: preference.refresh,
    setReporting: preference.save,
  };
}
