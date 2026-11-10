<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { selectPerformerFrame } from '../../../shared/presentation/performerFrame.mjs';
import { Info, MicVocal, SlidersHorizontal } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import PerformerSurface from '../performer/PerformerSurface.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiFilePickerButton from '../ui/UiFilePickerButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiRange from '../ui/UiRange.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSurface from '../ui/UiSurface.vue';
import GuideSegmentReview from './GuideSegmentReview.vue';
import ReferencePitchMicrophone from './ReferencePitchMicrophone.vue';
import {
  loadSingAlongPreferences,
  saveSingAlongPreferences,
} from './singAlongPreferences.js';
import {
  alignedOfflineVocalFrames,
  ALIGNED_VOCAL_HALF_WINDOW_SECONDS,
  MAX_ALIGNED_VOCAL_BYTES,
  readAlignedVocalWav,
} from './alignedVocalInput.js';
import {
  microphonePitchPath,
  noteName,
  PITCH_WIDTH,
} from './referencePitchPlot.js';
import {
  applyGuideOctaveMarks,
  connectMicFrames,
  createSingAlongClock,
  crossedSweepNote,
  GUIDE_NOTE_HEIGHT,
  guideNoteGeometry,
  guideNotes,
  guidePitchFrames,
  guideSilenceRanges,
  guideTechniqueMarkers,
  INPUT_LEVEL_HEIGHT,
  inputLevelPaths,
  maskGuideContours,
  SING_ALONG_CURSOR,
  SING_ALONG_MIC_LOOKBACK_MS,
  SING_ALONG_MIC_SCAN_BUFFER_MS,
  SING_ALONG_SECONDS,
  projectMicSamplePosition,
  retainSingAlongWordCue,
  selectSingAlongWordCue,
  songPitchBounds,
} from './singAlongPitchPlot.js';

const props = defineProps({
  snapshot: { type: Object, default: null },
  readingScale: { type: String, default: 'desk' },
  pending: { type: Boolean, default: false },
});
defineEmits(['control', 'sync-action', 'update:readingScale']);
const preferences = loadSingAlongPreferences();
const correctionMs = shallowRef(preferences.correctionMs);
const micPreferences = shallowRef(preferences.microphone);
const showMeter = shallowRef(preferences.showMeter);
const showReferencePitch = shallowRef(preferences.showReferencePitch);
const meterHost = useTemplateRef('meterHost');
const formatCorrection = (ms) => `${ms > 0 ? '+' : ''}${ms} ms`;
const access = window.UtawakuiPerformer;
const state = computed(() => props.snapshot?.state);
const playback = computed(() => state.value?.playback);
const trackId = computed(() => playback.value?.track?.id);
const source = computed(() => props.snapshot?.singAlong);
const duration = computed(() => (playback.value?.durationMs ?? 0) / 1000);
const playing = computed(() => playback.value?.status === 'playing');
const playRequested = computed(() =>
  ['playing', 'buffering', 'seeking'].includes(playback.value?.status),
);
const position = shallowRef(0);
const guideFillId = `prompter-guide-fill-${useId()}`;
const inputClipId = `prompter-input-clip-${useId()}`;
const inputClip = `url(#${inputClipId})`;
const sweepTintId = `prompter-sweep-tint-${useId()}`;
const sweepGlintId = `prompter-sweep-glint-${useId()}`;
const sweepGlint = shallowRef(null);
const sweepGlintStrike = shallowRef(false);
const response = shallowRef(null);
const reviewMarks = shallowRef([]);
const pendingGuide = shallowRef(false);
const toolsOpen = shallowRef(false);
const showInputLevel = shallowRef(preferences.showLevelHistory);
watch(
  [micPreferences, correctionMs, showMeter, showInputLevel, showReferencePitch],
  () => {
    saveSingAlongPreferences({
      microphone: micPreferences.value,
      correctionMs: correctionMs.value,
      showMeter: showMeter.value,
      showLevelHistory: showInputLevel.value,
      showReferencePitch: showReferencePitch.value,
    });
  },
);
const legendOpen = shallowRef(false);
const reviewOpen = shallowRef(false);
const reviewCenterMs = shallowRef(0);
const reviewTrigger = useTemplateRef('reviewTrigger');
const micRunning = shallowRef(false);
const micFrames = shallowRef([]);
const inputMode = shallowRef('microphone');
const inputOptions = [
  { value: 'microphone', label: '麥克風' },
  { value: 'live', label: 'Live 人聲檔' },
];
const liveSelected = computed(() => inputMode.value === 'live');
const micLookback = computed(() =>
  micRunning.value && !liveSelected.value ? SING_ALONG_MIC_LOOKBACK_MS : 0,
);
const liveInput = shallowRef(null);
const liveInputError = shallowRef('');
const liveMethod = shallowRef('offline');
const liveMethods = [
  { value: 'offline', label: '離線（SwiftF0）' },
  { value: 'realtime', label: '即時對照（YIN）' },
];
const offline = shallowRef(null);
const showOffline = computed(
  () => liveSelected.value && liveMethod.value === 'offline',
);
let liveRequest = 0;
let offlineRequest = null;
const clock = createSingAlongClock();
const continuityKey = computed(() =>
  JSON.stringify([
    playback.value?.track?.id,
    source.value?.playbackRevision,
    source.value?.continuityRevision,
  ]),
);
let requestId = null;
let animation = null;
let previousScanTime = null;
let continuous = false;
let micBoundaryMs = performance.now();

