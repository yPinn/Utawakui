import { reactive, readonly } from 'vue';

// Single shared instance (module scope, not Pinia) — SetlistView (picks a
// track) and PlayerBar (persistent controls) both import the same state
// and <audio> element.

const DEFAULT_VOLUME = 0.5;
// AudioParam.setTargetAtTime ramp: an instant 0<->1 gain jump is audible as
// a click; ~30ms is short enough to feel immediate but long enough not to.
const GAIN_RAMP_SECONDS = 0.03;

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
// Defaults ON — see state.guideVocalLevel below for why.
vocalGain.gain.value = 1;
mergerVoc.connect(vocalGain);

const masterGain = audioCtx.createGain();
masterGain.gain.value = DEFAULT_VOLUME;
mergerInst.connect(masterGain);
vocalGain.connect(masterGain);
masterGain.connect(audioCtx.destination);

function rampGain(audioParam, target) {
  audioParam.setTargetAtTime(target, audioCtx.currentTime, GAIN_RAMP_SECONDS);
}
// ----------------------------------------------------------------------

const state = reactive({
  track: null, // { id, filename, url, stemsUrl? } | null
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_VOLUME,
  isMuted: false,
  isLooping: false,
  error: null,
  // On/off only (0 or 1), session-global not per-track. Defaults on: the
  // guide vocal should be audible by default, with a one-click toggle to
  // drop it once the singer is confident.
  guideVocalLevel: 1,
});

// Two kinds of state, written two different ways:
// - isPlaying/currentTime/duration/error can change on their own (autoplay
//   rejection, track finishing, decode errors) — written ONLY from the
//   element's events below. Actions never assign them directly; that
//   second write path is exactly how this would drift out of sync.
// - volume/isMuted/isLooping/guideVocalLevel only change via our own
//   actions (no native controls UI to flip them behind our back), so
//   those actions write the AudioParam/element property and the state
//   field directly — no event to listen for, no desync risk.
audio.addEventListener('play', () => {
  state.isPlaying = true;
});
audio.addEventListener('pause', () => {
  state.isPlaying = false;
});
audio.addEventListener('ended', () => {
  // No auto-advance — there's no queue concept yet. That's a separate,
  // later feature; for now the track just stops (unless looping, in which
  // case the browser restarts it and this event doesn't fire at all).
  state.isPlaying = false;
});
audio.addEventListener('timeupdate', () => {
  state.currentTime = audio.currentTime;
});
audio.addEventListener('loadedmetadata', () => {
  state.duration = audio.duration;
});
audio.addEventListener('error', () => {
  state.error = audio.error ? audio.error.message : 'playback error';
  state.isPlaying = false;
});

async function playTrack(track) {
  state.error = null;
  state.track = track;
  state.currentTime = 0;
  state.duration = 0;
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
  audio.currentTime = time;
}

function setVolume(volume) {
  state.volume = volume;
  rampGain(masterGain.gain, state.isMuted ? 0 : volume);
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  rampGain(masterGain.gain, state.isMuted ? 0 : state.volume);
}

// Native looping. Deliberately not reset by playTrack() — like mute, this
// is a mode the user turned on, not a per-track setting.
function toggleRepeat() {
  audio.loop = !audio.loop;
  state.isLooping = audio.loop;
}

// Icon toggle only — no adjustable level. 0 and 1 are the only two values
// state.guideVocalLevel ever takes.
function toggleGuideVocal() {
  const next = state.guideVocalLevel > 0 ? 0 : 1;
  state.guideVocalLevel = next;
  rampGain(vocalGain.gain, next);
}

export function usePlayer() {
  return {
    state: readonly(state),
    playTrack,
    play,
    pause,
    toggle,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleGuideVocal,
  };
}
