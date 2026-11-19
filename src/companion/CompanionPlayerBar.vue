<script setup>
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { playbackPositionMs } from '../../shared/presentation/state.mjs';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiTrackThumb from '../components/ui/UiTrackThumb.vue';
import UiRangeControl from '../components/ui/range/UiRangeControl.vue';
import { Pause, Play, SkipBack, SkipForward } from '../icons/index.js';
import { formatDuration } from '../utils/format.js';
import { t } from '../utils/i18n.js';

const props = defineProps({
  snapshot: { type: Object, default: null },
  track: { type: Object, default: null },
  disabled: { type: Boolean, default: false },
  sendCommand: { type: Function, required: true },
});
const clock = shallowRef(Date.now());
const draft = shallowRef(null);
const playback = computed(() => props.snapshot?.state?.playback);
const playing = computed(() => playback.value?.status === 'playing');
const duration = computed(() => (playback.value?.durationMs ?? 0) / 1000);
const position = computed(
  () =>
    draft.value?.seconds ??
    (props.snapshot?.state
      ? playbackPositionMs(props.snapshot.state, clock.value) / 1000
      : 0),
);
let timer;

function updateClock() {
  clearInterval(timer);
  clock.value = Date.now();
  if (!document.hidden && playing.value)
    timer = setInterval(() => (clock.value = Date.now()), 250);
}

watch(playing, updateClock);
watch(() => props.track?.id, cancelScrub);
onMounted(() => {
  updateClock();
  document.addEventListener('visibilitychange', updateClock);
});
onUnmounted(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', updateClock);
});

function previewScrub(seconds) {
  draft.value = {
    trackId: props.track?.id,
    seconds,
  };
}

function cancelScrub() {
  draft.value = null;
}

async function commitScrub() {
  const target = draft.value;
  if (!target || props.disabled || target.trackId !== props.track?.id) return;
  try {
    await props.sendCommand('player.seek', {
      trackId: target.trackId,
      revision: props.snapshot?.state?.revision,
      positionMs: Math.round(target.seconds * 1000),
    });
  } finally {
    if (draft.value === target) cancelScrub();
  }
}
</script>

<template>
  <section
    class="companion-player"
    :aria-label="t('performer.actionBar.playback')"
  >
    <div class="companion-player__row">
      <div class="companion-player__track">
        <UiTrackThumb
          v-if="track"
          :track="track"
          size="var(--ui-companion-track-artwork-size)"
        />
        <div class="companion-player__identity">
          <p class="companion-player__title">
            {{ track?.title || t('companion.lyrics.noTrack') }}
          </p>
          <p v-if="track?.artist" class="companion-player__artist">
            {{ track.artist }}
          </p>
        </div>
      </div>
      <div class="companion-player__controls">
        <UiIconButton
          :icon="SkipBack"
          :label="t('companion.remote.previous')"
          size="lg"
          :disabled="disabled"
          @click="sendCommand('player.previous')"
        />
        <UiIconButton
          :icon="playing ? Pause : Play"
          :label="
            t(
              playing
                ? 'performer.actionBar.pause'
                : 'performer.actionBar.play',
            )
          "
          variant="accent"
          shape="circle"
          size="lg"
          :disabled="disabled"
          @click="sendCommand('player.play-pause')"
        />
        <UiIconButton
          :icon="SkipForward"
          :label="t('companion.remote.next')"
          size="lg"
          :disabled="disabled"
          @click="sendCommand('player.next')"
        />
      </div>
    </div>
    <div class="companion-player__progress">
      <span>{{ formatDuration(position) }}</span>
      <UiRangeControl
        class="companion-player__range"
        :model-value="position"
        :max="duration"
        :step="0.1"
        wheel-mode="off"
        :disabled="disabled || !duration"
        :format-value="formatDuration"
        :value-text="`${formatDuration(position)} / ${formatDuration(duration)}`"
        :aria-label="t('player.bar.progress')"
        @update:model-value="previewScrub"
        @change="commitScrub"
        @pointercancel="cancelScrub"
        @blur="cancelScrub"
      />
      <span>{{ formatDuration(duration) }}</span>
    </div>
  </section>
</template>

<style scoped>
.companion-player {
  container: companion-player / inline-size;
  min-inline-size: 0;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-companion-raised);
  color: var(--ui-color-text);
}

.companion-player__row,
.companion-player__progress {
  display: grid;
  align-items: center;
  gap: var(--ui-space-2);
}

.companion-player__row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.companion-player__track {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}

.companion-player__identity {
  min-inline-size: 0;
}

.companion-player__identity p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.companion-player__title {
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.companion-player__artist,
.companion-player__progress {
  color: var(--ui-color-text-muted);
}

.companion-player__artist {
  font-size: var(--ui-type-body-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.companion-player__progress {
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.companion-player__controls {
  display: flex;
  align-items: center;
}

.companion-player__progress {
  grid-template-columns: auto minmax(0, 1fr) auto;
  font-variant-numeric: tabular-nums;
}

.companion-player__range {
  --ui-range-target-size: var(--ui-control-height-live);
  min-inline-size: 0;
}

.companion-player__progress > span {
  min-inline-size: 4ch;
}

@container companion-player (max-width: 15rem) {
  .companion-player__row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .companion-player__controls {
    justify-content: center;
  }
}
</style>
