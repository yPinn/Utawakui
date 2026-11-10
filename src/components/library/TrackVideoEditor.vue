<script setup>
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import { extractVideoId } from '../../../shared/youtubeVideoId.mjs';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { formatBytes } from '../../utils/format.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';

const { trackId } = defineProps({ trackId: { type: String, required: true } });
const api = window.Utawakui;
const { confirm } = useAppConfirmation();
const saved = shallowRef(null);
const fixture = shallowRef(false);
const offer = shallowRef(null);
const fixtureOffer = computed(() => offer.value?.fixture === true);
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
const downloadOpen = shallowRef(true);
const previewOpen = shallowRef(false);
const previewUrl = computed(() =>
  sourceId.value ? `https://www.youtube.com/embed/${sourceId.value}` : null,
);
const candidate = shallowRef(null);
const candidatePlayable = shallowRef(false);
const offset = shallowRef(0);
const status = shallowRef('');
const progress = shallowRef(null);
const error = shallowRef('');
let active = true;
let timer;

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

function summary(video) {
  return t('trackVideo.summary', {
    ...video,
    size: formatBytes(video.sizeBytes),
  });
}

async function refresh() {
  const result = await api?.getTrackVideo?.(trackId, true);
  if (!active || !result || result.status !== 'ok') return;
  saved.value = result.video;
  fixture.value = result.fixture;
  recorded.value = result.source;
  if (!sourceEdited) sourceInput.value = result.source?.id ?? '';
}
void refresh().catch(() => {
  if (active) error.value = 'unavailable';
});

function poll() {
  timer = setInterval(async () => {
    try {
      const update = await api.getTrackVideoStatus(trackId);
      if (!active || !status.value || update.status === 'idle') return;
      progress.value = update.progress ?? null;
      status.value = update.status;
    } catch {
      // The acquisition result owns the visible error.
    }
  }, 100);
}

async function run(kind, action, apply) {
  if (status.value) return;
  error.value = '';
  status.value = kind;
  progress.value = null;
  if (kind === 'download') poll();
  try {
    const result = await action();
    if (!active) return;
    if (result.status === 'ok' || result.status === 'candidate') apply(result);
    else if (result.status !== 'cancelled') error.value = result.status;
  } catch {
    if (active) error.value = 'unavailable';
  } finally {
    clearInterval(timer);
    status.value = '';
  }
}

function showCandidate(result) {
  candidatePlayable.value = false;
  offset.value = saved.value?.offsetMs ?? 0;
  candidate.value = result;
}

function editSource(value) {
  sourceEdited = true;
  sourceInput.value = value;
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
  permitted.value = false;
  offer.value = null;
  selected.value = '';
});
watch(downloadOpen, (open) => {
  if (!open) previewOpen.value = false;
});

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
    showCandidate,
  );
}

function cancel() {
  candidate.value = null;
  void api.cancelTrackVideo(trackId).catch(() => {
    if (active) error.value = 'unavailable';
  });
}

