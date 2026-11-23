<script setup>
import { computed, useTemplateRef, watch } from 'vue';
import ObsTemplateTile from './ObsTemplateTile.vue';

const props = defineProps({
  presets: { type: Array, required: true },
  favoriteIds: { type: Set, default: () => new Set() },
  activeId: { type: String, default: null },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);
const strip = useTemplateRef('strip');
const orderedPresets = computed(() =>
  props.presets.toSorted(
    (a, b) =>
      Number(props.favoriteIds.has(b.id)) - Number(props.favoriteIds.has(a.id)),
  ),
);

function select(id) {
  if (id !== props.activeId) emit('select', id);
}

watch(
  [() => props.activeId, strip],
  ([activeId, node], [, previousNode], onCleanup) => {
    if (!activeId || !node) return;
    const frame = requestAnimationFrame(() => {
      // On entry, let the user see their favorites before following active changes.
      if (!previousNode && props.favoriteIds.has(orderedPresets.value[0]?.id))
        return;
      node
        .querySelector('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', container: 'nearest' });
    });
    onCleanup(() => cancelAnimationFrame(frame));
  },
  { flush: 'post' },
);
</script>

<template>
  <div ref="strip" class="obs-template-filmstrip">
    <ObsTemplateTile
      v-for="preset in orderedPresets"
      :key="preset.id"
      :preset="preset"
      :selected="preset.id === activeId"
      :applied="preset.id === activeId"
      :busy="busy"
      @select="select(preset.id)"
    />
  </div>
</template>

<style scoped>
.obs-template-filmstrip {
  --_filmstrip-perforations: repeating-linear-gradient(
    to bottom,
    var(--ui-color-border-strong) 0 var(--ui-space-1),
    transparent var(--ui-space-1) var(--ui-space-3)
  );

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--ui-space-3);
  min-inline-size: 0;
  margin-block: var(--ui-space-2) var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-sm);
  background:
    var(--_filmstrip-perforations) left var(--ui-space-1) top /
      var(--ui-space-1) 100% no-repeat,
    var(--_filmstrip-perforations) right var(--ui-space-1) top /
      var(--ui-space-1) 100% no-repeat,
    var(--ui-color-canvas);
}
</style>
