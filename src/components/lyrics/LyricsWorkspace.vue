<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { Minus, Plus, RefreshCw, RotateCcw } from '@lucide/vue';
import UiButton from '../ui/UiButton.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { formatDuration } from '../../utils/format.js';
import { formatLyricTime } from '../../utils/lyrics.js';

const {
  state,
  selectedTrack,
  selectedLyrics,
  selectedSource,
  lyricLines,
  activeLineIndex,
  isReloading,
  refresh,
  selectTrack,
  selectSource,
  adjustOffset,
  resetOffset,
  playFromLine,
} = useLyrics();

const lyricsPreview = useTemplateRef('lyricsPreview');
const lyricsFontSizeIndex = ref(1);
const LYRICS_FONT_SIZE_CLASSES = [
  'lyrics-preview--font-compact',
  'lyrics-preview--font-default',
  'lyrics-preview--font-large',
];

const tracksWithLyricsCount = computed(
  () =>
    state.tracks.filter((track) => track.lyrics?.status === 'available').length,
);
const tracksMissingLyricsCount = computed(
  () =>
    state.tracks.filter((track) => track.lyrics?.status === 'missing').length,
);
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
      return `掃描字幕 ${completed}/${total}`;
    }
    return '掃描字幕中';
  }
  return '';
});

function decreaseLyricsFontSize() {
  lyricsFontSizeIndex.value = Math.max(0, lyricsFontSizeIndex.value - 1);
}

function increaseLyricsFontSize() {
  lyricsFontSizeIndex.value = Math.min(
    LYRICS_FONT_SIZE_CLASSES.length - 1,
    lyricsFontSizeIndex.value + 1,
  );
}

function lyricsStatusLabel(track) {
  const status = track.lyrics?.status;
  if (status === 'available') return 'CC';
  if (status === 'missing') return '無字幕';
  return '待 reload';
}

function lyricsStatusClass(track) {
  return `lyrics-status--${track.lyrics?.status || 'unchecked'}`;
}

function sourceLabel(source) {
  return `${source.language.toUpperCase()} / ${source.kind === 'youtube-cc' ? 'YouTube CC' : source.kind}`;
}

function handleSourceChange(event) {
  selectSource(event.target.value);
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
    <section class="lyrics-panel lyrics-panel--list" aria-label="Lyrics tracks">
      <header class="lyrics-panel__header">
        <div class="lyrics-panel__title-group">
          <h2 class="lyrics-panel__title">曲目</h2>
          <p class="lyrics-panel__meta">
            {{ tracksWithLyricsCount }} CC /
            {{ tracksMissingLyricsCount }} 無字幕
          </p>
          <p v-if="reloadStatusLabel" class="lyrics-panel__status">
            {{ reloadStatusLabel }}
          </p>
        </div>
        <UiButton
          :icon="RefreshCw"
          :active="isReloading"
          title="重新載入"
          aria-label="重新載入"
          @click="refresh"
        />
      </header>

      <p v-if="state.error" class="lyrics-error">{{ state.error }}</p>
      <p v-else-if="state.isLoading" class="lyrics-empty">載入中</p>

      <ul v-else class="lyrics-track-list">
        <UiTrackRow
          v-for="track in state.tracks"
          :key="track.id"
          :track="track"
          :active="track.id === state.selectedTrackId"
          interactive
          @click="selectTrack(track.id)"
        >
          <template #trail>
            <span class="lyrics-status" :class="lyricsStatusClass(track)">
              {{ lyricsStatusLabel(track) }}
            </span>
          </template>
        </UiTrackRow>
      </ul>
    </section>

    <section
      class="lyrics-panel lyrics-panel--preview"
      aria-label="Lyrics preview"
    >
      <header class="lyrics-detail">
        <div class="lyrics-detail__text">
          <h2 class="lyrics-detail__title">
            {{ selectedTrack?.title || '未選取曲目' }}
          </h2>
          <p v-if="selectedMeta" class="lyrics-detail__meta">
            {{ selectedMeta }}
          </p>
        </div>
        <span
          v-if="selectedTrack"
          class="lyrics-status lyrics-status--large"
          :class="lyricsStatusClass(selectedTrack)"
        >
          {{ lyricsStatusLabel(selectedTrack) }}
        </span>
      </header>

      <div class="lyrics-toolbar">
        <label class="lyrics-source">
          <span class="lyrics-source__label">來源</span>
          <select
            class="lyrics-source__select"
            :value="state.selectedSourceFilename || ''"
            :disabled="selectedLyrics.sources.length === 0"
            @change="handleSourceChange"
          >
            <option value="">無</option>
            <option
              v-for="source in selectedLyrics.sources"
              :key="source.filename"
              :value="source.filename"
            >
              {{ sourceLabel(source) }}
            </option>
          </select>
        </label>

        <div class="lyrics-text-size" aria-label="歌詞字級">
          <UiButton
            :icon="Minus"
            title="縮小歌詞"
            aria-label="縮小歌詞"
            :disabled="!canDecreaseLyricsFontSize"
            @click="decreaseLyricsFontSize"
          />
          <span class="lyrics-text-size__value">字級</span>
          <UiButton
            :icon="Plus"
            title="放大歌詞"
            aria-label="放大歌詞"
            :disabled="!canIncreaseLyricsFontSize"
            @click="increaseLyricsFontSize"
          />
        </div>

        <div class="lyrics-offset" aria-label="歌詞偏移">
          <UiButton
            :icon="Minus"
            title="歌詞提前 0.1 秒"
            aria-label="歌詞提前 0.1 秒"
            @click="adjustOffset(-0.1)"
          />
          <span class="lyrics-offset__value">{{ offsetLabel }}</span>
          <UiButton
            :icon="Plus"
            title="歌詞延後 0.1 秒"
            aria-label="歌詞延後 0.1 秒"
            @click="adjustOffset(0.1)"
          />
          <UiButton
            :icon="RotateCcw"
            title="重設偏移"
            aria-label="重設偏移"
            @click="resetOffset"
          />
        </div>
      </div>

      <div
        ref="lyricsPreview"
        class="lyrics-preview"
        :class="lyricsFontSizeClass"
      >
        <p v-if="state.isLoadingLyrics" class="lyrics-empty">載入歌詞中</p>
        <p v-else-if="selectedLyrics.status === 'missing'" class="lyrics-empty">
          這首目前沒有可用 CC 字幕
        </p>
        <p
          v-else-if="selectedLyrics.status === 'unchecked'"
          class="lyrics-empty"
        >
          等待 reload 檢查 CC 字幕
        </p>
        <p
          v-else-if="selectedSource && lyricLines.length === 0"
          class="lyrics-empty"
        >
          字幕檔無法解析
        </p>
        <ol v-else class="lyrics-lines">
          <li
            v-for="(line, index) in lyricLines"
            :key="`${line.start}-${index}`"
            class="lyrics-line"
            :class="{
              'lyrics-line--active': index === activeLineIndex,
              'lyrics-line--past': index < activeLineIndex,
            }"
          >
            <button
              type="button"
              class="lyrics-line__button"
              :aria-label="`從 ${formatLyricTime(line.start)} 播放`"
              @click="playFromLine(line)"
            >
              <span class="lyrics-line__time">{{
                formatLyricTime(line.start)
              }}</span>
              <span class="lyrics-line__text">{{ line.text }}</span>
            </button>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lyrics-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: var(--ui-space-3);
  min-height: 0;
}