const sourceKey = computed(() =>
  source.value?.guide && trackId.value && duration.value > 0
    ? JSON.stringify([
        trackId.value,
        source.value.playbackRevision,
        source.value.guide.recipeId,
        source.value.guide.completedAtMs,
      ])
    : null,
);
const semitones = computed(() => source.value?.semitones ?? null);
const guidePitches = computed(() =>
  response.value?.status === 'ready'
    ? applyGuideOctaveMarks(
        response.value.pitches,
        response.value.stepSeconds,
        reviewMarks.value,
      )
    : null,
);
const silenceRanges = computed(() => guideSilenceRanges(reviewMarks.value));
const guide = computed(() =>
  guidePitches.value
    ? guideNotes(guidePitches.value, response.value.stepSeconds)
    : [],
);
const contours = computed(() =>
  maskGuideContours(guide.value, silenceRanges.value),
);
const historySeconds = SING_ALONG_SECONDS * SING_ALONG_CURSOR;
const viewStart = computed(() => position.value - historySeconds);
const viewEnd = computed(() => viewStart.value + SING_ALONG_SECONDS);
const focusPeriod = 4;
const overscan = 0.25;
const focusStart = computed(
  () => Math.floor(position.value / focusPeriod) * focusPeriod - historySeconds,
);
const focusEnd = computed(
  () => focusStart.value + focusPeriod + SING_ALONG_SECONDS,
);
const bounds = computed(() => songPitchBounds(guide.value, semitones.value));
const displayGuide = computed(() => {
  if (semitones.value === null) return [];
  const { low, high } = bounds.value;
  return contours.value.filter(({ points }) => {
    const midi = points[0].midi + semitones.value;
    return midi >= low && midi <= high;
  });
});
const nearbyGuide = computed(() =>
  displayGuide.value.filter(
    ({ start, end }) =>
      end > focusStart.value - overscan && start < focusEnd.value + overscan,
  ),
);
const y = (midi) => {
  const { low, high } = bounds.value;
  return 8 + (104 * (high - midi)) / (high - low);
};
const grid = computed(() => {
  const { low, high } = bounds.value;
  return Array.from({ length: (high - low) / 3 + 1 }, (_, index) => {
    const midi = high - index * 3;
    return {
      midi,
      octave: midi % 12 === 0,
      y: y(midi),
    };
  });
});
const labeledGrid = computed(() => grid.value.filter((line) => line.octave));
const timeToX = (time) => (time * PITCH_WIDTH) / SING_ALONG_SECONDS;
const timelineX = computed(() => timeToX(viewStart.value));
const timelineTransform = computed(() => `translate(${-timelineX.value} 0)`);
const guideBoxes = computed(() =>
  nearbyGuide.value.map((note) => ({
    start: note.start,
    end: note.end,
    ...guideNoteGeometry(note, timeToX, (midi) => y(midi + semitones.value)),
  })),
);
const referencePath = computed(() => {
  if (
    !showReferencePitch.value ||
    !guidePitches.value ||
    semitones.value === null
  )
    return '';
  const from = focusStart.value - overscan;
  const to = focusEnd.value + overscan;
  const frames = guidePitchFrames(
    guidePitches.value,
    response.value.stepSeconds,
    silenceRanges.value,
    from,
    to,
  );
  return microphonePitchPath(
    frames,
    from,
    to - from,
    (midi) => y(midi + semitones.value),
    timeToX,
  );
});
const annotations = computed(() =>
  guideTechniqueMarkers(
    nearbyGuide.value.filter(({ technique }) => technique?.kind === 'vibrato'),
    timeToX,
    focusStart.value - overscan,
    focusEnd.value + overscan,
    response.value?.techniqueCues,
    response.value?.hiddenTechniqueMarks,
  ),
);
const vibratoPath = 'M-3 0Q-1.5 -3 0 0T3 0';
const cursor = PITCH_WIDTH * SING_ALONG_CURSOR;
const scanDelay = computed(() =>
  micLookback.value
    ? ((playback.value?.rate ?? 1) * SING_ALONG_MIC_SCAN_BUFFER_MS) / 1000
    : 0,
);
const scanTime = computed(() => position.value - scanDelay.value);
const scanX = computed(() => cursor - timeToX(scanDelay.value));
const guideFillX = computed(() => timelineX.value + scanX.value - cursor);
const nearScreen = (time) => time >= focusStart.value && time <= focusEnd.value;
const beats = computed(() =>
  (response.value?.beats ?? []).map(({ timeMs, downbeat }) => ({
    time: timeMs / 1000,
    downbeat,
  })),
);
const visibleBeats = computed(() =>
  beats.value.filter(({ time }) => nearScreen(time)),
);
const lyrics = computed(() => state.value?.lyrics);
const lyricsOffset = computed(() => lyrics.value?.offsetMs ?? 0);
const wordCues = shallowRef([]);
const lyricPositionMs = computed(
  () => position.value * 1000 + lyricsOffset.value,
);
const displayWordCue = computed(() =>
  selectSingAlongWordCue(
    wordCues.value,
    lyrics.value?.lines,
    lyricPositionMs.value,
  ),
);
const displayFrame = computed(() =>
  selectPerformerFrame(props.snapshot, {
    positionMs: position.value * 1000,
    wordCue: displayWordCue.value,
  }),
);
const toMediaTime = (timeMs) => (timeMs - lyricsOffset.value) / 1000;
const lineStarts = computed(() =>
  lyrics.value?.synced === true && lyrics.value.trackId === trackId.value
    ? [
        ...new Set(
          lyrics.value.lines
            .filter((line) => line.text && Number.isFinite(line.startMs))
            .map((line) => toMediaTime(line.startMs))
            .filter((time) => time >= 0),
        ),
      ]
    : [],
);
const visibleLineStarts = computed(() => lineStarts.value.filter(nearScreen));
const wordBand = computed(() => {
  const cue = displayWordCue.value;
  if (!cue || !displayFrame.value.currentWordCue) return null;
  const start = toMediaTime(cue.startMs);
  const end = toMediaTime(cue.endMs);
  if (position.value < start || position.value >= end) return null;
  return {
    x: timeToX(Math.max(start, viewStart.value) - viewStart.value),
    width: timeToX(
      Math.min(end, viewEnd.value) - Math.max(start, viewStart.value),
    ),
  };
});
const realtimeFrames = computed(() =>
  liveSelected.value
    ? (liveInput.value?.frames(viewStart.value, position.value) ?? []).map(
        (sample) => ({
          ...sample,
          time: Math.max(0, sample.time - ALIGNED_VOCAL_HALF_WINDOW_SECONDS),
        }),
      )
    : micFrames.value.map((sample) => ({
        ...sample,
        time: sample.time + correctionMs.value / 1000,
      })),
);
const inputFrames = computed(() => {
  if (!showOffline.value) return realtimeFrames.value;
  if (offline.value?.status !== 'ready') return [];
  return alignedOfflineVocalFrames(
    offline.value.pitches,
    viewStart.value,
    position.value,
  );
});
const trace = computed(() => connectMicFrames(inputFrames.value));
const levelPaths = computed(() =>
  showInputLevel.value
    ? inputLevelPaths(
        realtimeFrames.value,
        focusStart.value - overscan,
        focusEnd.value + overscan,
        timeToX,
      )
    : {},
);
const micPath = computed(() =>
  microphonePitchPath(
    trace.value,
    focusStart.value - overscan,
    focusEnd.value - focusStart.value + 2 * overscan,
    y,
    timeToX,
  ),
);
const guideStatus = computed(() => {
  if (!trackId.value) return '請先在主視窗播放曲目。';
  if (!source.value?.guide) return '請在主視窗選用有分離導唱的音源。';
  if (!sourceKey.value) return '等待主播放器載入曲目…';
  if (pendingGuide.value) return '正在準備導唱音高…';
  if (response.value?.status === 'ready')
    return semitones.value === null ? '等待播放器確認調性…' : '';
  return (
    {
      'gate-disabled': '請先在設定啟用音訊處理。',
      'no-decoder': '請先在設定準備 FFmpeg。',
      'no-model': '此開發工作區尚未準備 SwiftF0 模型。',
      'too-long': '導唱音高目前支援最長 12 分鐘的曲目。',
      'no-guide': '找不到目前曲目的分離導唱。',
      busy: '音訊分析忙碌，稍後可重試。',
    }[response.value?.status] ?? '無法準備這首歌的導唱音高。'
  );
});

