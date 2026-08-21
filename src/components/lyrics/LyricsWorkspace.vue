<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import {
  Captions,
  Clock,
  ICON_SIZE,
  ListMusic,
  Loader2,
  MicVocal,
  Minus,
  Plus,
  RefreshCw,
  Type,
} from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useSeparation } from '../../composables/useSeparation.js';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
  SEPARATION_PRESET_SELECT_TITLE,
  hasSeparationPreset,
} from '../../constants/separationPresets.js';
import { formatDuration } from '../../utils/format.js';
import {
  formatLyricsSourceLabel,
  formatLyricTime,
} from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import LyricsSourceManagerModal from './LyricsSourceManagerModal.vue';
import LyricsTrackPickerModal from './LyricsTrackPickerModal.vue';

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
  describe,
  separate,
  selectResult,
} = useSeparation();

const lyricsPreview = useTemplateRef('lyricsPreview');
const selectedPresetId = ref(DEFAULT_SEPARATION_PRESET_ID);
const lyricsFontSizeIndex = ref(1);
const isSourceManagerOpen = ref(false);
const isTrackPickerOpen = ref(false);

const LYRICS_FONT_SIZE_CLASSES = [
  'lyrics-preview--font-compact',
  'lyrics-preview--font-default',
  'lyrics-preview--font-large',
];

const TRACK_SCOPE_LABELS = {
  all: '全部曲目',
  'current-playlist': '目前歌單',
  local: '本機曲目',
  'missing-lyrics': '缺歌詞',
  'available-lyrics': '有歌詞',
};

watch(selectedTrack, (track) => {
  const presetId = track?.separation?.selectedPresetId;
  if (hasSeparationPreset(presetId)) {
    selectedPresetId.value = presetId;
  }
});

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

