<script>
let nextPreviewReloadToken = 0;

function claimPreviewReloadToken() {
  nextPreviewReloadToken += 1;
  return String(nextPreviewReloadToken);
}
</script>

<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Copy, EyeOff, Film, UserRound } from '../../icons/index.js';
import { MANGA_WORKBENCH_TARGET_MESSAGE } from '../../../shared/presentation/mangaFrameContract.mjs';
import {
  calculateCapturePreviewScale,
  OUTPUT_LYRICS_CAPTURE_SIZE,
} from '../../constants/outputCaptureSizes.js';
import { buildOutputDropUrl } from '../../utils/outputRoutes.js';
import { useOutputClipboard } from '../../composables/output/useOutputClipboard.js';
import { DEFAULT_PERFORMER_GUIDE } from '../../utils/outputPerformerGuide.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useTrackVideoAsset } from '../../composables/useTrackVideoAsset.js';
import TrackVideoPlayback from '../playback/TrackVideoPlayback.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStack from '../ui/UiStack.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import ObsPreviewBackdropToggle from './ObsPreviewBackdropToggle.vue';
import ObsStreamerPreview from './ObsStreamerPreview.vue';
import ObsPerformerGuideSelection from './ObsPerformerGuideSelection.vue';
import ObsWidgetCapturePreview from './ObsWidgetCapturePreview.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  toolsTarget: { type: Object, default: null },
  preset: { type: Object, default: null },
  activeKind: { type: String, default: null },
  captureSize: { type: String, default: null },
  supportedCaptureSizes: { type: Array, default: () => [] },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  previewBackdrop: {
    type: String,
    default: 'checker',
    validator: (value) => ['checker', 'dark', 'light'].includes(value),
  },
  lyricsPreviewMode: { type: String, default: 'performer' },
  performerGuide: { type: Object, default: () => DEFAULT_PERFORMER_GUIDE },
  performerGuideImage: { type: String, default: null },
  customPerformerGuideImage: { type: Boolean, default: false },
  editingPerformerGuide: { type: Boolean, default: false },
  elementIds: { type: Array, default: () => [] },
  selectedElementId: { type: String, default: 'template' },
});

const emit = defineEmits([
  'update:captureSize',
  'update:previewBackdrop',
  'update:lyricsPreviewMode',
  'previewPerformerGuide',
  'commitPerformerGuide',
  'refreshProjection',
  'selectElement',
]);

const previewReloadToken = claimPreviewReloadToken();
const { copy: copyOutputUrl } = useOutputClipboard();
const previewStage = useTemplateRef('previewStage');
const lyricsFrame = useTemplateRef('lyricsFrame');
const previewInfo = useTemplateRef('previewInfo');
const previewScale = shallowRef(1);
const PREVIEW_CANVAS_WIDTH = OUTPUT_LYRICS_CAPTURE_SIZE.width;
const PREVIEW_CANVAS_HEIGHT = OUTPUT_LYRICS_CAPTURE_SIZE.height;
let resizeObserver = null;