function clearMic() {
  micBoundaryMs = performance.now();
  continuous = false;
  micFrames.value = [];
}

function clearLiveInput() {
  liveRequest++;
  clearOffline();
  liveInput.value = null;
  liveInputError.value = '';
}

function clearOffline() {
  const previous = offlineRequest;
  offlineRequest = null;
  offline.value = null;
  if (previous) void access?.cancelLiveVocal?.(previous).catch(() => {});
}

async function analyzeLiveInput() {
  const input = liveInput.value;
  if (!showOffline.value || !input?.range || offlineRequest) return;
  const id = crypto.randomUUID();
  offlineRequest = id;
  offline.value = { status: 'pending' };
  try {
    const samples = await input.offlineSamples();
    if (offlineRequest !== id) return;
    const result = await access?.analyzeLiveVocal?.(id, samples.buffer);
    if (offlineRequest !== id) return;
    offline.value = result?.status === 'ready' ? result : { status: 'error' };
  } catch {
    if (offlineRequest === id) offline.value = { status: 'error' };
  } finally {
    if (offlineRequest === id) offlineRequest = null;
  }
}

async function loadLiveInput(file) {
  if (!liveSelected.value || !sourceKey.value) return;
  const request = ++liveRequest;
  const source = sourceKey.value;
  liveInputError.value = '';
  try {
    if (file.size > MAX_ALIGNED_VOCAL_BYTES) throw new Error('WAV size limit');
    const buffer = await file.arrayBuffer();
    if (request !== liveRequest || source !== sourceKey.value) return;
    const input = readAlignedVocalWav(buffer);
    clearOffline();
    liveInput.value = { name: file.name, ...input };
  } catch {
    if (request !== liveRequest || source !== sourceKey.value) return;
    liveInputError.value =
      '請選擇 24 MB 以下、已對齊的單聲道 16-bit WAV（16 或 48 kHz）。';
  }
}

function cancelGuide() {
  const previous = requestId;
  requestId = null;
  pendingGuide.value = false;
  if (previous) void access?.cancelCurrentGuide?.(previous).catch(() => {});
}

async function loadGuide() {
  cancelGuide();
  response.value = null;
  reviewMarks.value = [];
  if (!sourceKey.value || !access?.analyzeCurrentGuide) return;
  const id = crypto.randomUUID();
  const identity = sourceKey.value;
  requestId = id;
  pendingGuide.value = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (requestId !== id || sourceKey.value !== identity) return;
      const result = await access.analyzeCurrentGuide(id);
      if (requestId !== id || sourceKey.value !== identity) return;
      if (result?.status === 'busy' && attempt < 5) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        continue;
      }
      response.value =
        result?.status === 'ready' &&
        Math.abs(result.durationSeconds - duration.value) >= 0.1
          ? { status: 'source-changed' }
          : result;
      reviewMarks.value = response.value?.marks ?? [];
      break;
    }
  } catch {
    if (requestId === id) response.value = { status: 'unavailable' };
  } finally {
    if (requestId === id) {
      requestId = null;
      pendingGuide.value = false;
    }
  }
}

