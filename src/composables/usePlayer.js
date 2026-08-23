import { reactive, readonly } from 'vue';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import pitchWorkletUrl from '@soundtouchjs/audio-worklet/processor?url';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

// Module-scope singleton shared by views and the persistent player bar.

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
// Short gain ramps prevent audible clicks.
const GAIN_RAMP_SECONDS = 0.03;
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

const DEFAULT_TRANSPOSE_SEMITONES = 0;
const DEFAULT_PITCH_CENTS = 0;
const DEFAULT_TEMPO_RATE = 1;
// Shared by PlayerBar.vue and useKeyboardShortcuts.js.
export const TRANSPOSE_SEMITONES_RANGE = { min: -12, max: 12 };
// ±50 cents completes integer semitone transpose with no overlap.
export const PITCH_CENTS_RANGE = { min: -50, max: 50 };
export const TEMPO_RATE_RANGE = { min: 0.5, max: 1.5 };
// No ceiling below 1.0 — full original vocal (100%) is a real, intended use
// (e.g. playing the untouched track as background music), not just headroom
// to guard against.
export const GUIDE_VOCAL_LEVEL_RANGE = { min: 0, max: 1 };
// Initial guide-vocal levels: the performer starts with a moderate monitor
// blend, while the OBS-facing capture chain starts at literal zero.
const DEFAULT_MONITOR_GUIDE_VOCAL_LEVEL = 0.5;
const DEFAULT_CAPTURE_GUIDE_VOCAL_LEVEL = 0;

const audio = new Audio();
// Required before load; otherwise cross-origin Web Audio outputs silence.
audio.crossOrigin = 'anonymous';

// <audio> remains the sole timing/decode source. Normal mono/stereo audio goes
// directly to the master mix so the browser preserves its channel layout. Only
// separated stems use the 4-channel splitter: 0/1 instrumental, 2/3 vocals.
// All output flows through masterGain; audio.volume is intentionally unused.
const audioCtx = new AudioContext();
const sourceNode = audioCtx.createMediaElementSource(audio);
const splitter = audioCtx.createChannelSplitter(4);

const mergerInst = audioCtx.createChannelMerger(2);
const mergerVoc = audioCtx.createChannelMerger(2);
splitter.connect(mergerInst, 0, 0);
splitter.connect(mergerInst, 1, 1);
splitter.connect(mergerVoc, 2, 0);
splitter.connect(mergerVoc, 3, 1);

const vocalGain = audioCtx.createGain();
// Seeded to the monitor default; track load/reset calls below keep it in sync.
vocalGain.gain.value = DEFAULT_MONITOR_GUIDE_VOCAL_LEVEL;
mergerVoc.connect(vocalGain);

const masterGain = audioCtx.createGain();
masterGain.gain.value = DEFAULT_VOLUME;
sourceNode.connect(masterGain);
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

// Capture chain: a second, independent AudioContext with its own native
// destination device — feeding a second output for OBS-facing capture (see
// useAudioOutput.js). Deliberately not a fan-out of masterGain into the
// *same* context — two real use cases need the capture mix to differ from
// what the headphones hear: pitching a guide vocal in for the performer
// only ("抓 key") without it reaching the recording, or the reverse for a
// duet track where the guide vocal must reach the recording.
//
// This used to bridge out via a MediaStreamAudioDestinationNode feeding a
// hidden <audio> element's setSinkId(). That worked, but Chromium's
// <audio>/<video> playback pipeline applies clock-drift-compensating
// resampling whenever an element's sink device differs from the graph's
// native render clock — audible as a persistent pitch wobble, most
// noticeable on vocals (steady instrumental beds mask it). AudioContext
// itself gained a native setSinkId() (Chrome 110+) that retargets a
// context's *own* destination at the render-thread level without going
// through that element-specific pipeline at all. A single AudioContext's
// destination can only target one device though, so getting monitor and
// capture onto two independently-clocked native destinations needs a
// second AudioContext — and nodes can't connect across two contexts
// directly. So the bridge moves earlier: mergerInst/mergerVoc (still in
// the shared audioCtx, upstream of any capture-only processing) are each
// exported to their own MediaStreamAudioDestinationNode here; the capture
// chain lives entirely in captureAudioCtx, fed via
// createMediaStreamSource() on those two streams. This bridge is Web-Audio
// native rather than <audio>-element-based, which should avoid the
// presentation-timeline logic that triggers the resampling above — but
// that's a reasoned hypothesis, not something verifiable from a sandbox
// with no audio hardware. If the pitch wobble is still audible after this,
// the bridge itself carries the same limitation and the remaining fix is a
// native (non-Chromium) output path, not another Web Audio rearrangement.
const instBridgeDest = audioCtx.createMediaStreamDestination();
const vocBridgeDest = audioCtx.createMediaStreamDestination();
mergerInst.connect(instBridgeDest);
mergerVoc.connect(vocBridgeDest);
// Mirrors sourceNode.connect(masterGain) above — an unseparated track has
// no splitter/mergerInst path, so sourceNode must reach the instrumental
// bridge directly too, or capture would be silent for every non-separated
// track. routeAudioGraph() below preserves this on every subsequent track
// load.
sourceNode.connect(instBridgeDest);

