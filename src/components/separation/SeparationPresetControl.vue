<script setup>
import { BadgeCheck, CircleAlert, ICON_SIZE } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';

defineProps({
  hasTrack: { type: Boolean, default: false },
  presetOptions: { type: Array, default: () => [] },
  selectedPresetId: { type: String, required: true },
  presetTitle: { type: String, default: '' },
  inFlight: { type: Boolean, default: false },
  progressPercent: { type: Number, default: 0 },
  hasResult: { type: Boolean, default: false },
  error: { type: String, default: '' },
  label: { type: String, default: '伴奏模型' },
});

const emit = defineEmits(['presetChange', 'generate']);

function handlePresetChange(event) {
  emit('presetChange', event.target.value);
}
</script>

<template>
  <div class="separation-preset-control" role="group" :aria-label="label">
    <span class="separation-preset-control__error-slot">
      <span
        v-if="error"
        class="separation-preset-control__error"
        role="alert"
        tabindex="0"
        :aria-label="error"
        :data-message="error"
      >
        <CircleAlert :size="ICON_SIZE" aria-hidden="true" />
      </span>
    </span>
    <span class="separation-preset-control__label">{{ label }}</span>
    <select
      class="separation-preset-control__select"
      :value="selectedPresetId"
      :disabled="!hasTrack || inFlight"
      aria-label="伴奏分離設定"
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
      aria-label="此模型已產生"
      title="此模型已產生；切換模型可查看其他結果"
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
</template>

<style scoped>
.separation-preset-control {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.separation-preset-control__label {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.separation-preset-control__select {
  width: var(--ui-separation-preset-width);
  height: var(--ui-control-height);
  min-width: var(--ui-separation-preset-width);
  flex: 0 0 var(--ui-separation-preset-width);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.separation-preset-control__select:focus-visible,
.separation-preset-control__error:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.separation-preset-control__state,
.separation-preset-control__action {
  width: var(--ui-separation-action-width);
  min-width: var(--ui-separation-action-width);
  flex: 0 0 var(--ui-separation-action-width);
}

.separation-preset-control__action {
  justify-content: center;
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
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
  color: var(--ui-color-accent);
}

.separation-preset-control__state--complete {
  background: var(--ui-color-accent-soft);
  color: var(--ui-color-accent);
}

.separation-preset-control__error-slot {
  display: inline-flex;
  width: var(--ui-icon-button-size-sm);
  min-width: var(--ui-icon-button-size-sm);
  flex: 0 0 var(--ui-icon-button-size-sm);
  align-items: center;
  justify-content: center;
}

.separation-preset-control__error {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-danger);
}

.separation-preset-control__error::after {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--ui-space-2));
  z-index: var(--ui-z-dropdown);
  width: max-content;
  max-width: 240px;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  box-shadow: var(--ui-shadow-overlay);
  color: var(--ui-color-text);
  content: attr(data-message);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  opacity: 0;
  pointer-events: none;
  white-space: normal;
}

.separation-preset-control__error:hover::after,
.separation-preset-control__error:focus-visible::after {
  opacity: 1;
}
</style>
