<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { Check, Pencil, X } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLyricsReading } from '../../composables/useLyricsReading.js';
import { useSeparation } from '../../composables/useSeparation.js';
import {
  SEPARATION_PRESET_SELECT_TITLE,
  separationPresetOptionsFor,
} from '../../constants/separationPresets.js';
import { formatDuration } from '../../utils/format.js';
import {
  alignReadings,
  detectLyricsScript,
  formatLyricTime,
} from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import LyricsLiveControls from './LyricsLiveControls.vue';
import LyricsPreparationBar from './LyricsPreparationBar.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import LyricsTrackPickerModal from './LyricsTrackPickerModal.vue';
import LyricsWorkspaceHeader from './LyricsWorkspaceHeader.vue';

const {
  state,
  selectedTrack,
  selectedLyrics,
  selectedSource,
  lyricLines,
  activeLineIndex,
  isReloading,
  refresh,
  selectSource,
  adjustOffset,
  resetOffset,
  playFromLine,
} = useLyrics();

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

const lyricsPreview = useTemplateRef('lyricsPreview');
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
  ['ja', 'ko'].includes(lyricsScript.value),
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

const isGeneratingReading = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source
    ? isGeneratingReadingFor(track.id, source.filename)
    : false;
});

const readingError = computed(() => {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  return track && source ? readingErrorFor(track.id, source.filename) : null;
});

watch(
  () => [selectedTrack.value?.id, selectedSource.value?.filename],
  ([trackId, filename]) => {
    editingReadingLineIndex.value = null;
    if (trackId && filename) loadReading(trackId, filename);
  },
  { immediate: true },
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

function canSeekLine(line) {
  return Number.isFinite(line?.start);
}

function setReadingVariant(variant) {
  readingVariant.value = variant;
}

function generateReadingForSelected() {
  const track = selectedTrack.value;
  const source = selectedSource.value;
  if (!track || !source) return;
  generateReading(
    track.id,
    source.filename,
    lyricLines.value.map((line) => line.text),
    lyricsScript.value,
  );
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
    index,
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

function shouldReduceMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

async function scrollActiveLineIntoView() {
  await nextTick();

  const container = lyricsPreview.value;
  const activeLine = container?.querySelector('.lyrics-line--active');
  if (!container || !activeLine) return;

  const containerRect = container.getBoundingClientRect();
  const activeRect = activeLine.getBoundingClientRect();
  const targetTop =
    container.scrollTop +
    activeRect.top -
    containerRect.top -
    container.clientHeight * 0.42 +
    activeRect.height / 2;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: shouldReduceMotion() ? 'auto' : 'smooth',
  });
}