// Lazily created — no second AudioContext (and the audio thread it opens)
// exists until a capture device is actually selected. All null until then.
let captureAudioCtx = null;
let captureVocalGain = null;
let captureMix = null;
let captureDry = null;
let captureWet = null;

function rampGain(ctx, audioParam, target) {
  audioParam.setTargetAtTime(target, ctx.currentTime, GAIN_RAMP_SECONDS);
}

// Bypasses the ramp entirely — used for a deliberate "turn this off now"
// action (a reset click, or toggling guide vocal off), not for continuous
// slider input. cancelScheduledValues() first, or a pending ramp from just
// before this call would keep animating toward its old target underneath
// the instant value this sets.
function hardStopGain(ctx, audioParam) {
  audioParam.cancelScheduledValues(ctx.currentTime);
  audioParam.setValueAtTime(0, ctx.currentTime);
}

// Involuntary sink loss (device unplugged mid-stream) reverts the context
// to its default sink and fires this rather than rejecting anywhere —
// AudioContext.sinkId is a string device id, or an AudioSinkOptions object
// ({ type: 'none' }) when explicitly silenced; only the string form is
// ever what we set ourselves.
function handleCaptureSinkChange() {
  const currentSinkId =
    typeof captureAudioCtx.sinkId === 'string' ? captureAudioCtx.sinkId : null;
  if (state.captureDeviceId && currentSinkId !== state.captureDeviceId) {
    state.captureError = '選擇的輸出裝置已中斷連線。';
    state.captureDeviceId = null;
  }
}

function ensureCaptureGraph() {
  if (captureAudioCtx) return captureAudioCtx;
  captureAudioCtx = new AudioContext();
  captureAudioCtx.addEventListener('sinkchange', handleCaptureSinkChange);

  const instSource = captureAudioCtx.createMediaStreamSource(
    instBridgeDest.stream,
  );
  const vocSource = captureAudioCtx.createMediaStreamSource(
    vocBridgeDest.stream,
  );

  captureVocalGain = captureAudioCtx.createGain();
  captureVocalGain.gain.value = state.captureGuideVocalOn
    ? state.captureGuideVocalValue
    : 0;
  vocSource.connect(captureVocalGain);

  captureMix = captureAudioCtx.createGain();
  instSource.connect(captureMix);
  captureVocalGain.connect(captureMix);

  captureDry = captureAudioCtx.createGain();
  captureWet = captureAudioCtx.createGain();
  captureDry.gain.value = 1;
  captureWet.gain.value = 0;
  captureMix.connect(captureDry);
  captureDry.connect(captureAudioCtx.destination);
  captureWet.connect(captureAudioCtx.destination);

  return captureAudioCtx;
}

function clampGuideVocalLevel(level) {
  return Math.min(
    GUIDE_VOCAL_LEVEL_RANGE.max,
    Math.max(GUIDE_VOCAL_LEVEL_RANGE.min, level),
  );
}

// Guide vocal is modeled as two independent pieces of state per chain, not
// one number — `on` (whether it's currently audible) and `value` (the
// calibrated blend ratio to use once it is). The gain actually applied is
// always `on ? value : 0`. This split exists because only `on` resets per
// track; `value` is a session-long calibration and starts at different
// initial defaults per chain.
function applyMonitorGuideVocalGain() {
  rampGain(
    audioCtx,
    vocalGain.gain,
    state.guideVocalOn ? state.guideVocalValue : 0,
  );
}

