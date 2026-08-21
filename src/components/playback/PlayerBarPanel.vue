<script setup>
import { X } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  status: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  closeLabel: { type: String, default: '關閉面板' },
});

const emit = defineEmits(['close']);
</script>

<template>
  <aside
    v-show="open"
    class="player-bar-panel"
    :aria-label="ariaLabel || title"
  >
    <header class="player-bar-panel__header">
      <div class="player-bar-panel__heading">
        <h2 class="player-bar-panel__title">{{ title }}</h2>
        <p v-if="status" class="player-bar-panel__status">{{ status }}</p>
      </div>
      <UiButton
        :icon="X"
        :aria-label="closeLabel"
        :title="closeLabel"
        @click="emit('close')"
      />
    </header>

    <slot />
  </aside>
</template>

<style scoped>
.player-bar-panel {
  position: fixed;
  right: var(--ui-player-bar-panel-edge-offset);
  bottom: calc(
    var(--ui-player-bar-height) + var(--ui-player-bar-panel-edge-offset)
  );
  z-index: var(--ui-z-dropdown);
  width: min(
    var(--ui-player-bar-panel-width),
    calc(
      100vw - var(--ui-player-bar-panel-edge-offset) -
        var(--ui-player-bar-panel-edge-offset)
    )
  );
  max-height: min(
    var(--ui-player-bar-panel-max-height),
    calc(100vh - var(--ui-player-bar-panel-viewport-offset))
  );
  overflow: auto;
  padding: var(--ui-player-bar-panel-padding);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-overlay);
}

.player-bar-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}

.player-bar-panel__heading {
  min-width: 0;
}

.player-bar-panel__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.player-bar-panel__status {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}
</style>
