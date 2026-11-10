<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useId,
  watch,
} from 'vue';
import { Pencil, SlidersHorizontal, Video } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import { trackTitlePresentation } from '../../utils/trackTitlePresentation.js';
import { trackArtistText } from '../../utils/artistPage.js';
import { translationForLine } from '../../utils/lyricsTranslationImport.js';
import { useLyricsDisplay } from '../../composables/useLyricsDisplay.js';
import { useLyricsVideoMode } from '../../composables/useLyricsVideoMode.js';
import { useTrackVideoAsset } from '../../composables/useTrackVideoAsset.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import TrackVideoPlayback from '../playback/TrackVideoPlayback.vue';
import LyricsLiveTool from './LyricsLiveTool.vue';
import LyricsVideoCaptions from './LyricsVideoCaptions.vue';
import LyricsTranslationEditor from './LyricsTranslationEditor.vue';
import LyricsExperimentalEstimate from './LyricsExperimentalEstimate.vue';
import LyricsDisplayControls from './LyricsDisplayControls.vue';
import LyricsTextProcessing from './LyricsTextProcessing.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
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
const videoAspect = shallowRef('standard');
const videoAspectId = useId();
const videoAspects = [
  { id: 'standard', label: '16:9' },
  { id: 'scope', label: t('trackVideo.scopeAspect') },
];
const videoCaptionIndex = computed(() =>
  activeLineIndex.value >= 0
    ? activeLineIndex.value
    : (positionedLineIndex?.value ?? -1),
);
const hasTimedVideoLyrics = computed(() =>
  lyricLines.value.some((line) => Number.isFinite(line.start)),
);
const translationId = useId();
const translationLanguage = shallowRef('off');
const translationLanguages = [
  { id: 'zh-TW', label: t('lyricsTranslation.traditionalChinese') },
  { id: 'en', label: t('lyricsTranslation.english') },
];
const translationRecord = shallowRef(null);
const translationEditorOpen = shallowRef(false);
const translationLoadError = shallowRef(false);
const translationContext = computed(() => {
  const session = lyrics.sourceSession?.value;
  const filename = selectedSource.value?.filename;
  const trackId = selectedTrack.value?.id;
  const { documentId, lines, source } = lyricsDocument.value;
  if (
    reference.value ||
    state.isLoadingLyrics ||
    !session ||
    !trackId ||
    !filename ||
    source?.filename !== filename ||
    !lines?.length
  )
    return null;
  return { trackId, filename, session: { ...session }, documentId, lines };
});
const translationOptions = computed(() => [
  { id: 'off', label: t('lyricsTranslation.off') },
  ...translationLanguages.map((language) => ({
    ...language,
    disabled: !translationRecord.value?.rows[language.id]?.length,
  })),
]);
const canonicalLinesById = computed(
  () => new Map(lyricsDocument.value.lines?.map((line) => [line.lineId, line])),
);
const captionTranslations = computed(
  () =>
    new Map(
      translationRecord.value?.rows[translationLanguage.value]?.map((row) => [
        row.lineId,
        row,
      ]),
    ),
);
const videoTranslation = computed(() =>
  translationForLine(
    captionTranslations.value,
    canonicalLinesById.value.get(
      lyricLines.value[videoCaptionIndex.value]?.lineId,
    ),
  ),
);
const translationVisible = computed(() =>
  Boolean(translationRecord.value?.rows[translationLanguage.value]?.length),
);
const translationReload = shallowRef(0);
watch(
  [translationContext, translationReload],
  async ([context], _previous, onCleanup) => {
    translationRecord.value = null;
    translationEditorOpen.value = false;
    translationLoadError.value = false;
    if (
      !context ||
      typeof window.Utawakui?.getLyricsTranslations !== 'function'
    )
      return;
    let current = true;
    onCleanup(() => {
      current = false;
    });
    try {
      const { trackId, filename, session, documentId } = context;
      const result = await window.Utawakui.getLyricsTranslations(
        trackId,
        filename,
        session,
        documentId,
      );
      if (current) translationRecord.value = result;
    } catch {
      if (current) translationLoadError.value = true;
    }
  },
  { immediate: true },
);
const videoTrackId = computed(() => {
  const id = lyrics.currentTrackId?.value;
  return id === selectedTrack.value?.id ? id : null;
});
const { active: videoMode, setActive: setVideoMode } = useLyricsVideoMode();
const { asset: videoAsset, pending: videoPending } = useTrackVideoAsset({
  trackId: videoTrackId,
  enabled: true,
});
watch([videoAsset, videoPending], ([asset, pending]) => {
  if (videoMode.value && !asset && !pending) setVideoMode(false);
});

let disposed = false;
onUnmounted(() => {
  disposed = true;
  setVideoMode(false);
});

const displayMenuOpen = shallowRef(false);
const isSourceManagerOpen = shallowRef(false);
let displayTriggerElement = null;
let restoreDisplayAfterManager = false;

function toggleDisplayMenu(event) {
  displayTriggerElement = event.currentTarget;
  displayMenuOpen.value = !displayMenuOpen.value;
}

