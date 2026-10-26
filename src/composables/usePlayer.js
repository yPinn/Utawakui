import { reactive, readonly } from 'vue';
import { usePlayerDiagnostics } from './player/usePlayerDiagnostics.js';
import { usePlayerLibrarySync } from './player/usePlayerLibrarySync.js';
import { usePlayerAudioStart } from './player/usePlayerAudioStart.js';
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
const LOOP_WRAP_EDGE_SECONDS = 1;
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

const endedListeners = new Set();
const pausedListeners = new Set();
const playingListeners = new Set();
const stoppedListeners = new Set();
const playbackProgressListeners = new Set();
let beforePlaybackStartListener = null;
let playbackStartRequestRevision = 0;
let lastObservedCurrentTime = 0;
let pendingRestorePosition = null;
let terminalStopNotified = false;

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

function handlePause() {
  state.isPlaying = false;
  state.currentTime = audio.currentTime || 0;
  // Chromium queues pause before ended at natural EOF. Only ended owns this
  // terminal boundary; treating it as an operator pause skips BGM post-roll.
  if (audio.ended) return;
  state.playbackPhase = state.track ? 'paused' : 'idle';
  if (!state.track) return;
  const pausedEvent = {
    trackId: state.track.id,
    playbackRevision: state.playbackRevision,
  };
  pausedListeners.forEach((listener) => listener(pausedEvent));
}

function handleEnded() {
  const endedEvent = state.track
    ? {
        trackId: state.track.id,
        playbackRevision: state.playbackRevision,
      }
    : null;
  state.isPlaying = false;
  state.currentTime = audio.currentTime || state.currentTime;
  state.playbackPhase = 'ended';
  terminalStopNotified = true;
  endedListeners.forEach((listener) => listener(endedEvent));
}

