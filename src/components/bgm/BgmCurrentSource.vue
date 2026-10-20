<script setup>
import { useTemplateRef } from 'vue';
import { Music2 } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

defineProps({
  track: { type: Object, default: null },
  status: { type: Object, default: null },
  pickerExpanded: { type: Boolean, default: false },
  pickerControls: { type: String, default: '' },
});
const emit = defineEmits(['togglePicker']);
const pickerButton = useTemplateRef('pickerButton');
defineExpose({ focusPicker: () => pickerButton.value?.$el?.focus() });
</script>

<template>
  <div class="bgm-current-source" aria-label="目前 BGM">
    <UiTrackThumb
      :track="track"
      class="bgm-current-source__artwork"
      size="var(--ui-track-row-thumb-size)"
      radius="var(--ui-radius-sm)"
    >
      <Music2 aria-hidden="true" />
    </UiTrackThumb>
    <div class="bgm-current-source__copy">
      <div class="bgm-current-source__identity">
        <strong>{{ track?.title ?? '尚未選擇 BGM' }}</strong>
        <UiButton
          ref="pickerButton"
          class="bgm-current-source__change"
          :active="pickerExpanded"
          :aria-expanded="pickerExpanded"
          :aria-controls="pickerControls || undefined"
          @click="emit('togglePicker')"
        >
          {{ track ? '更換' : '選擇' }}
        </UiButton>
      </div>
      <span
        v-if="status"
        class="bgm-current-source__status"
        :class="`bgm-current-source__status--${status.tone}`"
        :aria-label="status.accessibleLabel"
        aria-live="polite"
      >
        <component :is="status.icon" v-if="status.icon" aria-hidden="true" />
        <span>場間音樂 · {{ status.label }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.bgm-current-source {
  display: flex;
  min-block-size: var(--ui-track-row-min-height);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-track-row-gap);
}

.bgm-current-source__copy {
  display: flex;
  min-inline-size: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--ui-space-1);
}

.bgm-current-source__identity {
  display: grid;
  min-inline-size: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.bgm-current-source__identity strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-label-line-height);
}

.bgm-current-source__change {
  min-height: 0;
  padding-block: var(--ui-space-1);
}

.bgm-current-source__status {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-space-1);
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
}

.bgm-current-source__status > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bgm-current-source__status :deep(svg) {
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  flex: 0 0 auto;
}

.bgm-current-source__status--current,
.bgm-current-source__status--accent {
  color: var(--ui-color-accent);
}

.bgm-current-source__status--warning {
  color: var(--ui-color-warning);
}

.bgm-current-source__status--danger {
  color: var(--ui-color-danger);
}

.bgm-current-source__artwork :deep(svg) {
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  color: var(--ui-color-text-muted);
}
</style>