function applyCaptureGuideVocalGain() {
  // Nothing to ramp yet if no capture device has ever been selected —
  // ensureCaptureGraph() seeds captureVocalGain's initial value from
  // state.captureGuideVocalOn/Value once it exists.
  if (!captureVocalGain) return;
  rampGain(
    captureAudioCtx,
    captureVocalGain.gain,
    state.captureGuideVocalOn ? state.captureGuideVocalValue : 0,
  );
}

// A pure value setter — 0 is just a value here, not a synonym for "off"
// (that's setGuideVocalOn below, driven by its own dedicated control).
// Never touches `on`: calibrating a level while off is a legitimate
// "get it ready for next time" action that stays silent until the
// performer explicitly switches it on, and calibrating while on updates
// what's currently audible immediately (applyMonitorGuideVocalGain always
// computes on ? value : 0, so this is a harmless no-op while off).
function setGuideVocalValue(value) {
  state.guideVocalValue = clampGuideVocalLevel(value);
  applyMonitorGuideVocalGain();
}

function setCaptureGuideVocalValue(value) {
  state.captureGuideVocalValue = clampGuideVocalLevel(value);
  applyCaptureGuideVocalGain();
}

// Turning on ramps smoothly and reuses whatever value was last calibrated.
// Turning off is a hard stop (see hardStopGain above), not a ramp — same
// "kill it now" reasoning as before, just expressed as on=false instead of
// value=0.
function setGuideVocalOn(on) {
  state.guideVocalOn = on;
  if (on) applyMonitorGuideVocalGain();
  else hardStopGain(audioCtx, vocalGain.gain);
}

function setCaptureGuideVocalOn(on) {
  state.captureGuideVocalOn = on;
  if (on) applyCaptureGuideVocalGain();
  else if (captureVocalGain)
    hardStopGain(captureAudioCtx, captureVocalGain.gain);
}

// Reapplies an exact prior (on, value) pair without the "setting a value
// implies on=true" coupling above — only syncCurrentTrack() uses this, to
// restore state across a mid-playback URL swap without forcing guide
// vocal on if it was deliberately off.
function restoreGuideVocalState(on, value) {
  state.guideVocalValue = value;
  state.guideVocalOn = on;
  applyMonitorGuideVocalGain();
}

function restoreCaptureGuideVocalState(on, value) {
  state.captureGuideVocalValue = value;
  state.captureGuideVocalOn = on;
  applyCaptureGuideVocalGain();
}

// Lazy-load the worklet; bypass via dry/wet crossfade instead of
// reconnecting. AudioWorklet modules are registered per AudioContext, so
// monitor and capture each need one registration promise even though they
// use the same processor URL. A WeakMap keeps those lifetimes tied to their
// contexts and lets a failed registration retry later.
const workletRegistrations = new WeakMap();
let pitchProcessingError = null;
let capturePitchProcessingError = null;

function ensureWorkletRegistered(context) {
  let registration = workletRegistrations.get(context);
  if (!registration) {
    registration = SoundTouchNode.register(context, pitchWorkletUrl).catch(
      (err) => {
        workletRegistrations.delete(context);
        throw err;
      },
    );
    workletRegistrations.set(context, registration);
  }
  return registration;
}

function reportPitchProcessingError(err) {
  pitchProcessingError = reportPlayerError(
    err,
    'pitch-processing',
    '音高調整暫時無法使用。',
  );
  state.error = pitchProcessingError;
}

function clearPitchProcessingError() {
  if (pitchProcessingError && state.error === pitchProcessingError) {
    state.error = null;
  }
  pitchProcessingError = null;
}

function reportCapturePitchProcessingError() {
  capturePitchProcessingError = '擷取輸出的音高調整暫時無法使用。';
  state.captureError = capturePitchProcessingError;
}

function clearCapturePitchProcessingError() {
  if (
    capturePitchProcessingError &&
    state.captureError === capturePitchProcessingError
  ) {
    state.captureError = null;
  }
  capturePitchProcessingError = null;
}

let pitchNode = null;
let pitchNodeReady = null;

async function ensurePitchNode() {
  if (pitchNode) return pitchNode;
  if (!pitchNodeReady) {
    pitchNodeReady = (async () => {
      await ensureWorkletRegistered(audioCtx);
      const node = new SoundTouchNode({
        context: audioCtx,
        outputChannelCount: 2,
      });
      masterGain.connect(node);
      node.connect(wetGain);
      pitchNode = node;
      return node;
    })().catch((err) => {
      // Let a later call retry instead of replaying this rejection forever.
      pitchNodeReady = null;
      throw err;
    });
  }
  return pitchNodeReady;
}