watch(activeLineIndex, (index) => {
  if (index < 0) return;
  scrollActiveLineIntoView();
});
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
        :is-generating-reading="isGeneratingReading"
        :has-reading-document="Boolean(selectedReadingDoc)"
        :reading-error="readingError || ''"
        :can-decrease-font-size="canDecreaseLyricsFontSize"
        :can-increase-font-size="canIncreaseLyricsFontSize"
        @source-change="selectSource"
        @manage-sources="isSourceManagerOpen = true"
        @reading-variant-change="setReadingVariant"
        @generate-reading="generateReadingForSelected"
        @decrease-font-size="decreaseLyricsFontSize"
        @increase-font-size="increaseLyricsFontSize"
      />

      <div
        ref="lyricsPreview"
        class="lyrics-preview"
        :class="lyricsFontSizeClass"
        role="region"
        aria-label="歌詞內容"
        tabindex="0"
      >
        <UiHint v-if="state.error" tone="danger" padded>{{
          state.error
        }}</UiHint>
        <UiHint v-else-if="state.isLoading" padded>載入中</UiHint>
        <UiHint v-else-if="state.tracks.length === 0" padded>
          曲庫還沒有任何曲目。請先到 Import 匯入本機音訊。
        </UiHint>
        <UiHint v-else-if="!selectedTrack" padded>請選擇歌詞曲目。</UiHint>
        <UiHint v-else-if="state.isLoadingLyrics" padded>載入歌詞中</UiHint>
        <UiHint v-else-if="selectedLyrics.status === 'missing'" padded>
          目前沒有可用歌詞
        </UiHint>
        <UiHint v-else-if="selectedLyrics.status === 'unchecked'" padded>
          請按 reload 掃描歌詞來源
        </UiHint>
        <UiHint v-else-if="selectedSource && lyricLines.length === 0" padded>
          歌詞檔無可顯示內容
        </UiHint>
        <ol v-else class="lyrics-lines">
          <li
            v-for="(line, index) in lyricLines"
            :key="line.lineId"
            class="lyrics-line"
            :class="{
              'lyrics-line--active': index === activeLineIndex,
              'lyrics-line--past': index < activeLineIndex,
            }"
          >
            <!-- Editing never replaces the line's own display — it stays
                 rendered in its normal furigana/romaji style directly
                 below, so the user can see the actual result while
                 correcting it. No separate text label here either — that
                 line right underneath already shows it.
                 __edit-field mirrors __button's own grid (52px spacer +
                 text column) and padding exactly, so the input starts at
                 the same x-position as the lyric text does; __edit-row
                 mirrors __row's flex shape so the trailing action buttons
                 land where the pencil button sits below — both by
                 structural analogy, not by copying pixel values that would
                 drift out of sync if either one changes. -->
            <div
              v-if="editingReadingLineIndex === index"
              class="lyrics-line__edit-row"
            >
              <span class="lyrics-line__edit-field">
                <span class="lyrics-line__edit-spacer" aria-hidden="true" />
                <input
                  v-model="readingLineDraft"
                  type="text"
                  class="lyrics-line__edit-input"
                  :placeholder="
                    lyricsScript === 'ko'
                      ? '輸入這行的羅馬拼音'
                      : '輸入這行的假名讀音'
                  "
                  @keydown.enter="commitReadingLineEdit(index)"
                  @keydown.esc="cancelReadingLineEdit"
                />
              </span>
              <UiButton
                :icon="Check"
                title="儲存"
                aria-label="儲存"
                @click="commitReadingLineEdit(index)"
              />
              <UiButton
                :icon="X"
                title="取消"
                aria-label="取消"
                @click="cancelReadingLineEdit"
              />
            </div>
            <div class="lyrics-line__row">
              <button
                type="button"
                class="lyrics-line__button"
                :disabled="!canSeekLine(line)"
                :aria-label="
                  canSeekLine(line)
                    ? `從 ${formatLyricTime(line.start)} 播放`
                    : '未同步歌詞'
                "
                @click="playFromLine(line)"
              >
                <span class="lyrics-line__time">{{
                  formatLyricTime(line.start)
                }}</span>
                <span class="lyrics-line__text-group">
                  <span class="lyrics-line__text">
                    <template
                      v-if="
                        showsReadingAid &&
                        readingVariant === 'furigana' &&
                        readingLines[index]?.segments?.length
                      "
                    >
                      <template
                        v-for="(segment, segmentIndex) in readingLines[index]
                          .segments"
                        :key="segmentIndex"
                      >
                        <ruby v-if="segment.r"
                          >{{ segment.t }}<rt>{{ segment.r }}</rt></ruby
                        >
                        <template v-else>{{ segment.t }}</template>
                      </template>
                    </template>
                    <template v-else>{{ line.text }}</template>
                  </span>
                  <!-- Rendered for every line while this variant is active,
                       even ones with no matched romaji — a fallback space
                       keeps every row in romaji mode the same height, so a
                       stale/unmatched line doesn't sit shorter than its
                       neighbors. -->
                  <span
                    v-if="showsReadingAid && readingVariant === 'romaji'"
                    class="lyrics-line__romaji"
                  >
                    {{ readingLines[index]?.romaji || '\u00A0' }}
                  </span>
                </span>
              </button>
              <UiButton
                v-if="showsReadingAid && selectedReadingDoc"
                class="lyrics-line__edit"
                :icon="Pencil"
                title="修正這行讀音"
                aria-label="修正這行讀音"
                @click="startEditReadingLine(index)"
              />
            </div>
          </li>
        </ol>
      </div>

      <LyricsLiveControls
        :offset-label="offsetLabel"
        :can-reset="state.offsetSeconds !== 0"
        @adjust-offset="adjustOffset"
        @reset-offset="resetOffset"
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
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.lyrics-preview {
  min-height: 0;
  padding-bottom: var(--ui-lyrics-live-safe-area);
  overflow: auto;
}

.lyrics-preview--font-compact .lyrics-line__button {
  font-size: var(--ui-lyrics-font-size-compact);
}

.lyrics-preview--font-default .lyrics-line__button {
  font-size: var(--ui-lyrics-font-size-default);
}

.lyrics-preview--font-large .lyrics-line__button {
  font-size: var(--ui-lyrics-font-size-large);
}

.lyrics-lines {
  display: grid;
  /* Lyrics read as a dense block, not a spaced-out list — row legibility
     comes from the larger --ui-lyrics-font-size-* default, not from
     padding/gap, so the gap stays at the scale's own tightest step. */
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-4);
  list-style: none;
}

