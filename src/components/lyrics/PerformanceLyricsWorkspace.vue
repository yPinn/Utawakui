<script setup>
import { computed, nextTick, onMounted, onUnmounted, shallowRef } from 'vue';
import { Pencil, SlidersHorizontal } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import { useLyricsDisplay } from '../../composables/useLyricsDisplay.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import LyricsLiveTool from './LyricsLiveTool.vue';
import LyricsExperimentalEstimate from './LyricsExperimentalEstimate.vue';
import LyricsDisplayControls from './LyricsDisplayControls.vue';
import LyricsTextProcessing from './LyricsTextProcessing.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import UiButton from '../ui/UiButton.vue';
import UiPopover from '../ui/UiPopover.vue';

const lyrics = useLyrics();
const reading = useLyricsReading();
const {
  state,
  selectedTrack,
  selectedLyrics,
  availableSources,
  selectedSource,
  lyricsDocument,
  lyricLines,
  activeLineIndex,
  positionedLineIndex,
  initialize,
  adjustOffset,
  resetOffset,
  retryOffsetSave,
  playFromLine,
  selectSource,
  lyricsTextVariant,
  setLyricsTextVariant,
} = lyrics;
const { openLyricsAuthoring } = useAppView();

let disposed = false;
onUnmounted(() => {
  disposed = true;
});

const displayMenuOpen = shallowRef(false);
const isSourceManagerOpen = shallowRef(false);
let displayTriggerElement = null;
let restoreDisplayAfterManager = false;

function toggleDisplayMenu(event) {
  displayTriggerElement = event.currentTarget;
  displayMenuOpen.value = !displayMenuOpen.value;
}

async function openSourceManager() {
  restoreDisplayAfterManager = displayMenuOpen.value;
  displayMenuOpen.value = false;
  await nextTick();
  if (disposed || !selectedTrack.value) {
    restoreDisplayAfterManager = false;
    return;
  }
  // The management button was inside the now-unmounted popover. Give UiModal
  // a persistent return-focus target before it captures document.activeElement.
  displayTriggerElement?.focus();
  isSourceManagerOpen.value = true;
}
async function closeSourceManager() {
  const restore = restoreDisplayAfterManager;
  restoreDisplayAfterManager = false;
  isSourceManagerOpen.value = false;
  await nextTick();
  if (restore && !disposed && selectedTrack.value) displayMenuOpen.value = true;
}
const {
  lyricsScript,
  showsReadingAid,
  readingOptions,
  readingLines,
  lyricsFontSizeClass,
  lyricsFontSizeLabel,
  canDecreaseLyricsFontSize,
  canIncreaseLyricsFontSize,
  readingVariant,
  readingError,
  isPreparingReading,
  isGeneratingReading,
  selectReadingVariant,
  decreaseLyricsFontSize,
  increaseLyricsFontSize,
} = useLyricsDisplay({ lyrics, reading });
const offsetLabel = computed(() =>
  state.offsetSeconds === 0
    ? '0.0s'
    : `${state.offsetSeconds > 0 ? '+' : ''}${state.offsetSeconds.toFixed(1)}s`,
);
const trackLang = computed(() => trackContentLang(selectedTrack.value));

onMounted(initialize);
</script>

<template>
  <section class="performance-lyrics-workspace" aria-label="歌詞">
    <AppFolderWorkspaceToolbar
      :context="selectedTrack?.title || '尚未選擇曲目'"
      :context-lang="trackLang"
      :meta="selectedTrack?.artist ?? ''"
      :meta-lang="trackLang"
    >
      <template #actions>
        <UiPopover
          v-model:open="displayMenuOpen"
          aria-label="歌詞顯示設定"
          placement="bottom-end"
          :close-on-scroll="false"
          focus-on-open
        >
          <template #trigger="{ triggerProps }">
            <UiButton
              v-bind="triggerProps"
              :icon="SlidersHorizontal"
              :active="displayMenuOpen"
              @click="toggleDisplayMenu"
            >
              顯示
            </UiButton>
          </template>
          <LyricsDisplayControls
            class="performance-lyrics-workspace__display"
            :sources="availableSources ?? selectedLyrics.sources"
            :selected-source-filename="selectedSource?.filename ?? ''"
            :has-selected-track="Boolean(selectedTrack)"
            :is-loading-sources="state.isLoadingLyrics"
            :reading-options="readingOptions"
            :reading-variant="readingVariant"
            :reading-error="readingError || ''"
            :is-preparing-reading="isPreparingReading"
            :is-generating-reading="isGeneratingReading"
            :shows-lyrics-text-variant="lyricsScript === 'zh'"
            :lyrics-text-variant="lyricsTextVariant"
            :font-size-label="lyricsFontSizeLabel"
            :can-decrease-font-size="canDecreaseLyricsFontSize"
            :can-increase-font-size="canIncreaseLyricsFontSize"
            @source-change="selectSource"
            @request-sources="lyrics.refreshSourceDetails?.()"
            @manage-sources="openSourceManager"
            @reading-variant-change="selectReadingVariant"
            @lyrics-text-variant-change="setLyricsTextVariant"
            @decrease-font-size="decreaseLyricsFontSize"
            @increase-font-size="increaseLyricsFontSize"
          >
            <template #font-actions><LyricsExperimentalEstimate /></template>
            <template #text-processing><LyricsTextProcessing /></template>
          </LyricsDisplayControls>
        </UiPopover>
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

    <LyricsLiveTool
      :experimental-frame="
        lyrics.localLyricsFrame?.value ?? lyrics.experimentalLyrics?.frame.value
      "
      class="performance-lyrics-workspace__reader"
      :document-id="lyricsDocument.documentId"
      :error="state.error || ''"
      :is-loading="state.isLoading"
      :is-loading-lyrics="state.isLoadingLyrics"
      :track-count="state.tracks.length"
      :has-selected-track="Boolean(selectedTrack)"
      selection-hint="從曲庫播放曲目，即可查看歌詞。"
      unchecked-hint="按「編輯歌詞」，從「編輯」重新掃描。"
      :lyrics-status="selectedLyrics.status"
      :has-selected-source="Boolean(selectedSource)"
      :lines="lyricLines"
      :active-line-index="activeLineIndex"
      :positioned-line-index="positionedLineIndex"
      :font-size-class="lyricsFontSizeClass"
      :shows-reading-aid="showsReadingAid"
      :reading-variant="readingVariant"
      :reading-lines="readingLines"
      :lyrics-script="lyricsScript"
      :offset-label="offsetLabel"
      :can-reset-offset="state.offsetSeconds !== 0"
      :offset-error="state.offsetSave.error || ''"
      presentation="sheet"
      @seek-line="playFromLine"
      @adjust-offset="adjustOffset"
      @reset-offset="resetOffset"
      @retry-offset="retryOffsetSave"
    />
    <LyricsSourceManagerModal
      :open="isSourceManagerOpen"
      @close="closeSourceManager"
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

.performance-lyrics-workspace__reader {
  flex: 1 1 auto;
}

.performance-lyrics-workspace__display {
  inline-size: 18rem;
  max-inline-size: 100%;
}
</style>
