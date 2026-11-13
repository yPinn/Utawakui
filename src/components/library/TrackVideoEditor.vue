<script setup>
import {
  computed,
  nextTick,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import {
  extractVideoId,
  normalizeVideoInput,
} from '../../../shared/youtubeVideoId.mjs';
import { FEATURE_IDS } from '../../constants/featureGates.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useFeatureGateAccess } from '../../composables/useFeatureGateAccess.js';
import { formatBytes, formatDuration } from '../../utils/format.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTextField from '../ui/UiTextField.vue';
import TrackVideoSourcePanel from './TrackVideoSourcePanel.vue';

const { trackId } = defineProps({ trackId: { type: String, required: true } });
const api = window.Utawakui;
const { confirm } = useAppConfirmation();
const { requireFeatureGate } = useFeatureGateAccess();
// YouTube lookups, downloads and references need the external-source gate.
const providerAllowed = (operation) =>
  requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
    source: 'track-video',
    operation,
  });
const saved = shallowRef(null);
const fixture = shallowRef(false);
const offer = shallowRef(null);
const selected = shallowRef('');
const sourceInput = shallowRef('');
const recorded = shallowRef(null);
const sourceId = computed(() => extractVideoId(sourceInput.value));
const sourceResult = computed(
  () =>
    offer.value ??
    (recorded.value?.id === sourceId.value ? recorded.value : null),
);
let sourceEdited = false;
const permitted = shallowRef(false);
const downloadOpen = shallowRef(false);
const sourcePanel = useTemplateRef('sourcePanel');
const reviewTitle = useTemplateRef('reviewTitle');
const previewOpen = shallowRef(false);
const previewUrl = computed(() =>
  sourceId.value ? `https://www.youtube.com/embed/${sourceId.value}` : null,
);
const candidate = shallowRef(null);
const candidatePlayable = shallowRef(false);
const timingOpen = shallowRef(false);
const offset = shallowRef(0);
const offsetField = useTemplateRef('offsetField');
const referenceOpen = shallowRef(false);
const referenceInput = shallowRef('');
const referenceField = useTemplateRef('referenceField');
const referenceId = computed(() => extractVideoId(referenceInput.value));
const defaultOffsetHint = t('trackVideo.offsetHint');
const savedOffsetHint = shallowRef(defaultOffsetHint);
const pendingAlignment = shallowRef(null);
const useSegments = shallowRef(false);
const segmentCount = computed(() =>
  candidate.value
    ? (candidate.value.segmentCount ?? 0)
    : (pendingAlignment.value?.segmentCount ??
      saved.value?.syncSegments?.length ??
      0),
);
const offsetHint = computed(() =>
  candidate.value ? defaultOffsetHint : savedOffsetHint.value,
);
const candidateHint = computed(() =>
  candidate.value
    ? t(
        `trackVideo.review.${candidate.value.reason ?? 'insufficient-match'}`,
        reviewTimes(candidate.value.reviewRange),
      )
    : '',
);
const status = shallowRef('');
const progress = shallowRef(null);
const error = shallowRef('');
let active = true;
let timer;
let sourceTrigger;

const options = computed(() =>
  (offer.value?.choices ?? []).map((choice) => ({
    value: choice.id,
    label: t('trackVideo.qualityOption', {
      height: choice.height,
      size: choice.sizeBytes
        ? formatBytes(choice.sizeBytes)
        : t('trackVideo.unknownSize'),
    }),
  })),
);
const validOffset = computed(
  () =>
    offset.value !== '' &&
    Number.isSafeInteger(Number(offset.value)) &&
    Math.abs(Number(offset.value)) <= 120_000,
);
const isBusy = computed(() => Boolean(status.value));
const isEstimating = computed(() => status.value === 'estimating');
const canSaveOffset = computed(
  () =>
    !candidate.value &&
    saved.value?.available &&
    validOffset.value &&
    (Number(offset.value) !== saved.value.offsetMs ||
      useSegments.value !== Boolean(saved.value.syncSegments?.length) ||
      (useSegments.value && Boolean(pendingAlignment.value?.token))) &&
    !isBusy.value,
);
const isAcquiring = computed(() =>
  ['importing', 'download', 'validating', 'aligning'].includes(status.value),
);
const sourceLabel = computed(() => {
  if (!sourceResult.value) return '';
  const { title, kind } = sourceResult.value;
  const type = t(`trackVideo.kind.${kind}`);
  return title ? t('trackVideo.sourceSummary', { title, type }) : type;
});

