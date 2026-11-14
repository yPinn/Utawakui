<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Play, Square } from '../../icons/index.js';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { useMetronome } from '../../composables/useMetronome.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { isLocalPreviewTrack } from '../../utils/trackPreviewSource.js';
import { t } from '../../utils/i18n.js';
import TrackVideoPlayback from '../playback/TrackVideoPlayback.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  audioUrl: { type: String, default: '' },
  videoUrl: { type: String, required: true },
  offsetMs: { type: Number, required: true },
  segments: { type: Array, default: null },
  fromMs: { type: Number, required: true },
  toMs: { type: Number, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['position']);
const audio = useTemplateRef('audio');
const bgm = useBgmSession();
const metronome = useMetronome();
const player = usePlayer();
const position = shallowRef(null);
const status = shallowRef('');
const notice = shallowRef('');
const sessionActive = computed(
  () => bgm.handoffState.sessionMode !== 'inactive',
);
const canPlay = computed(
  () =>
    !props.disabled &&
    !sessionActive.value &&
    props.toMs > props.fromMs &&
    isLocalPreviewTrack({ id: true, url: props.audioUrl }),
);
const asset = computed(() => ({
  url: props.videoUrl,
  offsetMs: props.offsetMs,
  syncSegments: props.segments,
}));
let request = 0;
let lease;
let timer;
let frame;
let readyPosition;

function release() {
  request += 1;
  clearTimeout(timer);
  cancelAnimationFrame(frame);
  audio.value?.pause();
  lease?.release();
  lease = null;
  readyPosition = undefined;
}

function stop({ keepFrame = false } = {}) {
  release();
  status.value = '';
  notice.value = '';
  if (!keepFrame) position.value = null;
  emit('position', null);
}

function fail() {
  stop();
  notice.value = t('trackVideo.segmentPreview.failed');
}

function sampleClock() {
  if (position.value === null) return null;
  const element = audio.value;
  return {
    positionMs:
      status.value === 'playing' && element
        ? element.currentTime * 1000
        : position.value,
    phase:
      status.value === 'playing' && !element?.paused ? 'playing' : 'paused',
    rate: 1,
  };
}

async function start() {
  if (!canPlay.value || status.value) return;
  stop();
  const current = request;
  status.value = 'preparing';
  timer = setTimeout(fail, 12000);
  try {
    const granted = await bgm.acquirePreviewLane({
      onPreempt: () => {
        if (current === request) stop();
      },
    });
    if (current !== request) {
      granted?.release();
      return;
    }
    if (!granted) {
      fail();
      return;
    }
    lease = granted;
    metronome.stop();
    position.value = props.fromMs;
  } catch {
    if (current === request) fail();
  }
}

function audioReady() {
  if (status.value !== 'preparing' || !audio.value) return;
  if (
    !Number.isFinite(audio.value.duration) ||
    props.fromMs >= audio.value.duration * 1000
  ) {
    fail();
    return;
  }
  audio.value.currentTime = props.fromMs / 1000;
}

async function maybePlay() {
  const element = audio.value;
  if (
    status.value !== 'preparing' ||
    !element ||
    !lease ||
    element.readyState < 2 ||
    element.seeking ||
    Math.abs(element.currentTime * 1000 - props.fromMs) > 30 ||
    readyPosition !== props.fromMs
  )
    return;
  const current = request;
  status.value = 'starting';
  element.volume = player.state.volume;
  element.muted = player.state.isMuted;
  try {
    await element.play();
    if (current !== request) return;
    clearTimeout(timer);
    status.value = 'playing';
    tick();
  } catch {
    if (current === request) fail();
  }
}

function videoReady(time) {
  readyPosition = time;
  void maybePlay();
}

function tick() {
  if (status.value !== 'playing') return;
  const current = audio.value.currentTime * 1000;
  if (current >= props.toMs) {
    position.value = props.toMs;
    stop({ keepFrame: true });
    return;
  }
  emit('position', current);
  frame = requestAnimationFrame(tick);
}

function ended() {
  position.value = Math.min(props.toMs, audio.value.currentTime * 1000);
  stop({ keepFrame: true });
}

watch(
  () => [
    props.audioUrl,
    props.videoUrl,
    props.fromMs,
    props.toMs,
    props.disabled,
    sessionActive.value,
  ],
  () => stop(),
  { flush: 'sync' },
);
watch(
  () => [props.offsetMs, props.segments],
  () => {
    if (status.value === 'preparing' || status.value === 'starting') stop();
  },
  { flush: 'sync' },
);
function visibilityChanged() {
  if (document.hidden) stop();
}

onMounted(() =>
  document.addEventListener('visibilitychange', visibilityChanged),
);
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', visibilityChanged);
  stop();
});
</script>

<template>
  <div class="track-video-segment-preview">
    <div class="track-video-segment-preview__controls">
      <UiButton
        v-if="!status"
        variant="secondary"
        :icon="Play"
        :disabled="!canPlay"
        @click="start"
        >{{ t('trackVideo.segmentPreview.play') }}</UiButton
      >
      <UiButton v-else variant="secondary" :icon="Square" @click="stop()">
        {{ t('trackVideo.segmentPreview.stop') }}
      </UiButton>
      <UiHint
        v-if="
          sessionActive ||
          notice ||
          status === 'preparing' ||
          status === 'starting'
        "
        role="status"
      >
        {{
          sessionActive
            ? t('track.preview.blockedSession')
            : notice || t('trackVideo.segmentPreview.preparing')
        }}
      </UiHint>
    </div>
    <TrackVideoPlayback
      v-if="position !== null"
      class="track-video-segment-preview__video"
      :asset="asset"
      :clock="sampleClock"
      @frame-ready="videoReady"
      @error="fail"
    />
    <audio
      v-if="status && position !== null"
      ref="audio"
      :src="audioUrl"
      preload="auto"
      crossorigin="anonymous"
      @loadedmetadata="audioReady"
      @canplay="maybePlay"
      @seeked="maybePlay"
      @ended="ended"
      @error="fail"
    />
  </div>
</template>

<style scoped>
.track-video-segment-preview {
  display: grid;
  gap: var(--ui-space-2);
}
.track-video-segment-preview__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
.track-video-segment-preview__video {
  inline-size: min(100%, 24rem);
  aspect-ratio: 16 / 9;
}
</style>
