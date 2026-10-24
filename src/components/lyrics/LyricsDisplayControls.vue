<script setup>
import { onMounted, useId } from 'vue';
import { Minus, Plus } from '../../icons/index.js';
import LyricsSourceControl from './LyricsSourceControl.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiField from '../ui/UiField.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  layout: {
    type: String,
    default: 'stacked',
    validator: (value) => ['inline', 'stacked'].includes(value),
  },
  sources: { type: Array, default: () => [] },
  selectedSourceFilename: { type: String, default: '' },
  hasSelectedTrack: { type: Boolean, default: false },
  isLoadingSources: { type: Boolean, default: false },
  readingOptions: { type: Array, default: () => [] },
  readingVariant: { type: String, default: 'off' },
  readingError: { type: String, default: '' },
  isPreparingReading: { type: Boolean, default: false },
  isGeneratingReading: { type: Boolean, default: false },
  showsLyricsTextVariant: { type: Boolean, default: false },
  lyricsTextVariant: { type: String, default: 'traditional-tw' },
  fontSizeLabel: { type: String, default: '標準' },
  canDecreaseFontSize: { type: Boolean, default: false },
  canIncreaseFontSize: { type: Boolean, default: false },
});
const emit = defineEmits([
  'sourceChange',
  'manageSources',
  'readingVariantChange',
  'lyricsTextVariantChange',
  'decreaseFontSize',
  'increaseFontSize',
  'requestSources',
]);
onMounted(() => emit('requestSources'));
const textSelectId = `lyrics-text-${useId()}`;
const readingId = `lyrics-reading-${useId()}`;
const fontSizeId = `lyrics-font-size-${useId()}`;
const textOptions = [
  { value: 'original', label: '原文' },
  { value: 'traditional-tw', label: '繁體中文' },
];
function selectReadingVariant(value) {
  emit('readingVariantChange', value);
}
function changeTextVariant(value) {
  emit('lyricsTextVariantChange', value);
}
function changeSource(value) {
  emit('sourceChange', value);
}
function manageSources() {
  emit('manageSources');
}
function decreaseFontSize() {
  emit('decreaseFontSize');
}
function increaseFontSize() {
  emit('increaseFontSize');
}
</script>

<template>
  <div
    class="lyrics-display-controls"
    :class="`lyrics-display-controls--${layout}`"
  >
    <LyricsSourceControl
      class="lyrics-display-controls__source"
      :sources="sources"
      :selected-source-filename="selectedSourceFilename"
      :has-selected-track="hasSelectedTrack"
      :is-loading="isLoadingSources"
      @source-change="changeSource"
      @manage-sources="manageSources"
    />
    <UiSelect
      v-if="showsLyricsTextVariant"
      :id="textSelectId"
      label="文字"
      aria-label="歌詞文字顯示"
      :model-value="lyricsTextVariant"
      :options="textOptions"
      :disabled="isLoadingSources"
      @update:model-value="changeTextVariant"
    />
    <UiField v-if="readingOptions.length" :id="readingId" label="讀音" group>
      <div class="lyrics-display-controls__reading">
        <UiSegmentedControl
          :model-value="readingVariant"
          :items="readingOptions"
          aria-label="歌詞讀音顯示"
          :disabled="isLoadingSources || !hasSelectedTrack"
          :aria-busy="isPreparingReading || isGeneratingReading"
          @update:model-value="selectReadingVariant"
          @reselect="selectReadingVariant"
        />
        <UiNotice
          v-if="readingError && readingVariant !== 'off'"
          tone="danger"
          :message="readingError"
          compact
        />
        <UiHint
          v-else-if="
            readingVariant !== 'off' &&
            (isPreparingReading || isGeneratingReading)
          "
          role="status"
        >
          {{ isGeneratingReading ? '正在產生讀音…' : '正在讀取讀音…' }}
        </UiHint>
      </div>
    </UiField>
    <div class="lyrics-display-controls__footer">
      <UiField :id="fontSizeId" label="字級" group>
        <UiButtonGroup
          class="lyrics-display-controls__font-size"
          label="歌詞字級"
        >
          <UiIconButton
            :icon="Minus"
            label="縮小歌詞"
            :disabled="!canDecreaseFontSize"
            @click="decreaseFontSize"
          />
          <span aria-live="polite">{{ fontSizeLabel }}</span>
          <UiIconButton
            :icon="Plus"
            label="放大歌詞"
            :disabled="!canIncreaseFontSize"
            @click="increaseFontSize"
          />
        </UiButtonGroup>
      </UiField>
      <slot name="font-actions" />
    </div>
    <slot name="text-processing" />
  </div>
</template>

<style scoped>
.lyrics-display-controls {
  display: grid;
  gap: var(--ui-space-4);
  min-width: 0;
}
.lyrics-display-controls__font-size {
  justify-self: start;
  font-variant-numeric: tabular-nums;
}
.lyrics-display-controls__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.lyrics-display-controls__reading {
  display: grid;
  gap: var(--ui-space-1);
}
.lyrics-display-controls__font-size > span {
  min-inline-size: 3em;
  padding-inline: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  text-align: center;
}
.lyrics-display-controls--inline {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--ui-space-3);
}
.lyrics-display-controls--inline .lyrics-display-controls__source {
  flex: 1 1 16rem;
}
</style>
