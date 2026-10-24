<script setup>
import { computed, ref, watch } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import { useLyricsTimingEditor } from '../../composables/useLyricsTimingEditor.js';
import { formatDuration } from '../../utils/format.js';
import { useLyricsDisplay } from '../../composables/useLyricsDisplay.js';
import { canEditTimingLine } from '../../utils/lyricsTiming.js';
import LyricsLiveTool from './LyricsLiveTool.vue';
import LyricsAcousticPreview from './LyricsAcousticPreview.vue';
import LyricsExperimentalEstimate from './LyricsExperimentalEstimate.vue';
import LyricsPreparationBar from './LyricsPreparationBar.vue';
import LyricsSegmentEditor from './LyricsSegmentEditor.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import LyricsTimingToolbar from './LyricsTimingToolbar.vue';
import LyricsTrackPickerModal from './LyricsTrackPickerModal.vue';
import LyricsWorkspaceHeader from './LyricsWorkspaceHeader.vue';
import LyricsTextProcessing from './LyricsTextProcessing.vue';

const lyrics = useLyrics();
const reading = useLyricsReading();

const {
  state,
  selectedTrack,
  selectedLyrics,
  selectedSource,
  lyricsDocument,
  lyricsTextVariant,
  lyricLines,
  activeLineIndex,
  positionedLineIndex,
  currentLyricsPositionMs,
  isReloading,
  refresh,
  selectSource,
  setLyricsTextVariant,
  adjustOffset,
  resetOffset,
  retryOffsetSave,
  playFromLine,
  saveTimingDocument,
} = lyrics;
const { state: playerState } = usePlayer();

const {
  draft: timingDraft,
  canCommit: canCommitTiming,
  canUndo: canUndoTiming,
  beginLine: beginTimingLine,
  tapBoundary,
  nudgeBoundary,
  undo: undoTiming,
  buildDocument: buildTimingDocument,
  cancel: cancelTiming,
} = useLyricsTimingEditor();

const { setReadingLine } = reading;
const {
  lyricsScript,
  showsReadingAid,
  readingOptions,
  selectedReadingDoc,
  readingLines,
  lyricsFontSizeClass,
  lyricsFontSizeLabel,
  canDecreaseLyricsFontSize,
  canIncreaseLyricsFontSize,
  readingVariant,
  readingError,
  isPreparingReading,
  isGeneratingReading,
  selectReadingVariant: setReadingVariant,
  decreaseLyricsFontSize,
  increaseLyricsFontSize,
  refreshSelectedReading,
} = useLyricsDisplay({ lyrics, reading });

const isSourceManagerOpen = ref(false);
const isTrackPickerOpen = ref(false);
const editingReadingLineIndex = ref(null);
const readingLineDraft = ref('');
const editMode = ref('preview');
const acousticEstimate = computed(
  () => lyrics.lyricsAcousticEstimate?.value ?? { status: 'missing' },
);
const showsAcousticPreview = computed(
  () => acousticEstimate.value.status !== 'missing',
);
const acousticSourceKey = computed(
  () =>
    `${selectedTrack.value?.id ?? ''}/${selectedSource.value?.filename ?? ''}`,
);
const selectedDurationMs = computed(() =>
  selectedTrack.value?.id === playerState.track?.id &&
  Number.isFinite(playerState.duration)
    ? playerState.duration * 1000
    : null,
);
const isSavingReading = ref(false);
const hasEditingDraft = computed(
  () => Boolean(timingDraft.value) || editingReadingLineIndex.value !== null,
);
const isEditingLocked = computed(
  () =>
    hasEditingDraft.value || isSavingReading.value || state.timingSave.isSaving,
);
const editingHelp = computed(() => {
  if (hasEditingDraft.value)
    return '儲存或取消這行編輯後，可繼續選擇其他歌詞。';
  if (editMode.value === 'timing') return '選擇歌詞行的時鐘開始逐字校時。';
  return isGeneratingReading.value || isPreparingReading.value
    ? '正在準備讀音…'
    : '選擇歌詞行的鉛筆修正讀音。';
});
function setEditMode(mode) {
  if (isEditingLocked.value || !['preview', 'reading', 'timing'].includes(mode))
    return;
  if (mode !== 'preview' && (!selectedSource.value || state.isLoadingLyrics))
    return;
  if (mode === 'reading' && !showsReadingAid.value) return;
  if (mode === 'timing' && !canEditTiming.value) return;
  editMode.value = mode;
  if (mode === 'reading' && readingVariant.value === 'off') {
    void setReadingVariant(lyricsScript.value === 'ja' ? 'furigana' : 'romaji');
  }
}
async function openSourceManager(closeDisplay) {
  if (isEditingLocked.value) return;
  await closeDisplay();
  if (isEditingLocked.value || !selectedTrack.value) return;
  isSourceManagerOpen.value = true;
}

