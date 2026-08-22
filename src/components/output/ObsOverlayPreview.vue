<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
} from 'vue';
import { Copy, Grid2X2, Moon, Sun } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  error: { type: String, default: '' },
});

const copyState = shallowRef('idle');
const previewFrame = useTemplateRef('previewFrame');
const previewScale = shallowRef(1);
const previewBackdrop = shallowRef('checker');
const PREVIEW_CANVAS_WIDTH = 1280;
const PREVIEW_CANVAS_HEIGHT = 720;
const PREVIEW_BACKDROPS = Object.freeze([
  { id: 'checker', label: '透明背景', icon: Grid2X2 },
  { id: 'dark', label: '暗色背景', icon: Moon },
  { id: 'light', label: '亮色背景', icon: Sun },
]);
let copyResetTimer = null;
let resizeObserver = null;

const isRunning = computed(() => props.outputStatus.running === true);
const hasClients = computed(() => (props.outputStatus.clients ?? 0) > 0);
const statusLabel = computed(() => {
  if (hasClients.value) return 'Browser Source 已連線';
  if (isRunning.value) return '服務可用';
  return '服務已停止';
});
const statusTone = computed(() => {
  if (hasClients.value) return 'success';
  if (isRunning.value) return 'accent';
  return 'muted';
});
const hasRuntimeTemplate = computed(() => Boolean(props.previewUrl));
const inspectionUrl = computed(() => {
  if (!props.previewUrl) return null;
  const url = new URL(props.previewUrl);
  url.searchParams.set('backdrop', previewBackdrop.value);
  return url.toString();
});
const previewCanvasStyle = computed(() => ({
  width: `${PREVIEW_CANVAS_WIDTH}px`,
  height: `${PREVIEW_CANVAS_HEIGHT}px`,
  transform: `scale(${previewScale.value})`,
}));

function measurePreview() {
  const availableWidth = previewFrame.value?.clientWidth ?? 0;
  if (availableWidth > 0) {
    previewScale.value = availableWidth / PREVIEW_CANVAS_WIDTH;
  }
}

async function copyObsUrl() {
  if (!props.obsUrl) return;
  try {
    await navigator.clipboard.writeText(props.obsUrl);
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
  if (typeof ResizeObserver === 'function' && previewFrame.value) {
    resizeObserver = new ResizeObserver(measurePreview);
    resizeObserver.observe(previewFrame.value);
  }
});

onBeforeUnmount(() => {
  clearTimeout(copyResetTimer);
  resizeObserver?.disconnect();
});
</script>

<template>
  <section class="obs-overlay-preview" aria-label="Browser Source 預覽">
    <div
      ref="previewFrame"
      class="obs-overlay-preview__frame"
      :data-tone="preset?.tone"
      :data-backdrop="previewBackdrop"
    >
      <iframe
        v-if="hasRuntimeTemplate"
        class="obs-overlay-preview__iframe"
        :src="inspectionUrl"
        :style="previewCanvasStyle"
        :width="PREVIEW_CANVAS_WIDTH"
        :height="PREVIEW_CANVAS_HEIGHT"
        title="Browser Source 即時預覽"
        sandbox="allow-scripts allow-same-origin"
        referrerpolicy="no-referrer"
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

    <div class="obs-overlay-preview__toolbar">
      <div class="obs-overlay-preview__status">
        <UiChip :tone="statusTone">
          {{ statusLabel }}
        </UiChip>
        <span v-if="hasClients" class="obs-overlay-preview__client-count">
          {{ outputStatus.clients }} 個來源
        </span>
      </div>
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

    <p
      v-if="copyState !== 'idle' || error"
      class="obs-overlay-preview__feedback"
      :role="copyState === 'error' || error ? 'alert' : 'status'"
      aria-live="polite"
    >
      <template v-if="copyState === 'copied'">
        已複製 Browser Source URL
      </template>
      <template v-else-if="copyState === 'error'">無法複製 URL</template>
      <template v-else-if="error">{{ error }}</template>
    </p>
  </section>
</template>

<style scoped>
.obs-overlay-preview {
  inline-size: min(100%, var(--ui-output-workbench-stage-max-width));
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
  justify-self: center;
}

.obs-overlay-preview__frame {
  position: relative;
  inline-size: 100%;
  aspect-ratio: 16 / 9;
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

.obs-overlay-preview__frame[data-backdrop='dark'] {
  background: var(--ui-color-canvas);
}

.obs-overlay-preview__frame[data-backdrop='light'] {
  background: var(--ui-color-overlay-contrast);
}

.obs-overlay-preview__iframe {
  position: absolute;
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
  justify-content: space-between;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-overlay-preview__status {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
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

.obs-overlay-preview__client-count {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-overlay-preview__feedback {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
