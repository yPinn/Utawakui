import { computed, reactive } from 'vue';

export const METRONOME_BPM_RANGE = Object.freeze({ min: 40, max: 240 });
export const METRONOME_BEATS_RANGE = Object.freeze({ min: 2, max: 8 });

const DEFAULT_BPM = 120;
const DEFAULT_BEATS_PER_BAR = 4;
const TAP_RESET_MS = 2000;
const TAP_WINDOW = 5;

const state = reactive({
  isRunning: false,
  bpm: DEFAULT_BPM,
  beatsPerBar: DEFAULT_BEATS_PER_BAR,
  currentBeat: 1,
  pulseId: 0,
  lastTickAt: null,
});

let timerId = null;
let tapTimes = [];

const intervalMs = computed(() => Math.round(60000 / state.bpm));
const currentBeatLabel = computed(
  () => `${state.currentBeat}/${state.beatsPerBar}`,
);

function clampInteger(value, range, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(number)));
}

function clearTimer() {
  if (timerId === null) return;
  clearTimeout(timerId);
  timerId = null;
}

function advanceBeat() {
  state.currentBeat =
    state.currentBeat >= state.beatsPerBar ? 1 : state.currentBeat + 1;
  state.pulseId += 1;
  state.lastTickAt = Date.now();
}

function scheduleNextBeat() {
  clearTimer();
  if (!state.isRunning) return;
  timerId = setTimeout(() => {
    advanceBeat();
    scheduleNextBeat();
  }, intervalMs.value);
}

function start() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.currentBeat = 1;
  state.pulseId += 1;
  state.lastTickAt = Date.now();
  scheduleNextBeat();
}

function stop() {
  state.isRunning = false;
  clearTimer();
}

function toggle() {
  if (state.isRunning) {
    stop();
    return;
  }
  start();
}

function setBpm(value) {
  state.bpm = clampInteger(value, METRONOME_BPM_RANGE, state.bpm);
  scheduleNextBeat();
}

function adjustBpm(delta) {
  setBpm(state.bpm + delta);
}

function setBeatsPerBar(value) {
  state.beatsPerBar = clampInteger(
    value,
    METRONOME_BEATS_RANGE,
    state.beatsPerBar,
  );
  if (state.currentBeat > state.beatsPerBar) {
    state.currentBeat = state.beatsPerBar;
  }
}

function adjustBeatsPerBar(delta) {
  setBeatsPerBar(state.beatsPerBar + delta);
}

function reset() {
  stop();
  state.bpm = DEFAULT_BPM;
  state.beatsPerBar = DEFAULT_BEATS_PER_BAR;
  state.currentBeat = 1;
  state.lastTickAt = null;
  tapTimes = [];
}

function tapTempo(timestamp = Date.now()) {
  if (
    tapTimes.length > 0 &&
    timestamp - tapTimes[tapTimes.length - 1] > TAP_RESET_MS
  ) {
    tapTimes = [];
  }

  tapTimes.push(timestamp);
  tapTimes = tapTimes.slice(-TAP_WINDOW);
  state.currentBeat = 1;
  state.pulseId += 1;
  state.lastTickAt = timestamp;

  if (tapTimes.length < 2) return state.bpm;

  const intervals = tapTimes
    .slice(1)
    .map((time, index) => time - tapTimes[index])
    .filter((interval) => interval > 0);

  if (intervals.length === 0) return state.bpm;

  const averageInterval =
    intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  setBpm(60000 / averageInterval);
  return state.bpm;
}

export function useMetronome() {
  return {
    state,
    intervalMs,
    currentBeatLabel,
    start,
    stop,
    toggle,
    reset,
    setBpm,
    adjustBpm,
    setBeatsPerBar,
    adjustBeatsPerBar,
    tapTempo,
  };
}
