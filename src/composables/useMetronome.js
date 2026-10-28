import { computed, reactive } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { useAppNotifications } from './useAppNotifications.js';
import {
  beatIntervalSeconds,
  collectDueBeats,
  nextBeatNumber,
} from '../utils/metronomeSchedule.js';
import { createMetronomeClickEngine } from '../utils/metronomeClickEngine.js';

export const METRONOME_BPM_RANGE = Object.freeze({ min: 40, max: 240 });
export const METRONOME_BEATS_RANGE = Object.freeze({ min: 2, max: 8 });

const DEFAULT_BPM = 120;
const DEFAULT_BEATS_PER_BAR = 4;
const TAP_RESET_MS = 2000;
const TAP_WINDOW = 5;
// Coarse poll only; it never triggers sound directly. Each tick asks the
// pure scheduler (metronomeSchedule.js) which beats now fall inside the
// lookahead window and hands their absolute times to the audio clock, so
// this timer's own jitter can never compound into audible drift.
const LOOKAHEAD_TICK_MS = 25;

const state = reactive({
  isRunning: false,
  bpm: DEFAULT_BPM,
  beatsPerBar: DEFAULT_BEATS_PER_BAR,
  currentBeat: 1,
  pulseId: 0,
  lastTickAt: null,
  tapCount: 0,
  soundEnabled: false,
  volume: 1,
  soundError: '',
  // 'default': never touched. 'manual': the user set it (stepper/tap).
  // 'track-estimate': applied from the current track's analyzed BPM.
  // Only 'manual' blocks further track-estimate application; reset()
  // returns to 'default' so track syncing resumes.
  bpmSource: 'default',
  bpmSourceConfidence: null,
});

let engine = null;
let soundRevision = 0;
let tickTimerId = null;
let nextBeatTime = 0;
let scheduledBeatNumber = 1;
// Beats already handed to the audio clock (scheduled up to the lookahead
// window ahead of time) but not yet visually shown, because their moment
// hasn't actually arrived yet. Kept separate from audio scheduling so the
// beat dots / pulse never flash early relative to the click the performer
// hears.
let pendingVisualBeats = [];
let tapTimes = [];
let tapIdleTimerId = null;

const intervalMs = computed(() => Math.round(60000 / state.bpm));
const currentBeatLabel = computed(
  () => `${state.currentBeat}/${state.beatsPerBar}`,
);

function clampInteger(value, range, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(number)));
}

// The engine is resolved once per module lifetime (shared by every caller,
// same singleton posture as `state`). Tests inject a fake via
// `useMetronome({ engine })`; production leaves it undefined and gets a
// lazily-created real one on first use.
function resolveEngine(options = {}) {
  if (options.engine) {
    engine = options.engine;
  } else if (!engine) {
    engine = createMetronomeClickEngine();
  }
  engine.setVolume?.(state.volume);
  return engine;
}

function setVolume(value) {
  if (!Number.isFinite(value)) return;
  state.volume = Math.min(1, Math.max(0, value));
  engine?.setVolume?.(state.volume);
}

function failSound(error) {
  stop();
  state.soundEnabled = false;
  state.soundError = '請確認系統預設輸出後再重新啟動。';
  void Promise.resolve(engine?.close()).catch(() => {});
  // The tools panel may be closed mid-performance, so the shell owns this.
  useAppNotifications().notifyFailure({
    key: NOTIFICATION_KEYS.METRONOME_SOUND,
    title: '節拍器已停止',
    message: state.soundError,
    tone: 'warning',
    error,
    code: 'METRONOME_AUDIO_UNAVAILABLE',
    source: 'metronome',
    operation: 'resume-audio',
    context: { retryable: true },
    actionLabel: '重新啟動',
    action: restartWithSound,
  });
}

function clearSoundError() {
  if (!state.soundError) return;
  state.soundError = '';
  useAppNotifications().clear(NOTIFICATION_KEYS.METRONOME_SOUND);
}

function restartWithSound() {
  setSoundEnabled(true);
  start();
}

function resumeAudio() {
  const revision = ++soundRevision;
  void engine.resume().catch((error) => {
    if (revision === soundRevision) failSound(error);
  });
}

function clearTickTimer() {
  if (tickTimerId === null) return;
  clearInterval(tickTimerId);
  tickTimerId = null;
}

