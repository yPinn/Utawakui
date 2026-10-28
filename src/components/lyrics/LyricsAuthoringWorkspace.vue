<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import { isVocalSection } from '../../composables/lyrics/useLyricsVocalRoles.js';
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
import LyricsTimingReviewTool from './LyricsTimingReviewTool.vue';

const lyrics = useLyrics();
const reading = useLyricsReading();

const {
  state,
  selectedTrack,
  selectedLyrics,
  availableSources,
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
  lyricsTiming,
} = lyrics;
const { state: playerState } = usePlayer();

const {
  draft: timingDraft,
  sourceSession: timingSourceSession,
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
const vocalRoles = computed(() => lyrics.lyricsTextProcessing?.vocalRoles);
const canEditVocals = computed(
  () =>
    vocalRoles.value?.status.value === 'ready' &&
    lyricsDocument.value.lines.length > 0,
);
const vocalSectionLineIds = computed(() =>
  lyricsDocument.value.lines
    .filter((line) => isVocalSection(line.text))
    .map((line) => line.lineId),
);
const VOCAL_PENS = [
  { id: 'male', label: '男' },
  { id: 'female', label: '女' },
  { id: 'group', label: '合' },
  { id: 'auto', label: '清除' },
];
const vocalPen = ref('male');
let lastPaintedLineId = null;
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
const reviewBusy = computed(() => lyrics.timingReview?.state.isBusy ?? false);
const hasEditingDraft = computed(
  () => Boolean(timingDraft.value) || editingReadingLineIndex.value !== null,
);
const isEditingLocked = computed(
  () =>
    hasEditingDraft.value ||
    isSavingReading.value ||
    state.timingSave.isSaving ||
    reviewBusy.value,
);
const editingHelp = computed(() => {
  if (hasEditingDraft.value)
    return '儲存或取消這行編輯後，可繼續選擇其他歌詞。';
  if (editMode.value === 'timing') return '選擇歌詞行的時鐘開始逐字校時。';
  if (editMode.value === 'vocal')
    return '點歌詞行標註，Shift＋點標一段；人名行沿用至下一位。';
  return isGeneratingReading.value || isPreparingReading.value
    ? '正在準備讀音…'
    : '選擇歌詞行的鉛筆修正讀音。';
});
function setEditMode(mode) {
  if (
    isEditingLocked.value ||
    !['preview', 'reading', 'timing', 'vocal'].includes(mode)
  )
    return;
  if (mode !== 'preview' && (!selectedSource.value || state.isLoadingLyrics))
    return;
  if (mode === 'reading' && !showsReadingAid.value) return;
  if (mode === 'timing' && !canEditTiming.value) return;
  if (mode === 'vocal' && !canEditVocals.value) return;
  lastPaintedLineId = null;
  editMode.value = mode;
  if (mode === 'reading' && readingVariant.value === 'off') {
    void setReadingVariant(lyricsScript.value === 'ja' ? 'furigana' : 'romaji');
  }
}
let restoreDisplayAfterManager = null;
let disposed = false;
onUnmounted(() => {
  disposed = true;
  lyrics.timingReview?.cancel?.();
  restoreDisplayAfterManager = null;
});
async function openSourceManager(closeDisplay, restoreDisplay) {
  if (isEditingLocked.value) return;
  await closeDisplay();
  if (disposed || isEditingLocked.value || !selectedTrack.value) return;
  restoreDisplayAfterManager = restoreDisplay;
  isSourceManagerOpen.value = true;
}
async function closeSourceManager() {
  const restore = restoreDisplayAfterManager;
  restoreDisplayAfterManager = null;
  isSourceManagerOpen.value = false;
  await nextTick();
  if (!disposed && !isEditingLocked.value && selectedTrack.value) restore?.();
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
    () => lyricsTiming?.value.sourceSession?.id,
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

// Shift extends the stroke from the last painted row, in source order.
function paintVocalLine(lineId, extend) {
  if (editMode.value !== 'vocal' || !vocalRoles.value) return;
  const ids = lyricsDocument.value.lines.map((line) => line.lineId);
  const to = ids.indexOf(lineId);
  if (to < 0) return;
  const from =
    extend && lastPaintedLineId ? ids.indexOf(lastPaintedLineId) : -1;
  lastPaintedLineId = lineId;
  void vocalRoles.value.paint(
    from < 0 ? [lineId] : ids.slice(Math.min(from, to), Math.max(from, to) + 1),
    vocalPen.value,
  );
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
    lyricsTiming.value.sourceSession,
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
  if (
    (await saveTimingDocument(document, timingSourceSession.value)) &&
    timingDraft.value === draft
  )
    cancelTiming();
}
async function confirmTimingReview() {
  if (
    isSavingReading.value ||
    editingReadingLineIndex.value !== null ||
    reviewBusy.value
  )
    return;
  const draft = timingDraft.value;
  if (draft && !canCommitTiming.value) return;
  let saved = false;
  await lyrics.timingReview.confirm({
    document: draft ? buildTimingDocument() : null,
    baseline: timingSourceSession.value,
    isCurrent: () =>
      !disposed &&
      !lyrics.experimentalLyrics?.applied.value &&
      (saved ? timingDraft.value === null : timingDraft.value === draft),
    onSaved: () => {
      if (timingDraft.value === draft) cancelTiming();
      saved = true;
    },
  });
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
        :can-edit-vocals="canEditVocals && !state.isLoadingLyrics"
        :is-locked="isEditingLocked"
        :edit-mode="editMode"
        @select-track="isTrackPickerOpen = true"
        @refresh="refresh"
        @edit-mode-change="setEditMode"
      >
        <template #review>
          <LyricsTimingReviewTool
            v-if="lyrics.timingReview"
            :review="lyrics.timingReview"
            :context-key="selectedSource ? acousticSourceKey : ''"
            :has-draft="Boolean(timingDraft)"
            :edit-revision="timingDraft"
            :can-save="canCommitTiming"
            :blocked="
              isSavingReading ||
              editingReadingLineIndex !== null ||
              state.isLoadingLyrics
            "
            :estimated="lyrics.experimentalLyrics?.applied.value ?? false"
            :offset-pending="
              Boolean(state.offsetSave.isSaving || state.offsetSave.error)
            "
            @confirm="confirmTimingReview"
          />
        </template>
        <template #display="{ closeDisplay, restoreDisplay }">
          <LyricsPreparationBar
            :sources="availableSources ?? selectedLyrics.sources"
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
            @request-sources="lyrics.refreshSourceDetails?.()"
            @manage-sources="openSourceManager(closeDisplay, restoreDisplay)"
            @reading-variant-change="setReadingVariant"
            @lyrics-text-variant-change="setLyricsTextVariant"
            @decrease-font-size="decreaseLyricsFontSize"
            @increase-font-size="increaseLyricsFontSize"
          >
            <template #font-actions>
              <LyricsExperimentalEstimate
                :disabled="isEditingLocked || editMode !== 'preview'"
              />
            </template>
            <template #text-processing><LyricsTextProcessing /></template>
          </LyricsPreparationBar>
        </template>
      </LyricsWorkspaceHeader>
      <div v-if="editMode !== 'preview'" class="lyrics-edit-context">
        <UiHint role="status">{{ editingHelp }}</UiHint>
        <UiSegmentedControl
          v-if="editMode === 'vocal'"
          v-model="vocalPen"
          :items="VOCAL_PENS"
          aria-label="聲部筆色"
        />
        <UiButton :disabled="isEditingLocked" @click="setEditMode('preview')"
          >結束編輯</UiButton
        >
        <UiNotice
          v-if="editMode === 'reading' && readingError"
          tone="danger"
          :message="readingError"
          compact
        />
        <UiNotice
          v-if="editMode === 'vocal' && vocalRoles?.error.value"
          tone="danger"
          :message="vocalRoles.error.value"
          compact
        />
        <UiButton
          v-if="editMode === 'vocal' && vocalRoles?.error.value"
          @click="vocalRoles.reload()"
          >重新載入</UiButton
        >
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
          :is-saving="state.timingSave.isSaving || reviewBusy"
          :error="state.timingSave.error || ''"
          @undo="undoTiming"
          @save="commitTimingDocument"
          @cancel="cancelTiming"
        />
        <LyricsSegmentEditor
          v-if="timingDraft"
          :draft="timingDraft"
          :can-tap="canTapTiming && Number.isFinite(currentLyricsPositionMs)"
          :is-saving="state.timingSave.isSaving || reviewBusy"
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
        :vocal-roles="lyrics.lyricsTextProcessing?.lineRoles?.value ?? {}"
        :is-painting-vocals="editMode === 'vocal'"
        :vocal-section-line-ids="vocalSectionLineIds"
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
        @paint-line="paintVocalLine"
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
      @close="closeSourceManager"
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
