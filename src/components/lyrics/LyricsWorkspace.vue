<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import {
  Captions,
  Clock,
  Loader2,
  MicVocal,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Type,
} from '@lucide/vue';
import UiButton from '../ui/UiButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useSeparation } from '../../composables/useSeparation.js';
import { ICON_SIZE } from '../../constants/ui.js';
import { formatDuration } from '../../utils/format.js';
import { formatLyricTime } from '../../utils/lyrics.js';
import { orderPlaylistsForDisplay } from '../../utils/playlistOrdering.js';

const {
  state,
  tracksById,
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
const {
  state: playlistState,
  selectedPlaylist,
  select: selectPlaylistAction,
} = usePlaylists();
// Same order as PlaylistSidebar.vue's nav rows (see playlistOrdering.js) —
// playlists first in their manual drag order, then albums grouped by
// derived artist.
const orderedPlaylists = computed(() =>
  orderPlaylistsForDisplay(playlistState.playlists, tracksById.value),
);
// Owned at module scope (see useSeparation.js) — separation may keep
// running after the user switches away from this playlist/track.
const {
  state: separationState,
  isSeparating,
  describe,
  separate,
  selectResult,
} = useSeparation();

const lyricsPreview = useTemplateRef('lyricsPreview');
// Local, but synced below from the selected track's persisted "which
// result plays" pointer (electron/lib/vocalSeparation.js writes each
// preset's result to its own file under tracks/<id>/separations/, never
// overwriting a different preset's file; library.js surfaces the current
// pointer + all produced results as track.separation). Labels are factual
// (model/preset), not claims about how the result sounds — nothing here
// has been verified by ear.
const selectedPresetId = ref('standard');
// Speed measured on a 123s track: high-quality and inst-hq3 both run
// ~3x standard's time (denoise on for both; see CLAUDE.md) — inst-hq3
// earns the same "較慢" note despite sharing standard's overlap value,
// since its larger FFT costs as much as high-quality's higher overlap.
const PRESET_LABELS = {
  standard: '標準(卡拉OK模型)',
  'high-quality': '高品質(卡拉OK模型・較慢)',
  'inst-hq3': '人聲分離模型(Inst HQ 3・較慢)',
};
// Starts the dropdown from whichever result the track is actually set to
// play, not "whatever preset last ran" — multiple results can coexist now.
// Unseparated tracks (no separation field at all) leave the current
// selection alone.
watch(selectedTrack, (track) => {
  const presetId = track?.separation?.selectedPresetId;
  if (presetId && PRESET_LABELS[presetId]) {
    selectedPresetId.value = presetId;
  }
});

function hasSeparationResult(presetId) {
  return Boolean(selectedTrack.value?.separation?.results?.[presetId]);
}

// A checkmark instead of "・已產生" text — more compact, and reads as a
// status glyph rather than another clause to parse. Trailing, not truly
// right-aligned: native <option> elements don't support per-run text
// alignment (no flex/grid inside one option), so appending it at the end
// of the label is the closest a plain <select> can get.
function presetOptionLabel(presetId) {
  return PRESET_LABELS[presetId] + (hasSeparationResult(presetId) ? ' ✓' : '');
}

// Picking an already-produced preset switches playback immediately (cheap
// metadata write); picking one with no result yet just updates the local
// selection — the generate button below is the explicit trigger for that,
// so a dropdown change never silently starts a 30s+ DSP run.
function handlePresetChange(event) {
  const presetId = event.target.value;
  const track = selectedTrack.value;
  if (track && hasSeparationResult(presetId)) {
    selectResult(track, presetId);
  }
}
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
      return `掃描歌詞 ${completed}/${total}`;
    }
    return '掃描歌詞中';
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
  if (status === 'available') return '有歌詞';
  if (status === 'missing') return '無歌詞';
  return '未掃描歌詞';
}

function lyricsStatusClass(track) {
  return `lyrics-status--${track.lyrics?.status || 'unchecked'}`;
}

// Tone for the row icon badge — distinct from lyricsStatusClass above,
// which still drives the header's larger text pill (.lyrics-status--large).
// 'unchecked' gets 'highlight' rather than 'muted': it's the one state that
// still needs a manual scan, so it's meant to stand out among the badges,
// not blend in like a merely-pending one.
function lyricsStatusIconTone(track) {
  const status = track.lyrics?.status;
  if (status === 'available') return 'accent';
  if (status === 'missing') return 'muted';
  return 'highlight';
}

