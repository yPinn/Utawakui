<script setup>
import { computed } from 'vue';
import { AudioWaveform, Captions, Info } from '../../../icons/index.js';
import UiStatusIcon from '../../ui/UiStatusIcon.vue';
import UiTooltipSurface from '../../ui/tooltip/UiTooltipSurface.vue';
import { useTooltip } from '../../ui/useTooltip.js';

const props = defineProps({
  item: { type: Object, required: true },
});

const icons = {
  lyrics: Captions,
  separation: AudioWaveform,
};
const icon = computed(() => icons[props.item?.id] ?? Info);
const tooltipText = computed(() => `${props.item.label}：${props.item.status}`);
const { open, position, setTooltip, tooltipId, triggerProps } = useTooltip({
  text: tooltipText,
  placement: 'top',
  describedBy: true,
});
</script>

<template>
  <li class="track-capability-matrix__item">
    <div v-bind="triggerProps" class="track-capability-matrix__content">
      <UiStatusIcon
        :icon="icon"
        :tone="item.tone"
        :label="tooltipText"
        decorative
      />
      <span class="track-capability-matrix__copy">
        <span class="track-capability-matrix__label">{{ item.label }}</span>
        <span class="track-capability-matrix__status">{{ item.status }}</span>
      </span>
    </div>
    <UiTooltipSurface
      :open="open"
      :text="tooltipText"
      :detail="item.description"
      :tooltip-id="tooltipId"
      :position="position"
      placement="top"
      :set-element="setTooltip"
    />
  </li>
</template>

<style scoped>
.track-capability-matrix__item,
.track-capability-matrix__content,
.track-capability-matrix__copy {
  min-inline-size: 0;
}

.track-capability-matrix__content,
.track-capability-matrix__copy {
  display: grid;
}

.track-capability-matrix__content {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-1);
}

.track-capability-matrix__copy {
  gap: 0;
}

.track-capability-matrix__label,
.track-capability-matrix__status {
  overflow-wrap: anywhere;
}

.track-capability-matrix__label {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.track-capability-matrix__status {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
</style>