function summary(video) {
  return t('trackVideo.summary', {
    ...video,
    size: formatBytes(video.sizeBytes),
  });
}

function reviewTimes(range) {
  if (!range) return {};
  return {
    start: formatDuration(range.startMs / 1000),
    end: formatDuration(Math.ceil(range.endMs / 1000)),
  };
}

function setSaved(video) {
  if (saved.value?.revision !== video?.revision) {
    timingOpen.value = false;
    referenceOpen.value = false;
    referenceInput.value = '';
  }
  saved.value = video;
  offset.value = video?.offsetMs ?? 0;
  pendingAlignment.value = null;
  useSegments.value = Boolean(video?.syncSegments?.length);
  savedOffsetHint.value = defaultOffsetHint;
}

async function refresh() {
  const result = await api?.getTrackVideo?.(trackId, true);
  if (!active || !result || result.status !== 'ok') return;
  setSaved(result.video);
  fixture.value = result.fixture;
  recorded.value = result.source;
  if (!sourceEdited) sourceInput.value = result.source?.id ?? '';
}
void refresh().catch(() => {
  if (active) error.value = 'unavailable';
});

function poll() {
  const pollTimer = setInterval(async () => {
    try {
      const update = await api.getTrackVideoStatus(trackId);
      if (!active || timer !== pollTimer || update.status === 'idle') return;
      progress.value = update.progress ?? null;
      status.value = update.status;
    } catch {
      // The acquisition result owns the visible error.
    }
  }, 100);
  timer = pollTimer;
}

async function run(kind, action, apply) {
  if (status.value) return;
  error.value = '';
  status.value = kind;
  progress.value = null;
  if (kind === 'choosing' || kind === 'download') poll();
  try {
    const result = await action();
    if (!active) return;
    if (result.status === 'ok' || result.status === 'candidate') apply(result);
    else if (result.status === 'provider-disabled') void providerAllowed(kind);
    else if (result.status !== 'cancelled') error.value = result.status;
  } catch {
    if (active) error.value = 'unavailable';
  } finally {
    clearInterval(timer);
    timer = undefined;
    status.value = '';
  }
}

function resetOffer() {
  offer.value = null;
  selected.value = '';
  permitted.value = false;
}

// Main reports a moved or replaced video as stale; reload before retrying.
async function refreshIfStale(request) {
  const result = await request;
  if (result.status !== 'stale') return result;
  await refresh();
  return { status: 'offset-stale' };
}

function finishApply(result) {
  setSaved(result.video);
  candidate.value = null;
  timingOpen.value = false;
  downloadOpen.value = false;
  resetOffer();
  void nextTick(() => sourceTrigger?.focus());
}

function handleAcquired(result) {
  if (result.status === 'ok') {
    finishApply(result);
    return;
  }
  candidatePlayable.value = false;
  offset.value = result.suggestedOffsetMs ?? 0;
  useSegments.value = Boolean(result.segmentCount);
  timingOpen.value = true;
  candidate.value = result;
}

function editSource(value) {
  sourceEdited = true;
  sourceInput.value = normalizeVideoInput(value);
}

function pasteVideoInput(event, setValue) {
  const value = event.clipboardData?.getData('text/plain');
  if (!value || !extractVideoId(value)) return;
  event.preventDefault();
  const normalized = normalizeVideoInput(value);
  setValue(normalized);
  event.currentTarget.value = normalized;
}

