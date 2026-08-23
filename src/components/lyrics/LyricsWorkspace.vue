<script setup>
import { computed, ref, watch } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { useSeparation } from '../../composables/useSeparation.js';
import { useLyricsTimingEditor } from '../../composables/useLyricsTimingEditor.js';
import {
  SEPARATION_PRESET_SELECT_TITLE,
  separationPresetOptionsFor,
} from '../../constants/separationPresets.js';
import { formatDuration } from '../../utils/format.js';
import { alignReadings, detectLyricsScript } from '../../utils/lyrics.js';
import LyricsDocumentPanel from './LyricsDocumentPanel.vue';
import LyricsLiveControls from './LyricsLiveControls.vue';
import LyricsPreparationBar from './LyricsPreparationBar.vue';
import LyricsSegmentEditor from './LyricsSegmentEditor.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import LyricsTimingToolbar from './LyricsTimingToolbar.vue';
import LyricsTrackPickerModal from './LyricsTrackPickerModal.vue';
import LyricsWorkspaceHeader from './LyricsWorkspaceHeader.vue';

const SUPPORTED_READING_SCRIPTS = new Set(['ja', 'ko']);

const {
  state,
  selectedTrack,
  selectedLyrics,
  selectedSource,
  lyricsDocument,
  lyricLines,
  activeLineIndex,
  currentLyricsPositionMs,
  isReloading,
  refresh,
  selectSource,
  adjustOffset,
  resetOffset,
  retryOffsetSave,
  playFromLine,
  saveTimingDocument,
} = useLyrics();
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

const {
  state: separationState,
  isSeparating,
  presetIdFor,
  progressPercent,
  separate,
  selectPreset,
} = useSeparation();

const {
  variant: readingVariant,
  getDoc: getReadingDoc,
  isGenerating: isGeneratingReadingFor,
  errorFor: readingErrorFor,
  loadReading,
  generateReading,
  setReadingLine,
} = useLyricsReading();

const lyricsFontSizeIndex = ref(1);
const isSourceManagerOpen = ref(false);
const isTrackPickerOpen = ref(false);
const editingReadingLineIndex = ref(null);
const readingLineDraft = ref('');

const LYRICS_FONT_SIZE_CLASSES = [
  'lyrics-preview--font-compact',
  'lyrics-preview--font-default',
  'lyrics-preview--font-large',
];

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

const lyricsFontSizeClass = computed(
  () => LYRICS_FONT_SIZE_CLASSES[lyricsFontSizeIndex.value],
);
const canDecreaseLyricsFontSize = computed(() => lyricsFontSizeIndex.value > 0);
const canIncreaseLyricsFontSize = computed(
  () => lyricsFontSizeIndex.value < LYRICS_FONT_SIZE_CLASSES.length - 1,
);

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

const selectedSeparationError = computed(() => {
  const track = selectedTrack.value;
  return track ? (separationState.errors.get(track.id) ?? null) : null;
});

const selectedPresetId = computed(() => presetIdFor(selectedTrack.value));
const separationPresetOptions = computed(() =>
  separationPresetOptionsFor(selectedTrack.value),
);
const selectedSeparationInFlight = computed(() => {
  const track = selectedTrack.value;
  return track ? isSeparating(track.id) : false;
});
const selectedSeparationProgressPercent = computed(() => {
  const track = selectedTrack.value;
  return track ? progressPercent(track.id) : 0;
});
const selectedSeparationHasResult = computed(() =>
  Boolean(selectedTrack.value?.separation?.results?.[selectedPresetId.value]),
);

// Only Japanese/Korean lyrics get a reading-aid toolbar at all — showing a
// permanently-disabled control for every other language is pure noise
// (matches the plan's "not disabled — hidden" call).
const lyricsScript = computed(() =>
  detectLyricsScript(lyricLines.value.map((line) => line.text).join('')),
);
const showsReadingAid = computed(() =>
  SUPPORTED_READING_SCRIPTS.has(lyricsScript.value),
);

// Korean lyrics never produce furigana (see reading.js's
// buildRomanizationDoc — Korean has no ruby step at all), so the variant
// select hides that option for them. `readingVariant` lives in
// useLyricsReading.js's module scope and survives switching tracks, so
// without this a furigana selection made on a Japanese track would leave
// a Korean track's select showing a value with no matching <option>.
watch(lyricsScript, (script) => {
  if (script === 'ko' && readingVariant.value === 'furigana') {
    readingVariant.value = 'romaji';
  }
});

const selectedReadingDoc = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source ? getReadingDoc(track.id, source.filename) : null;
});

// Aligned 1:1 with lyricLines — entry is the matching reading line or null
// when there's no doc yet, or the doc is stale against the current text.
const readingLines = computed(() =>
  alignReadings(lyricLines.value, selectedReadingDoc.value),
);

const readingError = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source ? readingErrorFor(track.id, source.filename) : null;
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

let readingIntentRevision = 0;