const trackScopeSummary = computed(() => {
  const label = TRACK_SCOPE_LABELS[state.trackScope] ?? '全部曲目';
  return `${label} / ${state.tracks.length} 首`;
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

function lyricsStatusLabel(track) {
  const status = track.lyrics?.status;
  if (status === 'available') return '有歌詞';
  if (status === 'missing') return '無歌詞';
  return '未掃描歌詞';
}

function lyricsStatusTone(track) {
  return track.lyrics?.status === 'available' ? 'accent' : 'muted';
}

function lyricsStatusOverrides(track) {
  if (track.lyrics?.status) return {};
  return {
    background: 'var(--ui-color-surface-hover)',
    color: 'var(--ui-color-text)',
  };
}

function hasSeparationResult(presetId) {
  return Boolean(selectedTrack.value?.separation?.results?.[presetId]);
}

function handlePresetChange(event) {
  const presetId = event.target.value;
  const track = selectedTrack.value;
  if (track && hasSeparationResult(presetId)) {
    selectResult(track, presetId);
  }
}

function handleSourceChange(event) {
  selectSource(event.target.value);
}

function canSeekLine(line) {
  return Number.isFinite(line?.start);
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
    <section class="lyrics-stage" aria-label="歌詞預覽">
      <header class="lyrics-stage__header">
        <div class="lyrics-stage__text">
          <p class="lyrics-stage__scope">{{ trackScopeSummary }}</p>
          <h2 class="lyrics-stage__title">
            {{ selectedTrack?.title || '未選取歌曲' }}
          </h2>
          <p v-if="selectedMeta" class="lyrics-stage__meta">
            {{ selectedMeta }}
          </p>
          <p v-if="reloadStatusLabel" class="lyrics-stage__status">
            {{ reloadStatusLabel }}
          </p>
        </div>

        <div class="lyrics-stage__actions">
          <UiChip
            v-if="selectedTrack"
            class="lyrics-status-badge"
            :tone="lyricsStatusTone(selectedTrack)"
            v-bind="lyricsStatusOverrides(selectedTrack)"
          >
            {{ lyricsStatusLabel(selectedTrack) }}
          </UiChip>
          <UiButton
            :icon="ListMusic"
            title="選擇歌詞曲目"
            @click="isTrackPickerOpen = true"
          >
            選曲
          </UiButton>
          <UiButton
            :icon="RefreshCw"
            :active="isReloading"
            title="重新掃描"
            aria-label="重新掃描"
            @click="refresh"
          />
        </div>
      </header>

      <div class="lyrics-toolbar">
        <div class="lyrics-source" title="歌詞來源">
          <Captions :size="ICON_SIZE" aria-hidden="true" />
          <label>
            <span class="visually-hidden">歌詞來源</span>
            <select
              class="lyrics-select lyrics-source__select"
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
                {{ formatLyricsSourceLabel(source) }}
              </option>
            </select>
          </label>
          <UiButton
            v-if="selectedTrack"
            :icon="ListMusic"
            title="管理歌詞來源"
            aria-label="管理歌詞來源"
            @click="isSourceManagerOpen = true"
          />
        </div>

        <div
          class="lyrics-offset"
          aria-label="歌詞時間偏移"
          title="歌詞時間偏移"
        >
          <Clock :size="ICON_SIZE" aria-hidden="true" />
          <UiButton
            :icon="Minus"
            title="延後歌詞 0.1 秒"
            aria-label="延後歌詞 0.1 秒"
            @click="adjustOffset(-0.1)"
          />
          <UiButton
            class="lyrics-offset__value"
            :disabled="state.offsetSeconds === 0"
            title="重設歌詞時間偏移"
            aria-label="重設歌詞時間偏移"
            @click="resetOffset"
          >
            {{ offsetLabel }}
          </UiButton>
          <UiButton
            :icon="Plus"
            title="提前歌詞 0.1 秒"
            aria-label="提前歌詞 0.1 秒"
            @click="adjustOffset(0.1)"
          />
        </div>

        <div class="lyrics-text-size" aria-label="歌詞字級" title="歌詞字級">
          <Type :size="ICON_SIZE" aria-hidden="true" />
          <UiButton
            :icon="Minus"
            title="縮小歌詞"
            aria-label="縮小歌詞"
            :disabled="!canDecreaseLyricsFontSize"
            @click="decreaseLyricsFontSize"
          />
          <UiButton
            :icon="Plus"
            title="放大歌詞"
            aria-label="放大歌詞"
            :disabled="!canIncreaseLyricsFontSize"
            @click="increaseLyricsFontSize"
          />
        </div>

        <div v-if="selectedTrack" class="lyrics-separation" aria-label="伴奏">
          <select
            v-model="selectedPresetId"
            class="lyrics-select lyrics-separation__preset"
            :disabled="isSeparating(selectedTrack.id)"
            aria-label="伴奏分離設定"
            :title="SEPARATION_PRESET_SELECT_TITLE"
            @change="handlePresetChange"
          >
            <option
              v-for="preset in SEPARATION_PRESET_OPTIONS"
              :key="preset.id"
              :value="preset.id"
            >
              {{ preset.label }}
            </option>
          </select>
          <UiButton
            v-if="isSeparating(selectedTrack.id)"
            :icon="Loader2"
            class="lyrics-separation__spin"
            disabled
            :title="describe(selectedTrack.id)"
          >
            <span role="status">{{ describe(selectedTrack.id) }}</span>
          </UiButton>
          <UiButton
            v-else
            :icon="MicVocal"
            :aria-label="
              hasSeparationResult(selectedPresetId) ? '重新產生' : '產生'
            "
            :title="
              hasSeparationResult(selectedPresetId)
                ? '重新產生(用選定的設定重新產生這個結果)'
                : '產生(產生可調整導唱強弱的伴奏版本)'
            "
            @click="separate(selectedTrack, selectedPresetId)"
          />
          <span v-if="selectedSeparationError" class="lyrics-separation__error">
            {{ selectedSeparationError }}
          </span>
        </div>
      </div>

      <div
        ref="lyricsPreview"
        class="lyrics-preview"
        :class="lyricsFontSizeClass"
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
              <span class="lyrics-line__text">{{ line.text }}</span>
            </button>
          </li>
        </ol>
      </div>
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
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.lyrics-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.lyrics-stage {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.lyrics-stage__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-stage__text {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-stage__scope,
.lyrics-stage__title,
.lyrics-stage__meta,
.lyrics-stage__status {
  margin: 0;
}

.lyrics-stage__scope,
.lyrics-stage__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-stage__title {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-stage__status {
  color: var(--ui-color-accent);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-stage__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.lyrics-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-select {
  height: var(--ui-control-height);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.lyrics-select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-source {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
}

.lyrics-source > svg,
.lyrics-offset > svg,
.lyrics-text-size > svg {
  flex-shrink: 0;
  color: var(--ui-color-text-muted);
}

.lyrics-source__select {
  min-width: 180px;
  max-width: 320px;
}

.lyrics-text-size,
.lyrics-offset {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  height: var(--ui-control-height);
  padding: 0 var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.lyrics-offset__value {
  justify-content: center;
  min-width: 52px;
  padding: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  text-align: center;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.lyrics-separation {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-left: auto;
}

.lyrics-separation__preset {
  min-width: 96px;
}

.lyrics-separation__spin :deep(svg) {
  animation: lyrics-spin var(--ui-motion-spin) infinite;
}

.lyrics-separation__error {
  color: var(--ui-color-danger);
  font-size: var(--ui-font-size-sm);
}

.lyrics-preview {
  min-height: 0;
  overflow: auto;
}

.lyrics-preview--font-compact .lyrics-line__button {
  font-size: var(--ui-font-size-md);
}

.lyrics-preview--font-default .lyrics-line__button {
  font-size: var(--ui-font-size-lg);
}

.lyrics-preview--font-large .lyrics-line__button {
  font-size: var(--ui-font-size-xl);
}

.lyrics-lines {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-4);
  list-style: none;
}

.lyrics-line {
  border-radius: var(--ui-radius);
  color: var(--ui-color-text-muted);
}

.lyrics-line__button {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: baseline;
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 0;
  border-radius: var(--ui-radius);
  background: transparent;
  color: inherit;
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-body);
  text-align: left;
  cursor: pointer;
}

.lyrics-line__button:disabled {
  cursor: default;
}

.lyrics-line__button:not(:disabled):hover {
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

.lyrics-line--active .lyrics-line__button {
  background: var(--ui-color-accent);
}

.lyrics-line__time {
  font-size: var(--ui-font-size-sm);
  line-height: inherit;
  font-variant-numeric: tabular-nums;
}

.lyrics-line__text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

.lyrics-status-badge {
  flex: 0 0 auto;
  padding: var(--ui-space-2) var(--ui-space-3);
}

@keyframes lyrics-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lyrics-separation__spin :deep(svg) {
    animation: none;
  }
}

@media (max-width: 900px) {
  .lyrics-stage__header,
  .lyrics-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .lyrics-stage__actions,
  .lyrics-source,
  .lyrics-offset,
  .lyrics-text-size,
  .lyrics-separation {
    flex-wrap: wrap;
  }

  .lyrics-separation {
    margin-left: 0;
  }
}
</style>
