<script setup>
import { computed, useId } from 'vue';
import { BadgeCheck, ICON_SIZE } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTooltip from '../ui/UiTooltip.vue';

const props = defineProps({
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
const selectId = `separation-preset-${useId()}`;
const selectOptions = computed(() =>
  props.presetOptions.map((preset) => ({
    value: preset.id,
    label: preset.label,
  })),
);
</script>

<template>
  <div class="separation-preset-control" role="group" :aria-label="label">
    <div class="separation-preset-control__row">
      <span class="separation-preset-control__label">{{ label }}</span>
      <UiTooltip :text="presetTitle" :disabled="!presetTitle">
        <template #trigger="{ triggerProps }">
          <UiSelect
            v-bind="triggerProps"
            :id="selectId"
            class="separation-preset-control__select"
            label="伴奏處理模式"
            label-hidden
            :model-value="selectedPresetId"
            :options="selectOptions"
            :disabled="!hasTrack || inFlight"
            @update:model-value="emit('presetChange', $event)"
          />
        </template>
      </UiTooltip>

      <span
        v-if="inFlight"
        class="separation-preset-control__state separation-preset-control__state--progress"
        role="status"
        :aria-label="`伴奏處理進度 ${progressPercent}%`"
      >
        {{ progressPercent }}%
      </span>
      <UiTooltip
        v-else-if="hasResult"
        text="此模式已產生；切換模式可查看其他結果"
      >
        <template #trigger="{ triggerProps }">
          <span
            v-bind="triggerProps"
            class="separation-preset-control__state separation-preset-control__state--complete"
            role="status"
            tabindex="0"
            aria-label="此模式已產生；切換模式可查看其他結果"
          >
            <BadgeCheck :size="ICON_SIZE" aria-hidden="true" />
          </span>
        </template>
      </UiTooltip>
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
  --separation-preset-mode-min-width: 8.5rem;

  display: grid;
  grid-template-columns:
    max-content minmax(var(--separation-preset-mode-min-width), 1fr)
    max-content;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.separation-preset-control__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.separation-preset-control__select {
  min-inline-size: 0;
}

.separation-preset-control__action {
  width: max-content;
}

.separation-preset-control__state {
  display: inline-flex;
  height: var(--ui-control-height);
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
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