function handlePlaying() {
  terminalStopNotified = false;
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = 'playing';
  if (!state.track) return;
  const playingEvent = {
    trackId: state.track.id,
    playbackRevision: state.playbackRevision,
  };
  playingListeners.forEach((listener) => listener(playingEvent));
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

function isRepeatOneLoopWrap(previousTime, nextTime) {
  return (
    state.playbackMode === PLAYBACK_MODES.repeatOne &&
    Number.isFinite(state.duration) &&
    state.duration > 0 &&
    previousTime >= state.duration - LOOP_WRAP_EDGE_SECONDS &&
    nextTime <= LOOP_WRAP_EDGE_SECONDS
  );
}

function handleTimeUpdate() {
  const previousTime = lastObservedCurrentTime;
  const nextTime = audio.currentTime;
  const didAdvance = nextTime !== previousTime;
  if (isRepeatOneLoopWrap(previousTime, nextTime)) {
    resetTrackAudioControls();
  }
  lastObservedCurrentTime = nextTime;
  state.currentTime = nextTime;
  if (state.isPlaying && didAdvance && state.playbackPhase !== 'seeking') {
    state.playbackPhase = 'playing';
  }
  if (state.isPlaying && nextTime > previousTime && state.track) {
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
audio.addEventListener('playing', handlePlaying);
audio.addEventListener('pause', handlePause);
audio.addEventListener('ended', handleEnded);
audio.addEventListener('waiting', handleBuffering);
audio.addEventListener('stalled', handleBuffering);
audio.addEventListener('seeking', handleSeeking);
audio.addEventListener('seeked', handleSeeked);
audio.addEventListener('timeupdate', handleTimeUpdate);
audio.addEventListener('loadedmetadata', handleLoadedMetadata);
audio.addEventListener('error', handleError);

async function requestPlaybackStart({ trackId, requestRevision, resume }) {
  try {
    const request = { trackId, requestRevision };
    if (resume) request.resume = true;
    const allowed = await beforePlaybackStartListener?.(request);
    if (allowed === false || requestRevision !== playbackStartRequestRevision) {
      if (requestRevision === playbackStartRequestRevision) {
        state.pendingStartTrackId = null;
        notifyStopped('start-cancelled');
      }
      return false;
    }
    return true;
  } catch (error) {
    if (requestRevision === playbackStartRequestRevision) {
      state.pendingStartTrackId = null;
      state.error = reportPlayerError(
        error,
        'pre-start',
        '曲目開始前的音訊交接未完成，請再試一次。',
      );
      notifyStopped('error');
    }
    return false;
  }
}

const { startAudio, cancelAudioStart } = usePlayerAudioStart({
  audio,
  state,
  audioGraph,
  getStartRevision: () => playbackStartRequestRevision,
  reportPlayerError,
  notifyStopped,
});

async function playTrack(track) {
  audioGraph.cancelAudioControlApplication();
  const requestRevision = ++playbackStartRequestRevision;
  state.pendingStartTrackId = track.id;
  terminalStopNotified = false;
  state.error = null;
  // A new explicit performance request owns a fresh, editable timeline
  // boundary. Stop the current performance immediately, but keep its
  // identity/source stable until the BGM handoff hook grants the new start.
  if (state.isPlaying) audio.pause();
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
  resetTrackAudioControls();
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
  return true;
}

async function play() {
  if (!state.track) return false;
  const requestRevision = ++playbackStartRequestRevision;
  state.pendingStartTrackId = state.track.id;
  terminalStopNotified = false;
  state.error = null;
  const allowed = await requestPlaybackStart({
    trackId: state.track.id,
    requestRevision,
    resume: true,
  });
  if (!allowed) return false;

  return startAudio(requestRevision, 'resume');
}

function pause() {
  cancelPendingStart();
  audio.pause();
}

// Before the gate grants a track there is no new playback identity to stop.
// Once graph preparation owns it, explicitly release that handoff: pausing an
// already-paused native element emits no event in Chromium.
function cancelPendingStart() {
  const previousRevision = playbackStartRequestRevision++;
  state.pendingStartTrackId = null;
  cancelAudioStart(previousRevision);
}

function toggle() {
  if (state.isPlaying) return pause();
  return play();
}

function seek(time) {
  lastObservedCurrentTime = time;
  audio.currentTime = time;
}

function restartTrack() {
  if (!state.track) return;
  resetTrackAudioControls();
  seek(0);
}

// Explicit batches pause; live sliders retain their existing setters.
// Persistence is deliberately not connected in this slice.
function applyAudioControls(values) {
  return audioGraph.applyAudioControls(values, {
    beforeApply() {
      cancelPendingStart();
      audio.pause();
    },
  });
}

function clearTrack(trackId = null) {
  if (trackId !== null && state.track?.id !== trackId) return false;

  audioGraph.cancelAudioControlApplication();
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
});

let unsubscribeLibraryUpdated = null;
if (typeof window !== 'undefined' && window.Utawakui) {
  unsubscribeLibraryUpdated =
    window.Utawakui.onLibraryUpdated(syncCurrentTrack);
}

function setPlaybackMode(mode) {
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

const onEnded = (listener) => subscribe(endedListeners, listener);
const onPlaying = (listener) => subscribe(playingListeners, listener);
const onPaused = (listener) => subscribe(pausedListeners, listener);
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
  audio.removeEventListener('play', handlePlay);
  audio.removeEventListener('playing', handlePlaying);
  audio.removeEventListener('pause', handlePause);
  audio.removeEventListener('ended', handleEnded);
  audio.removeEventListener('waiting', handleBuffering);
  audio.removeEventListener('stalled', handleBuffering);
  audio.removeEventListener('seeking', handleSeeking);
  audio.removeEventListener('seeked', handleSeeked);
  audio.removeEventListener('timeupdate', handleTimeUpdate);
  audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  audio.removeEventListener('error', handleError);
  endedListeners.clear();
  pausedListeners.clear();
  playingListeners.clear();
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
