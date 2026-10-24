<script setup>
import { shallowRef } from 'vue';
import { ListMusic } from '../../icons/index.js';
import { TRACK_LIST_DENSITIES } from '../../composables/useTrackListDensity.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';

defineProps({
  density: {
    type: String,
    default: 'list',
    validator: (value) => TRACK_LIST_DENSITIES.includes(value),
  },
});

const emit = defineEmits(['updateDensity']);
const open = shallowRef(false);
const densityOptions = Object.freeze([
  Object.freeze({
    id: 'list',
    label: '疏散',
  }),
  Object.freeze({
    id: 'compact',
    label: '緊密',
  }),
]);

function updateDensity(value) {
  if (!TRACK_LIST_DENSITIES.includes(value)) return;
  emit('updateDensity', value);
}
</script>

<template>
  <UiPopover
    v-model:open="open"
    aria-label="曲目顯示密度"
    placement="bottom-end"
    :close-on-scroll="false"
  >
    <template #trigger="{ triggerProps }">
      <UiIconButton
        v-bind="triggerProps"
        :icon="ListMusic"
        label="調整曲目顯示密度"
        tooltip-placement="bottom"
        :active="open"
        @click="open = !open"
      />
    </template>
    <UiRadioGroup
      name="track-list-density"
      legend="曲目顯示密度"
      legend-hidden
      :items="densityOptions"
      :model-value="density"
      @update:model-value="updateDensity"
    />
  </UiPopover>
</template>