.lyrics-line {
  /* Column, not row: an active edit-row stacks above the line's own
     display instead of replacing it, so the styled result stays visible
     the whole time it's being corrected. */
  display: grid;
  gap: var(--ui-space-1);
  border-radius: var(--ui-radius);
  color: var(--ui-color-text-muted);
}

/* Owns the padding/radius/background that used to live on __button alone
   — the pencil (__edit) button is a flex sibling of __button inside this
   row, so if only __button carried the active/hover fill, the pencil sat
   outside it, visually detached from the highlighted row. Background
   painted here instead covers both, including the gap between them. */
.lyrics-line__row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius);
}

.lyrics-line__button {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: baseline;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-body);
  text-align: left;
  cursor: pointer;
}

.lyrics-line__edit {
  flex: 0 0 auto;
  opacity: 0;
}

.lyrics-line:hover .lyrics-line__edit,
.lyrics-line:focus-within .lyrics-line__edit {
  opacity: 1;
}

/* Mirrors .lyrics-line__row's own flex shape exactly (same display/gap, no
   extra padding of its own) so its trailing action buttons land in the
   same slot the pencil button occupies in the row below. */
.lyrics-line__edit-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

/* Mirrors .lyrics-line__button's own grid+padding exactly (same
   grid-template-columns/gap/padding) so the input starts at the same
   x-position the lyric text does — the spacer fills the 52px time column
   as an empty first grid cell. */
.lyrics-line__edit-field {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-3);
}

.lyrics-line__edit-input {
  min-width: 0;
  height: var(--ui-control-height);
  padding: 0 var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.lyrics-line__edit-input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-line__button:disabled {
  cursor: default;
}

/* :has() gates the hover fill on the seek button itself being enabled
   (untimed lines stay unhighlighted on hover), while still painting the
   whole row — including the pencil button's area — not just the button. */
.lyrics-line__row:has(.lyrics-line__button:not(:disabled)):hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.lyrics-line__button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.lyrics-line--past {
  color: var(--ui-color-text);
  opacity: var(--ui-opacity-muted);
}

.lyrics-line--active {
  color: var(--ui-color-accent-contrast);
  opacity: 1;
}

.lyrics-line--active .lyrics-line__row {
  background: var(--ui-color-accent);
}

.lyrics-line__time {
  font-size: var(--ui-font-size-sm);
  line-height: inherit;
  font-variant-numeric: tabular-nums;
}

.lyrics-line__text-group {
  display: grid;
  /* Smallest step on the spacing scale — tighter than would read as its
     own row, since the romaji line is a caption of the line above it, not
     a sibling of equal weight. */
  gap: var(--ui-space-1);
  min-width: 0;
}

.lyrics-line__text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

.lyrics-line__text rt {
  /* Relative to the line's own font-size so ruby scales with the
     compact/default/large lyrics-preview font-size toggle instead of
     needing its own token. kuromoji tokenizes most multi-kanji compounds
     into one <ruby> per character (何十回 -> 何/十/回, each its own
     token+reading) — real per-character correspondence, not per-word. At
     that granularity, each ruby's box is sized to whichever is wider, its
     1-character base or its (often 2-character) reading; verified directly
     (headless Electron measurement, real font stack) that ruby-align has
     zero effect on that box width for single-character bases — the only
     lever that actually shrinks it is the reading's own font-size. 0.5em
     is the standard ruby:base ratio (most browsers' UA stylesheet default,
     smaller than the 0.55em this used before) — for a 2-kana reading over
     1 kanji it's close to matching the base width, keeping adjacent
     kanji+reading pairs visually paired instead of bleeding into a
     continuous strip. A 3-kana reading (e.g. 十→じゅう) still overflows its
     single-character base somewhat — that's inherent to native browser
     ruby rendering (and to printed furigana) when the reading genuinely
     needs more width than its base, not something CSS can fully undo
     without shrinking the text into illegibility. */
  font-size: 0.5em;
  color: var(--ui-color-text-muted);
  user-select: none;
}

.lyrics-line--active .lyrics-line__text rt {
  color: inherit;
  opacity: var(--ui-opacity-muted);
}

.lyrics-line__romaji {
  color: var(--ui-color-text-muted);
  font-size: 0.7em;
  line-height: var(--ui-line-height-caption);
}

/* visibility, not display:none — the box still needs to occupy its row
   height in every variant (off/furigana), or switching to/from romaji
   changes row height and the whole list jumps. */
.lyrics-line__romaji--hidden {
  visibility: hidden;
}

.lyrics-line--active .lyrics-line__romaji {
  color: inherit;
  opacity: var(--ui-opacity-muted);
}
</style>
