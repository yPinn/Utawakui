<script setup>
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { Copy, Play, Square } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  supported: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['start', 'stop']);
const copyState = shallowRef('idle');
let copyResetTimer = null;

const isRunning = computed(() => props.outputStatus.running === true);
const hasRuntimeTemplate = computed(() => Boolean(props.previewUrl));

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

onBeforeUnmount(() => clearTimeout(copyResetTimer));
</script>

<template>
  <section class="obs-overlay-preview" aria-label="Browser Source 預覽">
    <div class="obs-overlay-preview__frame" :data-tone="preset?.tone">
      <iframe
        v-if="hasRuntimeTemplate"
        class="obs-overlay-preview__iframe"
        :src="previewUrl"
        title="OBS Overlay 即時預覽"
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
      <UiChip :tone="isRunning ? 'accent' : 'muted'">
        {{ isRunning ? '輸出中' : '未啟用' }}
      </UiChip>
      <UiButton
        v-if="!isRunning"
        :icon="Play"
        variant="accent"
        :disabled="busy || !supported"
        @click="emit('start')"
      >
        啟用預覽
      </UiButton>
      <UiButton v-else :icon="Square" :disabled="busy" @click="emit('stop')">
        停止輸出
      </UiButton>
    </div>

    <div v-if="obsUrl" class="obs-overlay-preview__url-row">
      <label class="visually-hidden" for="obs-overlay-url">OBS URL</label>
      <input
        id="obs-overlay-url"
        class="obs-overlay-preview__url"
        type="text"
        :value="obsUrl"
        readonly
      />
      <UiButton
        :icon="Copy"
        title="複製 OBS URL"
        aria-label="複製 OBS URL"
        @click="copyObsUrl"
      />
    </div>
    <p class="obs-overlay-preview__feedback" aria-live="polite">
      <template v-if="copyState === 'copied'">已複製 OBS URL</template>
      <template v-else-if="copyState === 'error'">無法複製 URL</template>
      <template v-else-if="error">{{ error }}</template>
    </p>
  </section>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.obs-overlay-preview {
  display: grid;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-overlay-preview__frame {
  inline-size: min(100%, var(--ui-output-gallery-preview-max-width));
  aspect-ratio: 16 / 9;
  min-width: 0;
  overflow: hidden;
  display: grid;
  justify-self: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
}

.obs-overlay-preview__iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
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

.obs-overlay-preview__url-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ui-space-1);
  min-width: 0;
}

.obs-overlay-preview__url {
  min-width: 0;
  height: var(--ui-control-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
}

.obs-overlay-preview__url:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-overlay-preview__feedback {
  min-height: 1.25rem;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