function pasteSource(event) {
  pasteVideoInput(event, editSource);
}

function pick(event) {
  sourceTrigger = event.currentTarget;
  return run('choosing', () => api.pickTrackVideo(trackId), handleAcquired);
}

async function toggleDownload(event) {
  sourceTrigger = event.currentTarget;
  if (!downloadOpen.value && !fixture.value && !(await providerAllowed('open')))
    return;
  downloadOpen.value = !downloadOpen.value;
}

function lookup(id = sourceId.value) {
  offer.value = null;
  selected.value = '';
  return run(
    'working',
    () => api.getTrackVideoFormats(trackId, id),
    (result) => {
      offer.value = result;
      selected.value = result.defaultId ?? '';
    },
  );
}

watch(sourceId, () => {
  previewOpen.value = false;
  resetOffer();
});
watch(
  downloadOpen,
  (open) => {
    if (open) sourcePanel.value?.focusSource();
    else previewOpen.value = false;
  },
  { flush: 'post' },
);
watch(
  candidate,
  (value) => {
    if (value) reviewTitle.value?.focus();
  },
  { flush: 'post' },
);

function preview() {
  return run(
    'working',
    () => api.previewTrackVideoSource(trackId, sourceId.value),
    () => {},
  );
}

function download() {
  previewOpen.value = false;
  return run(
    'download',
    () =>
      api.downloadTrackVideo(
        trackId,
        offer.value.token,
        selected.value,
        permitted.value,
      ),
    handleAcquired,
  );
}

function cancel() {
  void api.cancelTrackVideo(trackId).catch(() => {
    if (active) error.value = 'unavailable';
  });
}

function changeSource() {
  return run(
    'working',
    () => api.cancelTrackVideo(trackId),
    () => {
      candidate.value = null;
      timingOpen.value = false;
      setSaved(saved.value);
      resetOffer();
      void nextTick(() => {
        if (downloadOpen.value) sourcePanel.value?.focusSource();
        else sourceTrigger?.focus();
      });
    },
  );
}

watch(
  referenceOpen,
  (open) => {
    if (open) referenceField.value?.focus();
  },
  { flush: 'post' },
);

function alignSaved() {
  if (!saved.value?.available || (referenceOpen.value && !referenceId.value))
    return;
  return run(
    'estimating',
    () =>
      refreshIfStale(
        api.alignTrackVideo(trackId, saved.value.revision, referenceId.value),
      ),
    (result) => {
      if (result.needsReference) {
        referenceOpen.value = true;
        return;
      }
      if (result.suggestedOffsetMs == null) {
        savedOffsetHint.value = t('trackVideo.offsetUncertain');
        return;
      }
      if (referenceOpen.value) void nextTick(() => offsetField.value?.focus());
      referenceOpen.value = false;
      offset.value = result.suggestedOffsetMs;
      pendingAlignment.value = {
        token: result.alignmentToken,
        segmentCount: result.segmentCount ?? 0,
      };
      useSegments.value = Boolean(result.segmentCount);
      savedOffsetHint.value = t(
        result.reviewRange
          ? 'trackVideo.offsetProvisional'
          : result.segmentCount
            ? 'trackVideo.segmentedReview'
            : result.suggestedOffsetMs === saved.value.offsetMs &&
                !saved.value.syncSegments
              ? 'trackVideo.offsetMatches'
              : 'trackVideo.offsetReview',
        reviewTimes(result.reviewRange),
      );
    },
  );
}

function save() {
  return run(
    'working',
    () =>
      api.saveTrackVideo(
        trackId,
        candidate.value.token,
        Number(offset.value),
        useSegments.value,
      ),
    finishApply,
  );
}

