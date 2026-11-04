<script setup>
import { shallowRef } from 'vue';
import { UnfoldVertical } from '../../icons/index.js';
import { TRACK_LIST_DENSITIES } from '../../composables/useTrackListDensity.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import { t } from '../../utils/i18n.js';

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
    label: t('track.table.spacious'),
  }),
  Object.freeze({
    id: 'compact',
    label: t('track.table.compact'),
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
    :aria-label="t('track.table.density')"
    placement="bottom-end"
    :close-on-scroll="false"
  >
    <template #trigger="{ triggerProps }">
      <UiIconButton
        v-bind="triggerProps"
        :icon="UnfoldVertical"
        :label="t('track.table.adjustDensity')"
        tooltip-placement="bottom"
        :active="open"
        @click="open = !open"
      />
    </template>
    <UiRadioGroup
      name="track-list-density"
      :legend="t('track.table.density')"
      legend-hidden
      :items="densityOptions"
      :model-value="density"
      @update:model-value="updateDensity"
    />
  </UiPopover>
</template>
