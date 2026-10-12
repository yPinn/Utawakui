<script setup>
import { computed, onMounted, shallowRef, watch } from 'vue';
import { Minus, Plus } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { alignReadings, detectLyricsScript } from '../../utils/lyrics.js';
import LyricsLiveTool from './LyricsLiveTool.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const SUPPORTED_READING_SCRIPTS = new Set(['ja', 'ko']);
const LYRICS_FONT_SIZE_CLASSES = [
  'lyrics-preview--font-compact',
  'lyrics-preview--font-default',
  'lyrics-preview--font-large',
];

const {
  state,
  selectedTrack,
  selectedLyrics,
  selectedSource,
  lyricsDocument,
  lyricLines,
  activeLineIndex,
  initialize,
  adjustOffset,
  resetOffset,
  retryOffsetSave,
  playFromLine,
} = useLyrics();
const {
  variant: readingVariant,
  getDoc: getReadingDoc,
  loadReading,
  setVariant: setReadingVariant,
} = useLyricsReading();

const lyricsFontSizeIndex = shallowRef(1);
const lyricsScript = computed(() =>
  detectLyricsScript(lyricLines.value.map((line) => line.text).join('')),
);
const showsReadingAid = computed(() =>
  SUPPORTED_READING_SCRIPTS.has(lyricsScript.value),
);
const readingOptions = computed(() => {
  if (lyricsScript.value === 'ja') {
    return [
      { id: 'off', label: '關閉' },
      { id: 'furigana', label: '假名' },
      { id: 'romaji', label: '羅馬字' },
    ];
  }
  if (lyricsScript.value === 'ko') {
    return [
      { id: 'off', label: '關閉' },
      { id: 'romaji', label: '羅馬字' },
    ];
  }
  return [];
});
const selectedReadingDoc = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source ? getReadingDoc(track.id, source.filename) : null;
});
const readingLines = computed(() =>
  alignReadings(lyricLines.value, selectedReadingDoc.value),
);
const lyricsFontSizeClass = computed(
  () => LYRICS_FONT_SIZE_CLASSES[lyricsFontSizeIndex.value],
);
const canDecreaseLyricsFontSize = computed(() => lyricsFontSizeIndex.value > 0);
const canIncreaseLyricsFontSize = computed(
  () => lyricsFontSizeIndex.value < LYRICS_FONT_SIZE_CLASSES.length - 1,
);
const offsetLabel = computed(() => {
  if (state.offsetSeconds === 0) return '0.0s';
  return `${state.offsetSeconds > 0 ? '+' : ''}${state.offsetSeconds.toFixed(1)}s`;
});
const liveContextLabel = computed(() => {
  if (!selectedTrack.value) return '尚未選擇曲目';
  return [selectedTrack.value.title, selectedTrack.value.artist]
    .filter(Boolean)
    .join(' · ');
});

async function loadSelectedReading() {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  if (!track || !source) return;
  await loadReading(track.id, source.filename, lyricsDocument.value);
}

function selectReadingVariant(variant) {
  setReadingVariant(variant);
  if (variant !== 'off') void loadSelectedReading();
}

function decreaseLyricsFontSize() {
  lyricsFontSizeIndex.value = Math.max(0, lyricsFontSizeIndex.value - 1);
}

function increaseLyricsFontSize() {
  lyricsFontSizeIndex.value = Math.min(
    LYRICS_FONT_SIZE_CLASSES.length - 1,
    lyricsFontSizeIndex.value + 1,
  );
}

watch(
  () => [
    selectedTrack.value?.id,
    selectedSource.value?.filename,
    lyricsDocument.value?.documentId,
    lyricsDocument.value?.normalizerProfileId,
    lyricsDocument.value?.source?.sha256,
  ],
  loadSelectedReading,
  { immediate: true },
);

watch(lyricsScript, (script) => {
  if (!SUPPORTED_READING_SCRIPTS.has(script)) setReadingVariant('off');
  else if (script === 'ko' && readingVariant.value === 'furigana') {
    setReadingVariant('romaji');
  }
});

onMounted(initialize);
</script>

<template>
  <section class="performance-lyrics-workspace" aria-label="現場歌詞">
    <header class="performance-lyrics-workspace__toolbar">
      <div class="performance-lyrics-workspace__identity">
        <h1 class="performance-lyrics-workspace__title">現場歌詞</h1>
        <p class="performance-lyrics-workspace__track">
          {{ liveContextLabel }}
        </p>
      </div>
      <div class="performance-lyrics-workspace__display-controls">
        <div
          v-if="readingOptions.length > 0"
          class="performance-lyrics-workspace__control-group"
        >
          <span class="performance-lyrics-workspace__control-label">讀音</span>
          <UiSegmentedControl
            :model-value="readingVariant"
            :items="readingOptions"
            aria-label="現場歌詞讀音顯示"
            @update:model-value="selectReadingVariant"
          />
        </div>
        <div class="performance-lyrics-workspace__control-group">
          <span class="performance-lyrics-workspace__control-label">字級</span>
          <UiIconButton
            :icon="Minus"
            label="縮小現場歌詞"
            :disabled="!canDecreaseLyricsFontSize"
            @click="decreaseLyricsFontSize"
          />
          <UiIconButton
            :icon="Plus"
            label="放大現場歌詞"
            :disabled="!canIncreaseLyricsFontSize"
            @click="increaseLyricsFontSize"
          />
        </div>
      </div>
    </header>

    <LyricsLiveTool
      :document-id="lyricsDocument.documentId"
      :error="state.error || ''"
      :is-loading="state.isLoading"
      :is-loading-lyrics="state.isLoadingLyrics"
      :track-count="state.tracks.length"
      :has-selected-track="Boolean(selectedTrack)"
      :lyrics-status="selectedLyrics.status"
      :has-selected-source="Boolean(selectedSource)"
      :lines="lyricLines"
      :active-line-index="activeLineIndex"
      :font-size-class="lyricsFontSizeClass"
      :shows-reading-aid="showsReadingAid"
      :reading-variant="readingVariant"
      :reading-lines="readingLines"
      :lyrics-script="lyricsScript"
      :offset-label="offsetLabel"
      :can-reset-offset="state.offsetSeconds !== 0"
      :offset-error="state.offsetSave.error || ''"
      @seek-line="playFromLine"
      @adjust-offset="adjustOffset"
      @reset-offset="resetOffset"
      @retry-offset="retryOffsetSave"
    />
  </section>
</template>

<style scoped>
.performance-lyrics-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.performance-lyrics-workspace__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.performance-lyrics-workspace__identity {
  min-width: 0;
}

.performance-lyrics-workspace__title,
.performance-lyrics-workspace__track {
  margin: 0;
}

.performance-lyrics-workspace__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
}

.performance-lyrics-workspace__track,
.performance-lyrics-workspace__control-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.performance-lyrics-workspace__track {
  overflow: hidden;
  margin-top: var(--ui-space-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performance-lyrics-workspace__display-controls,
.performance-lyrics-workspace__control-group {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.performance-lyrics-workspace__display-controls {
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 52rem) {
  .performance-lyrics-workspace__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .performance-lyrics-workspace__display-controls {
    justify-content: flex-start;
  }
}
</style>