function saveOffset() {
  if (!canSaveOffset.value) return;
  return run(
    'working',
    () =>
      refreshIfStale(
        api.setTrackVideoOffset(
          trackId,
          saved.value.revision,
          Number(offset.value),
          {
            token: useSegments.value
              ? pendingAlignment.value?.token
              : undefined,
            useSegments: useSegments.value,
          },
        ),
      ),
    (result) => setSaved(result.video),
  );
}

async function remove() {
  if (
    !(await confirm({
      title: t('trackVideo.removeTitle'),
      message: t('trackVideo.removeMessage'),
      confirmLabel: t('trackVideo.remove'),
    }))
  )
    return;
  if (active)
    await run(
      'working',
      () => api.removeTrackVideo(trackId),
      (result) => {
        setSaved(result.video);
      },
    );
}

onUnmounted(() => {
  active = false;
  clearInterval(timer);
  if (candidate.value || status.value)
    void api?.cancelTrackVideo?.(trackId).catch(() => {});
});
</script>

<template>
  <div v-if="api?.getTrackVideo" class="track-video-editor">
    <div v-show="!candidate && !isAcquiring" class="track-video-editor__row">
      <UiHint class="track-video-editor__grow">{{
        saved?.available
          ? summary(saved)
          : t(saved ? 'trackVideo.missing' : 'trackVideo.empty')
      }}</UiHint>
      <div class="track-video-editor__actions">
        <UiButton variant="secondary" :disabled="isBusy" @click="pick">
          {{ t('trackVideo.pick') }}
        </UiButton>
        <UiButton
          variant="secondary"
          :active="downloadOpen"
          :disabled="isBusy"
          :aria-expanded="downloadOpen"
          aria-controls="track-video-youtube-source"
          @click="toggleDownload"
          >{{ t('trackVideo.downloadSource') }}</UiButton
        >
        <UiButton
          v-if="saved"
          intent="danger"
          :disabled="isBusy"
          @click="remove"
          >{{ t('trackVideo.remove') }}</UiButton
        >
      </div>
    </div>
    <TrackVideoSourcePanel
      v-if="downloadOpen && !candidate && !isAcquiring"
      ref="sourcePanel"
      v-model:preview-open="previewOpen"
      v-model:selected="selected"
      v-model:permitted="permitted"
      :source-input="sourceInput"
      :source-id="sourceId"
      :source-label="sourceLabel"
      :preview-url="previewUrl"
      :offer="offer"
      :options="options"
      :fixture="fixture"
      :busy="isBusy"
      @edit-source="editSource"
      @paste-source="pasteSource"
      @preview="preview"
      @lookup="lookup"
      @download="download"
    />
    <div
      v-if="isBusy && status !== 'choosing'"
      class="track-video-editor__row"
      aria-live="polite"
    >
      <UiProgress
        class="track-video-editor__grow"
        :label="
          t(
            status === 'download'
              ? 'trackVideo.progress'
              : status === 'aligning' || isEstimating
                ? 'trackVideo.aligning'
                : 'trackVideo.working',
          )
        "
        :value="progress ?? 0"
        :indeterminate="status !== 'download' || progress === null"
        :value-text="
          progress === null
            ? ''
            : t('trackVideo.progressValue', { percent: Math.floor(progress) })
        "
      />
      <div
        v-if="isAcquiring || isEstimating"
        class="track-video-editor__actions"
      >
        <UiButton variant="secondary" @click="cancel">{{
          t('trackVideo.cancel')
        }}</UiButton>
      </div>
    </div>
    <div v-if="candidate" class="track-video-editor__section">
      <UiSeparator decorative />
      <div class="track-video-editor__row">
        <h3
          ref="reviewTitle"
          class="track-video-editor__review-title"
          tabindex="-1"
        >
          {{ t('trackVideo.candidate') }}
        </h3>
        <UiHint>{{ summary(candidate) }}</UiHint>
      </div>
      <UiHint role="status">
        {{ candidateHint }}
      </UiHint>
      <video
        :key="candidate.token"
        class="track-video-editor__preview"
        :src="candidate.url"
        preload="metadata"
        controls
        muted
        playsinline
        @loadedmetadata="candidatePlayable = true"
        @error="
          candidatePlayable = false;
          error = 'invalid-video';
        "
      />
    </div>
    <UiDisclosure
      v-if="candidate || (saved?.available && !downloadOpen && !isAcquiring)"
      v-model:open="timingOpen"
      :label="t('trackVideo.timing')"
    >
      <div v-if="timingOpen" class="track-video-editor__section">
        <UiTextField
          id="track-video-offset"
          ref="offsetField"
          v-model="offset"
          class="track-video-editor__offset"
          type="number"
          step="1"
          min="-120000"
          max="120000"
          :disabled="isBusy"
          :label="t('trackVideo.offset')"
          :hint="offsetHint"
          @keydown.enter.prevent="saveOffset"
        >
          <template v-if="!candidate && !referenceOpen" #action>
            <UiButton
              variant="secondary"
              :disabled="isBusy"
              @click="alignSaved"
            >
              {{ t('trackVideo.autoSync') }}
            </UiButton>
          </template>
        </UiTextField>
        <UiTextField
          v-if="referenceOpen && !candidate"
          id="track-video-reference"
          ref="referenceField"
          :model-value="referenceInput"
          class="track-video-editor__reference"
          :label="t('trackVideo.referenceSource')"
          :error="
            referenceInput.trim() && !referenceId
              ? t('trackVideo.invalidSource')
              : ''
          "
          :disabled="isBusy"
          @update:model-value="referenceInput = normalizeVideoInput($event)"
          @paste="pasteVideoInput($event, (value) => (referenceInput = value))"
          @keydown.enter.prevent="alignSaved"
        >
          <template #action>
            <UiButton
              variant="secondary"
              :disabled="isBusy || !referenceId"
              @click="alignSaved"
            >
              {{ t('trackVideo.autoSync') }}
            </UiButton>
          </template>
        </UiTextField>
        <div v-if="segmentCount || !candidate" class="track-video-editor__row">
          <UiCheckbox
            v-if="segmentCount"
            id="track-video-use-segments"
            v-model="useSegments"
            :label="t('trackVideo.useSegments', { count: segmentCount })"
            :disabled="isBusy"
          />
          <div v-if="!candidate" class="track-video-editor__actions">
            <UiButton
              variant="secondary"
              :disabled="!canSaveOffset"
              @click="saveOffset"
            >
              {{ t('trackVideo.saveOffset') }}
            </UiButton>
          </div>
        </div>
      </div>
    </UiDisclosure>
    <template v-if="candidate">
      <div class="track-video-editor__actions">
        <UiButton
          variant="secondary"
          :disabled="isBusy"
          @click="changeSource"
          >{{ t('trackVideo.changeSource') }}</UiButton
        >
        <UiButton
          variant="accent"
          :disabled="!candidatePlayable || !validOffset || isBusy"
          @click="save"
          >{{ t('trackVideo.apply') }}</UiButton
        >
      </div>
    </template>
    <UiNotice
      v-if="error"
      tone="warning"
      :message="t(`trackVideo.error.${error}`)"
    />
  </div>
</template>

<style scoped>
.track-video-editor,
.track-video-editor__section {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-3);
}
.track-video-editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-inline-start: auto;
  gap: var(--ui-space-2);
}
.track-video-editor__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-3);
}
.track-video-editor__grow {
  flex: 1 1 auto;
  min-inline-size: 0;
}
.track-video-editor__offset {
  inline-size: min(100%, 20rem);
}
.track-video-editor__reference {
  inline-size: min(100%, 28rem);
}
.track-video-editor__review-title {
  margin: 0;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
.track-video-editor__review-title:focus {
  outline: none;
}
.track-video-editor__preview {
  width: 100%;
  max-height: 18rem;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  background: var(--ui-color-surface);
}
</style>
