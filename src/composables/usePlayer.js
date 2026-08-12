import { reactive, readonly } from 'vue';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import pitchWorkletUrl from '@soundtouchjs/audio-worklet/processor?url';
import { toPlayableTrack } from '../utils/playableTrack.js';

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

const DEFAULT_TRANSPOSE_SEMITONES = 0;
const DEFAULT_PITCH_CENTS = 0;
const DEFAULT_TEMPO_RATE = 1;
// Exported so PlayerBar.vue and useKeyboardShortcuts.js can clamp/disable
// without duplicating these bounds.
export const TRANSPOSE_SEMITONES_RANGE = { min: -12, max: 12 };
// ±50 cents (half a semitone) — with integer transpose, covers any pitch
// with no gap or overlap between the two controls.
export const PITCH_CENTS_RANGE = { min: -50, max: 50 };
export const TEMPO_RATE_RANGE = { min: 0.5, max: 1.5 };

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

// Pitch shifting is an optional insert effect after the final mix; tempo
// uses audio.playbackRate instead (see setTempoRate), so no second node is
// needed there. masterGain fans out to a dry path (straight through) and
// a wet path (via the SoundTouch worklet); a gain crossfade switches
// between them instead of connect()/disconnect(), which would click.
const dryGain = audioCtx.createGain();
const wetGain = audioCtx.createGain();
dryGain.gain.value = 1;
wetGain.gain.value = 0;
masterGain.connect(dryGain);
dryGain.connect(audioCtx.destination);
wetGain.connect(audioCtx.destination);

function rampGain(audioParam, target) {
  audioParam.setTargetAtTime(target, audioCtx.currentTime, GAIN_RAMP_SECONDS);
}

function setGuideVocalLevel(level) {
  state.guideVocalLevel = level;
  rampGain(vocalGain.gain, level);
}

// Lazy: a performer who never touches transpose/pitch never pays the
// AudioWorklet load cost. Once created it stays wired — bypass at default
// goes through the dry/wet crossfade (updatePitchBypass), not disconnect.
let pitchNode = null;
let pitchNodeReady = null;

async function ensurePitchNode() {
  if (pitchNode) return pitchNode;
  if (!pitchNodeReady) {
    pitchNodeReady = (async () => {
      await SoundTouchNode.register(audioCtx, pitchWorkletUrl);
      const node = new SoundTouchNode({
        context: audioCtx,
        outputChannelCount: 2,
      });
      masterGain.connect(node);
      node.connect(wetGain);
      pitchNode = node;
      return node;
    })();
  }
  return pitchNodeReady;
}

// Transpose and Pitch are independent AudioParams on the same node
// (combined internally as `pitch * 2^(pitchSemitones/12) / playbackRate`),
// so bypass only kicks in once BOTH are back at default.
function updatePitchBypass() {
  const active =
    state.transposeSemitones !== DEFAULT_TRANSPOSE_SEMITONES ||
    state.pitchCents !== DEFAULT_PITCH_CENTS;
  rampGain(dryGain.gain, active ? 0 : 1);
  rampGain(wetGain.gain, active ? 1 : 0);
}

async function setTransposeSemitones(semitones) {
  const next = Math.min(
    TRANSPOSE_SEMITONES_RANGE.max,
    Math.max(TRANSPOSE_SEMITONES_RANGE.min, Math.round(semitones)),
  );
  state.transposeSemitones = next;
  if (pitchNode) {
    pitchNode.pitchSemitones.value = next;
  } else if (next !== DEFAULT_TRANSPOSE_SEMITONES) {
    (await ensurePitchNode()).pitchSemitones.value = next;
  }
  updatePitchBypass();
}

async function setPitchCents(cents) {
  const next = Math.min(
    PITCH_CENTS_RANGE.max,
    Math.max(PITCH_CENTS_RANGE.min, Math.round(cents)),
  );
  state.pitchCents = next;
  const ratio = 2 ** (next / 1200);
  if (pitchNode) {
    pitchNode.pitch.value = ratio;
  } else if (next !== DEFAULT_PITCH_CENTS) {
    (await ensurePitchNode()).pitch.value = ratio;
  }
  updatePitchBypass();
}

