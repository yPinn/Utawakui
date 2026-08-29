<script setup>
import { formatLyricsSourceLabel } from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  sources: { type: Array, default: () => [] },
  selectedSourceFilename: { type: String, default: '' },
  hasSelectedTrack: { type: Boolean, default: false },
  showsReadingAid: { type: Boolean, default: false },
  lyricsScript: { type: String, default: '' },
  readingVariant: { type: String, default: 'off' },
  readingError: { type: String, default: '' },
  showsLyricsTextVariant: { type: Boolean, default: false },
  lyricsTextVariant: { type: String, default: 'traditional-tw' },
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
]);

function handleSourceChange(event) {
  emit('sourceChange', event.target.value);
}

function handleReadingVariantChange(event) {
  emit('readingVariantChange', event.target.value);
}

function handleLyricsTextVariantChange(event) {
  emit('lyricsTextVariantChange', event.target.value);
}
</script>

<template>
  <section class="lyrics-preparation" aria-label="閱讀與預先設定">
    <div class="lyrics-preparation__row">
      <div
        class="lyrics-preparation__group lyrics-preparation__group--source"
        title="歌詞來源"
      >
        <span class="lyrics-preparation__label">來源</span>
        <select
          class="lyrics-preparation__select lyrics-preparation__source-select"
          :value="selectedSourceFilename"
          :disabled="sources.length === 0"
          aria-label="歌詞來源"
          @change="handleSourceChange"
        >
          <option value="">無</option>
          <option
            v-for="source in sources"
            :key="source.filename"
            :value="source.filename"
          >
            {{ formatLyricsSourceLabel(source) }}
          </option>
        </select>
        <UiButton
          v-if="hasSelectedTrack"
          class="lyrics-preparation__command"
          title="管理歌詞來源"
          aria-label="管理歌詞來源"
          @click="emit('manageSources')"
        >
          管理
        </UiButton>
      </div>

      <div
        v-if="showsLyricsTextVariant"
        class="lyrics-preparation__group"
        title="歌詞文字顯示"
      >
        <span class="lyrics-preparation__label">文字</span>
        <select
          class="lyrics-preparation__select lyrics-preparation__text-select"
          :value="lyricsTextVariant"
          aria-label="歌詞文字顯示"
          @change="handleLyricsTextVariantChange"
        >
          <option value="original">原文</option>
          <option value="traditional-tw">繁體中文</option>
        </select>
      </div>

      <div
        v-if="showsReadingAid"
        class="lyrics-preparation__group"
        title="讀音顯示"
      >
        <span class="lyrics-preparation__label">讀音</span>
        <select
          class="lyrics-preparation__select lyrics-preparation__reading-select"
          :value="readingVariant"
          aria-label="讀音顯示"
          @change="handleReadingVariantChange"
        >
          <option value="off">不顯示</option>
          <option v-if="lyricsScript === 'ja'" value="furigana">
            假名標音
          </option>
          <option value="romaji">羅馬拼音</option>
        </select>
      </div>

      <div class="lyrics-preparation__group" title="歌詞字級">
        <span class="lyrics-preparation__label">字級</span>
        <div
          class="lyrics-preparation__stepper"
          role="group"
          aria-label="歌詞字級"
        >
          <UiButton
            title="縮小歌詞"
            aria-label="縮小歌詞"
            :disabled="!canDecreaseFontSize"
            @click="emit('decreaseFontSize')"
          >
            A−
          </UiButton>
          <UiButton
            title="放大歌詞"
            aria-label="放大歌詞"
            :disabled="!canIncreaseFontSize"
            @click="emit('increaseFontSize')"
          >
            A+
          </UiButton>
        </div>
      </div>
    </div>
    <UiNotice
      v-if="readingError"
      tone="danger"
      :message="readingError"
      compact
    />
  </section>
</template>

<style scoped>
.lyrics-preparation {
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-raised);
}

.lyrics-preparation__row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--ui-space-3);
}

.lyrics-preparation__group {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ui-space-1);
  min-width: 0;
}

.lyrics-preparation__group--source {
  flex: 1 1 280px;
  min-width: 0;
}

.lyrics-preparation__group + .lyrics-preparation__group {
  padding-inline-start: var(--ui-space-3);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-preparation__label {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.lyrics-preparation__select {
  height: var(--ui-control-height);
  min-width: 96px;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.lyrics-preparation__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-preparation__source-select {
  width: auto;
  min-width: 0;
  max-width: 240px;
  flex: 1 1 112px;
}

.lyrics-preparation__reading-select {
  width: 92px;
}

.lyrics-preparation__text-select {
  width: 104px;
}

.lyrics-preparation__command {
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.lyrics-preparation__stepper {
  display: inline-flex;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
}

.lyrics-preparation__stepper :deep(.ui-btn) {
  min-width: var(--ui-icon-button-size-lg);
  border-radius: 0;
}

.lyrics-preparation__stepper :deep(.ui-btn + .ui-btn) {
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

@container (max-width: 46rem) {
  .lyrics-preparation__row {
    flex-wrap: wrap;
  }

  .lyrics-preparation__group--source {
    flex-basis: 100%;
  }

  .lyrics-preparation__group:nth-child(2) {
    padding-inline-start: 0;
    border-inline-start: 0;
  }
}
</style>
