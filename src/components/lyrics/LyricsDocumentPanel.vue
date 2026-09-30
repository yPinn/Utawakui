<script setup>
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import { Check, Clock, LocateFixed, Pencil, X } from '../../icons/index.js';
import { formatLyricTime } from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

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
  lyricsScript: { type: String, default: 'unknown' },
  canEditTiming: { type: Boolean, default: false },
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

const activeLineId = computed(() => {
  if (props.activeLineIndex < 0) return null;
  return props.lines[props.activeLineIndex]?.lineId ?? null;
});
const showsReturnToActiveLine = computed(
  () => Boolean(activeLineId.value) && !isFollowingActiveLine.value,
);

function panelViewport() {
  return panel.value?.viewport ?? panel.value;
}

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
  const activeRect = activeLine.getBoundingClientRect();
  scrollPanel.scrollTo({
    top: Math.max(
      0,
      scrollPanel.scrollTop +
        activeRect.top -
        containerRect.top -
        scrollPanel.clientHeight * 0.42 +
        activeRect.height / 2,
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
</script>

<template>
  <div class="lyrics-document">
    <UiScrollRegion
      id="lyrics-document-reader"
      ref="panel"
      class="lyrics-preview"
      :class="fontSizeClass"
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
        曲庫還沒有任何曲目。請先到 Import 匯入本機音訊。
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
          }"
        >
          <div
            v-if="editingReadingLineIndex === index"
            class="lyrics-line__edit-row"
          >
            <span class="lyrics-line__edit-field">
              <span aria-hidden="true" />
              <input
                :value="readingLineDraft"
                type="text"
                class="lyrics-line__edit-input"
                :placeholder="
                  lyricsScript === 'ko'
                    ? '輸入這行的羅馬拼音'
                    : '輸入這行的假名讀音'
                "
                @input="emit('update-reading-draft', $event.target.value)"
                @keydown.enter="emit('commit-reading-edit', index)"
                @keydown.esc="emit('cancel-reading-edit')"
              />
            </span>
            <UiButton
              :icon="Check"
              title="儲存"
              aria-label="儲存"
              @click="emit('commit-reading-edit', index)"
            />
            <UiButton
              :icon="X"
              title="取消"
              aria-label="取消"
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
                <span
                  v-if="showsReadingAid && readingVariant === 'romaji'"
                  class="lyrics-line__romaji"
                >
                  {{ readingLines[index]?.romaji || '\u00A0' }}
                </span>
              </span>
            </button>
            <UiButton
              v-if="canEditTiming && canSeekLine(line)"
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
  padding-bottom: var(--ui-lyrics-live-safe-area);
}
.lyrics-preview__return {
  position: absolute;
  right: var(--ui-space-4);
  bottom: calc(
    var(--ui-space-4) + var(--ui-lyrics-live-control-height) + var(--ui-space-2)
  );
  z-index: var(--ui-z-dropdown);
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
  border-radius: var(--ui-radius);
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
.lyrics-line__edit-input:focus-visible,
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
}
.lyrics-line__text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}
.lyrics-line__text rt {
  font-size: 0.5em;
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
  font-size: 0.7em;
  line-height: var(--ui-line-height-caption);
}
</style>
