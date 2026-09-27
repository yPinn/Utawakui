import { reactive, readonly } from 'vue';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import {
  usePlayerAudioGraph,
  GUIDE_VOCAL_LEVEL_RANGE,
  PITCH_CENTS_RANGE,
  PLAYER_AUDIO_DEFAULTS,
  TEMPO_RATE_RANGE,
  TRANSPOSE_SEMITONES_RANGE,
} from './player/usePlayerAudioGraph.js';

export {
  GUIDE_VOCAL_LEVEL_RANGE,
  PITCH_CENTS_RANGE,
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
  track: null,
  isPlaying: false,
  playbackPhase: 'idle',
  playbackRevision: 0,
  // Output identity advances from audio-element discontinuity events; it is
  // not a second playback clock.
  continuityRevision: 0,
  currentTime: 0,
  duration: 0,
  volume: PLAYER_AUDIO_DEFAULTS.volume,
  isMuted: false,
  playbackMode: PLAYBACK_MODES.sequence,
  isLooping: false,
  error: null,
  guideVocalOn: true,
  guideVocalValue: PLAYER_AUDIO_DEFAULTS.monitorGuideVocalLevel,
  captureGuideVocalOn: false,
  captureGuideVocalValue: PLAYER_AUDIO_DEFAULTS.captureGuideVocalLevel,
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

const audioGraph = usePlayerAudioGraph({
  audio,
  state,
  reportPlayerError,
});

const {
  applyCaptureDevice,
  prepareCaptureDevice,
  resetPitchTempo,
  resetTrackAudioControls,
  restoreCaptureGuideVocalState,
  restoreGuideVocalState,
  routeAudioGraph,
  setCaptureGuideVocalOn,
  setCaptureGuideVocalValue,
  setGuideVocalOn,
  setGuideVocalValue,
  setPitchCents,
  setTempoRate,
  setTransposeSemitones,
  setVolume,
  setMuted,
  toggleCaptureGuideVocal,
  toggleMute,
} = audioGraph;

const endedListeners = new Set();
const playbackProgressListeners = new Set();
let lastObservedCurrentTime = 0;
let pendingRestorePosition = null;

function handlePlay() {
  state.isPlaying = true;
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = 'buffering';
}

function handlePause() {
  state.isPlaying = false;
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = state.track ? 'paused' : 'idle';
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
  endedListeners.forEach((listener) => listener(endedEvent));
}

function handlePlaying() {
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = 'playing';
}

function handleBuffering() {
  if (!state.track) return;
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
  state.error = reportPlayerError(
    audio.error,
    'media',
    '目前無法播放這首曲目，請再試一次。',
  );
  state.isPlaying = false;
  state.playbackPhase = 'error';
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

async function playTrack(track) {
  state.error = null;
  state.track = track;
  state.playbackRevision += 1;
  state.currentTime = 0;
  state.duration = 0;
  lastObservedCurrentTime = 0;
  resetTrackAudioControls();
  routeAudioGraph(Boolean(track.usesSeparatedAudio));
  audio.src = track.url;
  try {
    await audioGraph.resume();
    await audio.play();
  } catch (error) {
    state.error = reportPlayerError(
      error,
      'play-track',
      '目前無法播放這首曲目，請再試一次。',
    );
  }
}

function restorePlaybackState({
  track,
  positionSeconds = 0,
  volume = PLAYER_AUDIO_DEFAULTS.volume,
  isMuted = false,
  playbackMode = PLAYBACK_MODES.sequence,
} = {}) {
  if (!track) return false;
  state.error = null;
  state.track = track;
  state.playbackRevision += 1;
  state.isPlaying = false;
  state.playbackPhase = 'paused';
  state.currentTime = 0;
  state.duration = 0;
  lastObservedCurrentTime = 0;
  pendingRestorePosition = Math.max(0, Number(positionSeconds) || 0);
  resetTrackAudioControls();
  routeAudioGraph(Boolean(track.usesSeparatedAudio));
  setVolume(Number(volume));
  setMuted(Boolean(isMuted));
  setPlaybackMode(playbackMode);
  audio.src = track.url;
  return true;
}

async function play() {
  if (!state.track) return;
  try {
    await audioGraph.resume();
    await audio.play();
  } catch (error) {
    state.error = reportPlayerError(
      error,
      'resume',
      '目前無法繼續播放，請再試一次。',
    );
  }
}

function pause() {
  audio.pause();
}

function toggle() {
  if (state.isPlaying) pause();
  else play();
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

function clearTrack(trackId = null) {
  if (trackId !== null && state.track?.id !== trackId) return false;

  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  state.track = null;
  state.playbackPhase = 'idle';
  state.currentTime = 0;
  state.duration = 0;
  state.error = null;
  lastObservedCurrentTime = 0;
  resetTrackAudioControls();
  return true;
}

// Refresh the loaded track after library changes without making the library a
// second transport owner. A URL swap restores the exact live mix calibration.
async function syncCurrentTrack(options) {
  if (!state.track) return;
  const tracks = options
    ? await window.Utawakui.listTracks(options)
    : await window.Utawakui.listTracks();
  const updated = tracks.find((track) => track.id === state.track.id);
  if (!updated) return;

  const playable = toPlayableTrack(updated);
  const urlChanged = playable.url !== state.track.url;
  const resumeTime = state.currentTime;
  const wasPlaying = state.isPlaying;
  const guideOn = state.guideVocalOn;
  const guideValue = state.guideVocalValue;
  const captureGuideOn = state.captureGuideVocalOn;
  const captureGuideValue = state.captureGuideVocalValue;

  state.track = playable;
  if (!urlChanged) return;

  routeAudioGraph(Boolean(playable.usesSeparatedAudio));
  audio.src = playable.url;
  restoreGuideVocalState(guideOn, guideValue);
  restoreCaptureGuideVocalState(captureGuideOn, captureGuideValue);
  seek(resumeTime);
  if (wasPlaying) {
    try {
      await audioGraph.resume();
      await audio.play();
    } catch (error) {
      state.error = reportPlayerError(
        error,
        'reload',
        '播放版本已更新，請重新播放。',
      );
    }
  }
}

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

function onEnded(listener) {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}

function onPlaybackProgress(listener) {
  playbackProgressListeners.add(listener);
  return () => playbackProgressListeners.delete(listener);
}

function cleanupPlayerResources() {
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
  playbackProgressListeners.clear();
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
    playTrack,
    restorePlaybackState,
    play,
    pause,
    toggle,
    seek,
    restartTrack,
    clearTrack,
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
    setTransposeSemitones,
    setPitchCents,
    setTempoRate,
    resetPitchTempo,
    onEnded,
    onPlaybackProgress,
  };
}