function handlePlaylistChange(event) {
  selectPlaylistAction(event.target.value || null);
}

function separationStatusIcon(track) {
  return isSeparating(track.id) ? Loader2 : MicVocal;
}

function separationStatusTone(track) {
  if (isSeparating(track.id)) return 'text';
  return track.hasSeparation ? 'accent' : 'muted';
}

function separationStatusTitle(track) {
  if (isSeparating(track.id)) return describe(track.id);
  return track.hasSeparation ? '有伴奏' : '尚未產生伴奏';
}

const selectedSeparationError = computed(() => {
  const track = selectedTrack.value;
  return track ? (separationState.errors.get(track.id) ?? null) : null;
});

const SOURCE_KIND_LABELS = {
  'youtube-cc': 'YouTube CC',
  lrclib: 'LRCLIB',
};

function sourceLabel(source) {
  const kindLabel = SOURCE_KIND_LABELS[source.kind] || source.kind;
  return `${source.language.toUpperCase()} / ${kindLabel}`;
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
          <h2 class="lyrics-panel__title">歌詞</h2>
          <p v-if="reloadStatusLabel" class="lyrics-panel__status">
            {{ reloadStatusLabel }}
          </p>
        </div>
        <UiButton
          :icon="RefreshCw"
          :active="isReloading"
          title="重新掃描"
          aria-label="重新掃描"
          @click="refresh"
        />
      </header>

      <div class="lyrics-panel__playlist">
        <select
          class="lyrics-panel__playlist-select"
          :value="playlistState.selectedId || ''"
          aria-label="選擇播放清單"
          @change="handlePlaylistChange"
        >
          <option value="">選擇播放清單</option>
          <optgroup
            v-if="orderedPlaylists.playlistItems.length > 0"
            label="播放清單"
          >
            <option
              v-for="playlist in orderedPlaylists.playlistItems"
              :key="playlist.id"
              :value="playlist.id"
            >
              {{ playlist.name || '(未命名歌單)' }}
            </option>
          </optgroup>
          <optgroup v-if="orderedPlaylists.albumItems.length > 0" label="專輯">
            <option
              v-for="playlist in orderedPlaylists.albumItems"
              :key="playlist.id"
              :value="playlist.id"
            >
              {{ playlist.name || '(未命名歌單)' }}
            </option>
          </optgroup>
        </select>
        <p v-if="selectedPlaylist" class="lyrics-panel__meta">
          {{ tracksWithLyricsCount }} 有歌詞 /
          {{ tracksMissingLyricsCount }} 無歌詞
        </p>
      </div>

      <p v-if="state.error" class="lyrics-error">{{ state.error }}</p>
      <p v-else-if="state.isLoading" class="lyrics-empty">載入中</p>
      <p v-else-if="!selectedPlaylist" class="lyrics-empty">請先選擇播放清單</p>
      <p v-else-if="state.tracks.length === 0" class="lyrics-empty">
        這個播放清單還沒有曲目。
      </p>

      <ul v-else class="lyrics-track-list">
        <UiTrackRow
          v-for="track in state.tracks"
          :key="track.id"
          :track="track"
          :active="track.id === state.selectedTrackId"
          interactive
          hide-duration
          @click="selectTrack(track.id)"
        >
          <template #trail>
            <div class="lyrics-row-status">
              <UiStatusIcon
                :icon="separationStatusIcon(track)"
                :tone="separationStatusTone(track)"
                :spinning="isSeparating(track.id)"
                :label="separationStatusTitle(track)"
              />
              <UiStatusIcon
                :icon="Captions"
                :tone="lyricsStatusIconTone(track)"
                :label="lyricsStatusLabel(track)"
              />
              <span class="lyrics-row-status__duration">{{
                Number.isFinite(track.duration)
                  ? formatDuration(track.duration)
                  : ''
              }}</span>
            </div>
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
            {{ selectedTrack?.title || '未選取歌曲' }}
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
        <label class="lyrics-source" title="歌詞來源">
          <Captions :size="ICON_SIZE" aria-hidden="true" />
          <span class="visually-hidden">歌詞來源</span>
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

        <div
          class="lyrics-offset"
          aria-label="歌詞時間偏移"
          title="歌詞時間偏移"
        >
          <Clock :size="ICON_SIZE" aria-hidden="true" />
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
            class="lyrics-separation__preset"
            :disabled="isSeparating(selectedTrack.id)"
            aria-label="伴奏分離設定"
            title="標準/高品質皆為卡拉OK模型,設計上以移除主唱為主,和聲較可能留在伴奏;高品質是調整降噪等參數的最佳化版本,可與標準比較。人聲分離模型移除所有人聲。實際效果依曲目而異。選擇已產生的項目會立即切換播放。"
            @change="handlePresetChange"
          >
            <option value="standard">
              {{ presetOptionLabel('standard') }}
            </option>
            <option value="high-quality">
              {{ presetOptionLabel('high-quality') }}
            </option>
            <option value="inst-hq3">
              {{ presetOptionLabel('inst-hq3') }}
            </option>
          </select>
          <UiButton
            v-if="isSeparating(selectedTrack.id)"
            :icon="Loader2"
            class="lyrics-separation__spin"
            disabled
            :title="describe(selectedTrack.id)"
            role="status"
          >
            {{ describe(selectedTrack.id) }}
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
          <span
            v-if="selectedTrack.hasSeparation"
            class="lyrics-separation__done"
          >
            有伴奏
          </span>
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
        <p v-if="state.isLoadingLyrics" class="lyrics-empty">載入歌詞中</p>
        <p v-else-if="selectedLyrics.status === 'missing'" class="lyrics-empty">
          目前沒有可用歌詞
        </p>
        <p
          v-else-if="selectedLyrics.status === 'unchecked'"
          class="lyrics-empty"
        >
          請按 reload 掃描歌詞來源
        </p>
        <p
          v-else-if="selectedSource && lyricLines.length === 0"
          class="lyrics-empty"
        >
          歌詞檔無可顯示內容
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
/* Toolbar groups now lead with an icon instead of visible text (see
   .lyrics-source/.lyrics-offset/.lyrics-text-size below) — this keeps an
   accessible name on the <label>-wrapped source select without showing
   redundant text next to the icon + already-visible selected value. */
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
  display: grid;
  grid-template-columns: minmax(320px, 400px) minmax(0, 1fr);
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

.lyrics-panel__playlist {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-bottom: 1px solid var(--ui-border);
}

.lyrics-panel__playlist-select {
  min-width: 0;
  flex: 1 1 auto;
  height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
}

.lyrics-panel__playlist-select:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.lyrics-panel__playlist .lyrics-panel__meta {
  flex: 0 0 auto;
  margin-top: 0;
  white-space: nowrap;
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

.lyrics-row-status {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex: 0 0 auto;
  /* This panel is --ui-surface, not the --ui-bg the shared UiStatusIcon
     defaults to contrasting against — override so the badges stay visible
     here instead of blending into the panel. */
  --ui-status-icon-bg: var(--ui-bg);
}

.lyrics-row-status__duration {
  min-width: 34px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.ui-track--active .lyrics-row-status__duration {
  color: inherit;
  opacity: 0.75;
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

.lyrics-source > svg,
.lyrics-offset > svg,
.lyrics-text-size > svg {
  flex-shrink: 0;
  color: var(--ui-text-muted);
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
  height: 30px;
  padding: 0 var(--ui-space-2);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.lyrics-offset__value {
  min-width: 52px;
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.lyrics-separation {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  /* Prep-only action (run once before a performance), distinct from the
     three reading-experience adjustments to its left — pushed to the row's
     far end with a divider so it doesn't read as "one more live control". */
  margin-left: auto;
  padding-left: var(--ui-space-3);
  border-left: 1px solid var(--ui-border);
}

.lyrics-separation__preset {
  min-width: 96px;
  height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
}

.lyrics-separation__preset:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.lyrics-separation__spin :deep(svg) {
  animation: lyrics-spin 1s linear infinite;
}

.lyrics-separation__done {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.lyrics-separation__error {
  color: var(--ui-danger);
  font-size: var(--ui-text-sm);
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