// defaultPlaybackRate matters, not just playbackRate: the media load
// algorithm resets playbackRate to defaultPlaybackRate on every
// `audio.src =`, so mirroring into both survives syncCurrentTrack()'s
// src swap for free.
function setTempoRate(rate) {
  const next = Math.min(
    TEMPO_RATE_RANGE.max,
    Math.max(TEMPO_RATE_RANGE.min, rate),
  );
  state.tempoRate = next;
  audio.defaultPlaybackRate = next;
  audio.playbackRate = next;
}

// Not persisted (spec.md: slated for the future SQLite migration) — this
// is just the per-track reset spec.md:26 asks for.
function resetPitchTempo() {
  setTempoRate(DEFAULT_TEMPO_RATE);
  setTransposeSemitones(DEFAULT_TRANSPOSE_SEMITONES);
  setPitchCents(DEFAULT_PITCH_CENTS);
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
  // Integer semitones (Key change). Not persisted — resets per track.
  transposeSemitones: DEFAULT_TRANSPOSE_SEMITONES,
  // Continuous cents fine-tune, independent of transposeSemitones.
  pitchCents: DEFAULT_PITCH_CENTS,
  tempoRate: DEFAULT_TEMPO_RATE,
});

const endedListeners = new Set();
let lastObservedCurrentTime = 0;

// Two kinds of state, written two different ways:
// - isPlaying/currentTime/duration/error can change on their own (autoplay
//   rejection, track finishing, decode errors) — written ONLY from the
//   element's events below. Actions never assign them directly; that
//   second write path is exactly how this would drift out of sync.
// - volume/isMuted/playbackMode/guideVocalLevel/transposeSemitones/
//   pitchCents/tempoRate mostly change via our own actions. The one
//   event-owned reset (guide vocal + pitch/tempo) is native repeat-one
//   wraparound: audio.loop restarts the same media without calling
//   playTrack(), so the per-track default rule has to be enforced here too.
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
    resetPitchTempo();
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
  resetPitchTempo();
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
  resetPitchTempo();
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
  resetPitchTempo();
  return true;
}

// Self-heals staleness in the currently-loaded track's metadata — e.g. a
// vocal-separation result finishing after playback already started, which
// otherwise never reaches this module (playTrack() only ever runs again
// when something explicitly re-selects the track). Always refreshes
// state.track so PlayerBar's showGuideVocal (reads state.track?.stemsUrl)
// and similar computeds stay current; only reloads the <audio> element
// when the resolved playable URL actually changed, so an unrelated
// library:updated (e.g. a different track finished downloading) is a
// harmless no-op here. Every write below goes through an existing action
// (seek()/play()) or an audio.* call whose own event updates state — no
// new direct write to isPlaying/currentTime/duration/error.
async function syncCurrentTrack() {
  if (!state.track) return;
  const tracks = await window.Utawakui.listTracks();
  const updated = tracks.find((t) => t.id === state.track.id);
  if (!updated) return;

  const playable = toPlayableTrack(updated);
  const urlChanged = playable.url !== state.track.url;
  const resumeTime = state.currentTime;
  const wasPlaying = state.isPlaying;
  const guideLevel = state.guideVocalLevel;

  state.track = playable;
  if (!urlChanged) return;

  audio.src = playable.url;
  setGuideVocalLevel(guideLevel);
  seek(resumeTime);
  if (wasPlaying) {
    try {
      await audioCtx.resume();
      await audio.play();
    } catch (err) {
      state.error = err.message;
    }
  }
}

let unsubscribeLibraryUpdated = null;
if (typeof window !== 'undefined' && window.Utawakui) {
  unsubscribeLibraryUpdated =
    window.Utawakui.onLibraryUpdated(syncCurrentTrack);
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
  unsubscribeLibraryUpdated?.();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  sourceNode.disconnect();
  splitter.disconnect();
  mergerInst.disconnect();
  mergerVoc.disconnect();
  vocalGain.disconnect();
  masterGain.disconnect();
  dryGain.disconnect();
  wetGain.disconnect();
  pitchNode?.disconnect();
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
    setTransposeSemitones,
    setPitchCents,
    setTempoRate,
    resetPitchTempo,
    onEnded,
  };
}
