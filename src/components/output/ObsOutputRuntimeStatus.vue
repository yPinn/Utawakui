<script setup>
import { computed } from 'vue';
import { Play, Power } from '../../icons/index.js';
import { describeOutputRuntimeStatus } from '../../utils/outputRuntimeStatus.js';
import UiButton from '../ui/UiButton.vue';
import UiTooltip from '../ui/UiTooltip.vue';

const props = defineProps({
  outputStatus: { type: Object, default: () => ({ running: false }) },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['start', 'stop']);

const runtimeStatus = computed(() =>
  describeOutputRuntimeStatus(props.outputStatus),
);
</script>

<template>
  <section class="obs-output-runtime-status" aria-label="輸出狀態">
    <UiTooltip
      :text="`${runtimeStatus.label}：${runtimeStatus.detail}`"
      placement="bottom"
    >
      <template #trigger="{ triggerProps }">
        <span
          v-bind="triggerProps"
          class="obs-output-runtime-status__dot"
          :data-tone="runtimeStatus.tone"
          role="img"
          tabindex="0"
          :aria-label="`${runtimeStatus.label}。${runtimeStatus.detail}`"
        />
      </template>
    </UiTooltip>

    <UiButton
      v-if="!outputStatus.running"
      class="obs-output-runtime-status__command"
      :icon="Play"
      variant="accent"
      :disabled="busy"
      @click="emit('start')"
    >
      啟動
    </UiButton>
    <UiButton
      v-else
      class="obs-output-runtime-status__command"
      :icon="Power"
      variant="secondary"
      :disabled="busy"
      @click="emit('stop')"
    >
      停止
    </UiButton>
  </section>
</template>

<style scoped>
.obs-output-runtime-status {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-output-runtime-status__dot:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-output-runtime-status__command {
  min-width: var(--ui-output-settings-command-button-width);
  justify-content: center;
}

.obs-output-runtime-status__dot {
  inline-size: var(--ui-space-3);
  block-size: var(--ui-space-3);
  flex: 0 0 auto;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-text-muted);
}

.obs-output-runtime-status__dot[data-tone='accent'] {
  background: var(--ui-color-accent);
}

.obs-output-runtime-status__dot[data-tone='success'] {
  background: var(--ui-color-success);
}

.obs-output-runtime-status__dot[data-tone='warning'] {
  background: var(--ui-color-warning);
}

.obs-output-runtime-status__dot[data-tone='danger'] {
  background: var(--ui-color-danger);
}
</style>
