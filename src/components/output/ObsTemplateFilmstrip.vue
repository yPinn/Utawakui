<script setup>
import { useTemplateRef, watchPostEffect } from 'vue';
import { Check, ICON_SIZE } from '../../icons/index.js';
import UiTooltip from '../ui/UiTooltip.vue';
import ObsTemplateThumbnail from './ObsTemplateThumbnail.vue';

const props = defineProps({
  presets: { type: Array, required: true },
  activeId: { type: String, default: null },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);
const strip = useTemplateRef('strip');

function select(id) {
  if (!props.busy && id !== props.activeId) emit('select', id);
}

watchPostEffect((onCleanup) => {
  if (!props.activeId || !strip.value) return;
  const frame = requestAnimationFrame(() => {
    strip.value
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', container: 'nearest' });
  });
  onCleanup(() => cancelAnimationFrame(frame));
});
</script>

<template>
  <div ref="strip" class="obs-template-filmstrip">
    <UiTooltip
      v-for="preset in presets"
      :key="preset.id"
      :text="preset.name"
      :described-by="false"
    >
      <template #trigger="{ triggerProps }">
        <button
          v-bind="triggerProps"
          type="button"
          class="obs-template-filmstrip__frame"
          :aria-pressed="preset.id === activeId"
          :aria-disabled="busy || undefined"
          @click="select(preset.id)"
        >
          <ObsTemplateThumbnail :preset="preset" aria-hidden="true" />
          <span class="obs-template-filmstrip__caption">
            <span class="obs-template-filmstrip__name">{{ preset.name }}</span>
            <Check
              v-if="preset.id === activeId"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
          </span>
        </button>
      </template>
    </UiTooltip>
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

.obs-template-filmstrip__frame {
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.obs-template-filmstrip__frame:not([aria-disabled='true']):hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.obs-template-filmstrip__frame[aria-disabled='true'] {
  cursor: wait;
}

.obs-template-filmstrip__frame[aria-pressed='true'] {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
}

.obs-template-filmstrip__frame:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-template-filmstrip__caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  min-inline-size: 0;
  padding: var(--ui-space-1);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-template-filmstrip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-filmstrip__caption svg {
  flex: none;
  color: var(--ui-color-accent);
}
</style>