const offsetLabel = computed(() => {
  if (state.offsetSeconds === 0) return '0.0s';
  return `${state.offsetSeconds > 0 ? '+' : ''}${state.offsetSeconds.toFixed(1)}s`;
});

const selectedMeta = computed(() => {
  if (!selectedTrack.value) return '';
  const parts = [
    selectedTrack.value.artist,
    Number.isFinite(selectedTrack.value.duration)
      ? formatDuration(selectedTrack.value.duration)
      : null,
  ].filter(Boolean);
  return parts.join(' / ');
});

const reloadStatusLabel = computed(() => {
  if (state.backfillStatus.error) return state.backfillStatus.error;
  if (state.backfillStatus.isRunning) {
    const total = state.backfillStatus.total;
    const completed = state.backfillStatus.completed;
    if (Number.isFinite(total) && total > 0) {
      return `掃描歌詞 ${completed}/${total}`;
    }
    return '掃描歌詞中';
  }
  return '';
});

const isSelectedPlaybackAtStart = computed(() => {
  const trackId = selectedTrack.value?.id;
  return Boolean(
    trackId &&
    playerState.track?.id === trackId &&
    Number.isFinite(playerState.currentTime) &&
    playerState.currentTime <= 1,
  );
});

watch(
  [
    () => selectedTrack.value?.id,
    () => selectedSource.value?.filename,
    () => lyricsDocument.value?.documentId,
  ],
  () => {
    cancelReadingLineEdit();
    cancelTiming();
    editMode.value = 'preview';
  },
);

watch(
  [
    () => playerState.track,
    () => playerState.continuityRevision ?? 0,
    isSelectedPlaybackAtStart,
  ],
  ([track, continuityRevision, isAtStart], previous) => {
    if (!isAtStart || !previous) return;
    const [previousTrack, previousContinuityRevision, wasAtStart] = previous;
    const samePlaybackTrack =
      Boolean(track?.id) && track.id === previousTrack?.id;
    if (!samePlaybackTrack) return;

    const reloadedSameTrack = track !== previousTrack;
    const restartedAtBeginning =
      continuityRevision !== previousContinuityRevision;
    const wrappedToBeginning = wasAtStart === false;
    if (reloadedSameTrack || restartedAtBeginning || wrappedToBeginning) {
      refreshSelectedReading();
    }
  },
);

// Seeds the draft from whatever reading already exists for this line.
// Japanese: segment reading where present, the segment's own text
// otherwise (kana segments' text already is the reading), so correcting
// one wrong kanji doesn't mean retyping the whole line. Korean: there are
// no per-segment readings to reassemble (buildRomanizationDoc never
// produces a `segment.r`) — the thing being edited IS the line's romaji
// string, so seed from that directly.
function startEditReadingLine(index) {
  if (editMode.value !== 'reading' || isEditingLocked.value) return;
  const current = readingLines.value[index];
  if (lyricsScript.value === 'ko') {
    readingLineDraft.value = current?.romaji ?? '';
  } else {
    readingLineDraft.value = current?.segments
      ? current.segments.map((segment) => segment.r ?? segment.t).join('')
      : '';
  }
  editingReadingLineIndex.value = index;
}

function cancelReadingLineEdit() {
  editingReadingLineIndex.value = null;
  readingLineDraft.value = '';
}

async function commitReadingLineEdit(index) {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  if (
    !track ||
    !source ||
    isSavingReading.value ||
    editingReadingLineIndex.value !== index
  )
    return;
  const documentId = lyricsDocument.value.documentId;
  const lineId = lyricsDocument.value.lines[index]?.lineId;
  if (!lineId) return;
  isSavingReading.value = true;
  try {
    await setReadingLine(
      track.id,
      source.filename,
      lyricsDocument.value,
      lineId,
      readingLineDraft.value,
    );
    if (
      selectedTrack.value?.id === track.id &&
      selectedSource.value?.filename === source.filename &&
      lyricsDocument.value.documentId === documentId &&
      !reading.errorFor(track.id, source.filename)
    )
      cancelReadingLineEdit();
  } finally {
    isSavingReading.value = false;
  }
}

