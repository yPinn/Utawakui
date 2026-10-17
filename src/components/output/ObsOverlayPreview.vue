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
} from 'vue';
import { Copy, UserRound } from '../../icons/index.js';
import streamerPreviewImage from '../../assets/workbench-streamer-guide.png';
import {
  calculateCapturePreviewScale,
  OUTPUT_LYRICS_CAPTURE_SIZE,
} from '../../constants/outputCaptureSizes.js';
import { buildOutputDropUrl } from '../../utils/outputRoutes.js';
import UiIconButton from '../ui/UiIconButton.vue';
import ObsPreviewBackdropToggle from './ObsPreviewBackdropToggle.vue';
import ObsStreamerPreview from './ObsStreamerPreview.vue';
import ObsWidgetCapturePreview from './ObsWidgetCapturePreview.vue';

const props = defineProps({
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
  showLyricsGuide: { type: Boolean, default: true },
});

const emit = defineEmits([
  'update:captureSize',
  'update:previewBackdrop',
  'update:showLyricsGuide',
  'refreshProjection',
]);

const previewReloadToken = claimPreviewReloadToken();
const copyState = shallowRef('idle');
const previewStage = useTemplateRef('previewStage');
const previewScale = shallowRef(1);
const PREVIEW_CANVAS_WIDTH = OUTPUT_LYRICS_CAPTURE_SIZE.width;
const PREVIEW_CANVAS_HEIGHT = OUTPUT_LYRICS_CAPTURE_SIZE.height;
let copyResetTimer = null;
let resizeObserver = null;

const isLyrics = computed(() => props.activeKind === 'lyrics');
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
  if (isLyrics.value) {
    url.pathname = '/overlay/lyrics';
    url.search = '';
    url.hash = '';
    url.searchParams.set('workbench', '1');
    // Opt-in lyrics diagnostics: keep them out of production preview iframes.
    if (import.meta.env.DEV) url.searchParams.set('lyricsDebug', '1');
    url.searchParams.set('backdrop', props.previewBackdrop);
    url.searchParams.set('guide', props.showLyricsGuide ? '1' : '0');
  } else {
    url.searchParams.set('backdrop', props.previewBackdrop);
  }
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
  const availableWidth = previewStage.value?.clientWidth ?? 0;
  const availableHeight = previewStage.value?.clientHeight ?? 0;
  if (availableWidth <= 0 || availableHeight <= 0) return;
  previewScale.value = calculateCapturePreviewScale({
    availableWidth,
    availableHeight,
    captureSize: OUTPUT_LYRICS_CAPTURE_SIZE,
  });
}

function handlePreviewLoad() {
  emit('refreshProjection');
}

function startUrlDrag(event) {
  if (!dropUrl.value || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/uri-list', dropUrl.value);
  event.dataTransfer.setData('text/plain', dropUrl.value);
}

async function copyObsUrl() {
  if (!props.obsUrl) return;
  try {
    if (typeof window.Utawakui?.copyOutputUrl !== 'function') {
      throw new Error('clipboard bridge unavailable');
    }
    await window.Utawakui.copyOutputUrl(props.activeKind);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'error';
  }
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle';
  }, 1800);
}

onMounted(() => {
  measurePreview();
  if (typeof ResizeObserver === 'function' && previewStage.value) {
    resizeObserver = new ResizeObserver(measurePreview);
    resizeObserver.observe(previewStage.value);
  }
});

onBeforeUnmount(() => {
  clearTimeout(copyResetTimer);
  resizeObserver?.disconnect();
});
</script>

