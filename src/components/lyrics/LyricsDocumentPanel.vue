<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Check, Clock, LocateFixed, Pencil, X } from '../../icons/index.js';
import { formatLyricTime } from '../../utils/lyrics.js';
import { rubySegmentGaps } from '../../utils/rubyLayout.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({
  documentId: { type: String, default: '' },
  error: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isLoadingLyrics: { type: Boolean, default: false },
  trackCount: { type: Number, default: 0 },
  hasSelectedTrack: { type: Boolean, default: false },
  lyricsStatus: { type: String, default: 'unchecked' },
  hasSelectedSource: { type: Boolean, default: false },
  lines: { type: Array, default: () => [] },
  activeLineIndex: { type: Number, default: -1 },
  fontSizeClass: { type: String, default: '' },
  showsReadingAid: { type: Boolean, default: false },
  readingVariant: { type: String, default: 'off' },
  readingLines: { type: Array, default: () => [] },
  hasReadingDocument: { type: Boolean, default: false },
  editingReadingLineIndex: { type: Number, default: null },
  readingLineDraft: { type: String, default: '' },
  isSavingReading: { type: Boolean, default: false },
  lyricsScript: { type: String, default: 'unknown' },
  canEditTiming: { type: Boolean, default: false },
  editableTimingLineIds: { type: Array, default: null },
  // 'sheet' prints the live lyrics on paper with a highlighter on the sung line.
  presentation: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'sheet'].includes(value),
  },
});

const emit = defineEmits([
  'seek-line',
  'edit-timing',
  'start-reading-edit',
  'update-reading-draft',
  'commit-reading-edit',
  'cancel-reading-edit',
]);

const LYRICS_SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
]);

const panel = useTemplateRef('panel');
const isFollowingActiveLine = shallowRef(true);
let pointerScrollStart = null;
const measuredRubyScale = shallowRef(1);
const readerHeight = shallowRef('0px');
let readerObserver;

const activeLineId = computed(() => {
  if (props.activeLineIndex < 0) return null;
  return props.lines[props.activeLineIndex]?.lineId ?? null;
});
const showsFurigana = computed(
  () => props.showsReadingAid && props.readingVariant === 'furigana',
);
const editableTimingIds = computed(() =>
  props.editableTimingLineIds === null
    ? null
    : new Set(props.editableTimingLineIds),
);
const lyricsLang = computed(() =>
  ['ja', 'ko'].includes(props.lyricsScript) ? props.lyricsScript : undefined,
);
const romanizationLang = computed(() =>
  lyricsLang.value ? `${lyricsLang.value}-Latn` : undefined,
);
// Sheet readings float over their word, so neighbours get explicit room.
const rubyGaps = computed(() =>
  props.presentation === 'sheet' && showsFurigana.value
    ? props.readingLines.map((line) =>
        rubySegmentGaps(line?.segments, measuredRubyScale.value),
      )
    : [],
);

function rubyGapStyle(lineIndex, segmentIndex) {
  const gap = rubyGaps.value[lineIndex]?.[segmentIndex] ?? 0;
  return gap > 0 ? { '--lyrics-ruby-gap': `${gap}em` } : undefined;
}

const showsReturnToActiveLine = computed(
  () => Boolean(activeLineId.value) && !isFollowingActiveLine.value,
);

function panelViewport() {
  return panel.value?.viewport ?? panel.value;
}

function measureReader() {
  const viewport = panelViewport();
  if (!viewport) return;
  readerHeight.value = `${Math.max(0, viewport.clientHeight || 0)}px`;
  if (typeof globalThis.getComputedStyle !== 'function') return;
  const annotation = viewport.querySelector?.('rt');
  const lyric = annotation?.closest('.lyrics-line__text');
  if (!annotation || !lyric) return;
  const mainSize = Number.parseFloat(getComputedStyle(lyric).fontSize);
  const rubySize = Number.parseFloat(getComputedStyle(annotation).fontSize);
  if (mainSize > 0 && rubySize > 0)
    measuredRubyScale.value = rubySize / mainSize;
}

onMounted(() => {
  measureReader();
  const viewport = panelViewport();
  if (viewport && typeof ResizeObserver === 'function') {
    readerObserver = new ResizeObserver(() => {
      measureReader();
      if (isFollowingActiveLine.value) void scrollActiveLineIntoView();
    });
    readerObserver.observe(viewport);
  }
});
onUnmounted(() => readerObserver?.disconnect());

function canSeekLine(line) {
  return Number.isFinite(line?.start);
}