const timingReadings = computed(
  () =>
    new Map(
      readingLines.value.filter(Boolean).map((line) => [line.lineId, line]),
    ),
);
const editableTimingLineIds = computed(() =>
  lyricsDocument.value.lines
    .filter((line) =>
      canEditTimingLine(line, timingReadings.value.get(line.lineId)),
    )
    .map((line) => line.lineId),
);
const canEditTiming = computed(() => editableTimingLineIds.value.length > 0);
const canTapTiming = computed(() =>
  Boolean(
    timingDraft.value?.segments.some(
      (segment, index) => index > 0 && !Number.isFinite(segment.startMs),
    ),
  ),
);
const totalTimingBoundaries = computed(() =>
  Math.max(0, (timingDraft.value?.segments.length ?? 1) - 1),
);
const completedTimingBoundaries = computed(
  () =>
    timingDraft.value?.segments.filter(
      (segment, index) => index > 0 && Number.isFinite(segment.startMs),
    ).length ?? 0,
);

function startTimingEdit(lineId) {
  if (editMode.value !== 'timing' || isEditingLocked.value) return;
  if (!editableTimingLineIds.value.includes(lineId)) return;
  beginTimingLine(
    lyricsDocument.value,
    lineId,
    timingReadings.value.get(lineId),
  );
}

function recordTimingBoundary() {
  if (Number.isFinite(currentLyricsPositionMs.value)) {
    tapBoundary(currentLyricsPositionMs.value);
  }
}

async function commitTimingDocument() {
  if (state.timingSave.isSaving || !timingDraft.value || !canCommitTiming.value)
    return;
  const draft = timingDraft.value;
  const document = buildTimingDocument();
  if (!document) return;
  if ((await saveTimingDocument(document)) && timingDraft.value === draft)
    cancelTiming();
}
</script>