function sampleMic(running, frame) {
  micRunning.value = running;
  if (!frame) {
    clearMic();
    return;
  }
  if (!playing.value || !trackId.value) {
    continuous = false;
    return;
  }
  const positionMs = projectMicSamplePosition(
    frame,
    micBoundaryMs,
    clock.positionAt,
    playback.value?.rate ?? 1,
  );
  if (positionMs === null) return;
  const time = positionMs / 1000;
  const previous = micFrames.value.at(-1);
  if (previous && time <= previous.time) return;
  micFrames.value = [
    ...micFrames.value.slice(-1199).filter((point) => point.time >= time - 17),
    {
      time,
      atMs: frame.atMs,
      hz: frame.hz,
      dbfs: frame.dbfs,
      levelTone: frame.levelTone,
      continuous: continuous && previous && frame.atMs - previous.atMs <= 150,
    },
  ];
  continuous = true;
}

function resetSweepGlint() {
  previousScanTime = null;
  sweepGlint.value = null;
  sweepGlintStrike.value = false;
}

function tick(frameMs) {
  animation = null;
  if (!playing.value) return;
  position.value = clock.advanceDisplay(frameMs) / 1000;
  const time = scanTime.value;
  const hit = crossedSweepNote(guideBoxes.value, previousScanTime, time);
  if (hit) sweepGlint.value = hit;
  sweepGlintStrike.value = Boolean(hit);
  previousScanTime = time;
  animation = requestAnimationFrame(tick);
}

function openLegend() {
  toolsOpen.value = false;
  legendOpen.value = true;
}

function openReview() {
  reviewCenterMs.value = Math.round(position.value * 1000);
  reviewOpen.value = true;
}

function returnToTools() {
  reviewOpen.value = false;
  void nextTick(() => reviewTrigger.value?.$el.focus());
}

