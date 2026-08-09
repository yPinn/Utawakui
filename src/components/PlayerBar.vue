<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ListMusic,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from '@lucide/vue';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { PLAYBACK_MODES, usePlayer } from '../composables/usePlayer.js';
import { formatDuration } from '../utils/format.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { ICON_SIZE } from '../constants/ui.js';
import PlaybackQueuePanel from './PlaybackQueuePanel.vue';
import UiButton from './ui/UiButton.vue';

const {
  state,
  playTrack,
  toggle,
  seek,
  restartTrack,
  setVolume,
  toggleMute,
  cyclePlaybackMode,
  toggleGuideVocal,
  onEnded,
} = usePlayer();
const {
  state: queueState,
  canGoNext,
  previousTrack,
  nextTrack,
  restartSourceQueue,
  toggleShuffle,
} = usePlaybackQueue();

const isQueueOpen = ref(false);

const progress = computed({
  get: () => state.currentTime,
  set: (value) => seek(Number(value)),
});

const volume = computed({
  get: () => state.volume,
  set: (value) => setVolume(Number(value)),
});

const volumePercent = computed(() => Math.round(state.volume * 100));
const canShuffle = computed(() => queueState.tracks.length > 1);
const playbackModeIcon = computed(() =>
  state.playbackMode === PLAYBACK_MODES.repeatOne ? Repeat1 : Repeat,
);
const playbackModeActionLabel = computed(() => {
  if (state.playbackMode === PLAYBACK_MODES.repeatList) {
    return '啟用單曲循環';
  }
  if (state.playbackMode === PLAYBACK_MODES.repeatOne) {
    return '停用重複播放';
  }
  return '啟用重複播放';
});
const playbackModeActive = computed(
  () => state.playbackMode !== PLAYBACK_MODES.sequence,
);

// SetlistView always plays a separated track's stems variant, so "has
// separation" and "stems are playing" are the same check.
const showGuideVocal = computed(() => Boolean(state.track?.stemsUrl));

function playQueuedTrack(track) {
  if (!track) return;
  playTrack(toPlayableTrack(track));
}

function playPrevious() {
  const previous = previousTrack();
  if (previous) {
    playQueuedTrack(previous);
    return;
  }

  restartTrack();
}

function playNext() {
  playQueuedTrack(nextTrack());
}

function playNextAfterEnded() {
  const next =
    nextTrack() ||
    (state.playbackMode === PLAYBACK_MODES.repeatList
      ? restartSourceQueue()
      : null);
  playQueuedTrack(next);
}

function toggleQueuePanel() {
  isQueueOpen.value = !isQueueOpen.value;
}

let unsubscribeEnded;

onMounted(() => {
  unsubscribeEnded = onEnded(playNextAfterEnded);
});

onUnmounted(() => {
  unsubscribeEnded?.();
});
</script>