<template>
  <div class="lyrics-workspace">
    <section class="lyrics-stage" aria-label="歌詞工作區">
      <LyricsWorkspaceHeader
        :track="selectedTrack"
        :track-meta="selectedMeta"
        :reload-status="reloadStatusLabel"
        :is-reloading="isReloading"
        :can-edit-readings="showsReadingAid && !state.isLoadingLyrics"
        :can-edit-timing="canEditTiming && !state.isLoadingLyrics"
        :is-locked="isEditingLocked"
        :edit-mode="editMode"
        @select-track="isTrackPickerOpen = true"
        @refresh="refresh"
        @edit-mode-change="setEditMode"
      >
        <template #display="{ closeDisplay }">
          <LyricsPreparationBar
            :sources="selectedLyrics.sources"
            :selected-source-filename="state.selectedSourceFilename || ''"
            :has-selected-track="Boolean(selectedTrack)"
            :is-loading-sources="state.isLoadingLyrics"
            :reading-options="readingOptions"
            :is-preparing-reading="isPreparingReading"
            :is-generating-reading="isGeneratingReading"
            :font-size-label="lyricsFontSizeLabel"
            :shows-lyrics-text-variant="lyricsScript === 'zh'"
            :lyrics-text-variant="lyricsTextVariant"
            :reading-variant="readingVariant"
            :reading-error="readingError || ''"
            :can-decrease-font-size="canDecreaseLyricsFontSize"
            :can-increase-font-size="canIncreaseLyricsFontSize"
            @source-change="selectSource"
            @manage-sources="openSourceManager(closeDisplay)"
            @reading-variant-change="setReadingVariant"
            @lyrics-text-variant-change="setLyricsTextVariant"
            @decrease-font-size="decreaseLyricsFontSize"
            @increase-font-size="increaseLyricsFontSize"
          />
        </template>
      </LyricsWorkspaceHeader>
      <LyricsTextProcessing />
      <LyricsExperimentalEstimate
        :disabled="isEditingLocked || editMode !== 'preview'"
      />
      <div v-if="editMode !== 'preview'" class="lyrics-edit-context">
        <UiHint role="status">{{ editingHelp }}</UiHint>
        <UiButton :disabled="isEditingLocked" @click="setEditMode('preview')"
          >結束編輯</UiButton
        >
        <UiNotice
          v-if="editMode === 'reading' && readingError"
          tone="danger"
          :message="readingError"
          compact
        />
      </div>
      <div
        v-if="timingDraft || showsAcousticPreview"
        class="lyrics-timing-stack"
      >
        <LyricsAcousticPreview
          v-if="showsAcousticPreview"
          :document="lyricsDocument"
          :estimate="acousticEstimate"
          :source-key="acousticSourceKey"
          :position-ms="currentLyricsPositionMs"
          :offset-ms="Math.round(state.offsetSeconds * 1000)"
          :duration-ms="selectedDurationMs"
          :disabled="isEditingLocked || editMode !== 'preview'"
        />
        <LyricsTimingToolbar
          v-if="timingDraft"
          :can-undo="canUndoTiming"
          :can-save="canCommitTiming"
          :completed-boundaries="completedTimingBoundaries"
          :total-boundaries="totalTimingBoundaries"
          :is-saving="state.timingSave.isSaving"
          :error="state.timingSave.error || ''"
          @undo="undoTiming"
          @save="commitTimingDocument"
          @cancel="cancelTiming"
        />
        <LyricsSegmentEditor
          v-if="timingDraft"
          :draft="timingDraft"
          :can-tap="canTapTiming && Number.isFinite(currentLyricsPositionMs)"
          :is-saving="state.timingSave.isSaving"
          @tap="recordTimingBoundary"
          @nudge-boundary="nudgeBoundary"
        />
      </div>
      <LyricsLiveTool
        :experimental-frame="
          editMode === 'preview'
            ? (lyrics.localLyricsFrame?.value ??
              lyrics.experimentalLyrics?.frame.value)
            : null
        "
        class="lyrics-stage__live-tool"
        :document-id="lyricsDocument.documentId"
        :error="state.error || ''"
        :is-loading="state.isLoading"
        :is-loading-lyrics="state.isLoadingLyrics"
        :track-count="state.tracks.length"
        :has-selected-track="Boolean(selectedTrack)"
        selection-hint="從「編輯 → 選擇曲目」開始。"
        unchecked-hint="從「編輯 → 重新掃描歌詞」檢查歌詞。"
        :lyrics-status="selectedLyrics.status"
        :has-selected-source="Boolean(selectedSource)"
        :lines="lyricLines"
        :active-line-index="activeLineIndex"
        :positioned-line-index="positionedLineIndex"
        :font-size-class="lyricsFontSizeClass"
        :shows-reading-aid="showsReadingAid"
        :reading-variant="readingVariant"
        :reading-lines="readingLines"
        :has-reading-document="
          editMode === 'reading' &&
          Boolean(selectedReadingDoc) &&
          !hasEditingDraft
        "
        :editing-reading-line-index="editingReadingLineIndex"
        :reading-line-draft="readingLineDraft"
        :is-saving-reading="isSavingReading"
        :editable-timing-line-ids="editableTimingLineIds"
        :lyrics-script="lyricsScript"
        :can-edit-timing="
          editMode === 'timing' && canEditTiming && !hasEditingDraft
        "
        :offset-label="offsetLabel"
        :can-reset-offset="state.offsetSeconds !== 0"
        :offset-error="state.offsetSave.error || ''"
        allow-authoring-actions
        @seek-line="playFromLine"
        @edit-timing="startTimingEdit"
        @start-reading-edit="startEditReadingLine"
        @update-reading-draft="readingLineDraft = $event"
        @commit-reading-edit="commitReadingLineEdit"
        @cancel-reading-edit="cancelReadingLineEdit"
        @adjust-offset="adjustOffset"
        @reset-offset="resetOffset"
        @retry-offset="retryOffsetSave"
      />
    </section>

    <LyricsTrackPickerModal
      :open="isTrackPickerOpen"
      @close="isTrackPickerOpen = false"
    />
    <LyricsSourceManagerModal
      :analysis-disabled="isEditingLocked || editMode !== 'preview'"
      :open="isSourceManagerOpen"
      @close="isSourceManagerOpen = false"
    />
  </div>
</template>

<style scoped>
.lyrics-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.lyrics-stage {
  position: relative;
  display: grid;
  container-type: inline-size;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.lyrics-edit-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}
.lyrics-timing-stack {
  grid-row: 3;
  min-width: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-raised);
}

.lyrics-stage__live-tool {
  grid-row: 4;
}
</style>