watch(sourceKey, loadGuide, { immediate: true });
watch([liveInput, showOffline], () => {
  if (offline.value?.status !== 'ready') void analyzeLiveInput();
});
watch(inputMode, () => {
  clearMic();
  clearLiveInput();
  micRunning.value = false;
});
watch(sourceKey, () => {
  clearLiveInput();
  if (reviewOpen.value) returnToTools();
});
watch(
  toolsOpen,
  (open) => {
    if (!open) reviewOpen.value = false;
  },
  { flush: 'sync' },
);
watch(
  [
    trackId,
    () => source.value?.playbackRevision,
    () => source.value?.continuityRevision,
    () => playback.value?.rate,
    semitones,
    () => source.value?.monitorPitchDelayMs,
  ],
  clearMic,
  { flush: 'sync' },
);
watch(
  playing,
  () => {
    continuous = false;
    if (playing.value) micBoundaryMs = performance.now();
  },
  { flush: 'sync' },
);
watch(
  [
    continuityKey,
    lyricsOffset,
    () => lyrics.value?.trackId,
    () => lyrics.value?.synced,
    () => JSON.stringify(lyrics.value?.source),
  ],
  () => {
    wordCues.value = [];
  },
  { flush: 'sync' },
);
watch(
  () => props.snapshot,
  (snapshot) => {
    wordCues.value = retainSingAlongWordCue(
      wordCues.value,
      snapshot?.wordCue,
      snapshot?.state?.lyrics?.lines,
      lyricPositionMs.value,
    );
  },
  { immediate: true },
);
watch(
  [playing, continuityKey, scanDelay, displayGuide, semitones],
  resetSweepGlint,
  { flush: 'sync' },
);
watch(
  [state, continuityKey, micLookback, () => source.value?.monitorPitchDelayMs],
  () => {
    const frameMs = performance.now();
    const previous = clock.displayPositionAt(frameMs);
    const next = clock.sync(
      state.value,
      continuityKey.value,
      Date.now(),
      frameMs,
      source.value?.monitorPitchDelayMs,
      micLookback.value,
    );
    if (Math.abs(next - previous) > 0.001) resetSweepGlint();
    if (!playing.value || animation === null) position.value = next / 1000;
    if (playing.value && animation === null) {
      animation = requestAnimationFrame(tick);
    } else if (!playing.value && animation !== null) {
      cancelAnimationFrame(animation);
      animation = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  clearLiveInput();
  cancelGuide();
  if (animation !== null) cancelAnimationFrame(animation);
});
</script>

<template>
  <PerformerSurface
    :frame="displayFrame"
    :reading-scale="readingScale"
    :pending="pending"
    @control="$emit('control', $event)"
    @sync-action="$emit('sync-action', $event)"
    @update:reading-scale="$emit('update:readingScale', $event)"
  >
    <template #above-cues>
      <figure class="prompter-sing-along__pitch">
        <figcaption v-if="guideStatus" class="prompter-sing-along__status">
          <span role="status">{{ guideStatus }}</span>
          <UiButton
            v-if="sourceKey && !pendingGuide && response?.status !== 'ready'"
            @click="loadGuide"
            >重試</UiButton
          >
        </figcaption>
        <div class="prompter-sing-along__chart">
          <div class="prompter-sing-along__axis" aria-hidden="true">
            <span
              v-for="line in labeledGrid"
              :key="line.midi"
              :style="{ insetBlockStart: `${(line.y / 120) * 100}%` }"
              >{{ noteName(line.midi) }}</span
            >
          </div>
          <svg
            class="prompter-sing-along__plot"
            :style="{ '--prompter-guide-fill': `url(#${guideFillId})` }"
            :viewBox="`0 0 ${PITCH_WIDTH} 120`"
            preserveAspectRatio="none"
            role="img"
            :aria-label="
              liveSelected
                ? '原唱曲線、目標音符與人聲檔音高'
                : '原唱曲線、目標音符與麥克風實唱音高'
            "
          >
            <defs>
              <clipPath :id="inputClipId">
                <rect :width="scanX" height="120" />
              </clipPath>
              <!-- Match the fixed scan position in the scrolling score coordinates. -->
              <linearGradient
                :id="guideFillId"
                class="prompter-sing-along__sweep"
                gradientUnits="userSpaceOnUse"
                :gradientTransform="`translate(${guideFillX} 0)`"
                :x2="PITCH_WIDTH"
              >
                <stop
                  class="prompter-sing-along__sweep--passed"
                  :offset="SING_ALONG_CURSOR"
                />
                <stop
                  class="prompter-sing-along__sweep--pending"
                  :offset="SING_ALONG_CURSOR"
                />
              </linearGradient>
              <linearGradient :id="sweepTintId">
                <stop class="prompter-sing-along__tint-stop" stop-opacity="0" />
                <stop
                  class="prompter-sing-along__tint-stop"
                  offset="1"
                  stop-opacity="0.22"
                />
              </linearGradient>
              <linearGradient
                :id="sweepGlintId"
                gradientUnits="userSpaceOnUse"
                x2="8"
              >
                <stop class="prompter-sing-along__light" offset="0.28" />
                <stop
                  class="prompter-sing-along__light"
                  offset="1"
                  stop-opacity="0"
                />
              </linearGradient>
            </defs>
            <rect
              v-if="wordBand"
              class="prompter-sing-along__word"
              :x="wordBand.x"
              :width="wordBand.width"
              y="0"
              height="120"
            />
            <path
              v-for="line in grid"
              :key="line.midi"
              class="prompter-sing-along__grid"
              :class="{
                'prompter-sing-along__grid--octave': line.octave,
                'prompter-sing-along__grid--minor': !line.octave,
              }"
              :d="`M0 ${line.y}H${PITCH_WIDTH}`"
            />
            <path
              v-if="beats.length"
              class="prompter-sing-along__ruler"
              :d="`M0 116H${PITCH_WIDTH}`"
            />
            <rect
              class="prompter-sing-along__sweep-tint"
              :opacity="playing ? 1 : 0"
              :fill="`url(#${sweepTintId})`"
              :x="scanX - 6"
              width="6"
              height="120"
              pointer-events="none"
              aria-hidden="true"
            />
            <g :transform="timelineTransform">
              <path
                v-for="beat in visibleBeats"
                :key="beat.time"
                :class="
                  beat.downbeat
                    ? 'prompter-sing-along__barline'
                    : 'prompter-sing-along__beat'
                "
                :d="`M${timeToX(beat.time)} ${beat.downbeat ? 4 : 110}V116`"
              />
              <path
                v-for="time in visibleLineStarts"
                :key="time"
                class="prompter-sing-along__phrase"
                :d="`M${timeToX(time)} 0V9`"
              />
              <g
                v-for="note in guideBoxes"
                :key="note.start"
                v-memo="[note, scanTime >= note.start, scanTime >= note.end]"
                class="prompter-sing-along__note"
                :class="{
                  'prompter-sing-along__note--past': scanTime >= note.end,
                  'prompter-sing-along__note--active':
                    scanTime >= note.start && scanTime < note.end,
                }"
              >
                <rect
                  class="prompter-sing-along__target"
                  :x="note.x"
                  :y="note.y"
                  :width="note.width"
                  :height="GUIDE_NOTE_HEIGHT"
                />
                <rect
                  class="prompter-sing-along__target-band"
                  :x="note.x + 0.1"
                  :y="note.bandY"
                  :width="Math.max(0, note.width - 0.2)"
                  :height="note.bandHeight"
                />
              </g>
              <rect
                v-memo="[sweepGlint, sweepGlintStrike]"
                class="prompter-sing-along__glint"
                :class="{
                  'prompter-sing-along__glint--strike': sweepGlintStrike,
                  'prompter-sing-along__glint--idle': !sweepGlint,
                }"
                :transform="`translate(${sweepGlint?.x ?? 0} ${sweepGlint?.y ?? 0})`"
                :width="sweepGlint?.width ?? 0"
                :height="GUIDE_NOTE_HEIGHT"
                :fill="`url(#${sweepGlintId})`"
                aria-hidden="true"
              />
              <path
                v-memo="[referencePath]"
                class="prompter-sing-along__reference"
                :d="referencePath"
              />
            </g>
            <g :clip-path="inputClip">
              <g :transform="timelineTransform">
                <path class="prompter-sing-along__voice-edge" :d="micPath" />
                <path class="prompter-sing-along__voice" :d="micPath" />
              </g>
            </g>
            <line
              class="prompter-sing-along__cursor"
              :x1="scanX"
              :x2="scanX"
              y1="0"
              y2="120"
            />
          </svg>
          <template v-if="showInputLevel">
            <span class="prompter-sing-along__level-label" aria-hidden="true">
              電平
            </span>
            <svg
              class="prompter-sing-along__level"
              :viewBox="`0 0 ${PITCH_WIDTH} ${INPUT_LEVEL_HEIGHT}`"
              preserveAspectRatio="none"
              role="img"
              :aria-label="t('performerInput.historyDescription')"
            >
              <path
                class="prompter-sing-along__ruler"
                :d="`M0 ${INPUT_LEVEL_HEIGHT - 1}H${PITCH_WIDTH}`"
              />
              <g :clip-path="inputClip">
                <g :transform="timelineTransform">
                  <path
                    v-for="(path, tone) in levelPaths"
                    :key="tone"
                    class="prompter-sing-along__level-fill"
                    :data-tone="tone"
                    :d="path"
                  />
                </g>
              </g>
              <line
                class="prompter-sing-along__cursor"
                :x1="scanX"
                :x2="scanX"
                y1="0"
                :y2="INPUT_LEVEL_HEIGHT"
              />
            </svg>
          </template>
          <svg
            class="prompter-sing-along__annotations"
            :viewBox="`0 0 ${PITCH_WIDTH} 16`"
            preserveAspectRatio="none"
            role="img"
            aria-label="導唱技巧註記"
            :aria-hidden="annotations.length === 0"
          >
            <g :transform="timelineTransform">
              <g
                v-for="mark in annotations"
                :key="mark.start"
                class="prompter-sing-along__annotation"
                :class="{
                  'prompter-sing-along__annotation--active':
                    position >= mark.start && position < mark.end,
                }"
                :transform="`translate(${mark.x} 6)`"
              >
                <title>顫音</title>
                <path class="prompter-sing-along__technique" :d="vibratoPath" />
                <path
                  v-if="mark.onsetOffset"
                  class="prompter-sing-along__annotation-stem"
                  :d="`M${Math.min(4, mark.onsetOffset / 2)} 0H${mark.onsetOffset}v4`"
                />
                <path
                  v-else
                  class="prompter-sing-along__annotation-stem"
                  d="M0 4V8"
                />
              </g>
            </g>
          </svg>
        </div>
      </figure>
    </template>
    <template v-if="!liveSelected && showMeter" #rail-meter>
      <UiSurface
        class="prompter-sing-along__meter"
        tag="section"
        stroke="inset"
        :aria-label="t('performerInput.device')"
      >
        <div ref="meterHost" />
      </UiSurface>
    </template>
    <template #rail-tools>
      <UiIconButton
        class="prompter-sing-along__legend-button"
        :icon="Info"
        label="譜面圖例"
        :title="legendOpen ? '' : undefined"
        aria-haspopup="dialog"
        @click="openLegend"
      />
    </template>
    <template #display-tools>
      <div class="prompter-sing-along__display-toggles">
        <UiCheckbox
          id="prompter-show-reference-pitch"
          v-model="showReferencePitch"
          :label="t('performerInput.showReferencePitch')"
        />
        <UiCheckbox
          id="prompter-show-mic-meter"
          v-model="showMeter"
          :label="t('performerInput.showMeter')"
        />
        <UiCheckbox
          id="prompter-show-input-level"
          v-model="showInputLevel"
          :label="t('performerInput.history')"
        />
      </div>
    </template>
    <template #leading-tools>
      <UiPopover
        v-model:open="toolsOpen"
        keep-mounted
        focus-on-open
        placement="top-end"
        scroll-axis="vertical"
        aria-label="跟唱工具"
        :panel-style="
          reviewOpen
            ? {
                inlineSize: 'min(46rem, calc(100vw - 2rem))',
                '--ui-popover-max-inline-size': '46rem',
              }
            : { inlineSize: 'var(--ui-performer-settings-inline-size)' }
        "
      >
        <template #trigger="{ triggerProps }">
          <UiButton
            v-bind="triggerProps"
            variant="secondary"
            :icon="micRunning ? MicVocal : SlidersHorizontal"
            :active="toolsOpen || micRunning"
            :aria-label="micRunning ? '跟唱工具，麥克風已啟用' : undefined"
            @click="toolsOpen = !toolsOpen"
            >跟唱工具</UiButton
          >
        </template>
        <div v-show="!reviewOpen" class="prompter-sing-along__mic-settings">
          <UiSelect
            id="prompter-pitch-input"
            v-model="inputMode"
            label="音高來源"
            :options="inputOptions"
            label-inline
          />
          <ReferencePitchMicrophone
            v-if="inputMode === 'microphone'"
            v-model:preferences="micPreferences"
            :access="access"
            :meter-host="meterHost"
            prefer-system-default
            stop-when-hidden
            @frame="sampleMic"
          >
            <template #tuning>
              <UiRange
                id="prompter-mic-correction"
                v-model="correctionMs"
                :label="t('performerInput.alignment')"
                :hint="t('performerInput.alignmentHint')"
                :min="-500"
                :max="500"
                :step="10"
                :value-text="formatCorrection(correctionMs)"
                :format-value="formatCorrection"
                value-in-label
              />
            </template>
          </ReferencePitchMicrophone>
          <template v-else>
            <UiFilePickerButton
              accept=".wav,audio/wav"
              variant="accent"
              :disabled="!sourceKey || offline?.status === 'pending'"
              @select="loadLiveInput"
            >
              選擇人聲 WAV
            </UiFilePickerButton>
            <UiHint v-if="liveInputError" tone="warning" role="alert">
              {{ liveInputError }}
            </UiHint>
            <UiHint v-if="liveInput" class="prompter-sing-along__filename">
              {{ liveInput.name }}
            </UiHint>
            <UiHint v-if="liveInput && !liveInput.range">
              這份 WAV 沒有聲音。
            </UiHint>
            <UiSelect
              v-if="liveInput?.range && access?.analyzeLiveVocal"
              id="prompter-live-method"
              v-model="liveMethod"
              label="音高分析"
              :options="liveMethods"
              label-inline
            />
            <UiHint
              v-if="showOffline && offline?.status === 'pending'"
              role="status"
            >
              分析中…
            </UiHint>
            <UiHint
              v-if="showOffline && offline?.status === 'error'"
              tone="warning"
              role="alert"
            >
              離線分析失敗。
            </UiHint>
            <UiButton
              v-if="showOffline && offline?.status === 'error'"
              variant="secondary"
              @click="analyzeLiveInput"
              >重試</UiButton
            >
          </template>
          <UiButton
            v-if="access?.loadGuideReview"
            ref="reviewTrigger"
            variant="secondary"
            :disabled="response?.status !== 'ready'"
            @click="openReview"
            >檢查這段</UiButton
          >
        </div>
        <GuideSegmentReview
          v-if="reviewOpen"
          :access="access"
          :center-ms="reviewCenterMs"
          :duration-ms="Math.round(duration * 1000)"
          :playback-active="playRequested"
          @back="returnToTools"
          @marks="reviewMarks = $event"
          @pause="$emit('control', 'pause')"
        />
      </UiPopover>
      <UiModal
        :open="legendOpen"
        title="譜面圖例"
        size="notice"
        initial-focus="dialog"
        :selectable="false"
        dismiss-on-backdrop
        @close="legendOpen = false"
      >
        <dl class="prompter-sing-along__legend">
          <div>
            <dt>
              <svg viewBox="0 0 48 24" aria-hidden="true">
                <rect
                  class="prompter-sing-along__target"
                  x="4"
                  y="8"
                  width="29"
                  height="8"
                />
                <rect
                  class="prompter-sing-along__target-band"
                  x="4.2"
                  y="10"
                  width="28.6"
                  height="4"
                />
                <path
                  class="prompter-sing-along__reference"
                  d="M5 13Q11 6 17 12T29 12"
                />
                <path class="prompter-sing-along__voice" d="M14 12H43" />
              </svg>
              音高對照
            </dt>
            <dd>
              {{ t('performerInput.pitchLegend') }}
            </dd>
          </div>
          <div>
            <dt>
              <svg viewBox="0 0 48 24" aria-hidden="true">
                <path
                  class="prompter-sing-along__technique"
                  transform="translate(13 12) scale(1.5)"
                  :d="vibratoPath"
                />
                <path class="prompter-sing-along__phrase" d="M32 8V16" />
              </svg>
              演唱標記
            </dt>
            <dd>波浪是顫音，短線是句首。</dd>
          </div>
          <div>
            <dt>
              <svg viewBox="0 0 48 24" aria-hidden="true">
                <path class="prompter-sing-along__ruler" d="M4 20H44" />
                <path class="prompter-sing-along__barline" d="M10 4V20" />
                <path class="prompter-sing-along__cursor" d="M22 4V20" />
                <path
                  class="prompter-sing-along__beat"
                  d="M34 15V20M42 15V20"
                />
              </svg>
              節拍定位
            </dt>
            <dd>{{ t('performerInput.scanLegend') }}</dd>
          </div>
          <div>
            <dt>
              <svg viewBox="0 0 48 24" aria-hidden="true">
                <path
                  class="prompter-sing-along__level-fill"
                  d="M4 20V15L10 13L14 16L21 8L27 10L33 15L38 12L44 16V20Z"
                />
              </svg>
              {{ t('performerInput.historyName') }}
            </dt>
            <dd>{{ t('performerInput.historyDescription') }}</dd>
          </div>
        </dl>
      </UiModal>
    </template>
  </PerformerSurface>
