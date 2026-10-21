<script setup>
import { computed } from 'vue';
import { useObsIntegration } from '../../composables/useObsIntegration.js';

const { state } = useObsIntegration();
const connected = computed(
  () =>
    !state.statusReadError &&
    ['ready', 'degraded'].includes(state.observed.lifecycle),
);
const live = computed(() => connected.value && state.observed.streaming.active);
const recording = computed(
  () => connected.value && state.observed.recording.active,
);
</script>

<template>
  <span
    v-if="live || recording"
    class="performance-broadcast-status"
    role="status"
    aria-label="OBS 輸出狀態"
  >
    <span v-if="live">LIVE</span>
    <span v-if="recording">REC</span>
  </span>
</template>

<style scoped>
.performance-broadcast-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-live);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  white-space: nowrap;
}
.performance-broadcast-status > span {
  padding-inline: var(--ui-space-1);
  border: var(--ui-border-width) solid currentColor;
  border-radius: var(--ui-radius-xs);
}
</style>
