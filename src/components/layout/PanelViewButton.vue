<script setup>
import { computed } from 'vue';
import { Maximize2, Minimize2 } from '../../icons/index.js';
import { usePanelView } from '../../composables/usePanelView.js';
import UiIconButton from '../ui/UiIconButton.vue';
const props = defineProps({ panelId: { type: String, default: undefined } });
const view = usePanelView();
const maximized = computed(() =>
  props.panelId
    ? view.maximizedId.value === props.panelId
    : Boolean(view.maximizedId.value),
);
</script>
<template>
  <UiIconButton
    :icon="maximized ? Minimize2 : Maximize2"
    :label="maximized ? '還原面板' : '放大面板'"
    :active="maximized"
    :disabled="!view.hasTarget(props.panelId)"
    :aria-pressed="maximized"
    aria-keyshortcuts="`"
    @click="view.toggle(props.panelId)"
  />
</template>