async function applySelectedReadingIntent() {
  readingIntentRevision += 1;
  const revision = readingIntentRevision;
  editingReadingLineIndex.value = null;
  const track = selectedTrack.value;
  const source = selectedSource.value;
  if (!track || !source) return;

  const document = lyricsDocument.value;
  const script = lyricsScript.value;
  const loaded = await loadReading(track.id, source.filename);
  if (
    revision !== readingIntentRevision ||
    selectedTrack.value?.id !== track.id ||
    selectedSource.value?.filename !== source.filename
  ) {
    return;
  }
  if (
    readingVariant.value === 'off' ||
    loaded !== null ||
    !SUPPORTED_READING_SCRIPTS.has(script) ||
    isGeneratingReadingFor(track.id, source.filename)
  ) {
    return;
  }

  await generateReading(track.id, source.filename, document, script);
}

watch(
  () => [
    selectedTrack.value?.id,
    selectedSource.value?.filename,
    lyricsScript.value,
  ],
  applySelectedReadingIntent,
  { immediate: true },
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
      applySelectedReadingIntent();
    }
  },
);

function handlePresetChange(presetId) {
  const track = selectedTrack.value;
  if (track) selectPreset(track, presetId);
}

function generateSeparation() {
  const track = selectedTrack.value;
  if (!track || selectedSeparationHasResult.value) return;
  separate(track, selectedPresetId.value);
}

function setReadingVariant(variant) {
  readingVariant.value = variant;
  if (variant === 'off') {
    readingIntentRevision += 1;
    return;
  }
  applySelectedReadingIntent();
}

// Seeds the draft from whatever reading already exists for this line.
// Japanese: segment reading where present, the segment's own text
// otherwise (kana segments' text already is the reading), so correcting
// one wrong kanji doesn't mean retyping the whole line. Korean: there are
// no per-segment readings to reassemble (buildRomanizationDoc never
// produces a `segment.r`) — the thing being edited IS the line's romaji
// string, so seed from that directly.
function startEditReadingLine(index) {
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
  if (!track || !source) return;
  await setReadingLine(
    track.id,
    source.filename,
    lyricsDocument.value,
    lyricsDocument.value.lines[index].lineId,
    readingLineDraft.value,
  );
  cancelReadingLineEdit();
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

const canEditTiming = computed(() =>
  lyricsDocument.value.lines.some((line) => Number.isFinite(line.startMs)),
);
const canTapTiming = computed(
  () => timingDraft.value !== null && !canCommitTiming.value,
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

watch(
  () => lyricsDocument.value.documentId,
  (documentId, previousDocumentId) => {
    if (previousDocumentId && documentId !== previousDocumentId) cancelTiming();
  },
);

function startTimingEdit(lineId) {
  beginTimingLine(lyricsDocument.value, lineId);
}

function recordTimingBoundary() {
  if (Number.isFinite(currentLyricsPositionMs.value)) {
    tapBoundary(currentLyricsPositionMs.value);
  }
}

async function commitTimingDocument() {
  const document = buildTimingDocument();
  if (!document) return;
  if (await saveTimingDocument(document)) cancelTiming();
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
        :separation-preset-options="separationPresetOptions"
        :selected-separation-preset-id="selectedPresetId"
        :separation-preset-title="SEPARATION_PRESET_SELECT_TITLE"
        :separation-in-flight="selectedSeparationInFlight"
        :separation-progress-percent="selectedSeparationProgressPercent"
        :separation-has-result="selectedSeparationHasResult"
        :separation-error="selectedSeparationError || ''"
        @select-track="isTrackPickerOpen = true"
        @refresh="refresh"
        @separation-preset-change="handlePresetChange"
        @generate-separation="generateSeparation"
      />

      <LyricsPreparationBar
        :sources="selectedLyrics.sources"
        :selected-source-filename="state.selectedSourceFilename || ''"
        :has-selected-track="Boolean(selectedTrack)"
        :shows-reading-aid="showsReadingAid"
        :lyrics-script="lyricsScript"
        :reading-variant="readingVariant"
        :reading-error="readingError || ''"
        :can-decrease-font-size="canDecreaseLyricsFontSize"
        :can-increase-font-size="canIncreaseLyricsFontSize"
        @source-change="selectSource"
        @manage-sources="isSourceManagerOpen = true"
        @reading-variant-change="setReadingVariant"
        @decrease-font-size="decreaseLyricsFontSize"
        @increase-font-size="increaseLyricsFontSize"
      />

      <div v-if="timingDraft" class="lyrics-timing-stack">
        <LyricsTimingToolbar
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
          :draft="timingDraft"
          :can-tap="canTapTiming && Number.isFinite(currentLyricsPositionMs)"
          :is-saving="state.timingSave.isSaving"
          @tap="recordTimingBoundary"
          @nudge-boundary="nudgeBoundary"
        />
      </div>
      <LyricsDocumentPanel
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
        :has-reading-document="Boolean(selectedReadingDoc)"
        :editing-reading-line-index="editingReadingLineIndex"
        :reading-line-draft="readingLineDraft"
        :lyrics-script="lyricsScript"
        :can-edit-timing="canEditTiming"
        @seek-line="playFromLine"
        @edit-timing="startTimingEdit"
        @start-reading-edit="startEditReadingLine"
        @update-reading-draft="readingLineDraft = $event"
        @commit-reading-edit="commitReadingLineEdit"
        @cancel-reading-edit="cancelReadingLineEdit"
      />

      <LyricsLiveControls
        :offset-label="offsetLabel"
        :can-reset="state.offsetSeconds !== 0"
        :error="state.offsetSave.error || ''"
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
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.lyrics-timing-stack {
  min-width: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-raised);
}
</style>
