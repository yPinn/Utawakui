import { reactive, readonly } from 'vue';
import { normalizeAppError } from '../utils/appErrors.js';
import {
  DIAGNOSTICS_DEFAULT_BY_KIND,
  FEEDBACK_KINDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TRACK_LABEL_LENGTH,
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
  descriptionError: '',
  validationAttempt: 0,
});

let requestRevision = 0;

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
function boundedPrefill(value, limit) {
  if (typeof value !== 'string') return '';
  return Array.from(value.slice(0, limit * 2))
    .filter((character) => {
      const point = character.codePointAt(0);
      return (point > 31 && point !== 127) || [9, 10, 13].includes(point);
    })
    .join('')
    .trim()
    .slice(0, limit);
}

function resetDraft({ kind, errorRecord, description, trackLabel } = {}) {
  requestRevision += 1;
  state.descriptionError = '';
  state.validationAttempt = 0;
  const nextKind = Object.values(FEEDBACK_KINDS).includes(kind)
    ? kind
    : FEEDBACK_KINDS.BUG;
  state.kind = nextKind;
  state.description = boundedPrefill(
    typeof description === 'string'
      ? description
      : errorRecord
        ? `發生問題：${errorRecord.title || ''}${
            errorRecord.message ? ` — ${errorRecord.message}` : ''
          }\n\n`
        : '',
    MAX_DESCRIPTION_LENGTH,
  );
  state.contact = '';
  state.trackLabel =
    nextKind === FEEDBACK_KINDS.CONTENT
      ? boundedPrefill(trackLabel, MAX_TRACK_LABEL_LENGTH)
      : '';
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
  requestRevision += 1;
  state.isLoading = false;
  state.open = false;
}

// The checkbox default is policy-driven by kind (see
// DIAGNOSTICS_DEFAULT_BY_KIND); changing kind resets it so the UI never
// shows a checked box the main process will silently ignore for a
// non-bug report.
function updateDraft(patch) {
  if (state.isLoading) return;
  for (const key of [
    'kind',
    'description',
    'contact',
    'trackLabel',
    'includeDiagnostics',
  ]) {
    if (Object.hasOwn(patch, key)) state[key] = patch[key];
  }
  if (state.validationAttempt)
    state.descriptionError = state.description.trim()
      ? ''
      : '簡短描述你遇到的狀況，才能繼續預覽。';
  state.previewPayload = null;
  if (patch.kind) {
    state.includeDiagnostics = DIAGNOSTICS_DEFAULT_BY_KIND[patch.kind] ?? false;
  }
}

// Main sends or saves exactly the payload it previewed under this id.
function previewedInput() {
  return { previewId: state.previewPayload?.reportId ?? '' };
}

function returnToComposeForExpiredPreview() {
  state.step = 'compose';
  state.previewPayload = null;
  state.notice = failureNotice({
    title: '預覽已逾時',
    message: '請重新建立預覽後再送出。',
    actionLabel: '',
    operation: 'preview',
  });
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
  if (state.isLoading) return false;
  state.validationAttempt += 1;
  state.descriptionError = state.description.trim()
    ? ''
    : '簡短描述你遇到的狀況，才能繼續預覽。';
  if (state.descriptionError) {
    state.notice = null;
    return false;
  }

  const buildPreview = bridgeMethod('buildFeedbackPreview');
  if (!buildPreview) {
    state.notice = failureNotice({
      title: '需要重新啟動',
      actionLabel: '',
      message: '重新啟動後即可送出回饋。',
      operation: 'preview',
    });
    return false;
  }

  const current = ++requestRevision;
  state.isLoading = true;
  state.notice = null;
  try {
    const result = await buildPreview(currentInput());
    if (current !== requestRevision) return false;
    if (!result?.ok) throw new Error('feedback preview failed');
    state.previewPayload = result.payload;
    state.step = 'preview';
    return true;
  } catch {
    if (current !== requestRevision) return false;
    state.notice = failureNotice({
      title: '無法建立預覽',
      operation: 'preview',
    });
    return false;
  } finally {
    if (current === requestRevision) state.isLoading = false;
  }
}

function backToCompose() {
  if (state.isLoading) return;
  state.step = 'compose';
  state.notice = null;
}

async function submitReport() {
  if (state.isLoading) return false;
  const submit = bridgeMethod('submitFeedback');
  if (!submit) {
    state.notice = failureNotice({
      title: '需要重新啟動',
      actionLabel: '',
      operation: 'submit',
    });
    return false;
  }

  const current = ++requestRevision;
  state.isLoading = true;
  state.notice = null;
  try {
    const result = await submit(previewedInput());
    if (current !== requestRevision) return false;
    if (result?.errorCode === 'FEEDBACK_PREVIEW_EXPIRED') {
      returnToComposeForExpiredPreview();
      return false;
    }
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
    if (current !== requestRevision) return false;
    state.notice = failureNotice({
      title: '送出失敗',
      message: '目前無法送出，你可以改成另存成檔案自行傳給開發者。',
      operation: 'submit',
      actionLabel: '另存檔案',
    });
    return false;
  } finally {
    if (current === requestRevision) state.isLoading = false;
  }
}

async function exportFallback() {
  if (state.isLoading) return false;
  const exportFn = bridgeMethod('exportFeedbackFallback');
  if (!exportFn) {
    state.notice = failureNotice({
      title: '無法另存檔案',
      operation: 'export-fallback',
    });
    return false;
  }

  const previousNotice = state.notice;
  const current = ++requestRevision;
  state.isLoading = true;
  state.notice = null;
  try {
    const result = await exportFn(previewedInput());
    if (current !== requestRevision) return false;
    if (result?.errorCode === 'FEEDBACK_PREVIEW_EXPIRED') {
      returnToComposeForExpiredPreview();
      return false;
    }
    // A cancelled save dialog is expected control flow, matching
    // usePersistentDiagnostics.js's exportBundle().
    if (result?.cancelled) {
      state.notice = previousNotice;
      return true;
    }
    if (!result?.ok) throw new Error('feedback export failed');
    state.notice = normalizeAppError(null, {
      code: 'FEEDBACK_EXPORTED',
      severity: 'success',
      title: '已另存檔案',
      message: '檔案已儲存，尚未傳送；請自行將檔案傳給開發者。',
      source: 'feedback',
      operation: 'export-fallback',
    });
    return true;
  } catch {
    if (current !== requestRevision) return false;
    state.notice = failureNotice({
      title: '無法另存檔案',
      operation: 'export-fallback',
    });
    return false;
  } finally {
    if (current === requestRevision) state.isLoading = false;
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