let capturePitchNode = null;
let capturePitchNodeReady = null;

// Only meaningful once ensureCaptureGraph() has run — captureMix/captureWet
// don't exist before a capture device has ever been selected. Callers
// (setTransposeSemitones/setPitchCents below) already guard on
// captureAudioCtx before reaching here.
async function ensureCapturePitchNode() {
  if (capturePitchNode) return capturePitchNode;
  if (!capturePitchNodeReady) {
    capturePitchNodeReady = (async () => {
      await ensureWorkletRegistered(captureAudioCtx);
      const node = new SoundTouchNode({
        context: captureAudioCtx,
        outputChannelCount: 2,
      });
      captureMix.connect(node);
      node.connect(captureWet);
      capturePitchNode = node;
      return node;
    })().catch((err) => {
      capturePitchNodeReady = null;
      throw err;
    });
  }
  return capturePitchNodeReady;
}

// Transpose and Pitch are independent AudioParams on the same node
// (combined internally as `pitch * 2^(pitchSemitones/12) / playbackRate`),
// so bypass only kicks in once BOTH are back at default. Both chains share
// one transpose/pitch value — there's no scenario where the capture mix
// should be a different key than what the performer hears — so both gain
// crossfades are driven by the same `active` check.
function updatePitchBypass() {
  const active =
    state.transposeSemitones !== DEFAULT_TRANSPOSE_SEMITONES ||
    state.pitchCents !== DEFAULT_PITCH_CENTS;
  rampGain(audioCtx, dryGain.gain, active ? 0 : 1);
  rampGain(audioCtx, wetGain.gain, active ? 1 : 0);
  if (captureAudioCtx) {
    // If capture-node creation fails, keep that chain audible on dry while
    // the independently valid monitor transpose stays on wet.
    const captureActive = active && Boolean(capturePitchNode);
    rampGain(captureAudioCtx, captureDry.gain, captureActive ? 0 : 1);
    rampGain(captureAudioCtx, captureWet.gain, captureActive ? 1 : 0);
  }
}

function syncPitchNodeToCurrentState(node) {
  node.pitchSemitones.value = state.transposeSemitones;
  node.pitch.value = 2 ** (state.pitchCents / 1200);
}

// Catches up the capture chain's pitch node when a capture device is
// (re)selected — the performer may have already transposed before ever
// picking one, and ensureCaptureGraph() only seeds captureVocalGain's
// level (state.captureGuideVocalOn/Value), not pitch. Only called from
// applyCaptureDevice(), after ensureCaptureGraph() has run.
async function syncCaptureChainToCurrentState() {
  const needsPitch =
    state.transposeSemitones !== DEFAULT_TRANSPOSE_SEMITONES ||
    state.pitchCents !== DEFAULT_PITCH_CENTS;
  if (!needsPitch) return;
  const node = await ensureCapturePitchNode();
  syncPitchNodeToCurrentState(node);
  rampGain(captureAudioCtx, captureDry.gain, 0);
  rampGain(captureAudioCtx, captureWet.gain, 1);
}

