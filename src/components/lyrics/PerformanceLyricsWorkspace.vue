<script setup>
import { computed, nextTick, onMounted, onUnmounted, shallowRef } from 'vue';
import { Pencil, SlidersHorizontal } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import { trackTitlePresentation } from '../../utils/trackTitlePresentation.js';
import { trackArtistText } from '../../utils/artistPage.js';
import { useLyricsDisplay } from '../../composables/useLyricsDisplay.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import LyricsLiveTool from './LyricsLiveTool.vue';
import LyricsExperimentalEstimate from './LyricsExperimentalEstimate.vue';
import LyricsDisplayControls from './LyricsDisplayControls.vue';
import LyricsTextProcessing from './LyricsTextProcessing.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiPopover from '../ui/UiPopover.vue';
import LyricsLoopTool from './LyricsLoopTool.vue';
import { t } from '../../utils/i18n.js';

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
const presentation = computed(() =>
  trackTitlePresentation(selectedTrack.value),
);
const trackMeta = computed(() => trackArtistText(selectedTrack.value));
const reference = computed(() => lyrics.linkedReference?.value);

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
const offsetLabel = computed(() => {
  const seconds = state.playbackOffsetSeconds ?? state.offsetSeconds;
  return `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)}s`;
});
const trackLang = computed(() => trackContentLang(selectedTrack.value));

onMounted(initialize);
</script>

<template>
  <section
    class="performance-lyrics-workspace"
    :aria-label="t('lyricsDisplay.title')"
  >
    <AppFolderWorkspaceToolbar
      :context="presentation.title || t('lyricsEditor.header.noTrack')"
      :context-lang="trackLang"
      :meta="trackMeta"
      :meta-lang="trackLang"
    >
      <template #actions>
        <LyricsLoopTool :context-track-id="selectedTrack?.id ?? ''" />
        <UiPopover
          v-model:open="displayMenuOpen"
          :aria-label="t('lyricsEditor.header.displayLabel')"
          placement="bottom-end"
          :close-on-scroll="false"
          focus-on-open
        >
          <template #trigger="{ triggerProps }">
            <UiIconButton
              v-bind="triggerProps"
              :icon="SlidersHorizontal"
              :label="t('lyricsEditor.header.displayLabel')"
              :active="displayMenuOpen"
              @click="toggleDisplayMenu"
            />
          </template>
          <LyricsDisplayControls
            class="performance-lyrics-workspace__display"
            :sources="
              reference ? [] : (availableSources ?? selectedLyrics.sources)
            "
            :selected-source-filename="selectedSource?.filename ?? ''"
            :empty-source-label="
              reference
                ? t('lyricsSource.control.reference', {
                    title: reference.title,
                  })
                : ''
            "
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
        <UiIconButton
          v-if="selectedTrack"
          :icon="Pencil"
          :label="t('lyricsDisplay.performance.edit')"
          :title="t('lyricsDisplay.performance.editTitle')"
          @click="reference ? openSourceManager() : openLyricsAuthoring()"
        />
      </template>
    </AppFolderWorkspaceToolbar>

    <UiHint v-if="reference" role="status">
      {{
        t(
          reference.document.granularity === 'T0'
            ? 'lyricsSource.manager.linkedReferenceText'
            : 'lyricsSource.manager.linkedReference',
          { title: reference.title },
        )
      }}
    </UiHint>
    <LyricsLiveTool
      :experimental-frame="
        lyrics.localLyricsFrame?.value ?? lyrics.experimentalLyrics?.frame.value
      "
      class="performance-lyrics-workspace__reader"
      :document-id="reference?.document.documentId ?? lyricsDocument.documentId"
      :error="state.error || ''"
      :is-loading="state.isLoading"
      :is-loading-lyrics="state.isLoadingLyrics"
      :track-count="state.tracks.length"
      :has-selected-track="Boolean(selectedTrack)"
      :selection-hint="t('lyricsDisplay.performance.selectionHint')"
      :unchecked-hint="t('lyricsDisplay.performance.uncheckedHint')"
      :lyrics-status="reference ? 'available' : selectedLyrics.status"
      :has-selected-source="Boolean(reference || selectedSource)"
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
      :offset-disabled="Boolean(reference)"
      :offset-error="state.offsetSave.error || ''"
      :vocal-roles="lyrics.lyricsTextProcessing?.lineRoles?.value ?? {}"
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