</template>

<style scoped>
.prompter-sing-along__pitch {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.prompter-sing-along__status {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.prompter-sing-along__meter {
  inline-size: min(100%, var(--ui-performer-mic-meter-inline-size));
  min-inline-size: 0;
  padding: var(--ui-space-2);
}

.prompter-sing-along__display-toggles {
  display: grid;
  gap: var(--ui-space-1);
}

.prompter-sing-along__mic-settings {
  display: grid;
  gap: var(--ui-space-2);
}

.prompter-sing-along__legend-button {
  flex: none;
  min-block-size: var(--ui-performer-action-min-block-size);
  min-inline-size: var(--ui-performer-action-min-block-size);
}

.prompter-sing-along__filename {
  overflow-wrap: anywhere;
}

.prompter-sing-along__status,
.prompter-sing-along__axis,
.prompter-sing-along__level-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.prompter-sing-along__chart {
  display: grid;
  grid-template-areas:
    '. annotations'
    'axis plot'
    'level-label level';
  grid-template-columns: 4ch minmax(0, 1fr);
  column-gap: var(--ui-space-2);
}

.prompter-sing-along__axis {
  grid-area: axis;
  position: relative;
}

.prompter-sing-along__axis span {
  position: absolute;
  translate: 0 -50%;
}

.prompter-sing-along__plot {
  grid-area: plot;
  inline-size: 100%;
  block-size: clamp(4rem, 17vh, 6rem);
}

.prompter-sing-along__annotations {
  grid-area: annotations;
  inline-size: 100%;
  block-size: var(--ui-space-4);
}

.prompter-sing-along__plot,
.prompter-sing-along__annotations,
.prompter-sing-along__level {
  overflow: hidden;
}

.prompter-sing-along__level-label {
  grid-area: level-label;
  align-self: end;
  white-space: nowrap;
}

.prompter-sing-along__level {
  grid-area: level;
  inline-size: 100%;
  block-size: var(--ui-space-5);
}

.prompter-sing-along__level-fill {
  fill: var(--ui-color-accent);
  fill-opacity: 0.4;
}

.prompter-sing-along__level-fill[data-tone='success'] {
  fill: var(--ui-color-success);
}

.prompter-sing-along__level-fill[data-tone='warning'] {
  fill: var(--ui-color-warning);
}

.prompter-sing-along__level-fill[data-tone='danger'] {
  fill: var(--ui-color-danger);
}

.prompter-sing-along__legend {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ui-space-2) var(--ui-space-4);
  margin: 0;
  font-size: var(--ui-type-body-size);
}

.prompter-sing-along__legend > div {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
}

.prompter-sing-along__legend dt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-weight: var(--ui-font-weight-semibold);
}