<template>
  <section class="obs-overlay-preview" aria-label="Browser Source 預覽">
    <div ref="previewStage" class="obs-overlay-preview__stage">
      <div
        v-if="isLyrics"
        class="obs-overlay-preview__frame"
        :data-backdrop="previewBackdrop"
        :style="previewFrameStyle"
      >
        <ObsStreamerPreview
          v-if="isLyrics && showLyricsGuide && !hasRuntimeTemplate"
          :src="streamerPreviewImage"
        />
        <iframe
          v-if="hasRuntimeTemplate"
          :key="inspectionUrl"
          class="obs-overlay-preview__iframe"
          :src="inspectionUrl"
          :style="previewCanvasStyle"
          :width="PREVIEW_CANVAS_WIDTH"
          :height="PREVIEW_CANVAS_HEIGHT"
          title="Browser Source 即時預覽"
          sandbox="allow-scripts allow-same-origin"
          referrerpolicy="no-referrer"
          @load="handlePreviewLoad"
        />
        <div v-else class="obs-overlay-preview__fallback">
          <span class="obs-overlay-preview__fallback-title">
            {{ preset?.preview?.title ?? 'Preview' }}
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

      <ObsWidgetCapturePreview
        v-else
        :inspection-url="inspectionUrl"
        :selected-size="selectedCaptureSize"
        :supported-sizes="supportedCaptureSizes"
        :preset="preset"
        :backdrop="previewBackdrop"
        @select-size="emit('update:captureSize', $event)"
      />
    </div>

    <div class="obs-overlay-preview__toolbar">
      <div class="obs-overlay-preview__info">
        <p v-if="isLyrics" class="obs-overlay-preview__capture-meta">
          <span>固定</span>
          <strong>
            {{ PREVIEW_CANVAS_WIDTH }} × {{ PREVIEW_CANVAS_HEIGHT }}
          </strong>
        </p>
        <p
          v-if="copyState !== 'idle'"
          class="obs-overlay-preview__feedback"
          :role="copyState === 'error' ? 'alert' : 'status'"
          aria-live="polite"
        >
          <template v-if="copyState === 'copied'"> 已複製 </template>
          <template v-else-if="copyState === 'error'">複製失敗</template>
        </p>
      </div>
      <div class="obs-overlay-preview__actions">
        <UiIconButton
          v-if="isLyrics"
          :icon="UserRound"
          :label="showLyricsGuide ? '隱藏人物參考' : '顯示人物參考'"
          :active="showLyricsGuide"
          :aria-pressed="showLyricsGuide"
          @click="emit('update:showLyricsGuide', !showLyricsGuide)"
        />
        <ObsPreviewBackdropToggle
          :model-value="previewBackdrop"
          @update:model-value="emit('update:previewBackdrop', $event)"
        />
        <UiIconButton
          v-if="obsUrl"
          :icon="Copy"
          label="複製網址"
          title="複製網址，或直接拖進直播軟體"
          :draggable="dropUrl ? 'true' : undefined"
          @click="copyObsUrl"
          @dragstart="startUrlDrag"
        />
      </div>
    </div>
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

.obs-overlay-preview__frame {
  --ui-output-preview-layer-guide: 1;
  --ui-output-preview-layer-output: 2;

  position: relative;
  aspect-ratio: var(--ui-output-preview-aspect-ratio);
  min-width: 0;
  overflow: hidden;
  display: grid;
  justify-self: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: conic-gradient(
      var(--ui-color-surface) 25%,
      var(--ui-color-surface-raised) 0 50%,
      var(--ui-color-surface) 0 75%,
      var(--ui-color-surface-raised) 0
    )
    0 0 / var(--ui-space-6) var(--ui-space-6);
}

.obs-overlay-preview__stage {
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
  position: absolute;
  z-index: var(--ui-output-preview-layer-output);
  inset: 0;
  display: block;
  border: 0;
  background: transparent;
  transform-origin: left top;
}

.obs-overlay-preview__fallback {
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
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-label-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-overlay-preview__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-overlay-preview__actions,
.obs-overlay-preview__info,
.obs-overlay-preview__capture-meta {
  min-width: 0;
  display: flex;
  align-items: center;
}

.obs-overlay-preview__info {
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-3);
}

.obs-overlay-preview__capture-meta,
.obs-overlay-preview__feedback {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.obs-overlay-preview__capture-meta {
  gap: var(--ui-space-2);
}

.obs-overlay-preview__capture-meta strong {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.obs-overlay-preview__actions {
  gap: var(--ui-space-3);
}

.obs-overlay-preview__feedback {
  line-height: var(--ui-line-height-caption);
}
</style>
