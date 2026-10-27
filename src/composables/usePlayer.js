import { reactive, readonly } from 'vue';
import { usePlayerDiagnostics } from './player/usePlayerDiagnostics.js';
import { usePlayerLibrarySync } from './player/usePlayerLibrarySync.js';
import { usePlayerAudioStart } from './player/usePlayerAudioStart.js';
import { usePlayerPerformanceSettings } from './player/usePlayerPerformanceSettings.js';
import { usePlayerMediaBoundary } from './player/usePlayerMediaBoundary.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import {
  usePlayerAudioGraph,
  GUIDE_VOCAL_LEVEL_RANGE,
  PITCH_CENTS_RANGE,
  PLAYER_AUDIO_DEFAULTS,
  PLAYER_VOLUME_RANGE,
  TEMPO_RATE_RANGE,
  TRANSPOSE_SEMITONES_RANGE,
} from './player/usePlayerAudioGraph.js';
import { normalizeAudioPreferences } from '../utils/audioPreferences.js';
import { createPlaybackClockSampler } from '../utils/playbackClockSample.js';

export {
  GUIDE_VOCAL_LEVEL_RANGE,
  PITCH_CENTS_RANGE,
  PLAYER_AUDIO_DEFAULTS,
  PLAYER_VOLUME_RANGE,
  TEMPO_RATE_RANGE,
  TRANSPOSE_SEMITONES_RANGE,
};

// Module-scope singleton shared by views and the persistent player bar.
export const PLAYBACK_MODES = Object.freeze({
  sequence: 'sequence',
  repeatList: 'repeat-list',
  repeatOne: 'repeat-one',
});

const PLAYBACK_MODE_ORDER = Object.freeze([
  PLAYBACK_MODES.sequence,
  PLAYBACK_MODES.repeatList,
  PLAYBACK_MODES.repeatOne,
]);
const { recordError } = useAppDiagnostics();

const initialAudioPreferences = normalizeAudioPreferences(
  typeof window !== 'undefined'
    ? window.Utawakui?.initialAudioPreferences
    : null,
);