function shouldReduceMotion() {
  return Boolean(
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
}

async function scrollActiveLineIntoView() {
  await nextTick();
  const scrollPanel = panelViewport();
  const activeLine = scrollPanel?.querySelector?.('.lyrics-line--active');
  if (
    !scrollPanel ||
    !activeLine ||
    typeof scrollPanel.getBoundingClientRect !== 'function' ||
    typeof activeLine.getBoundingClientRect !== 'function' ||
    typeof scrollPanel.scrollTo !== 'function'
  ) {
    return;
  }
  const containerRect = scrollPanel.getBoundingClientRect();
  const primary =
    activeLine.querySelector?.('.lyrics-line__text') ?? activeLine;
  const activeRect = primary.getBoundingClientRect();
  const rubyReserve =
    typeof globalThis.getComputedStyle === 'function'
      ? Number.parseFloat(getComputedStyle(primary).paddingBlockStart) || 0
      : 0;
  scrollPanel.scrollTo({
    top: Math.max(
      0,
      scrollPanel.scrollTop +
        activeRect.top -
        containerRect.top -
        scrollPanel.clientHeight / 3 +
        rubyReserve,
    ),
    behavior: shouldReduceMotion() ? 'auto' : 'smooth',
  });
}

function pauseActiveLineFollowing() {
  if (!activeLineId.value) return;
  pointerScrollStart = null;
  isFollowingActiveLine.value = false;
}

function handleLyricsScrollKey(event) {
  if (
    event.target === event.currentTarget &&
    LYRICS_SCROLL_KEYS.has(event.key)
  ) {
    pauseActiveLineFollowing();
  }
}

function rememberPointerScrollStart(event) {
  pointerScrollStart =
    event.target === event.currentTarget ? event.currentTarget.scrollTop : null;
}

function handleLyricsScroll() {
  if (
    pointerScrollStart === null ||
    panelViewport()?.scrollTop === pointerScrollStart
  ) {
    return;
  }
  pauseActiveLineFollowing();
}

function clearPointerScrollStart() {
  pointerScrollStart = null;
}

async function resumeActiveLineFollowing() {
  isFollowingActiveLine.value = true;
  await scrollActiveLineIntoView();
}

watch(
  [() => props.documentId, activeLineId],
  ([documentId, lineId], previous = []) => {
    const [previousDocumentId] = previous;
    if (documentId !== previousDocumentId) {
      isFollowingActiveLine.value = true;
    }
    if (lineId && isFollowingActiveLine.value) {
      scrollActiveLineIntoView();
    }
  },
  { immediate: true },
);

watch(
  [
    () => props.fontSizeClass,
    () => props.readingVariant,
    () => props.readingLines,
    () => props.presentation,
    () => props.lines,
  ],
  async () => {
    await nextTick();
    measureReader();
    if (isFollowingActiveLine.value) void scrollActiveLineIntoView();
  },
);
</script>

<template>
  <div
    class="lyrics-document"
    :style="{ '--lyrics-reader-height': readerHeight }"
  >
    <UiScrollRegion
      id="lyrics-document-reader"
      ref="panel"
      class="lyrics-preview"
      :class="[
        fontSizeClass,
        { 'lyrics-preview--sheet': presentation === 'sheet' },
      ]"
      axis="both"
      viewport-class="lyrics-preview__viewport"
      role="region"
      aria-label="歌詞內容"
      tabindex="0"
      @wheel.passive="pauseActiveLineFollowing"
      @touchmove.passive="pauseActiveLineFollowing"
      @keydown="handleLyricsScrollKey"
      @pointerdown="rememberPointerScrollStart"
      @pointerup="clearPointerScrollStart"
      @pointercancel="clearPointerScrollStart"
      @scroll="handleLyricsScroll"
    >
      <UiNotice
        v-if="error"
        tone="danger"
        title="歌詞讀取未完成"
        :message="error"
        compact
      />
      <UiHint v-else-if="isLoading" padded>載入中</UiHint>
      <UiHint v-else-if="trackCount === 0" padded>
        曲庫還沒有任何曲目。請從曲庫的「匯入曲目」加入本機音訊。
      </UiHint>
      <UiHint v-else-if="!hasSelectedTrack" padded>請選擇歌詞曲目。</UiHint>
      <UiHint v-else-if="isLoadingLyrics" padded>載入歌詞中</UiHint>
      <UiHint v-else-if="lyricsStatus === 'missing'" padded
        >目前沒有可用歌詞</UiHint
      >
      <UiHint v-else-if="lyricsStatus === 'unchecked'" padded>
        請按 reload 掃描歌詞來源
      </UiHint>
      <UiHint v-else-if="hasSelectedSource && lines.length === 0" padded>
        歌詞檔無可顯示內容
      </UiHint>
      <ol v-else class="lyrics-lines">
        <li
          v-for="(line, index) in lines"
          :key="line.lineId"
          class="lyrics-line"
          :class="{
            'lyrics-line--active': index === activeLineIndex,
            'lyrics-line--past': index < activeLineIndex,
            'lyrics-line--ruby': showsFurigana,
          }"
        >
          <div
            v-if="editingReadingLineIndex === index"
            class="lyrics-line__edit-row"
          >
            <span class="lyrics-line__edit-field">
              <span aria-hidden="true" />
              <UiTextField
                :id="`lyrics-reading-line-${index}`"
                :model-value="readingLineDraft"
                label="這行的讀音"
                label-hidden
                autofocus
                :disabled="isSavingReading"
                :placeholder="
                  lyricsScript === 'ko'
                    ? '輸入這行的羅馬拼音'
                    : '輸入這行的假名讀音'
                "
                @update:model-value="emit('update-reading-draft', $event)"
                @keydown.enter="emit('commit-reading-edit', index)"
                @keydown.esc="emit('cancel-reading-edit')"
              />
            </span>
            <UiButton
              :icon="Check"
              title="儲存"
              aria-label="儲存"
              :loading="isSavingReading"
              @click="emit('commit-reading-edit', index)"
            />
            <UiButton
              :icon="X"
              title="取消"
              aria-label="取消"
              :disabled="isSavingReading"
              @click="emit('cancel-reading-edit')"
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
              @click="emit('seek-line', line)"
            >
              <span class="lyrics-line__time">{{
                formatLyricTime(line.start)
              }}</span>
              <span class="lyrics-line__text-group" :lang="lyricsLang">
                <span class="lyrics-line__text"
                  ><span class="lyrics-line__ink">
                    <template
                      v-if="
                        showsFurigana && readingLines[index]?.segments?.length
                      "
                    >
                      <template
                        v-for="(segment, segmentIndex) in readingLines[index]
                          .segments"
                        :key="segmentIndex"
                      >
                        <ruby
                          v-if="segment.r"
                          :style="rubyGapStyle(index, segmentIndex)"
                          >{{ segment.t }}<rt>{{ segment.r }}</rt></ruby
                        >
                        <span
                          v-else-if="rubyGapStyle(index, segmentIndex)"
                          class="lyrics-line__ruby-gap"
                          :style="rubyGapStyle(index, segmentIndex)"
                          >{{ segment.t }}</span
                        >
                        <template v-else>{{ segment.t }}</template>
                      </template>
                    </template>
                    <template v-else>{{ line.text }}</template>
                  </span></span
                >
                <span
                  v-if="showsReadingAid && readingVariant === 'romaji'"
                  class="lyrics-line__romaji"
                  :lang="romanizationLang"
                >
                  {{ readingLines[index]?.romaji || '\u00A0' }}
                </span>
              </span>
            </button>
            <UiButton
              v-if="
                canEditTiming &&
                canSeekLine(line) &&
                (!editableTimingIds || editableTimingIds.has(line.lineId))
              "
              class="lyrics-line__edit"
              :icon="Clock"
              :title="`編輯逐字時間：${line.text}`"
              :aria-label="`編輯逐字時間：${line.text}`"
              @click="emit('edit-timing', line.lineId)"
            />
            <UiButton
              v-if="showsReadingAid && hasReadingDocument"
              class="lyrics-line__edit"
              :icon="Pencil"
              title="修正這行讀音"
              aria-label="修正這行讀音"
              @click="emit('start-reading-edit', index)"
            />
          </div>
        </li>
      </ol>
    </UiScrollRegion>

    <UiIconButton
      v-if="showsReturnToActiveLine"
      class="lyrics-preview__return"
      variant="accent"
      size="lg"
      shape="circle"
      :icon="LocateFixed"
      label="回到目前歌詞"
      aria-controls="lyrics-document-reader"
      @click="resumeActiveLineFollowing"
    />
  </div>