<template>
  <div class="player-bar" role="region" aria-label="播放控制列">
    <div class="player-bar__track">
      <div class="player-bar__track-copy">
        <template v-if="state.track">
          <span class="player-bar__track-title">{{ state.track.title }}</span>
          <span v-if="state.track.artist" class="player-bar__track-artist">
            {{ state.track.artist }}
          </span>
        </template>
        <span v-else class="player-bar__track-empty">尚未播放</span>
      </div>
    </div>

    <div class="player-bar__center">
      <div class="player-bar__transport">
        <UiButton
          :icon="Shuffle"
          :active="queueState.isShuffle"
          :disabled="!canShuffle"
          :aria-label="queueState.isShuffle ? '關閉隨機播放' : '開啟隨機播放'"
          :aria-pressed="queueState.isShuffle"
          title="隨機播放"
          @click="toggleShuffle"
        />
        <UiButton
          :icon="SkipBack"
          :disabled="!state.track"
          aria-label="上一首"
          title="上一首"
          @click="playPrevious"
        />
        <button
          type="button"
          :disabled="!state.track"
          :aria-label="state.isPlaying ? '暫停' : '播放'"
          class="player-bar__play"
          @click="toggle"
        >
          <Pause v-if="state.isPlaying" :size="ICON_SIZE" />
          <Play v-else :size="ICON_SIZE" />
        </button>
        <UiButton
          :icon="SkipForward"
          :disabled="!canGoNext"
          aria-label="下一首"
          title="下一首"
          @click="playNext"
        />
        <UiButton
          :icon="playbackModeIcon"
          :active="playbackModeActive"
          :aria-label="playbackModeActionLabel"
          :aria-pressed="playbackModeActive"
          :title="playbackModeActionLabel"
          @click="cyclePlaybackMode"
        />
      </div>

      <div class="player-bar__progress">
        <span class="player-bar__time">{{
          formatDuration(state.currentTime)
        }}</span>
        <input
          v-model="progress"
          type="range"
          min="0"
          :max="state.duration || 0"
          step="0.1"
          :disabled="!state.track"
          aria-label="播放進度"
          :aria-valuetext="`${formatDuration(state.currentTime)} / ${formatDuration(state.duration)}`"
        />
        <span class="player-bar__time player-bar__time--end">{{
          formatDuration(state.duration)
        }}</span>
      </div>
    </div>

    <div class="player-bar__extras">
      <UiButton
        v-if="showGuideVocal"
        :icon="MicVocal"
        :active="state.guideVocalLevel > 0"
        :aria-label="state.guideVocalLevel > 0 ? '關閉導唱' : '開啟導唱'"
        :aria-pressed="state.guideVocalLevel > 0"
        title="開關導唱(分離後) (G)"
        @click="toggleGuideVocal"
      />

      <UiButton
        :icon="ListMusic"
        :active="isQueueOpen"
        :aria-label="isQueueOpen ? '關閉播放佇列' : '開啟播放佇列'"
        :aria-pressed="isQueueOpen"
        title="播放佇列"
        @click="toggleQueuePanel"
      />

      <div class="player-bar__volume">
        <UiButton
          :icon="state.isMuted || state.volume === 0 ? VolumeX : Volume2"
          :aria-label="state.isMuted ? '取消靜音' : '靜音'"
          :aria-pressed="state.isMuted"
          title="靜音 / 取消靜音 (M)"
          @click="toggleMute"
        />
        <input
          v-model="volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="音量"
          :aria-valuetext="`${volumePercent}%`"
        />
        <span class="player-bar__volume-value">{{ volumePercent }}%</span>
      </div>
    </div>

    <PlaybackQueuePanel :open="isQueueOpen" @close="isQueueOpen = false" />
  </div>
</template>

<style scoped>
.player-bar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: var(--ui-surface);
  border-top: 1px solid var(--ui-border);
  box-sizing: border-box;
  /* Otherwise dragging a slider triggers native text selection, which can
     swallow a click on a nearby button instead of registering it. */
  user-select: none;
}

.player-bar__track {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__track-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.player-bar__track-empty {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.player-bar__track-title {
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-bar__track-artist {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

/* Capped width so the progress bar doesn't stretch absurdly on a wide
   window. rem, matching public/tokens.css's --ui-space-* scale. */
.player-bar__center {
  flex: 2;
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-1);
}

.player-bar__transport {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
  cursor: pointer;
}

.player-bar__play:disabled {
  background: var(--ui-surface-hover);
  color: var(--ui-text-muted);
}

.player-bar__play:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.player-bar__progress {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__progress input {
  flex: 1;
}

/* Fixed width, not min-width: elapsed time crossing e.g. 9:59 -> 10:00
   would still push the slider and shift the row otherwise. */
.player-bar__time {
  flex-shrink: 0;
  width: 5ch;
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
}

.player-bar__time--end {
  text-align: right;
}

/* flex: 1 matches .player-bar__track's flex:1 on the left, keeping
   .player-bar__center visually centered. min-width: 0 because flexbox
   otherwise falls back to min-width: auto, floored at content's natural
   width, which breaks that balance. */
.player-bar__extras {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}

.player-bar__volume {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.player-bar__volume input {
  width: 5rem; /* rem, not px: see .player-bar__center's max-width above */
}

.player-bar__volume-value {
  flex-shrink: 0;
  width: 4ch;
  text-align: right;
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
}
</style>
