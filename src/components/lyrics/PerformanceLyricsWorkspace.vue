<script setup>
import { computed, onMounted, shallowRef, watch } from 'vue';
import { Minus, Pencil, Plus } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import {
  alignReadings,
  detectLyricsScript,
  formatLyricsSourceLabel,
} from '../../utils/lyrics.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import LyricsLiveTool from './LyricsLiveTool.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiSelect from '../ui/UiSelect.vue';

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
  selectSource,
} = useLyrics();
const {
  variant: readingVariant,
  getDoc: getReadingDoc,
  isGenerating: isGeneratingReadingFor,
  errorFor: readingErrorFor,
  loadReading,
  generateReading,
  setVariant: setReadingVariant,
} = useLyricsReading();
const { openLyricsAuthoring } = useAppView();

// Key of the source whose stored reading has been looked up, so a pending
// lookup is never mistaken for a missing reading.
const checkedReadingKey = shallowRef('');

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
const trackLang = computed(() => trackContentLang(selectedTrack.value));
const sourceOptions = computed(() =>
  selectedLyrics.value.sources.map((source) => ({
    value: source.filename,
    label: formatLyricsSourceLabel(source),
  })),
);
const readingKey = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source ? `${track.id}::${source.filename}` : '';
});
const isGeneratingReading = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return Boolean(
    track && source && isGeneratingReadingFor(track.id, source.filename),
  );
});
const readingError = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source ? readingErrorFor(track.id, source.filename) : null;
});
// A stale reading aligns to no line, so it counts as missing too.
const showsMissingReading = computed(
  () =>
    showsReadingAid.value &&
    readingVariant.value !== 'off' &&
    readingKey.value !== '' &&
    checkedReadingKey.value === readingKey.value &&
    !readingLines.value.some(Boolean),
);

async function loadSelectedReading() {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  if (!track || !source) return;
  const key = readingKey.value;
  await loadReading(track.id, source.filename, lyricsDocument.value);
  if (readingKey.value === key) checkedReadingKey.value = key;
}

function generateSelectedReading() {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  if (!track || !source || isGeneratingReading.value) return;
  generateReading(
    track.id,
    source.filename,
    lyricsDocument.value,
    lyricsScript.value,
  );
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
    <AppFolderWorkspaceToolbar
      :context="selectedTrack?.title || '尚未選擇曲目'"
      :context-lang="trackLang"
      :meta="selectedTrack?.artist ?? ''"
      :meta-lang="trackLang"
    >
      <template #actions>
        <UiSelect
          v-if="sourceOptions.length > 0"
          id="performance-lyrics-source"
          class="performance-lyrics-workspace__source"
          label="歌詞來源"
          label-hidden
          :model-value="selectedSource?.filename ?? ''"
          :options="sourceOptions"
          :disabled="sourceOptions.length < 2"
          @update:model-value="selectSource"
        />
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
        <UiButton
          v-if="selectedTrack"
          :icon="Pencil"
          title="在曲庫編輯這首歌的歌詞、來源與讀音"
          @click="openLyricsAuthoring"
        >
          編輯歌詞
        </UiButton>
      </template>
    </AppFolderWorkspaceToolbar>

    <UiNotice
      v-if="readingError"
      tone="danger"
      :message="readingError"
      action-label="重試"
      :action-disabled="isGeneratingReading"
      compact
      @action="generateSelectedReading"
    />
    <UiNotice
      v-else-if="showsMissingReading"
      tone="info"
      :message="
        isGeneratingReading ? '正在產生讀音…' : '這首歌還沒有讀音資料。'
      "
      :action-label="isGeneratingReading ? '' : '產生讀音'"
      compact
      @action="generateSelectedReading"
    />

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
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.performance-lyrics-workspace > :last-child {
  flex: 1 1 auto;
}

.performance-lyrics-workspace__source {
  inline-size: 12rem;
  max-inline-size: 100%;
}

.performance-lyrics-workspace__control-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.performance-lyrics-workspace__control-group {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>
