import { computed, reactive } from 'vue';
import {
  alignSessionTimepoints,
  buildSessionMarkerCsv,
  formatMarkerTime,
  groupSessionTimepoints,
} from '../../shared/sessionExportTimepoints.mjs';
import { useObsIntegration } from './useObsIntegration.js';
import { useClipboardFeedback } from './useClipboardFeedback.js';
import {
  formatSessionTimepointLabel,
  formatYoutubeChapters,
} from '../utils/obsChapters.js';
import { t } from '../utils/i18n.js';

const MAX_COPY_LENGTH = 8000;
const YOUTUBE_DESCRIPTION_LIMIT = 5000;
const SOURCES = ['stream', 'record'];
const state = reactive({
  isOpen: false,
  session: null,
  source: 'stream',
  mode: 'youtube',
  segmentIndex: '',
  offsets: {},
  includeOpening: false,
  descriptionIntro: '',
  isLoading: false,
  isSaving: false,
  error: '',
  saveMessage: '',
  saveError: false,
  arrangementId: null,
});

const obs = useObsIntegration();
const clipboard = useClipboardFeedback({
  writeText: (value) => window.Utawakui.copyObsText(value),
  maxLength: MAX_COPY_LENGTH,
  persistError: true,
});
let loadRevision = 0;

const sources = computed(() =>
  Object.fromEntries(
    SOURCES.map((source) => [
      source,
      groupSessionTimepoints(state.session?.entries, source),
    ]),
  ),
);
const availableSources = computed(() =>
  SOURCES.filter((source) => sources.value[source].segments.length),
);
const sourceGroups = computed(() => sources.value[state.source]);
const segmentIndex = computed(() =>
  sourceGroups.value.segments.length === 1 ? 0 : state.segmentIndex,
);
function segmentKey(segment) {
  const first = segment?.[0];
  return first
    ? JSON.stringify([
        first.segmentId,
        first.entry.id ?? first.entry.occurredAt,
        first.rawMs,
      ])
    : '';
}
const selectedSegmentKey = computed(() =>
  segmentKey(sourceGroups.value.segments[segmentIndex.value]),
);
const offsetKey = computed(() => `${state.source}:${selectedSegmentKey.value}`);
const offsetText = computed(() =>
  String(state.offsets[offsetKey.value] ?? '0'),
);
const offsetMs = computed(() => {
  const value = offsetText.value.trim();
  if (!/^[+-]?\d+(?:\.\d{1,3})?$/u.test(value)) return null;
  const milliseconds = Math.round(Number(value) * 1000);
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
});
const offsetError = computed(() =>
  offsetMs.value === null ? t('obs.export.offsetInvalid') : '',
);
const aligned = computed(() =>
  alignSessionTimepoints(
    sourceGroups.value.segments[segmentIndex.value],
    offsetMs.value ?? 0,
  ),
);
const result = computed(() =>
  formatYoutubeChapters(aligned.value.rows, {
    includeOpening: state.includeOpening,
  }),
);
const markerCsv = computed(() =>
  buildSessionMarkerCsv(aligned.value.rows, state.source),
);
const referenceText = computed(() =>
  aligned.value.rows
    .map(
      ({ entry, ms }) =>
        `${formatMarkerTime(ms)} ${formatSessionTimepointLabel(entry)}`,
    )
    .join('\n'),
);
const hasDescriptionIntro = computed(() =>
  Boolean(state.descriptionIntro.trim()),
);
const youtubeText = computed(() => {
  const timeline = result.value.text;
  if (!timeline || !hasDescriptionIntro.value) return timeline;
  return t('obs.export.descriptionTemplate', {
    intro: state.descriptionIntro.trim(),
    timeline,
  });
});
const previewText = computed(() =>
  state.mode === 'youtube' ? youtubeText.value : referenceText.value,
);
const descriptionTooLong = computed(
  () =>
    state.mode === 'youtube' &&
    youtubeText.value.length > YOUTUBE_DESCRIPTION_LIMIT,
);
const canExport = computed(
  () =>
    state.isOpen &&
    !state.isLoading &&
    !state.isSaving &&
    !state.error &&
    !offsetError.value,
);
const copyTooLong = computed(() => previewText.value.length > MAX_COPY_LENGTH);
const canCopy = computed(
  () => canExport.value && Boolean(previewText.value) && !copyTooLong.value,
);
const canSave = computed(
  () =>
    canExport.value &&
    state.mode === 'markers' &&
    Boolean(state.session?.id && markerCsv.value),
);

function clearFeedback() {
  clipboard.dispose();
  state.saveMessage = '';
  state.saveError = false;
}

function selectSource(source) {
  if (source === state.source || !SOURCES.includes(source)) return;
  state.source = source;
  state.segmentIndex = '';
  state.includeOpening = false;
  clearFeedback();
}

function selectPreferredSource() {
  const preferred = state.mode === 'markers' ? 'record' : 'stream';
  selectSource(
    availableSources.value.includes(preferred)
      ? preferred
      : (availableSources.value[0] ?? preferred),
  );
}

function resetDraft() {
  state.offsets = {};
  state.descriptionIntro = '';
  state.includeOpening = false;
  state.segmentIndex = '';
  state.mode = 'youtube';
  selectPreferredSource();
}