</template>

<style scoped>
.lyrics-document {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.lyrics-preview {
  height: 100%;
  min-height: 0;
}
.lyrics-preview :deep(.lyrics-preview__viewport) {
  padding-bottom: max(
    var(--ui-lyrics-live-safe-area),
    calc(var(--lyrics-reader-height) * 2 / 3)
  );
}
.lyrics-preview__return {
  position: absolute;
  right: var(--ui-space-4);
  bottom: calc(
    var(--ui-space-4) + var(--ui-lyrics-live-control-height) + var(--ui-space-2)
  );
  z-index: var(--ui-layer-overlay);
  box-shadow: var(--ui-shadow-overlay);
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
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-4);
  list-style: none;
}
.lyrics-line {
  display: grid;
  gap: var(--ui-space-1);
  border-radius: var(--ui-radius-md);
  color: var(--ui-color-text-muted);
}
.lyrics-line__row,
.lyrics-line__edit-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}
.lyrics-line__row {
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
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
  font-size: var(--ui-lyrics-font-size-default);
  font-weight: var(--ui-lyrics-font-weight);
  line-height: var(--ui-lyrics-line-height);
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
.lyrics-line__edit-field {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-3);
}
.lyrics-line__button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}
.lyrics-line__button:disabled {
  cursor: default;
}
.lyrics-line__row:has(.lyrics-line__button:not(:disabled)):hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
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
  gap: var(--ui-space-1);
  min-width: 0;
  font-family: var(--ui-font-family-base);
}
.lyrics-line__text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}
.lyrics-line__text rt {
  font-size: var(--ui-lyrics-ruby-font-size);
  font-weight: var(--ui-lyrics-ruby-font-weight);
  line-height: var(--ui-lyrics-ruby-line-height);
  color: var(--ui-color-text-muted);
  user-select: none;
}
.lyrics-line--active .lyrics-line__text rt,
.lyrics-line--active .lyrics-line__romaji {
  color: inherit;
  opacity: var(--ui-opacity-muted);
}
.lyrics-line__romaji {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-lyrics-romaji-font-size);
  font-weight: var(--ui-lyrics-romaji-font-weight);
  line-height: var(--ui-lyrics-romaji-line-height);
  overflow-wrap: anywhere;
}
/* Sheet: ink on paper, readings printed above, highlighter on the sung line. */
.lyrics-preview--sheet .lyrics-line {
  color: var(--ui-color-text);
}
.lyrics-preview--sheet .lyrics-line__button {
  align-items: last baseline;
}
.lyrics-preview--sheet .lyrics-line__time {
  color: var(--ui-color-text-muted);
}
.lyrics-preview--sheet .lyrics-line--active .lyrics-line__row {
  background: transparent;
}
/* Reserve the same fragment geometry before and during the current line.
   Only paint changes, so marker activation cannot change wrapping. */
