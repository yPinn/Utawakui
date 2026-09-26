import { computed, reactive } from 'vue';
import { useObsIntegration } from './useObsIntegration.js';
import { useClipboardFeedback } from './useClipboardFeedback.js';
import { projectYoutubeChapters } from '../utils/obsChapters.js';

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
});

const obs = useObsIntegration();
const clipboard = useClipboardFeedback({
  writeText: (value) =>
    typeof window !== 'undefined' && window.Utawakui?.copyObsText
      ? window.Utawakui.copyObsText(value)
      : Promise.reject(new Error('clipboard unavailable')),
  maxLength: CHAPTERS_MAX_COPY_LENGTH,
});

function hasOutput(kind) {
  return (state.session?.entries ?? []).some((entry) => entry?.[kind]);
}

async function open() {
  state.isOpen = true;
  state.isLoading = true;
  state.error = '';
  try {
    state.session = await obs.getLatestSession();
    if (!hasOutput(state.source)) {
      state.source = hasOutput('record') ? 'record' : 'stream';
    }
  } catch {
    state.error = '目前無法讀取場次紀錄，請再試一次。';
  } finally {
    state.isLoading = false;
  }
}

function close() {
  state.isOpen = false;
}

const offsetMs = computed(() => {
  const parsed = Number.parseInt(state.offsetSeconds, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0;
});

const result = computed(() =>
  projectYoutubeChapters(state.session?.entries ?? [], {
    offsetMs: offsetMs.value,
    source: state.source,
  }),
);

async function copyChapters() {
  return clipboard.copy(result.value.text, 'YouTube 章節文字', {
    successMessage: '已複製章節文字',
    errorMessage: '無法複製章節文字，請手動選取文字',
  });
}

export function useObsSessionExport() {
  return {
    isOpen: computed(() => state.isOpen),
    session: computed(() => state.session),
    source: computed({
      get: () => state.source,
      set: (value) => {
        state.source = value;
      },
    }),
    offsetSeconds: computed({
      get: () => state.offsetSeconds,
      set: (value) => {
        state.offsetSeconds = value;
      },
    }),
    result,
    isLoading: computed(() => state.isLoading),
    error: computed(() => state.error),
    copyState: clipboard.state,
    open,
    close,
    copyChapters,
  };
}
