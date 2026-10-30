import { computed, reactive } from 'vue';
import { useObsIntegration } from './useObsIntegration.js';
import { useClipboardFeedback } from './useClipboardFeedback.js';
import { projectYoutubeChapters } from '../utils/obsChapters.js';
import { t } from '../utils/i18n.js';

// A generated chapter list scales with setlist length, not a short label —
// useClipboardFeedback's own 1024-char default suits URLs/labels, not this.
const CHAPTERS_MAX_COPY_LENGTH = 8000;

// Module-level singleton (same shape as useFeedbackReport.js) so the
// trigger button (ObsIntegrationSettingsBlock.vue) and the modal that
// renders the result (ObsSessionExportModal.vue) share one instance
// without prop drilling between components that aren't otherwise related.
const state = reactive({
  isOpen: false,
  session: null,
  source: 'stream',
  // Text input, whole seconds — same convention as skipThresholdSeconds in
  // useObsIntegrationSettings.js.
  offsetSeconds: '0',
  isLoading: false,
  error: '',
  arrangementId: null,
});

const obs = useObsIntegration();
const clipboard = useClipboardFeedback({
  writeText: (value) =>
    typeof window !== 'undefined' && window.Utawakui?.copyObsText
      ? window.Utawakui.copyObsText(value)
      : Promise.reject(new Error('clipboard unavailable')),
  maxLength: CHAPTERS_MAX_COPY_LENGTH,
  persistError: true,
});
let loadRevision = 0;

function hasOutput(kind) {
  return (state.session?.entries ?? []).some((entry) => entry?.[kind]);
}

async function loadSession(arrangementId = null) {
  if (state.isLoading) return;
  const current = ++loadRevision;
  clipboard.dispose();
  state.isOpen = true;
  state.isLoading = true;
  state.error = '';
  state.arrangementId = arrangementId;
  try {
    let session;
    if (arrangementId) {
      const response =
        await window.Utawakui.getPerformanceSession(arrangementId);
      if (response?.ok !== true) throw new Error('session unavailable');
      session = { ...response.plan, entries: response.plan.timeline };
    } else session = await obs.getLatestSession();
    if (current !== loadRevision) return;
    state.session = session;
    if (!hasOutput(state.source)) {
      state.source = hasOutput('record') ? 'record' : 'stream';
    }
  } catch {
    if (current !== loadRevision) return;
    state.error = t('obs.export.readFailed');
  } finally {
    if (current === loadRevision) state.isLoading = false;
  }
}

function close() {
  loadRevision += 1;
  state.isLoading = false;
  state.isOpen = false;
  clipboard.dispose();
}

const offsetMs = computed(() => {
  const parsed = Number.parseInt(state.offsetSeconds, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0;
});
const offsetError = computed(() => {
  const value = String(state.offsetSeconds).trim();
  const number = Number(value);
  return /^\d+$/u.test(value) &&
    Number.isSafeInteger(number) &&
    number <= Math.floor(Number.MAX_SAFE_INTEGER / 1000)
    ? ''
    : t('obs.export.offsetInvalid');
});

const result = computed(() =>
  projectYoutubeChapters(state.session?.entries ?? [], {
    offsetMs: offsetMs.value,
    source: state.source,
  }),
);
const canCopy = computed(
  () =>
    state.isOpen &&
    !state.isLoading &&
    !state.error &&
    !offsetError.value &&
    Boolean(result.value.text),
);

async function copyChapters() {
  if (!canCopy.value) return false;
  return clipboard.copy(result.value.text, t('obs.export.clipboardLabel'), {
    successMessage: t('obs.export.copySuccess'),
    errorMessage: t('obs.export.copyFailed'),
  });
}

export function useObsSessionExport() {
  return {
    isOpen: computed(() => state.isOpen),
    session: computed(() => state.session),
    source: computed({
      get: () => state.source,
      set: (value) => {
        if (value !== state.source) clipboard.dispose();
        state.source = value;
      },
    }),
    offsetSeconds: computed({
      get: () => state.offsetSeconds,
      set: (value) => {
        if (value !== state.offsetSeconds) clipboard.dispose();
        state.offsetSeconds = value;
      },
    }),
    result,
    offsetError,
    canCopy,
    isLoading: computed(() => state.isLoading),
    error: computed(() => state.error),
    copyState: clipboard.state,
    open: () => loadSession(null),
    openForArrangement: (sessionId) => loadSession(sessionId),
    reload: () => loadSession(state.arrangementId),
    close,
    copyChapters,
  };
}
