<script setup>
import { Check, ICON_SIZE } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import UiTooltip from '../ui/UiTooltip.vue';
import ObsTemplateThumbnail from './ObsTemplateThumbnail.vue';

defineProps({
  preset: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  applied: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  tooltip: { type: String, default: '' },
});

const emit = defineEmits(['select', 'activate']);
</script>

<template>
  <UiTooltip :text="tooltip || preset.name" :described-by="Boolean(tooltip)">
    <template #trigger="{ triggerProps }">
      <button
        v-bind="triggerProps"
        type="button"
        class="obs-template-thumb"
        :class="{
          'obs-template-thumb--active': selected,
          'obs-template-thumb--applied': applied,
        }"
        :aria-pressed="selected"
        :aria-disabled="busy || undefined"
        @click="!busy && emit('select')"
        @dblclick="!busy && emit('activate')"
      >
        <ObsTemplateThumbnail :preset="preset" />
        <span class="obs-template-thumb__body">
          <span class="obs-template-thumb__name">{{ preset.name }}</span>
          <Check
            v-if="applied"
            class="obs-template-thumb__applied"
            :size="ICON_SIZE"
            role="img"
            :aria-label="t('outputPanel.gallery.applied')"
          />
        </span>
      </button>
    </template>
  </UiTooltip>
</template>

<style scoped>
.obs-template-thumb {
  --obs-template-preview-frame-border-width: 0px;
  --obs-template-preview-frame-radius: 0;

  min-inline-size: 0;
  min-block-size: var(--ui-output-template-thumb-min-height);
  display: grid;
  grid-template-rows: auto minmax(min-content, 1fr);
  padding: 0;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.obs-template-thumb:not([aria-disabled='true']):hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.obs-template-thumb[aria-disabled='true'] {
  cursor: wait;
}

.obs-template-thumb:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-template-thumb--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
}

.obs-template-thumb--applied .obs-template-thumb__body {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.obs-template-thumb__body {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  min-block-size: 2lh;
  padding-inline: var(--ui-space-2);
  padding-block: var(--ui-space-1);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-template-thumb__name {
  flex: 1;
  min-inline-size: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.obs-template-thumb__applied {
  flex: none;
}
</style>