async function openTranslationEditor() {
  const context = translationContext.value;
  displayMenuOpen.value = false;
  await nextTick();
  if (
    disposed ||
    !translationRecord.value ||
    translationContext.value !== context
  )
    return;
  displayTriggerElement?.focus();
  translationEditorOpen.value = true;
}

function applyTranslations(record, language) {
  translationRecord.value = record;
  translationLanguage.value = record.rows[language].length ? language : 'off';
  translationEditorOpen.value = false;
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
        <UiButton
          v-if="videoAsset || videoMode"
          :icon="Video"
          variant="secondary"
          :aria-pressed="videoMode"
          @click="setVideoMode(!videoMode)"
          >{{
            t(videoMode ? 'trackVideo.lyricsSheet' : 'trackVideo.lyricsVideo')
          }}</UiButton
        >
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
            <template #presentation-options>
              <UiField
                v-if="videoMode"
                :id="videoAspectId"
                :label="t('trackVideo.aspect')"
                group
              >
                <UiSegmentedControl
                  v-model="videoAspect"
                  :items="videoAspects"
                  :aria-label="t('trackVideo.aspect')"
                />
              </UiField>
              <UiField
                v-if="videoMode && translationRecord"
                :id="translationId"
                :label="t('lyricsTranslation.language')"
                group
              >
                <UiSegmentedControl
                  v-model="translationLanguage"
                  :items="translationOptions"
                  :aria-label="t('lyricsTranslation.language')"
                />
              </UiField>
              <UiButton
                v-if="translationRecord"
                @click="openTranslationEditor"
                >{{ t('lyricsTranslation.manage') }}</UiButton
              >
              <div v-else-if="translationLoadError">
                <UiHint role="status">{{
                  t('lyricsTranslation.loadFailed')
                }}</UiHint>
                <UiButton @click="translationReload++">{{
                  t('common.retry')
                }}</UiButton>
              </div>
            </template>
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
    <section
      v-if="videoMode"
      class="performance-lyrics-workspace__stage"
      :data-aspect="videoAspect"
      :class="{
        'performance-lyrics-workspace__stage--translated': translationVisible,
      }"
      :aria-label="t('trackVideo.lyricsVideo')"
    >
      <TrackVideoPlayback
        v-if="videoAsset"
        active
        stage
        :stage-asset="videoAsset"
        class="performance-lyrics-workspace__video"
      />
      <UiHint
        v-else
        class="performance-lyrics-workspace__video performance-lyrics-workspace__video-loading"
        role="status"
        >{{ t('trackVideo.working') }}</UiHint
      >
      <LyricsVideoCaptions
        class="performance-lyrics-workspace__captions"
        :class="lyricsFontSizeClass"
        :lang="trackLang"
        :line="lyricLines[videoCaptionIndex]"
        :translation="videoTranslation"
        :translation-lang="translationLanguage"
        :next-line="
          hasTimedVideoLyrics && videoCaptionIndex < 0 ? lyricLines[0] : null
        "
        :reading="readingLines[videoCaptionIndex]"
        :show-empty="
          !hasTimedVideoLyrics && !state.isLoading && !state.isLoadingLyrics
        "
        :reading-variant="showsReadingAid ? readingVariant : 'off'"
        :frame="
          activeLineIndex >= 0
            ? (lyrics.localLyricsFrame?.value ??
              lyrics.experimentalLyrics?.frame.value)
            : null
        "
      />
    </section>
    <LyricsLiveTool
      v-show="!videoMode"
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
    <LyricsTranslationEditor
      v-if="translationEditorOpen && translationContext && translationRecord"
      :context="translationContext"
      :saved="translationRecord"
      :languages="translationLanguages"
      :initial-language="
        translationLanguage === 'off' ? 'zh-TW' : translationLanguage
      "
      @close="translationEditorOpen = false"
      @saved="applyTranslations"
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
.performance-lyrics-workspace__stage {
  --lyrics-video-aspect: 16 / 9;
  --lyrics-video-caption-height: 5rem;
  --lyrics-video-frame-width: min(
    100cqw,
    max(
      0px,
      calc(
        (100cqh - var(--lyrics-video-caption-height) - var(--ui-space-2)) *
          (var(--lyrics-video-aspect))
      )
    )
  );
  container-type: size;
  display: grid;
  flex: 1 1 0;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto var(--lyrics-video-caption-height);
  align-content: center;
  justify-items: center;
  gap: var(--ui-space-2);
  min-block-size: 0;
}
.performance-lyrics-workspace__stage[data-aspect='scope'] {
  --lyrics-video-aspect: 239 / 100;
}
.performance-lyrics-workspace__stage--translated {
  --lyrics-video-caption-height: 7rem;
}
.performance-lyrics-workspace__video,
.performance-lyrics-workspace__captions {
  inline-size: var(--lyrics-video-frame-width);
  box-sizing: border-box;
}
.performance-lyrics-workspace__video {
  aspect-ratio: var(--lyrics-video-aspect);
  min-block-size: 0;
}
.performance-lyrics-workspace__video-loading {
  display: grid;
  place-items: center;
}

.performance-lyrics-workspace__display {
  inline-size: 18rem;
  max-inline-size: 100%;
}
</style>
