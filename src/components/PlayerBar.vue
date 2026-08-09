<script setup>
// Previous/next stay disabled — there's no queue concept yet, only a
// single "currently playing track" from usePlayer. That's a separate,
// later feature; wiring fake prev/next here would be dishonest UI.
import { computed } from 'vue';
import {
  MicVocal,
  Pause,
  Play,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from '@lucide/vue';
import { usePlayer } from '../composables/usePlayer.js';
import { formatDuration } from '../utils/format.js';
import { ICON_SIZE } from '../constants/ui.js';
import UiButton from './ui/UiButton.vue';

const {
  state,
  toggle,
  seek,
  setVolume,
  toggleMute,
  toggleRepeat,
  toggleGuideVocal,
} = usePlayer();

const progress = computed({
  get: () => state.currentTime,
  set: (value) => seek(Number(value)),
});

const volume = computed({
  get: () => state.volume,
  set: (value) => setVolume(Number(value)),
});

const volumePercent = computed(() => Math.round(state.volume * 100));

// SetlistView always plays a separated track's stems variant, so "has
// separation" and "stems are playing" are the same check.
const showGuideVocal = computed(() => Boolean(state.track?.stemsUrl));
</script>

<template>
  <div class="player-bar" role="region" aria-label="播放控制列">
    <div class="player-bar__track">
      <template v-if="state.track">
        <span class="player-bar__track-title">{{ state.track.title }}</span>
        <span v-if="state.track.artist" class="player-bar__track-artist">{{
          state.track.artist
        }}</span>
      </template>
      <span v-else class="player-bar__track-empty">尚未播放</span>
    </div>

    <div class="player-bar__center">
      <div class="player-bar__transport">
        <!-- No queue to shuffle yet — honest "not wired up" placeholder.
             aria-disabled (not disabled) so the title tooltip and screen
             reader can still explain why, instead of the element being
             silently dropped from the tab order. -->
        <UiButton
          :icon="Shuffle"
          aria-disabled="true"
          aria-label="隨機播放"
          title="尚未支援播放佇列"
        />
        <UiButton
          :icon="SkipBack"
          aria-disabled="true"
          aria-label="上一首"
          title="尚未支援播放佇列"
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
          aria-disabled="true"
          aria-label="下一首"
          title="尚未支援播放佇列"
        />
        <UiButton
          :icon="Repeat1"
          :active="state.isLooping"
          :disabled="!state.track"
          :aria-label="state.isLooping ? '關閉單曲重播' : '開啟單曲重播'"
          :aria-pressed="state.isLooping"
          @click="toggleRepeat"
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

    <!-- Right-side utility controls share one region so they read as a
         grouped cluster instead of scattered top-level flex items. -->
    <div class="player-bar__extras">
      <UiButton
        v-if="showGuideVocal"
        :icon="MicVocal"
        :active="state.guideVocalLevel > 0"
        :aria-label="state.guideVocalLevel > 0 ? '關閉導唱' : '開啟導唱'"
        :aria-pressed="state.guideVocalLevel > 0"
        title="開關導唱(人聲) (G)"
        @click="toggleGuideVocal"
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

/* Fixed width, not min-width — elapsed time crossing e.g. 9:59 -> 10:00
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
  width: 5rem; /* rem, not px — see .player-bar__center's max-width above */
}

.player-bar__volume-value {
  flex-shrink: 0;
  width: 4ch;
  text-align: right;
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
}
</style>