.prompter-sing-along__legend svg {
  flex: none;
  inline-size: var(--ui-space-7);
  block-size: var(--ui-space-5);
  color: var(--ui-color-text-muted);
}

.prompter-sing-along__legend dd {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  line-height: var(--ui-type-label-line-height);
}

.prompter-sing-along__grid,
.prompter-sing-along__ruler,
.prompter-sing-along__barline,
.prompter-sing-along__beat,
.prompter-sing-along__phrase,
.prompter-sing-along__target,
.prompter-sing-along__technique,
.prompter-sing-along__annotation-stem,
.prompter-sing-along__reference,
.prompter-sing-along__voice-edge,
.prompter-sing-along__voice,
.prompter-sing-along__cursor {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.prompter-sing-along__grid {
  stroke: var(--ui-color-border);
}

.prompter-sing-along__grid--minor {
  opacity: 0.55;
}

.prompter-sing-along__grid--octave {
  stroke: var(--ui-color-border-strong);
  opacity: 0.45;
}

.prompter-sing-along__word {
  fill: var(--ui-color-accent-soft);
  opacity: 0.55;
}

.prompter-sing-along__ruler {
  stroke: var(--ui-color-border);
}

.prompter-sing-along__barline,
.prompter-sing-along__beat {
  stroke: var(--ui-color-border-strong);
}

.prompter-sing-along__barline {
  opacity: 0.32;
}

.prompter-sing-along__beat,
.prompter-sing-along__ruler {
  opacity: 0.48;
}

.prompter-sing-along__phrase {
  stroke: var(--ui-color-accent);
  stroke-width: 2;
}

.prompter-sing-along__cursor {
  stroke: var(--ui-color-text-muted);
  stroke-width: var(--ui-performer-sweep-width);
}

.prompter-sing-along__tint-stop {
  stop-color: var(--ui-color-accent);
}

.prompter-sing-along__light {
  stop-color: color-mix(
    in srgb,
    var(--ui-color-focus),
    var(--ui-palette-warm-neutral-100) 25%
  );
}

.prompter-sing-along__glint {
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--ui-motion-duration-standard)
    var(--ui-motion-easing-standard);
}