.lyrics-preview--sheet .lyrics-line__ink {
  padding-inline: var(--ui-space-3);
  margin-inline: calc(-1 * var(--ui-space-3));
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.lyrics-preview--sheet .lyrics-line--active .lyrics-line__ink {
  background-image: linear-gradient(
    104deg,
    transparent var(--ui-lyrics-marker-cut),
    var(--ui-lyrics-highlight)
      calc(var(--ui-lyrics-marker-cut) + var(--ui-border-width)),
    var(--ui-lyrics-highlight)
      calc(100% - var(--ui-lyrics-marker-cut) - var(--ui-border-width)),
    transparent calc(100% - var(--ui-lyrics-marker-cut))
  );
  background-position: 0 calc(100% - var(--ui-lyrics-marker-bottom));
  background-size: 100% var(--ui-lyrics-marker-height);
  background-repeat: no-repeat;
}
.lyrics-preview--sheet .lyrics-line__text rt,
.lyrics-preview--sheet .lyrics-line__romaji,
.lyrics-preview--sheet .lyrics-line--active .lyrics-line__text rt,
.lyrics-preview--sheet .lyrics-line--active .lyrics-line__romaji {
  color: inherit;
  opacity: 1;
}
/* Readings float centred over their word instead of spreading it;
   rubySegmentGaps() reads the actual tier sizes to keep neighbours clear. */
.lyrics-preview--sheet {
  --lyrics-ruby-block-size: calc(
    var(--ui-lyrics-ruby-font-size) * var(--ui-lyrics-ruby-line-height)
  );
}
.lyrics-preview--sheet .lyrics-line--ruby .lyrics-line__text {
  padding-block-start: var(--lyrics-ruby-block-size);
}
.lyrics-preview--sheet .lyrics-line__text ruby {
  position: relative;
  display: inline-block;
  margin-inline-start: var(--lyrics-ruby-gap, 0);
}
.lyrics-preview--sheet .lyrics-line__ruby-gap {
  margin-inline-start: var(--lyrics-ruby-gap, 0);
}
.lyrics-preview--sheet .lyrics-line__text rt {
  position: absolute;
  inset-block-end: 88%;
  inset-inline-start: 50%;
  display: block;
  white-space: nowrap;
  transform: translateX(-50%);
}
.lyrics-preview--sheet .lyrics-line__romaji {
  order: -1;
}
</style>