function reportPlayerError(error, operation, message) {
  return recordError(error, {
    code: `PLAYER_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title: '播放操作未完成',
    message,
    source: 'player',
    operation,
    context: { retryable: true },
  }).message;
}

const state = reactive({
  pendingStartTrackId: null,
  track: null,
  isPlaying: false,
  playbackPhase: 'idle',
  playbackRevision: 0,
  // Output identity advances from audio-element discontinuity events; it is
  // not a second playback clock.
  continuityRevision: 0,
  currentTime: 0,
  duration: 0,
  volume: initialAudioPreferences.performanceVolume,
  captureVolume: initialAudioPreferences.captureVolume,
  isMuted: initialAudioPreferences.performanceMuted,
  playbackMode: PLAYBACK_MODES.sequence,
  isLooping: false,
  error: null,
  guideVocalOn: true,
  guideVocalValue: initialAudioPreferences.monitorGuideVocalLevel,
  captureGuideVocalOn: false,
  captureGuideVocalValue: initialAudioPreferences.captureGuideVocalLevel,
  transposeSemitones: PLAYER_AUDIO_DEFAULTS.transposeSemitones,
  pitchCents: PLAYER_AUDIO_DEFAULTS.pitchCents,
  tempoRate: PLAYER_AUDIO_DEFAULTS.tempoRate,
  captureDeviceId: null,
  captureError: null,
});

// The HTML audio element remains the sole authority for playback timing and
// state. Web Audio consumes its decoded output but never writes transport state.
const audio = new Audio();
audio.crossOrigin = 'anonymous';
const samplePlaybackClock = createPlaybackClockSampler(audio, state);

const recordAudioDiagnostic = usePlayerDiagnostics(state);
const audioGraph = usePlayerAudioGraph({
  audio,
  state,
  reportPlayerError,
  recordAudioDiagnostic,
});

const {
  applyCaptureDevice,
  prepareCaptureDevice,
  prepareCaptureOutput,
  registerCaptureInput,
  resetPitchTempo,
  resetTrackAudioControls,
  routeAudioGraph,
  setCaptureGuideVocalOn,
  setCaptureGuideVocalValue,
  setGuideVocalOn,
  setGuideVocalValue,
  setPitchCents,
  setTempoRate,
  setTransposeSemitones,
  setCaptureVolume,
  setVolume,
  toggleCaptureGuideVocal,
  toggleMute,
} = audioGraph;

const stoppedListeners = new Set();
const playbackProgressListeners = new Set();
let beforePlaybackStartListener = null;
let playbackStartRequestRevision = 0;
let lastObservedCurrentTime = 0;
let pendingRestorePosition = null;
let terminalStopNotified = false;
const practiceBoundary = usePlayerMediaBoundary({
  audio,
  state,
  cancelStart: cancelPendingStart,
  flushProgress: handleTimeUpdate,
  onTerminal: () => {
    terminalStopNotified = true;
  },
  onPlaying: () => {
    terminalStopNotified = false;
  },
});

function notifyStopped(reason, track = state.track) {
  if (!track || terminalStopNotified) return;
  terminalStopNotified = true;
  const stoppedEvent = {
    reason,
    trackId: track.id,
    playbackRevision: state.playbackRevision,
  };
  stoppedListeners.forEach((listener) => listener(stoppedEvent));
}

function handlePlay() {
  state.isPlaying = true;
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = 'buffering';
}

function handleBuffering(event) {
  if (!state.track) return;
  if (state.playbackPhase === 'playing') {
    const ready = Number.isInteger(audio.readyState) ? audio.readyState : 0;
    const network = Number.isInteger(audio.networkState)
      ? audio.networkState
      : 0;
    recordAudioDiagnostic(
      'buffering',
      event?.type === 'stalled' ? 'stalled' : 'waiting',
      {
        status: `ready-${ready}-network-${network}`,
      },
    );
  }
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = 'buffering';
}

function handleSeeking() {
  if (!state.track) return;
  state.continuityRevision += 1;
  state.currentTime = audio.currentTime || 0;
  lastObservedCurrentTime = state.currentTime;
  state.playbackPhase = 'seeking';
}

function handleSeeked() {
  if (!state.track) return;
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = state.isPlaying ? 'buffering' : 'paused';
}

function handleTimeUpdate() {
  const progressing =
    (state.isPlaying || (audio.ended && state.playbackPhase === 'playing')) &&
    !audio.seeking;
  const previousTime = lastObservedCurrentTime;
  const nextTime = audio.currentTime;
  const didAdvance = nextTime !== previousTime;
  lastObservedCurrentTime = nextTime;
  state.currentTime = nextTime;
  if (state.isPlaying && didAdvance && state.playbackPhase !== 'seeking') {
    state.playbackPhase = 'playing';
  }
  if (progressing && nextTime > previousTime && state.track) {
    const progressEvent = {
      trackId: state.track.id,
      playbackRevision: state.playbackRevision,
      deltaSeconds: nextTime - previousTime,
    };
    playbackProgressListeners.forEach((listener) => listener(progressEvent));
  }
}

function handleLoadedMetadata() {
  state.duration = audio.duration;
  if (pendingRestorePosition !== null) {
    const restoredPosition = Math.min(
      pendingRestorePosition,
      Number.isFinite(audio.duration) ? audio.duration : pendingRestorePosition,
    );
    pendingRestorePosition = null;
    audio.currentTime = restoredPosition;
  }
  state.currentTime = audio.currentTime || 0;
  lastObservedCurrentTime = audio.currentTime || 0;
}

function handleError() {
  pendingRestorePosition = null;
  if (Number.isInteger(audio.error?.code)) {
    recordAudioDiagnostic('media-error', 'media-element', {
      errorCode: audio.error.code,
    });
  }
  state.error = reportPlayerError(
    audio.error,
    'media',
    '目前無法播放這首曲目，請再試一次。',
  );
  state.isPlaying = false;
  state.playbackPhase = 'error';
  notifyStopped('error');
}

audio.addEventListener('play', handlePlay);
audio.addEventListener('waiting', handleBuffering);
audio.addEventListener('stalled', handleBuffering);
audio.addEventListener('seeking', handleSeeking);
audio.addEventListener('seeked', handleSeeked);
audio.addEventListener('timeupdate', handleTimeUpdate);
audio.addEventListener('loadedmetadata', handleLoadedMetadata);
audio.addEventListener('error', handleError);

const {
  startAudio,
  cancelAudioStart,
  requestPlaybackStart,
  restartAudio: restartTrack,
  applyAudioControls,
  toggle,
} = usePlayerAudioStart({
  audio,
  state,
  audioGraph,
  getStartRevision: () => playbackStartRequestRevision,
  getBeforePlaybackStart: () => beforePlaybackStartListener,
  cancelPendingStart,
  play,
  pause,
  seek,
  advanceStartRevision: () => ++playbackStartRequestRevision,
  prepareControls: (track, options) => {
    practiceBoundary.intent('restart');
    return performanceSettings.prepare(track, options);
  },
  commitControls: () => performanceSettings.commitPreparedSelection(),
  reportPlayerError,
  notifyStopped,
});
const performanceSettings = usePlayerPerformanceSettings({
  playerState: state,
  graph: audioGraph,
  applyValues: applyAudioControls,
  onScopeInvalidated: (event) => {
    cancelPendingStart();
    if (!event.trackId || event.trackId === state.track?.id) clearTrack();
  },
});

async function playTrack(track, { useDefaults = false } = {}) {
  practiceBoundary.intent('replace');
  audioGraph.cancelAudioControlApplication();
  const requestRevision = ++playbackStartRequestRevision;
  state.pendingStartTrackId = track.id;
  terminalStopNotified = false;
  state.error = null;
  // A new explicit performance request owns a fresh, editable timeline
  // boundary. Stop the current performance immediately, but keep its
  // identity/source stable until the BGM handoff hook grants the new start.
  if (state.isPlaying) audio.pause();
  const controls = await performanceSettings.prepare(track, {
    isCurrent: () => requestRevision === playbackStartRequestRevision,
    useDefaults,
    retry: (defaults) => playTrack(track, { useDefaults: defaults }),
  });
  if (requestRevision !== playbackStartRequestRevision) return false;
  if (!controls) {
    state.pendingStartTrackId = null;
    return false;
  }
  const allowed = await requestPlaybackStart({
    trackId: track.id,
    requestRevision,
  });
  if (!allowed) return false;

  state.track = track;
  state.playbackRevision += 1;
  state.currentTime = 0;
  state.duration = 0;
  lastObservedCurrentTime = 0;
  pendingRestorePosition = null;
  resetTrackAudioControls(controls);
  performanceSettings.commitPreparedSelection();
  routeAudioGraph(Boolean(track.usesSeparatedAudio));
  audio.src = track.url;
  return startAudio(requestRevision, 'play-track');
}

function restorePlaybackState({
  track,
  positionSeconds = 0,
  playbackMode = PLAYBACK_MODES.sequence,
} = {}) {
  if (!track) return false;
  practiceBoundary.intent('restore');
  audioGraph.cancelAudioControlApplication();
  playbackStartRequestRevision += 1;
  state.pendingStartTrackId = null;
  state.error = null;
  state.track = track;
  terminalStopNotified = false;
  state.playbackRevision += 1;
  state.isPlaying = false;
  state.playbackPhase = 'paused';
  state.currentTime = 0;
  state.duration = 0;
  lastObservedCurrentTime = 0;
  pendingRestorePosition = Math.max(0, Number(positionSeconds) || 0);
  resetTrackAudioControls();
  routeAudioGraph(Boolean(track.usesSeparatedAudio));
  setPlaybackMode(playbackMode);
  audio.src = track.url;
  void performanceSettings.restore(track);
  return true;
}

async function play({ useDefaults = false, practiceToken } = {}) {
  if (!state.track) return false;
  const requestRevision = ++playbackStartRequestRevision;
  state.pendingStartTrackId = state.track.id;
  terminalStopNotified = false;
  state.error = null;
  if (!(await practiceBoundary.beforePlay(practiceToken))) {
    if (requestRevision === playbackStartRequestRevision)
      state.pendingStartTrackId = null;
    return false;
  }
  if (requestRevision !== playbackStartRequestRevision) return false;
  const ready = await performanceSettings.ensure(
    state.track,
    () => requestRevision === playbackStartRequestRevision,
    useDefaults,
    (defaults) => play({ useDefaults: defaults }),
  );
  if (requestRevision !== playbackStartRequestRevision) return false;
  if (!ready) {
    state.pendingStartTrackId = null;
    return false;
  }
  const allowed = await requestPlaybackStart({
    trackId: state.track.id,
    requestRevision,
    resume: true,
  });
  if (!allowed) return false;

  return startAudio(requestRevision, 'resume');
}

function pause() {
  practiceBoundary.intent('pause');
  cancelPendingStart();
  audio.pause();
}

// Before the gate grants a track there is no new playback identity to stop.
// Once graph preparation owns it, explicitly release that handoff: pausing an
// already-paused native element emits no event in Chromium.
function cancelPendingStart(practiceToken) {
  practiceBoundary.intent('cancel', practiceToken);
  const previousRevision = playbackStartRequestRevision++;
  performanceSettings.cancelStart();
  state.pendingStartTrackId = null;
  cancelAudioStart(previousRevision);
}

function seek(time, practiceToken) {
  practiceBoundary.intent('seek', practiceToken, time);
  lastObservedCurrentTime = time;
  audio.currentTime = time;
}

function clearTrack(trackId = null) {
  if (trackId !== null && state.track?.id !== trackId) return false;
  practiceBoundary.intent('clear');

  audioGraph.cancelAudioControlApplication();
  performanceSettings.clear();
  playbackStartRequestRevision += 1;
  state.pendingStartTrackId = null;
  notifyStopped('cleared');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  state.track = null;
  state.playbackPhase = 'idle';
  state.currentTime = 0;
  state.duration = 0;
  state.error = null;
  lastObservedCurrentTime = 0;
  pendingRestorePosition = null;
  resetTrackAudioControls();
  return true;
}

// Refresh the loaded track after library changes without making the library a
// second transport owner. A URL swap restores the exact live mix calibration.
const syncCurrentTrack = usePlayerLibrarySync({
  audio,
  state,
  audioGraph,
  getStartRevision: () => playbackStartRequestRevision,
  seek,
  reportPlayerError,
  notifyStopped,
  practiceBoundary,
  verifySource: () => performanceSettings.verifySource(),
});

let unsubscribeLibraryUpdated = null;
if (typeof window !== 'undefined' && window.Utawakui) {
  unsubscribeLibraryUpdated =
    window.Utawakui.onLibraryUpdated(syncCurrentTrack);
}

function setPlaybackMode(mode) {
  practiceBoundary.intent('mode');
  const nextMode = PLAYBACK_MODE_ORDER.includes(mode)
    ? mode
    : PLAYBACK_MODES.sequence;
  state.playbackMode = nextMode;
  audio.loop = nextMode === PLAYBACK_MODES.repeatOne;
  state.isLooping = audio.loop;
}

function cyclePlaybackMode() {
  const index = PLAYBACK_MODE_ORDER.indexOf(state.playbackMode);
  const nextIndex = index === -1 ? 0 : (index + 1) % PLAYBACK_MODE_ORDER.length;
  setPlaybackMode(PLAYBACK_MODE_ORDER[nextIndex]);
}

function toggleRepeat() {
  cyclePlaybackMode();
}

function subscribe(listeners, listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const { onEnded, onPlaying, onPaused } = practiceBoundary;
const onStopped = (listener) => subscribe(stoppedListeners, listener);
const onPlaybackProgress = (listener) =>
  subscribe(playbackProgressListeners, listener);

function registerBeforePlaybackStart(listener) {
  beforePlaybackStartListener = listener;
  return () => {
    if (beforePlaybackStartListener === listener) {
      beforePlaybackStartListener = null;
    }
  };
}

export function cleanupPlayerResources() {
  practiceBoundary.dispose();
  performanceSettings.dispose();
  audio.removeEventListener('play', handlePlay);
  audio.removeEventListener('waiting', handleBuffering);
  audio.removeEventListener('stalled', handleBuffering);
  audio.removeEventListener('seeking', handleSeeking);
  audio.removeEventListener('seeked', handleSeeked);
  audio.removeEventListener('timeupdate', handleTimeUpdate);
  audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  audio.removeEventListener('error', handleError);
  stoppedListeners.clear();
  playbackProgressListeners.clear();
  beforePlaybackStartListener = null;
  playbackStartRequestRevision += 1;
  unsubscribeLibraryUpdated?.();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audioGraph.cleanup();
}

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupPlayerResources);
}

export function usePlayer() {
  return {
    state: readonly(state),
    performanceSettings,
    practiceBoundary,
    getPlaybackStartRequestRevision: () => playbackStartRequestRevision,
    samplePlaybackClock,
    playTrack,
    restorePlaybackState,
    play,
    pause,
    cancelPendingStart,
    toggle,
    seek,
    restartTrack,
    clearTrack,
    setCaptureVolume,
    setVolume,
    toggleMute,
    setPlaybackMode,
    cyclePlaybackMode,
    toggleRepeat,
    toggleCaptureGuideVocal,
    setGuideVocalValue,
    setCaptureGuideVocalValue,
    setGuideVocalOn,
    setCaptureGuideVocalOn,
    prepareCaptureDevice,
    applyCaptureDevice,
    prepareCaptureOutput,
    registerCaptureInput,
    applyAudioControls,
    setTransposeSemitones,
    setPitchCents,
    setTempoRate,
    resetPitchTempo,
    registerBeforePlaybackStart,
    onEnded,
    onPaused,
    onPlaying,
    onStopped,
    onPlaybackProgress,
  };
}
