import { reactive, readonly } from 'vue';

// Single shared instance (module scope, not Pinia) — SetlistView (picks a
// track) and PlayerBar (persistent controls) both import the same state
// and <audio> element.

const DEFAULT_VOLUME = 0.5;
export const PLAYBACK_MODES = {
  sequence: 'sequence',
  repeatList: 'repeat-list',
  repeatOne: 'repeat-one',
};
const PLAYBACK_MODE_ORDER = [
  PLAYBACK_MODES.sequence,
  PLAYBACK_MODES.repeatList,
  PLAYBACK_MODES.repeatOne,
];
// AudioParam.setTargetAtTime ramp: an instant 0<->1 gain jump is audible as
// a click; ~30ms is short enough to feel immediate but long enough not to.
const GAIN_RAMP_SECONDS = 0.03;
const LOOP_WRAP_EDGE_SECONDS = 1;

const audio = new Audio();
// Required or createMediaElementSource() below produces silence —
// utawakui-media:// is cross-origin, and MediaElementAudioSourceNode
// zeroes a cross-origin source unless the request is CORS-clean (paired
// with main.js's scheme privileges). Must be set before the element ever
// loads a resource.
audio.crossOrigin = 'anonymous';

// <audio> stays the sole timing/seek/decode source (see the state-write
// discipline comment below) — this graph only splits its output into an
// instrumental pair and a vocals pair so the vocals can be gain-controlled
// independently. Once wired into a MediaElementAudioSourceNode, ALL of the
// element's output (including plain tracks) flows through this graph —
// that's why setVolume/toggleMute write to masterGain, not audio.volume.
//
// Channel layout is fixed, documented in library.js's SEPARATED_VARIANTS
// comment: 0/1 = instrumental L/R, 2/3 = vocals L/R. A plain stereo track
// only has channels 0/1 — ChannelSplitterNode's 'discrete' interpretation
// zero-fills the rest, so the vocals path is simply silent; no
// special-casing needed for "has stems" vs. not.
const audioCtx = new AudioContext();
const sourceNode = audioCtx.createMediaElementSource(audio);
const splitter = audioCtx.createChannelSplitter(4);
sourceNode.connect(splitter);

const mergerInst = audioCtx.createChannelMerger(2);
const mergerVoc = audioCtx.createChannelMerger(2);
splitter.connect(mergerInst, 0, 0);
splitter.connect(mergerInst, 1, 1);
splitter.connect(mergerVoc, 2, 0);
splitter.connect(mergerVoc, 3, 1);

const vocalGain = audioCtx.createGain();
// Defaults off and resets per track. Guide vocal is a song-specific assist,
// not a session-wide playback preference.
vocalGain.gain.value = 0;
mergerVoc.connect(vocalGain);

const masterGain = audioCtx.createGain();
masterGain.gain.value = DEFAULT_VOLUME;
mergerInst.connect(masterGain);
vocalGain.connect(masterGain);
masterGain.connect(audioCtx.destination);

function rampGain(audioParam, target) {
  audioParam.setTargetAtTime(target, audioCtx.currentTime, GAIN_RAMP_SECONDS);
}

function setGuideVocalLevel(level) {
  state.guideVocalLevel = level;
  rampGain(vocalGain.gain, level);
}
// ----------------------------------------------------------------------

const state = reactive({
  track: null, // { id, filename, url, stemsUrl? } | null
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_VOLUME,
  isMuted: false,
  playbackMode: PLAYBACK_MODES.sequence,
  isLooping: false,
  error: null,
  // On/off only (0 or 1), reset to off whenever a new track is loaded.
  guideVocalLevel: 0,
});

const endedListeners = new Set();
let lastObservedCurrentTime = 0;

// Two kinds of state, written two different ways:
// - isPlaying/currentTime/duration/error can change on their own (autoplay
//   rejection, track finishing, decode errors) — written ONLY from the
//   element's events below. Actions never assign them directly; that
//   second write path is exactly how this would drift out of sync.
// - volume/isMuted/playbackMode/guideVocalLevel mostly change via our own
//   actions. The one event-owned guide-vocal write is native repeat-one
//   wraparound: audio.loop restarts the same media without calling
//   playTrack(), so the per-track default-off rule has to be enforced here.
function handlePlay() {
  state.isPlaying = true;
}

function handlePause() {
  state.isPlaying = false;
}

function handleEnded() {
  state.isPlaying = false;
  endedListeners.forEach((listener) => listener());
}

function handleTimeUpdate() {
  const nextTime = audio.currentTime;
  if (isRepeatOneLoopWrap(lastObservedCurrentTime, nextTime)) {
    setGuideVocalLevel(0);
  }
  lastObservedCurrentTime = nextTime;
  state.currentTime = nextTime;
}

function handleLoadedMetadata() {
  state.duration = audio.duration;
  lastObservedCurrentTime = audio.currentTime || 0;
}

function handleError() {
  state.error = audio.error ? audio.error.message : 'playback error';
  state.isPlaying = false;
}

audio.addEventListener('play', handlePlay);
audio.addEventListener('pause', handlePause);
audio.addEventListener('ended', handleEnded);
audio.addEventListener('timeupdate', handleTimeUpdate);
audio.addEventListener('loadedmetadata', handleLoadedMetadata);
audio.addEventListener('error', handleError);

async function playTrack(track) {
  state.error = null;
  state.track = track;
  state.currentTime = 0;
  state.duration = 0;
  lastObservedCurrentTime = 0;
  setGuideVocalLevel(0);
  audio.src = track.url;
  try {
    // Graph output is silent while suspended (its initial state) — every
    // play attempt resumes it, not just the first.
    await audioCtx.resume();
    await audio.play();
  } catch (err) {
    state.error = err.message;
  }
}

async function play() {
  if (!state.track) return;
  try {
    await audioCtx.resume();
    await audio.play();
  } catch (err) {
    state.error = err.message;
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
  setGuideVocalLevel(0);
  seek(0);
}

function clearTrack(trackId = null) {
  if (trackId !== null && state.track?.id !== trackId) return false;

  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  state.track = null;
  state.currentTime = 0;
  state.duration = 0;
  state.error = null;
  lastObservedCurrentTime = 0;
  setGuideVocalLevel(0);
  return true;
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

function setVolume(volume) {
  state.volume = volume;
  rampGain(masterGain.gain, state.isMuted ? 0 : volume);
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  rampGain(masterGain.gain, state.isMuted ? 0 : state.volume);
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

// Backward-compatible alias for older callers; the UI now cycles through
// sequence, list repeat, and single-track repeat.
function toggleRepeat() {
  cyclePlaybackMode();
}

function onEnded(listener) {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}

function cleanupPlayerResources() {
  audio.removeEventListener('play', handlePlay);
  audio.removeEventListener('pause', handlePause);
  audio.removeEventListener('ended', handleEnded);
  audio.removeEventListener('timeupdate', handleTimeUpdate);
  audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  audio.removeEventListener('error', handleError);
  endedListeners.clear();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  sourceNode.disconnect();
  splitter.disconnect();
  mergerInst.disconnect();
  mergerVoc.disconnect();
  vocalGain.disconnect();
  masterGain.disconnect();
  audioCtx.close();
}

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupPlayerResources);
}

// Icon toggle only — no adjustable level. 0 and 1 are the only two values
// state.guideVocalLevel ever takes.
function toggleGuideVocal() {
  const next = state.guideVocalLevel > 0 ? 0 : 1;
  setGuideVocalLevel(next);
}

export function usePlayer() {
  return {
    state: readonly(state),
    playTrack,
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
    toggleGuideVocal,
    onEnded,
  };
}
