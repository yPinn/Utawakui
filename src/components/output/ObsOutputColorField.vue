<script setup>
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import UiColorField from '../ui/UiColorField.vue';

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  paletteTarget: { type: Boolean, default: false },
  stacked: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['activate', 'update:modelValue', 'commit']);
</script>

<template>
  <div
    class="obs-output-color-field"
    :class="{ 'obs-output-color-field--compact': compact }"
    :data-palette-target="paletteTarget || undefined"
    @focusin="emit('activate')"
    @click="emit('activate')"
  >
    <ObsAppearanceControlRow
      class="obs-output-color-field__controls"
      :control-id="id"
      :label="label"
      :labels-control="false"
      :stacked="stacked"
    >
      <UiColorField
        :id="id"
        :label="label"
        :model-value="modelValue"
        label-hidden
        :stretch="stacked"
        :align="stacked ? 'start' : 'end'"
        @update:model-value="emit('update:modelValue', $event)"
        @commit="emit('commit', $event)"
      />
    </ObsAppearanceControlRow>
  </div>
</template>

<style scoped>
.obs-output-color-field {
  min-width: 0;
}

.obs-output-color-field:not(.obs-output-color-field--compact)
  > .obs-output-color-field__controls:not(
    .obs-appearance-control-row--stacked
  ) {
  grid-template-columns: minmax(0, max-content) minmax(
      var(--ui-field-color-inline-size),
      1fr
    );
  gap: var(--ui-space-2);
}

.obs-output-color-field[data-palette-target]
  :deep(.obs-appearance-control-row__label) {
  color: var(--ui-color-text);
}
</style>
