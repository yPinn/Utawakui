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
import { Copy, Grid2X2, Moon, Sun } from '../../icons/index.js';
import streamerPreviewImage from '../../assets/workbench-streamer-guide.png';
import { OUTPUT_LYRICS_CAPTURE_SIZE } from '../../constants/outputCaptureSizes.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import ObsStreamerPreview from './ObsStreamerPreview.vue';
import ObsWidgetCapturePreview from './ObsWidgetCapturePreview.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  activeKind: { type: String, default: null },
  captureSize: { type: String, default: null },
  supportedCaptureSizes: { type: Array, default: () => [] },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
});

const emit = defineEmits(['update:captureSize', 'refreshProjection']);

const previewReloadToken = claimPreviewReloadToken();
const copyState = shallowRef('idle');
const previewStage = useTemplateRef('previewStage');
const previewScale = shallowRef(1);
const previewBackdrop = shallowRef('checker');
const PREVIEW_CANVAS_WIDTH = OUTPUT_LYRICS_CAPTURE_SIZE.width;
const PREVIEW_CANVAS_HEIGHT = OUTPUT_LYRICS_CAPTURE_SIZE.height;
const PREVIEW_BACKDROPS = Object.freeze([
  { id: 'checker', label: '透明背景', icon: Grid2X2 },
  { id: 'dark', label: '暗色背景', icon: Moon },
  { id: 'light', label: '亮色背景', icon: Sun },
]);
let copyResetTimer = null;
let resizeObserver = null;

const isLyrics = computed(() => props.activeKind === 'lyrics');
const selectedCaptureSize = computed(
  () => props.captureSize ?? props.supportedCaptureSizes[0] ?? 'small',
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
    url.searchParams.set('backdrop', previewBackdrop.value);
  } else {
    url.searchParams.set('backdrop', previewBackdrop.value);
  }
  url.searchParams.set('reload', previewReloadToken);
  return url.toString();
});
const previewCanvasStyle = computed(() => ({
  width: `${PREVIEW_CANVAS_WIDTH}px`,
  height: `${PREVIEW_CANVAS_HEIGHT}px`,
  transform: `scale(${previewScale.value})`,
}));

function measurePreview() {
  const availableWidth = previewStage.value?.clientWidth ?? 0;
  if (availableWidth > 0) {
    previewScale.value = availableWidth / PREVIEW_CANVAS_WIDTH;
  }
}

function handlePreviewLoad() {
  emit('refreshProjection');
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
        :data-tone="preset?.tone"
        :data-backdrop="previewBackdrop"
      >
        <ObsStreamerPreview
          v-if="!hasRuntimeTemplate"
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
      <p
        v-if="copyState !== 'idle'"
        class="obs-overlay-preview__feedback"
        :role="copyState === 'error' ? 'alert' : 'status'"
        aria-live="polite"
      >
        <template v-if="copyState === 'copied'">
          已複製 Browser Source URL
        </template>
        <template v-else-if="copyState === 'error'">無法複製 URL</template>
      </p>
      <div class="obs-overlay-preview__actions">
        <div
          class="obs-overlay-preview__backdrops"
          role="group"
          aria-label="預覽背景"
        >
          <UiIconButton
            v-for="backdrop in PREVIEW_BACKDROPS"
            :key="backdrop.id"
            :icon="backdrop.icon"
            :label="backdrop.label"
            :active="previewBackdrop === backdrop.id"
            :aria-pressed="previewBackdrop === backdrop.id"
            size="sm"
            @click="previewBackdrop = backdrop.id"
          />
        </div>
        <UiButton
          v-if="obsUrl"
          :icon="Copy"
          title="複製目前類型的 Browser Source URL"
          aria-label="複製目前類型的 Browser Source URL"
          @click="copyObsUrl"
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
  inline-size: 100%;
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
  background: var(--ui-color-canvas);
}

.obs-overlay-preview__frame[data-tone='stage'] .obs-overlay-preview__fallback {
  background: var(--ui-color-surface-playing);
}

.obs-overlay-preview__frame[data-tone='lyrics'] .obs-overlay-preview__fallback {
  background: var(--ui-color-surface-selected);
}

.obs-overlay-preview__fallback-title {
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-title);
}

.obs-overlay-preview__fallback-line {
  min-width: 0;
  overflow: hidden;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
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
.obs-overlay-preview__backdrops {
  min-width: 0;
  display: flex;
  align-items: center;
}

.obs-overlay-preview__actions {
  gap: var(--ui-space-3);
}

.obs-overlay-preview__backdrops {
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.obs-overlay-preview__feedback {
  margin: 0;
  margin-inline-end: auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