function runTick() {
  const now = engine.now();

  // Schedule any beats that newly fall inside the lookahead window. Their
  // audio time is exact even though this poll's own timing is not.
  const result = collectDueBeats({
    nextBeatTime,
    beatNumber: scheduledBeatNumber,
    bpm: state.bpm,
    beatsPerBar: state.beatsPerBar,
    now,
  });
  nextBeatTime = result.nextBeatTime;
  scheduledBeatNumber = result.beatNumber;
  for (const beat of result.beats) {
    if (state.soundEnabled) {
      engine.scheduleClick(beat.time, beat.accent);
    }
    pendingVisualBeats.push(beat);
  }

  // Only flip the visual indicator once a scheduled beat's own time has
  // actually arrived, so the dots never light up ahead of the click.
  while (pendingVisualBeats.length > 0 && pendingVisualBeats[0].time <= now) {
    const beat = pendingVisualBeats.shift();
    state.currentBeat = beat.beatNumber;
    state.pulseId += 1;
    state.lastTickAt = Date.now();
  }
}

function start() {
  if (state.isRunning) return;
  clearSoundError();
  resolveEngine();
  let startTime;
  try {
    startTime = engine.now();
  } catch (error) {
    failSound(error);
    return;
  }
  state.isRunning = true;
  state.currentBeat = 1;
  state.pulseId += 1;
  state.lastTickAt = Date.now();
  if (state.soundEnabled) {
    engine.scheduleClick(startTime, true);
  }
  // Beat 1 is handled synchronously above; anchor the schedule to start
  // looking for beat 2 onward so the first tick doesn't re-fire beat 1.
  nextBeatTime = startTime + beatIntervalSeconds(state.bpm);
  scheduledBeatNumber = nextBeatNumber(1, state.beatsPerBar);
  pendingVisualBeats = [];
  clearTickTimer();
  tickTimerId = setInterval(runTick, LOOKAHEAD_TICK_MS);
  // Request resume within the user gesture without delaying the clock setup.
  // Only the current attempt may report failure and stop this run.
  resumeAudio();
}

function stop() {
  soundRevision += 1;
  state.isRunning = false;
  clearTickTimer();
  pendingVisualBeats = [];
}

function toggle() {
  if (state.isRunning) {
    stop();
    return;
  }
  start();
}

function setBpm(value) {
  // No timer reschedule needed: runTick reads state.bpm fresh every tick
  // and continues from the already-anchored nextBeatTime, so a BPM change
  // takes effect starting at the next unscheduled beat instead of
  // discarding whatever remains of the current one.
  state.bpm = clampInteger(value, METRONOME_BPM_RANGE, state.bpm);
  state.bpmSource = 'manual';
  state.bpmSourceConfidence = null;
}

function adjustBpm(delta) {
  setBpm(state.bpm + delta);
}

// The only entry point for the current track's analyzed BPM
// (see useMetronomeTrackTempo.js). Declines once the user has manually set
// a BPM this session (until reset()), and while running, so a track change
// never yanks the tempo out from under an active click track.
function applyTrackTempo(bpm, confidence) {
  if (state.bpmSource === 'manual' || state.isRunning) return false;
  state.bpm = clampInteger(bpm, METRONOME_BPM_RANGE, state.bpm);
  state.bpmSource = 'track-estimate';
  state.bpmSourceConfidence = Number.isFinite(confidence) ? confidence : null;
  return true;
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

function setSoundEnabled(enabled) {
  soundRevision += 1;
  state.soundEnabled = Boolean(enabled);
  if (state.soundEnabled) {
    resolveEngine();
    clearSoundError();
    resumeAudio();
  }
}

function toggleSound() {
  setSoundEnabled(!state.soundEnabled);
}

function clearTapIdleTimer() {
  if (tapIdleTimerId === null) return;
  clearTimeout(tapIdleTimerId);
  tapIdleTimerId = null;
}

function clearTaps() {
  clearTapIdleTimer();
  tapTimes = [];
  state.tapCount = 0;
}

function reset() {
  stop();
  state.bpm = DEFAULT_BPM;
  state.beatsPerBar = DEFAULT_BEATS_PER_BAR;
  state.currentBeat = 1;
  state.lastTickAt = null;
  state.bpmSource = 'default';
  state.bpmSourceConfidence = null;
  clearTaps();
  setVolume(1);
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
  state.tapCount = tapTimes.length;
  state.currentBeat = 1;
  state.pulseId += 1;
  state.lastTickAt = timestamp;

  clearTapIdleTimer();
  tapIdleTimerId = setTimeout(() => {
    tapIdleTimerId = null;
    clearTaps();
  }, TAP_RESET_MS);

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

export function useMetronome(options = {}) {
  resolveEngine(options);
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
    applyTrackTempo,
    setBeatsPerBar,
    adjustBeatsPerBar,
    setSoundEnabled,
    toggleSound,
    setVolume,
    tapTempo,
    resetTaps: clearTaps,
  };
}
