<script setup>
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import UiSelect from '../ui/UiSelect.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  id: { type: String, required: true },
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true },
  stacked: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const label = t('outputPanel.workbench.target');
</script>

<template>
  <ObsAppearanceControlRow
    class="obs-inspector-target"
    :control-id="id"
    :label="label"
    :labels-control="false"
    :stacked="stacked"
  >
    <UiSelect
      :id="id"
      :label="label"
      :model-value="modelValue"
      :options="options"
      label-hidden
      @update:model-value="emit('update:modelValue', $event)"
    />
  </ObsAppearanceControlRow>
</template>

<style scoped>
.obs-inspector-target {
  padding-block: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}
</style>