async function loadSession(arrangementId = null, preserveDraft = false) {
  if (state.isSaving) return;
  const current = ++loadRevision;
  const previousId = state.session?.id;
  const previousSegmentKey = selectedSegmentKey.value;
  clearFeedback();
  state.isOpen = true;
  state.isLoading = true;
  state.error = '';
  state.arrangementId = arrangementId;
  try {
    let session;
    if (arrangementId) {
      const response =
        await window.Utawakui.getPerformanceSession(arrangementId);
      if (response?.ok !== true || response.plan?.id !== arrangementId)
        throw new Error('session unavailable');
      session = { ...response.plan, entries: response.plan.timeline };
    } else session = await obs.getLatestSession();
    if (current !== loadRevision) return;
    state.session = session;
    if (!preserveDraft || previousId !== session?.id) resetDraft();
    else if (!availableSources.value.includes(state.source))
      selectPreferredSource();
    else {
      const index = sourceGroups.value.segments.findIndex(
        (segment) => segmentKey(segment) === previousSegmentKey,
      );
      state.segmentIndex = index < 0 ? '' : index;
      if (selectedSegmentKey.value !== previousSegmentKey)
        state.includeOpening = false;
    }
  } catch {
    if (current !== loadRevision) return;
    state.error = t('obs.export.readFailed');
  } finally {
    if (current === loadRevision) state.isLoading = false;
  }
}

function close() {
  loadRevision++;
  state.isLoading = false;
  state.isOpen = false;
  clearFeedback();
}

async function copyPreview() {
  if (!canCopy.value) return false;
  const editing = state.mode === 'markers';
  const description = !editing && hasDescriptionIntro.value;
  const valid = !editing && result.value.valid;
  return clipboard.copy(
    previewText.value,
    t(
      editing
        ? 'obs.export.markers'
        : description
          ? 'obs.export.videoDescription'
          : valid
            ? 'obs.export.chapters'
            : 'obs.export.timepoints',
    ),
    {
      successMessage: t(
        editing
          ? 'obs.export.referenceCopied'
          : description
            ? 'obs.export.descriptionCopied'
            : valid
              ? 'obs.export.copySuccess'
              : 'obs.export.pointsCopied',
      ),
      errorMessage: t('obs.export.copyFailed'),
    },
  );
}

async function saveMarkers() {
  if (!canSave.value) return false;
  const csv = markerCsv.value;
  const intent = {
    sessionId: state.session.id,
    latest: state.arrangementId === null,
    source: state.source,
    offsetMs: offsetMs.value,
    segmentIndex: segmentIndex.value,
  };
  clearFeedback();
  state.isSaving = true;
  try {
    const bytes = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(csv),
    );
    const digest = Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const response = await window.Utawakui.savePerformanceMarkerCsv({
      ...intent,
      digest,
    });
    if (response?.ok !== true) {
      state.saveMessage = response?.error?.message || t('obs.export.csvFailed');
      state.saveError = true;
      return false;
    }
    if (response.plan.saved) state.saveMessage = t('obs.export.csvSaved');
    return response.plan.saved;
  } catch {
    state.saveMessage = t('obs.export.csvFailed');
    state.saveError = true;
    return false;
  } finally {
    state.isSaving = false;
  }
}

export function useObsSessionExport() {
  return {
    isOpen: computed(() => state.isOpen),
    session: computed(() => state.session),
    isLatest: computed(() => state.arrangementId === null),
    availableSources,
    source: computed({ get: () => state.source, set: selectSource }),
    mode: computed({
      get: () => state.mode,
      set(value) {
        if (!['youtube', 'markers'].includes(value) || value === state.mode)
          return;
        state.mode = value;
        selectPreferredSource();
        clearFeedback();
      },
    }),
    segmentStarts: computed(() =>
      sourceGroups.value.segments.map(
        (segment) => segment[0].entry.occurredAt ?? null,
      ),
    ),
    segmentIndex: computed({
      get: () => segmentIndex.value,
      set(value) {
        state.segmentIndex =
          Number.isInteger(value) && sourceGroups.value.segments[value]
            ? value
            : '';
        state.includeOpening = false;
        clearFeedback();
      },
    }),
    includeOpening: computed({
      get: () => state.includeOpening,
      set(value) {
        state.includeOpening = value === true;
        clearFeedback();
      },
    }),
    descriptionIntro: computed({
      get: () => state.descriptionIntro,
      set(value) {
        state.descriptionIntro = value;
        clearFeedback();
      },
    }),
    hasDescriptionIntro,
    descriptionTooLong,
    offsetSeconds: computed({
      get: () => offsetText.value,
      set(value) {
        state.offsets[offsetKey.value] = value;
        clearFeedback();
      },
    }),
    result,
    previewText,
    markerCsv,
    aligned,
    missingCount: computed(() => sourceGroups.value.missingCount),
    offsetError,
    canCopy,
    copyTooLong,
    canSave,
    isLoading: computed(() => state.isLoading),
    isSaving: computed(() => state.isSaving),
    error: computed(() => state.error),
    saveMessage: computed(() => state.saveMessage),
    saveError: computed(() => state.saveError),
    copyState: clipboard.state,
    open: () => loadSession(null),
    openForArrangement: (sessionId) => loadSession(sessionId),
    reload: () => loadSession(state.arrangementId, true),
    close,
    copyPreview,
    saveMarkers,
  };
}