async function applyToCapturePitchNode(apply) {
  if (capturePitchNode) {
    apply(capturePitchNode);
    clearCapturePitchProcessingError();
    return;
  }
  if (!captureAudioCtx) return;

  const needsPitch =
    state.transposeSemitones !== DEFAULT_TRANSPOSE_SEMITONES ||
    state.pitchCents !== DEFAULT_PITCH_CENTS;
  if (!needsPitch) {
    clearCapturePitchProcessingError();
    return;
  }

  try {
    const node = await ensureCapturePitchNode();
    // A prior failure may have left the other pitch dimension pending, so a
    // newly-created capture node always hydrates the complete current state.
    syncPitchNodeToCurrentState(node);
    clearCapturePitchProcessingError();
  } catch (err) {
    reportCapturePitchProcessingError(err);
  }
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
    try {
      (await ensurePitchNode()).pitchSemitones.value = next;
    } catch (err) {
      // The wet path never became available, so do not leave a requested
      // value in state that the performer cannot actually hear. Guard the
      // rollback so an intervening newer request keeps ownership of state.
      if (state.transposeSemitones === next) {
        state.transposeSemitones = DEFAULT_TRANSPOSE_SEMITONES;
      }
      reportPitchProcessingError(err);
      return;
    }
  }
  clearPitchProcessingError();
  await applyToCapturePitchNode((node) => {
    node.pitchSemitones.value = next;
  });
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
    try {
      (await ensurePitchNode()).pitch.value = ratio;
    } catch (err) {
      if (state.pitchCents === next) {
        state.pitchCents = DEFAULT_PITCH_CENTS;
      }
      reportPitchProcessingError(err);
      return;
    }
  }
  clearPitchProcessingError();
  await applyToCapturePitchNode((node) => {
    node.pitch.value = ratio;
  });
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
  playbackPhase: 'idle',
  // Renderer-issued Output source identity advances from the audio element's
  // own discontinuity events; it is not a second playback clock.
  continuityRevision: 0,
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_VOLUME,
  isMuted: false,
  playbackMode: PLAYBACK_MODES.sequence,
  isLooping: false,
  error: null,
  // Initial values are monitor on/50%, capture off/0%; per-track reset only
  // restores on/off, preserving the user's calibrated values.
  guideVocalOn: true,
  guideVocalValue: DEFAULT_MONITOR_GUIDE_VOCAL_LEVEL,
  captureGuideVocalOn: false,
  captureGuideVocalValue: DEFAULT_CAPTURE_GUIDE_VOCAL_LEVEL,
  // Integer semitones (Key change). Not persisted — resets per track.
  transposeSemitones: DEFAULT_TRANSPOSE_SEMITONES,
  // Continuous cents fine-tune, independent of transposeSemitones.
  pitchCents: DEFAULT_PITCH_CENTS,
  tempoRate: DEFAULT_TEMPO_RATE,
  // Output device id for the capture chain (see applyCaptureDevice below);
  // null means the feature is off and captureAudioCtx stays suspended.
  // Machine-local, persisted via config.json/useAudioOutput.js, not per-track.
  captureDeviceId: null,
  captureError: null,
});

const endedListeners = new Set();
let lastObservedCurrentTime = 0;
let isUsingSeparatedAudioGraph = false;

// Two kinds of state, written two different ways:
// - isPlaying/playbackPhase/currentTime/duration/error can change on their
//   own (autoplay rejection, track finishing, decode errors) — written ONLY
//   from the element's events below. Actions never assign them directly;
//   that second write path is exactly how this would drift out of sync.
// - volume/isMuted/playbackMode/guideVocalOn/transposeSemitones/
//   pitchCents/tempoRate mostly change via our own actions. The one
//   event-owned reset (guide vocal on/off + pitch/tempo) is native
//   repeat-one wraparound: audio.loop restarts the same media without
//   calling playTrack(), so the per-track default rule has to be enforced
//   here too.
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
  state.isPlaying = false;
  state.currentTime = audio.currentTime || state.currentTime;
  state.playbackPhase = 'ended';
  endedListeners.forEach((listener) => listener());
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
  state.playbackPhase = 'seeking';
}

function handleSeeked() {
  if (!state.track) return;
  state.currentTime = audio.currentTime || 0;
  state.playbackPhase = state.isPlaying ? 'buffering' : 'paused';
}

function handleTimeUpdate() {
  const nextTime = audio.currentTime;
  const didAdvance = nextTime !== lastObservedCurrentTime;
  if (isRepeatOneLoopWrap(lastObservedCurrentTime, nextTime)) {
    setGuideVocalOn(true);
    setCaptureGuideVocalOn(false);
    resetPitchTempo();
  }
  lastObservedCurrentTime = nextTime;
  state.currentTime = nextTime;
  if (state.isPlaying && didAdvance && state.playbackPhase !== 'seeking') {
    state.playbackPhase = 'playing';
  }
}