function save() {
  return run(
    'working',
    () =>
      api.saveTrackVideo(trackId, candidate.value.token, Number(offset.value)),
    (result) => {
      saved.value = result.video;
      candidate.value = null;
    },
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
        saved.value = result.video;
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
    <div class="track-video-editor__source">
      <UiHint class="track-video-editor__source-field">{{
        saved?.available
          ? summary(saved)
          : t(saved ? 'trackVideo.missing' : 'trackVideo.empty')
      }}</UiHint>
      <div class="track-video-editor__actions">
        <UiButton
          :disabled="isBusy || Boolean(candidate)"
          @click="
            run('working', () => api.pickTrackVideo(trackId), showCandidate)
          "
        >
          {{ t('trackVideo.pick') }}
        </UiButton>
        <UiButton
          v-if="saved"
          variant="secondary"
          :disabled="isBusy || Boolean(candidate)"
          @click="remove"
          >{{ t('trackVideo.remove') }}</UiButton
        >
      </div>
    </div>
    <UiDisclosure
      v-model:open="downloadOpen"
      :label="t('trackVideo.downloadSource')"
    >
      <div class="track-video-editor__inputs">
        <div class="track-video-editor__source">
          <UiTextField
            id="track-video-source"
            class="track-video-editor__source-field"
            :model-value="sourceInput"
            :label="t('trackVideo.sourceId')"
            :hint="t('trackVideo.sourceHint')"
            :maxlength="2048"
            :disabled="isBusy || Boolean(candidate)"
            @update:model-value="editSource"
          />
          <div class="track-video-editor__actions">
            <UiButton
              :disabled="!sourceId || isBusy || Boolean(candidate)"
              @click="lookup()"
              >{{ t('trackVideo.formats') }}</UiButton
            >
            <UiButton
              variant="secondary"
              :disabled="!sourceId || isBusy"
              :aria-expanded="previewOpen"
              aria-controls="track-video-youtube-preview"
              @click="previewOpen = !previewOpen"
              >{{
                t(
                  previewOpen
                    ? 'trackVideo.collapsePreview'
                    : 'trackVideo.expandPreview',
                )
              }}</UiButton
            >
            <UiButton
              v-if="fixture"
              variant="secondary"
              :disabled="isBusy || Boolean(candidate)"
              @click="lookup('fixture')"
              >{{ t('trackVideo.fixture') }}</UiButton
            >
          </div>
        </div>
        <div
          v-if="previewOpen && previewUrl"
          id="track-video-youtube-preview"
          class="track-video-editor__inputs"
        >
          <div class="track-video-editor__actions">
            <UiHint>{{ t('trackVideo.youtubeFallback') }}</UiHint>
            <UiButton variant="secondary" :disabled="isBusy" @click="preview">{{
              t('trackVideo.previewSource')
            }}</UiButton>
          </div>
          <iframe
            class="track-video-editor__youtube"
            :src="previewUrl"
            :title="t('trackVideo.youtubePlayer')"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div
          v-if="sourceResult"
          class="track-video-editor__source-result"
          aria-live="polite"
        >
          <UiHint v-if="sourceResult.title">{{ sourceResult.title }}</UiHint>
          <UiHint>{{ t(`trackVideo.kind.${sourceResult.kind}`) }}</UiHint>
          <UiHint v-if="offer && !options.length">{{
            t('trackVideo.error.no-formats')
          }}</UiHint>
        </div>
        <template v-if="options.length">
          <div class="track-video-editor__source">
            <UiSelect
              id="track-video-quality"
              v-model="selected"
              class="track-video-editor__source-field"
              :label="t('trackVideo.quality')"
              :placeholder="t('trackVideo.quality')"
              :options="options"
              :disabled="isBusy || Boolean(candidate)"
            />
            <div class="track-video-editor__actions">
              <UiButton
                :disabled="
                  !selected ||
                  (!permitted && !fixtureOffer) ||
                  isBusy ||
                  Boolean(candidate)
                "
                @click="download"
                >{{ t('trackVideo.download') }}</UiButton
              >
            </div>
          </div>
          <UiCheckbox
            v-if="!fixtureOffer"
            id="track-video-permission"
            v-model="permitted"
            :label="t('trackVideo.permission')"
            :disabled="isBusy || Boolean(candidate)"
          />
        </template>
      </div>
    </UiDisclosure>
    <div v-if="isBusy" class="track-video-editor__inputs" aria-live="polite">
      <UiProgress
        :label="
          t(
            status === 'download'
              ? 'trackVideo.progress'
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
      <UiButton
        v-if="status === 'download' || status === 'validating'"
        variant="secondary"
        @click="cancel"
        >{{ t('trackVideo.cancel') }}</UiButton
      >
    </div>
    <div v-if="candidate" class="track-video-editor__inputs">
      <UiHint>{{ t('trackVideo.candidate') }} {{ summary(candidate) }}</UiHint>
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
      <UiTextField
        id="track-video-offset"
        v-model="offset"
        type="number"
        step="1"
        min="-120000"
        max="120000"
        :label="t('trackVideo.offset')"
        :hint="t('trackVideo.offsetHint')"
      />
      <div class="track-video-editor__actions">
        <UiButton
          variant="accent"
          :disabled="!candidatePlayable || !validOffset || isBusy"
          @click="save"
          >{{ t('trackVideo.apply') }}</UiButton
        >
        <UiButton variant="secondary" :disabled="isBusy" @click="cancel">{{
          t('trackVideo.cancel')
        }}</UiButton>
      </div>
    </div>
    <UiNotice
      v-if="error"
      tone="warning"
      :message="t(`trackVideo.error.${error}`)"
    />
  </div>
</template>

<style scoped>
.track-video-editor,
.track-video-editor__inputs {
  display: grid;
  gap: var(--ui-space-3);
}
.track-video-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.track-video-editor__source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-3);
}
.track-video-editor__source-field {
  flex: 1 1 16rem;
  min-width: 0;
}
.track-video-editor__source-result {
  display: grid;
  gap: var(--ui-space-1);
  overflow-wrap: anywhere;
}
.track-video-editor__youtube {
  display: block;
  inline-size: 100%;
  max-inline-size: 36rem;
  min-block-size: 200px;
  aspect-ratio: 16 / 9;
  margin-inline: auto;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
}
.track-video-editor__inputs > .ui-button {
  justify-self: start;
}
.track-video-editor__preview {
  width: 100%;
  max-height: 18rem;
  background: var(--ui-color-surface);
}
</style>
