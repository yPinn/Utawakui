<script setup>
import { BadgeCheck, ICON_SIZE } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  hasTrack: { type: Boolean, default: false },
  presetOptions: { type: Array, default: () => [] },
  selectedPresetId: { type: String, required: true },
  presetTitle: { type: String, default: '' },
  inFlight: { type: Boolean, default: false },
  progressPercent: { type: Number, default: 0 },
  hasResult: { type: Boolean, default: false },
  error: { type: String, default: '' },
  label: { type: String, default: '處理模式' },
});

const emit = defineEmits(['presetChange', 'generate']);

function handlePresetChange(event) {
  emit('presetChange', event.target.value);
}
</script>

<template>
  <div class="separation-preset-control" role="group" :aria-label="label">
    <div class="separation-preset-control__row">
      <span class="separation-preset-control__label">{{ label }}</span>
      <select
        class="separation-preset-control__select"
        :value="selectedPresetId"
        :disabled="!hasTrack || inFlight"
        aria-label="伴奏處理模式"
        :title="presetTitle"
        @change="handlePresetChange"
      >
        <option
          v-for="preset in presetOptions"
          :key="preset.id"
          :value="preset.id"
        >
          {{ preset.label }}
        </option>
      </select>

      <span
        v-if="inFlight"
        class="separation-preset-control__state separation-preset-control__state--progress"
        role="status"
        :aria-label="`伴奏處理進度 ${progressPercent}%`"
      >
        {{ progressPercent }}%
      </span>
      <span
        v-else-if="hasResult"
        class="separation-preset-control__state separation-preset-control__state--complete"
        role="status"
        aria-label="此模式已產生"
        title="此模式已產生；切換模式可查看其他結果"
      >
        <BadgeCheck :size="ICON_SIZE" aria-hidden="true" />
      </span>
      <UiButton
        v-else
        class="separation-preset-control__action"
        variant="accent"
        :disabled="!hasTrack"
        aria-label="產生伴奏"
        title="產生可調整導唱強弱的伴奏版本"
        @click="emit('generate')"
      >
        產生
      </UiButton>
    </div>
    <UiNotice v-if="error" tone="danger" :message="error" compact />
  </div>
</template>

<style scoped>
.separation-preset-control {
  display: grid;
  min-width: 0;
  gap: var(--ui-space-2);
}

.separation-preset-control__row {
  display: grid;
  grid-template-columns:
    max-content minmax(var(--ui-separation-mode-min-width), 1fr)
    max-content;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.separation-preset-control__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.separation-preset-control__select {
  box-sizing: border-box;
  inline-size: 100%;
  max-inline-size: 100%;
  height: var(--ui-control-height);
  min-inline-size: 0;
  padding-inline: var(--ui-space-2) var(--ui-space-5);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.separation-preset-control__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.separation-preset-control__action {
  width: max-content;
}

.separation-preset-control__state {
  display: inline-flex;
  height: var(--ui-control-height);
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  font-variant-numeric: tabular-nums;
}

.separation-preset-control__state--progress {
  min-width: var(--ui-control-height);
  padding-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
  color: var(--ui-color-accent);
}

.separation-preset-control__state--complete {
  width: var(--ui-control-height);
  background: var(--ui-color-accent-soft);
  color: var(--ui-color-accent);
}
</style>
