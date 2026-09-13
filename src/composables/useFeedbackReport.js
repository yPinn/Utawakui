import { reactive, readonly } from 'vue';
import { normalizeAppError } from '../utils/appErrors.js';
import {
  DIAGNOSTICS_DEFAULT_BY_KIND,
  FEEDBACK_KINDS,
} from '../constants/feedback.js';

// Module-level singleton (same shape as usePersistentDiagnostics.js) so any
// entry point in the app — an error notice's action, a Settings row — can
// call openReport() and drive the same modal instance without prop drilling.
const state = reactive({
  open: false,
  kind: FEEDBACK_KINDS.BUG,
  description: '',
  contact: '',
  trackLabel: '',
  includeDiagnostics: DIAGNOSTICS_DEFAULT_BY_KIND[FEEDBACK_KINDS.BUG],
  step: 'compose',
  isLoading: false,
  notice: null,
  previewPayload: null,
  reportId: null,
});

function bridgeMethod(name) {
  const method = globalThis.window?.Utawakui?.[name];
  return typeof method === 'function' ? method : null;
}

function failureNotice({
  title,
  message = '請稍後再試一次。',
  operation,
  actionLabel = '重試',
}) {
  return normalizeAppError(null, {
    code: `FEEDBACK_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title,
    message,
    actionLabel,
    source: 'feedback',
    operation,
  });
}

// Every openReport() call starts from a clean draft rather than resuming a
// previous one: different entry points (a specific error's "回報" action vs.
// the general Settings entry) should never bleed a stale kind/description
// into each other.
function resetDraft({ kind, errorRecord } = {}) {
  const nextKind = Object.values(FEEDBACK_KINDS).includes(kind)
    ? kind
    : FEEDBACK_KINDS.BUG;
  state.kind = nextKind;
  state.description = errorRecord
    ? `發生問題：${errorRecord.title || ''}${
        errorRecord.message ? ` — ${errorRecord.message}` : ''
      }\n\n`
    : '';
  state.contact = '';
  state.trackLabel = '';
  state.includeDiagnostics = DIAGNOSTICS_DEFAULT_BY_KIND[nextKind] ?? false;
  state.step = 'compose';
  state.isLoading = false;
  state.notice = null;
  state.previewPayload = null;
  state.reportId = null;
}

function openReport(options) {
  resetDraft(options);
  state.open = true;
}

function closeReport() {
  state.open = false;
}

// The checkbox default is policy-driven by kind (see
// DIAGNOSTICS_DEFAULT_BY_KIND); changing kind resets it so the UI never
// shows a checked box the main process will silently ignore for a
// non-bug report.
function updateDraft(patch) {
  Object.assign(state, patch);
  if (patch.kind) {
    state.includeDiagnostics = DIAGNOSTICS_DEFAULT_BY_KIND[patch.kind] ?? false;
  }
}

function currentInput() {
  return {
    kind: state.kind,
    description: state.description,
    contact: state.contact,
    trackLabel: state.trackLabel,
    includeDiagnostics: state.includeDiagnostics,
  };
}

async function goToPreview() {
  if (!state.description.trim()) {
    state.notice = normalizeAppError(null, {
      code: 'FEEDBACK_DESCRIPTION_REQUIRED',
      severity: 'warning',
      title: '請先填寫說明',
      message: '簡短描述你遇到的狀況，才能繼續預覽。',
      source: 'feedback',
      operation: 'preview',
    });
    return false;
  }

  const buildPreview = bridgeMethod('buildFeedbackPreview');
  if (!buildPreview) {
    state.notice = failureNotice({
      title: '需要重新啟動',
      message: '重新啟動後即可送出回饋。',
      operation: 'preview',
    });
    return false;
  }

  state.isLoading = true;
  state.notice = null;
  try {
    const result = await buildPreview(currentInput());
    if (!result?.ok) throw new Error('feedback preview failed');
    state.previewPayload = result.payload;
    state.step = 'preview';
    return true;
  } catch {
    state.notice = failureNotice({
      title: '無法建立預覽',
      operation: 'preview',
    });
    return false;
  } finally {
    state.isLoading = false;
  }
}

function backToCompose() {
  state.step = 'compose';
  state.notice = null;
}

async function submitReport() {
  const submit = bridgeMethod('submitFeedback');
  if (!submit) {
    state.notice = failureNotice({
      title: '需要重新啟動',
      operation: 'submit',
    });
    return false;
  }

  state.isLoading = true;
  state.notice = null;
  try {
    const result = await submit(currentInput());
    if (!result?.ok) {
      const message =
        result?.errorCode === 'FEEDBACK_RATE_LIMITED'
          ? '這台電腦短時間內送出太多次，請稍後再試。'
          : '目前無法送出，你可以改成另存成檔案自行傳給開發者。';
      state.notice = failureNotice({
        title: '送出失敗',
        message,
        operation: 'submit',
        actionLabel: '另存檔案',
      });
      return false;
    }
    state.reportId = result.reportId;
    state.step = 'result';
    return true;
  } catch {
    state.notice = failureNotice({
      title: '送出失敗',
      message: '目前無法送出，你可以改成另存成檔案自行傳給開發者。',
      operation: 'submit',
      actionLabel: '另存檔案',
    });
    return false;
  } finally {
    state.isLoading = false;
  }
}

async function exportFallback() {
  const exportFn = bridgeMethod('exportFeedbackFallback');
  if (!exportFn) {
    state.notice = failureNotice({
      title: '無法另存檔案',
      operation: 'export-fallback',
    });
    return false;
  }

  state.isLoading = true;
  state.notice = null;
  try {
    const result = await exportFn(currentInput());
    // A cancelled save dialog is expected control flow, matching
    // usePersistentDiagnostics.js's exportBundle().
    if (result?.cancelled) return true;
    if (!result?.ok) throw new Error('feedback export failed');
    state.notice = normalizeAppError(null, {
      code: 'FEEDBACK_EXPORTED',
      severity: 'success',
      title: '已另存檔案',
      message: '檔案已儲存在你選擇的位置，你可以自行傳給開發者。',
      source: 'feedback',
      operation: 'export-fallback',
    });
    return true;
  } catch {
    state.notice = failureNotice({
      title: '無法另存檔案',
      operation: 'export-fallback',
    });
    return false;
  } finally {
    state.isLoading = false;
  }
}

export function useFeedbackReport() {
  return {
    state: readonly(state),
    openReport,
    closeReport,
    updateDraft,
    goToPreview,
    backToCompose,
    submitReport,
    exportFallback,
  };
}
