<script setup>
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import UiColorField from '../ui/UiColorField.vue';

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  modified: { type: Boolean, default: false },
  paletteTarget: { type: Boolean, default: false },
});

const emit = defineEmits(['activate', 'update:modelValue', 'commit']);
</script>

<template>
  <div
    class="obs-output-color-field"
    :data-palette-target="paletteTarget || undefined"
    @focusin="emit('activate')"
    @click="emit('activate')"
  >
    <ObsAppearanceControlRow
      class="obs-output-color-field__controls"
      :control-id="id"
      :label="label"
      :labels-control="false"
      :modified="modified"
    >
      <UiColorField
        :id="id"
        :label="label"
        :model-value="modelValue"
        label-hidden
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

.obs-output-color-field > .obs-output-color-field__controls {
  grid-template-columns: minmax(0, max-content) minmax(
      calc(
        var(--ui-control-height) + var(--ui-space-2) +
          var(--ui-field-hex-value-inline-size)
      ),
      1fr
    );
  gap: var(--ui-space-2);
}

.obs-output-color-field__controls :deep(.obs-appearance-control-row__label) {
  position: relative;
  overflow-wrap: anywhere;
}

.obs-output-color-field__controls :deep(.ui-color-field) {
  margin-inline-start: auto;
}

.obs-output-color-field__controls :deep(.obs-appearance-control-row__modified) {
  position: absolute;
  inset-block: 0;
  inset-inline-end: calc(100% + var(--ui-space-1) / 2);
  margin: auto 0;
}

.obs-output-color-field[data-palette-target]
  :deep(.obs-appearance-control-row__label) {
  color: var(--ui-color-text);
}
</style>