function handleLoadedMetadata() {
  state.duration = audio.duration;
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

function routeAudioGraph(usesSeparatedAudio) {
  if (isUsingSeparatedAudioGraph === usesSeparatedAudio) return;

  sourceNode.disconnect();
  if (usesSeparatedAudio) {
    // splitter already fans out to masterGain (via mergerInst/vocalGain)
    // and to the capture bridge (via mergerInst/instBridgeDest and
    // mergerVoc/vocBridgeDest — see the capture chain comment above).
    sourceNode.connect(splitter);
  } else {
    sourceNode.connect(masterGain);
    sourceNode.connect(instBridgeDest);
  }
  isUsingSeparatedAudioGraph = usesSeparatedAudio;
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
  state.currentTime = 0;
  state.duration = 0;
  lastObservedCurrentTime = 0;
  setGuideVocalOn(true);
  setCaptureGuideVocalOn(false);
  resetPitchTempo();
  routeAudioGraph(Boolean(track.usesSeparatedAudio));
  audio.src = track.url;
  try {
    // Graph output is silent while suspended (its initial state) — every
    // play attempt resumes it, not just the first.
    await audioCtx.resume();
    await audio.play();
  } catch (err) {
    state.error = reportPlayerError(
      err,
      'play-track',
      '目前無法播放這首曲目，請再試一次。',
    );
  }
}

async function play() {
  if (!state.track) return;
  try {
    await audioCtx.resume();
    await audio.play();
  } catch (err) {
    state.error = reportPlayerError(
      err,
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
  setGuideVocalOn(true);
  setCaptureGuideVocalOn(false);
  resetPitchTempo();
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
  setGuideVocalOn(true);
  setCaptureGuideVocalOn(false);
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
async function syncCurrentTrack(options) {
  if (!state.track) return;
  const tracks = options
    ? await window.Utawakui.listTracks(options)
    : await window.Utawakui.listTracks();
  const updated = tracks.find((t) => t.id === state.track.id);
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
  // restoreGuideVocalState, not setGuideVocalValue — this is reapplying
  // exact prior state across a URL swap, not a fresh user pick, so it must
  // not force on=true if the performer had deliberately turned it off.
  restoreGuideVocalState(guideOn, guideValue);
  restoreCaptureGuideVocalState(captureGuideOn, captureGuideValue);
  seek(resumeTime);
  if (wasPlaying) {
    try {
      await audioCtx.resume();
      await audio.play();
    } catch (err) {
      state.error = reportPlayerError(
        err,
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
  rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : volume);
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  rampGain(audioCtx, masterGain.gain, state.isMuted ? 0 : state.volume);
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
  instBridgeDest.disconnect();
  vocBridgeDest.disconnect();
  if (captureAudioCtx) {
    captureAudioCtx.removeEventListener('sinkchange', handleCaptureSinkChange);
    captureVocalGain.disconnect();
    captureMix.disconnect();
    captureDry.disconnect();
    captureWet.disconnect();
    capturePitchNode?.disconnect();
    captureAudioCtx.close();
  }
  audioCtx.close();
}

if (import.meta.hot) {
  import.meta.hot.dispose(cleanupPlayerResources);
}

// The 'g' shortcut / quick toggle button targets the CAPTURE chain, not
// the monitor one — the "kill it now" gesture only matters this much for
// whichever chain a mistake actually broadcasts. Leaving guide vocal on in
// the performer's own headphones a beat too long is a non-event; leaving
// it on in what OBS is capturing is the actual on-air mistake. The monitor
// chain has no equivalent quick toggle — it's deliberate, panel-only
// adjustment (stops + slider), not an emergency control.
//
// Just flips captureGuideVocalOn — state.captureGuideVocalValue already
// *is* the persisted "last calibrated ratio" (see the on/value split
// above), so there's no separate "last level" bookkeeping needed here
// anymore.
function toggleCaptureGuideVocal() {
  setCaptureGuideVocalOn(!state.captureGuideVocalOn);
}

// deviceId null turns the capture output off — suspending rather than
// closing the context, since applyCaptureDevice(otherDeviceId) is expected
// to re-select later in the same session and closing would mean the whole
// graph (captureVocalGain/captureMix/etc.) has to be torn down and rebuilt.
// Failure (unknown/removed device, setSinkId unsupported) clears the
// selection rather than leaving state.captureDeviceId pointing at a device
// that silently isn't working.
async function applyCaptureDevice(deviceId) {
  state.captureError = null;
  if (!deviceId) {
    await captureAudioCtx?.suspend();
    state.captureDeviceId = null;
    return;
  }
  try {
    const ctx = ensureCaptureGraph();
    await ctx.setSinkId(deviceId);
    await ctx.resume();
    await syncCaptureChainToCurrentState();
    state.captureDeviceId = deviceId;
  } catch {
    await captureAudioCtx?.suspend();
    state.captureDeviceId = null;
    state.captureError = '擷取輸出裝置無法使用。';
  }
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
    toggleCaptureGuideVocal,
    setGuideVocalValue,
    setCaptureGuideVocalValue,
    setGuideVocalOn,
    setCaptureGuideVocalOn,
    applyCaptureDevice,
    setTransposeSemitones,
    setPitchCents,
    setTempoRate,
    resetPitchTempo,
    onEnded,
  };
}