.prompter-sing-along__glint--strike {
  opacity: 0.9;
  transition: none;
}

.prompter-sing-along__glint--idle {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .prompter-sing-along__glint {
    visibility: hidden;
  }
}

:global(:root[data-ui-motion='reduced'] .prompter-sing-along__glint) {
  visibility: hidden;
}

.prompter-sing-along__annotation {
  color: var(--ui-color-text-muted);
}
.prompter-sing-along__technique,
.prompter-sing-along__annotation-stem {
  stroke: currentColor;
}
.prompter-sing-along__technique {
  stroke-width: 1.5;
}
.prompter-sing-along__annotation-stem {
  opacity: 0.65;
}
.prompter-sing-along__annotation--active {
  color: var(--ui-color-accent);
}
.prompter-sing-along__target,
.prompter-sing-along__glint {
  rx: var(--ui-radius-xs);
  ry: var(--ui-radius-sm);
}

.prompter-sing-along__target {
  fill: var(
    --prompter-guide-fill,
    color-mix(in srgb, var(--ui-color-surface), var(--ui-color-accent) 23%)
  );
  stroke: var(--ui-color-text-muted);
}
.prompter-sing-along__sweep--passed {
  stop-color: color-mix(
    in srgb,
    var(--ui-color-surface),
    var(--ui-color-accent) 70%
  );
}
.prompter-sing-along__sweep--pending {
  stop-color: var(--ui-color-surface);
}
.prompter-sing-along__target-band {
  rx: var(--ui-radius-xs);
  ry: var(--ui-radius-xs);
  fill: color-mix(in srgb, var(--ui-color-surface), var(--ui-color-accent) 8%);
}
.prompter-sing-along__plot .prompter-sing-along__target-band {
  fill: none;
  stroke: var(--ui-color-text);
  stroke-opacity: 0.4;
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
}
.prompter-sing-along__note--past .prompter-sing-along__target {
  stroke-opacity: 0.62;
}
.prompter-sing-along__note--active .prompter-sing-along__target {
  stroke: color-mix(
    in srgb,
    var(--ui-color-text-muted) 80%,
    var(--ui-color-text)
  );
  stroke-width: 1.5;
}

.prompter-sing-along__reference {
  stroke: var(--ui-color-text-muted);
  stroke-width: 1.25;
  stroke-linecap: round;
}
.prompter-sing-along__plot .prompter-sing-along__reference {
  stroke: color-mix(
    in srgb,
    var(--ui-color-text),
    var(--ui-color-text-muted) 15%
  );
}

.prompter-sing-along__voice-edge {
  stroke: var(--ui-color-text);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.prompter-sing-along__voice {
  stroke: var(--ui-performer-input-foreground);
  stroke-width: 2;
  stroke-linecap: round;
}
</style>