.lyrics-panel {
  min-height: 0;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.lyrics-panel--list {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 190px);
}

.lyrics-panel--preview {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  max-height: calc(100vh - 190px);
}

.lyrics-panel__header,
.lyrics-detail,
.lyrics-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border-bottom: 1px solid var(--ui-border);
}

.lyrics-panel__title,
.lyrics-detail__title,
.lyrics-panel__meta,
.lyrics-detail__meta,
.lyrics-error,
.lyrics-empty {
  margin: 0;
}

.lyrics-panel__title,
.lyrics-detail__title {
  font-size: var(--ui-text-lg);
  font-weight: var(--ui-font-weight-strong);
  color: var(--ui-text);
}

.lyrics-panel__meta,
.lyrics-detail__meta {
  margin-top: var(--ui-space-1);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.lyrics-panel__status {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-accent);
  font-size: var(--ui-text-sm);
}

.lyrics-track-list,
.lyrics-lines {
  list-style: none;
  margin: 0;
  padding: var(--ui-space-2);
}

.lyrics-track-list,
.lyrics-preview {
  overflow: auto;
}

.lyrics-error,
.lyrics-empty {
  padding: var(--ui-space-4);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.lyrics-error {
  color: var(--ui-danger);
}

.lyrics-status {
  flex: 0 0 auto;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  color: var(--ui-text-muted);
  background: var(--ui-bg);
  font-size: var(--ui-text-sm);
  line-height: 1;
}

.lyrics-status--available {
  color: var(--ui-accent);
  background: var(--ui-bg);
}

.lyrics-status--missing {
  color: var(--ui-text-muted);
}

.lyrics-status--unchecked {
  color: var(--ui-text);
  background: var(--ui-surface-hover);
}

.lyrics-status--large {
  padding: var(--ui-space-2) var(--ui-space-3);
}

.lyrics-toolbar {
  align-items: stretch;
  flex-wrap: wrap;
}

.lyrics-source {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex: 1 1 220px;
  min-width: 0;
}

.lyrics-source__label {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.lyrics-source__select {
  min-width: 180px;
  max-width: 280px;
  height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
}

.lyrics-source__select:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.lyrics-text-size,
.lyrics-offset {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.lyrics-text-size__value,
.lyrics-offset__value {
  min-width: 52px;
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.lyrics-preview {
  min-height: 360px;
}

.lyrics-preview--font-compact .lyrics-line__button {
  font-size: var(--ui-text-md);
}

.lyrics-preview--font-default .lyrics-line__button {
  font-size: var(--ui-text-lg);
}

.lyrics-preview--font-large .lyrics-line__button {
  font-size: var(--ui-text-xl);
}

.lyrics-lines {
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-line {
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
}

.lyrics-line__button {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: baseline;
  width: 100%;
  padding: var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius);
  background: transparent;
  color: inherit;
  font-family: var(--font-ui);
  font-size: var(--ui-text-lg);
  line-height: 1.55;
  text-align: left;
  cursor: pointer;
}

.lyrics-line__button:hover {
  background: var(--ui-surface-hover);
  color: var(--ui-text);
}

.lyrics-line__button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}

.lyrics-line--past {
  color: var(--ui-text);
  opacity: 0.72;
}

.lyrics-line--active {
  color: var(--ui-accent-contrast);
  opacity: 1;
}

.lyrics-line--active .lyrics-line__button {
  background: var(--ui-accent);
}

.lyrics-line__time {
  font-size: var(--ui-text-sm);
  line-height: inherit;
  font-variant-numeric: tabular-nums;
}

.lyrics-line__text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

@media (max-width: 900px) {
  .lyrics-workspace {
    grid-template-columns: 1fr;
  }

  .lyrics-panel--list,
  .lyrics-panel--preview {
    max-height: none;
  }

  .lyrics-toolbar {
    flex-direction: column;
  }
}
</style>