const isLyrics = computed(() => props.activeKind === 'lyrics');
const { state: player } = usePlayer();
const { asset: previewVideo } = useTrackVideoAsset({
  trackId: () => player.track?.id,
  enabled: isLyrics,
});
const previewActions = {
  performer: {
    icon: UserRound,
    label: t('outputPanel.overlay.showPreviewPerformer'),
  },
  mv: { icon: Film, label: t('outputPanel.overlay.showPreviewMv') },
  none: { icon: EyeOff, label: t('outputPanel.overlay.hidePreviewBackground') },
};
const nextPreviewMode = computed(() => {
  if (props.lyricsPreviewMode === 'none') return 'performer';
  return props.lyricsPreviewMode === 'performer' && previewVideo.value
    ? 'mv'
    : 'none';
});
const nextPreviewAction = computed(() => previewActions[nextPreviewMode.value]);
const showPreviewVideo = computed(
  () => props.lyricsPreviewMode === 'mv' && Boolean(previewVideo.value),
);
const previewVideoVisible = shallowRef(false);
watch([showPreviewVideo, () => previewVideo.value?.url], () => {
  previewVideoVisible.value = false;
});
const selectedCaptureSize = computed(
  () => props.captureSize ?? props.supportedCaptureSizes[0] ?? 'small',
);
const dropUrl = computed(() =>
  buildOutputDropUrl(props.obsUrl, props.activeKind, selectedCaptureSize.value),
);
const hasRuntimeTemplate = computed(() => Boolean(props.previewUrl));
const inspectionUrl = computed(() => {
  if (!props.previewUrl) return null;
  const url = new URL(props.previewUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('workbench', '1');
  if (isLyrics.value) {
    url.pathname = '/overlay/lyrics';
    // Opt-in lyrics diagnostics: keep them out of production preview iframes.
    if (import.meta.env.DEV) url.searchParams.set('lyricsDebug', '1');
  }
  // The renderer frame owns the Lyrics backdrop and its local media.
  const iframeBackdrop =
    isLyrics.value || props.previewBackdrop === 'checker'
      ? 'transparent'
      : props.previewBackdrop;
  url.searchParams.set('backdrop', iframeBackdrop);
  if (isLyrics.value) url.searchParams.set('guide', '0');
  url.searchParams.set('reload', previewReloadToken);
  return url.toString();
});
const previewCanvasStyle = computed(() => ({
  width: `${PREVIEW_CANVAS_WIDTH}px`,
  height: `${PREVIEW_CANVAS_HEIGHT}px`,
  transform: `scale(${previewScale.value})`,
}));
const previewFrameStyle = computed(() => ({
  width: `${PREVIEW_CANVAS_WIDTH * previewScale.value}px`,
  height: `${PREVIEW_CANVAS_HEIGHT * previewScale.value}px`,
}));

function measurePreview() {
  const stage = previewStage.value;
  if (!stage) return;
  const styles = getComputedStyle(stage);
  const availableWidth = Math.max(
    0,
    stage.clientWidth -
      parseFloat(styles.paddingLeft) -
      parseFloat(styles.paddingRight),
  );
  const availableHeight = Math.max(
    0,
    stage.clientHeight -
      parseFloat(styles.paddingTop) -
      parseFloat(styles.paddingBottom),
  );
  if (availableWidth <= 0 || availableHeight <= 0) return;
  previewScale.value = calculateCapturePreviewScale({
    availableWidth,
    availableHeight,
    captureSize: OUTPUT_LYRICS_CAPTURE_SIZE,
  });
}

function handlePreviewLoad() {
  sendMangaGuideCenter();
  emit('refreshProjection');
}

function sendMangaGuideCenter() {
  const iframe = lyricsFrame.value;
  if (
    props.preset?.id !== 'manga-frame' ||
    !iframe?.contentWindow ||
    !inspectionUrl.value
  )
    return;
  const { x, y } = props.performerGuide;
  iframe.contentWindow.postMessage(
    { type: MANGA_WORKBENCH_TARGET_MESSAGE, x, y },
    new URL(inspectionUrl.value).origin,
  );
}

watch(
  [
    () => props.preset?.id,
    () => props.performerGuide.x,
    () => props.performerGuide.y,
  ],
  sendMangaGuideCenter,
  { flush: 'post' },
);

function startUrlDrag(event) {
  if (!dropUrl.value || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/uri-list', dropUrl.value);
  event.dataTransfer.setData('text/plain', dropUrl.value);
}

async function copyObsUrl() {
  if (!props.obsUrl) return;
  return copyOutputUrl(props.activeKind);
}

onMounted(() => {
  measurePreview();
  if (typeof ResizeObserver === 'function' && previewStage.value) {
    resizeObserver = new ResizeObserver(measurePreview);
    resizeObserver.observe(previewStage.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <section
    class="obs-overlay-preview"
    :aria-label="t('outputPanel.overlay.label')"
  >
    <div ref="previewStage" class="obs-overlay-preview__stage">
      <div
        v-if="isLyrics"
        class="obs-overlay-preview__canvas-group"
        :style="previewFrameStyle"
      >
        <div
          class="obs-overlay-preview__frame"
          :data-backdrop="previewBackdrop"
        >
          <ObsStreamerPreview
            v-if="
              performerGuideImage &&
              lyricsPreviewMode !== 'none' &&
              (!showPreviewVideo || !previewVideoVisible)
            "
            :src="performerGuideImage"
            :guide="performerGuide"
            :custom-image="customPerformerGuideImage"
          />
          <TrackVideoPlayback
            v-if="showPreviewVideo"
            :key="previewVideo.url"
            class="obs-overlay-preview__video"
            :asset="previewVideo"
            background
            @visibility-change="previewVideoVisible = $event"
          />
          <iframe
            v-if="hasRuntimeTemplate"
            :key="inspectionUrl"
            ref="lyricsFrame"
            class="obs-overlay-preview__iframe"
            :src="inspectionUrl"
            :style="previewCanvasStyle"
            :width="PREVIEW_CANVAS_WIDTH"
            :height="PREVIEW_CANVAS_HEIGHT"
            :title="t('outputPanel.overlay.live')"
            sandbox="allow-scripts allow-same-origin"
            referrerpolicy="no-referrer"
            @load="handlePreviewLoad"
          />
          <div v-else class="obs-overlay-preview__fallback">
            <span class="obs-overlay-preview__fallback-title">
              {{ preset?.preview?.title ?? t('common.preview') }}
            </span>
            <span
              v-for="line in preset?.preview?.lines ?? []"
              :key="line"
              class="obs-overlay-preview__fallback-line"
            >
              {{ line }}
            </span>
          </div>
        </div>
        <ObsPerformerGuideSelection
          v-if="editingPerformerGuide && lyricsPreviewMode === 'performer'"
          :key="performerGuide.shape"
          :guide="performerGuide"
          @preview="emit('previewPerformerGuide', $event)"
          @commit="emit('commitPerformerGuide', $event)"
        />
      </div>
      <ObsWidgetCapturePreview
        v-else
        :metadata-target="previewInfo"
        :inspection-url="inspectionUrl"
        :selected-size="selectedCaptureSize"
        :supported-sizes="supportedCaptureSizes"
        :preset="preset"
        :backdrop="previewBackdrop"
        :template-id="preset?.id ?? null"
        :element-ids="elementIds"
        :selected-element-id="selectedElementId"
        @select-size="emit('update:captureSize', $event)"
        @select-element="emit('selectElement', $event)"
      />
    </div>

    <Teleport :to="toolsTarget || 'body'" :disabled="!toolsTarget">
      <UiStack
        class="obs-overlay-preview__toolbar"
        align="center"
        justify="end"
        :gap="2"
      >
        <div
          ref="previewInfo"
          class="obs-overlay-preview__info"
          data-output-preview-info
        >
          <ObsPreviewCaption
            v-if="isLyrics"
            class="obs-overlay-preview__capture-meta"
            :label="t('outputPanel.overlay.fixed')"
            :width="PREVIEW_CANVAS_WIDTH"
            :height="PREVIEW_CANVAS_HEIGHT"
          />
        </div>
        <UiStack class="obs-overlay-preview__actions" align="center" :gap="3">
          <UiIconButton
            v-if="isLyrics"
            :icon="nextPreviewAction.icon"
            :label="nextPreviewAction.label"
            :data-next-preview-mode="nextPreviewMode"
            @click="emit('update:lyricsPreviewMode', nextPreviewMode)"
          />
          <ObsPreviewBackdropToggle
            :model-value="previewBackdrop"
            @update:model-value="emit('update:previewBackdrop', $event)"
          />
          <UiIconButton
            v-if="obsUrl"
            :icon="Copy"
            :label="t('outputPanel.overlay.copyUrl')"
            :title="t('outputPanel.overlay.copyUrlHint')"
            :draggable="dropUrl ? 'true' : undefined"
            @click="copyObsUrl"
            @dragstart="startUrlDrag"
          />
        </UiStack>
      </UiStack>
    </Teleport>
  </section>
</template>

<style scoped>
.obs-overlay-preview {
  inline-size: min(100%, var(--ui-output-workbench-stage-max-width));
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: var(--ui-space-2);
  justify-self: center;
}

.obs-overlay-preview:has(.obs-overlay-preview__toolbar) {
  grid-template-rows: minmax(0, 1fr) auto;
}

.obs-overlay-preview:not(:has(.obs-overlay-preview__toolbar)) {
  grid-template-rows: minmax(0, 1fr);
}

.obs-overlay-preview__canvas-group {
  --ui-output-preview-layer-guide: 1;
  --ui-output-preview-layer-output: 2;
  --ui-output-preview-layer-selection: 3;

  position: relative;
  isolation: isolate;
  aspect-ratio: var(--ui-output-preview-aspect-ratio);
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
}

.obs-overlay-preview__frame {
  position: relative;
  min-width: 0;
  overflow: hidden;
  display: grid;
  outline: var(--ui-border-width) solid var(--ui-color-border);
  outline-offset: calc(-1 * var(--ui-border-width));
  border-radius: var(--ui-radius-sm);
  background: conic-gradient(
      var(--ui-output-preview-canvas) 25%,
      var(--ui-output-preview-backdrop-dark) 0 50%,
      var(--ui-output-preview-canvas) 0 75%,
      var(--ui-output-preview-backdrop-dark) 0
    )
    0 0 / var(--ui-output-preview-checker-tile)
    var(--ui-output-preview-checker-tile);
}

.obs-overlay-preview__stage {
  box-sizing: border-box;
  padding: var(--ui-output-preview-inset);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.obs-overlay-preview__frame[data-backdrop='dark'] {
  background: var(--ui-color-canvas);
}

.obs-overlay-preview__frame[data-backdrop='light'] {
  background: var(--ui-color-overlay-contrast);
}

.obs-overlay-preview__iframe {
  /* Match the Overlay document, preserving transparency in dark app chrome. */
  color-scheme: normal;
  position: absolute;
  z-index: var(--ui-output-preview-layer-output);
  inset: 0;
  display: block;
  border: 0;
  background: transparent;
  transform-origin: left top;
}

.obs-overlay-preview__video {
  position: absolute;
  z-index: var(--ui-output-preview-layer-guide);
  inset: 0;
  pointer-events: none;
}

.obs-overlay-preview__fallback {
  position: relative;
  z-index: var(--ui-output-preview-layer-output);
  display: grid;
  align-content: end;
  gap: var(--ui-space-2);
  min-width: 0;
  padding: var(--ui-space-4);
  background: transparent;
}

.obs-overlay-preview__fallback-title {
  justify-self: start;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-title-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-overlay-preview__fallback-line {
  min-width: 0;
  overflow: hidden;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-overlay-preview__toolbar {
  min-width: 0;
}

.obs-overlay-preview__info {
  min-width: 0;
  display: flex;
  align-items: center;
}

.obs-overlay-preview__info {
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-3);
}

.obs-overlay-preview__actions {
  min-width: 0;
}
</style>
