<script setup>
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { Copy } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  previewUrl: { type: String, default: null },
  obsUrl: { type: String, default: null },
  error: { type: String, default: '' },
});

const copyState = shallowRef('idle');
let copyResetTimer = null;

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
      <UiButton
        v-if="obsUrl"
        :icon="Copy"
        title="複製目前類型的 Browser Source URL"
        aria-label="複製目前類型的 Browser Source URL"
        @click="copyObsUrl"
      />
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
  inline-size: 100%;
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

.obs-overlay-preview__status {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
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
