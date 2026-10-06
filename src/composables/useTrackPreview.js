import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useBgmSession } from './useBgmSession.js';
import { useMetronome } from './useMetronome.js';
import { usePlayer } from './usePlayer.js';
import { parseLyricsText, pickPreferredLyricsSource } from '../utils/lyrics.js';
import { resolvePreviewSegment } from '../utils/trackPreviewSegment.js';

async function settle(load) {
  try {
    return (await load()) ?? null;
  } catch {
    return null;
  }
}

// Line timing from the preferred source; word timing is not needed.
async function loadPreviewLyrics(track) {
  const source = pickPreferredLyricsSource(track);
  if (!source) return null;
  const result = await window.Utawakui?.getTrackLyrics?.(
    track.id,
    source.filename,
  );
  if (!result?.text) return null;
  const offsetMs = result.source?.offsetMs;
  return {
    lines: parseLyricsText(result.text, { source: result.source ?? source }),
    offsetSeconds: Number.isInteger(offsetMs) ? offsetMs / 1000 : 0,
  };
}

const FADE_IN_MS = 300;

// Monitor-only track preview (docs/contracts/track-preview.md). It owns its
// own audio element and never writes the performance player's state.
export function createTrackPreview({
  audio,
  bgm,
  metronome,
  getMusicStructure,
  getLyrics = async () => null,
  getDefaultVolume = () => 1,
  recordError = () => {},
  documentRef = typeof document === 'undefined' ? null : document,
  windowRef = typeof window === 'undefined' ? null : window,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
}) {
  const state = reactive({
    isOpen: false,
    title: '',
    tracks: [],
    index: 0,
    status: 'idle',
    blockedReason: null,
    segment: null,
    currentTime: 0,
    isMuted: false,
  });

  let lease = null;
  let openGeneration = 0;
  let trackGeneration = 0;
  // The load whose src the element holds; until a switch assigns the new
  // src, element events still describe the previous track.
  let sourceGeneration = 0;
  let pendingSeek = null;
  // Only a pause caused by losing focus resumes on its own.
  let pausedByFocus = false;
  let failedInRow = 0;
  let frameId = null;
  let fadeFrameId = null;
  let targetVolume = 1;

  const currentTrack = () => state.tracks[state.index] ?? null;
  const ownsSource = () => sourceGeneration === trackGeneration;
  const sessionActive = () => bgm.handoffState.sessionMode !== 'inactive';

  function handlePreempt() {
    pausedByFocus = false;
    lease = null;
    audio.pause();
    state.status = 'paused';
    state.blockedReason = sessionActive() ? 'session-active' : 'preempted';
  }

  // Rapid card switches share one in-flight request, never two leases.
  let acquiring = null;

  function acquire() {
    if (lease) return Promise.resolve(true);
    acquiring ??= requestLane().finally(() => {
      acquiring = null;
    });
    return acquiring;
  }

  async function requestLane() {
    const generation = openGeneration;
    state.status = 'acquiring';
    const granted = await bgm.acquirePreviewLane({ onPreempt: handlePreempt });
    if (generation !== openGeneration || !state.isOpen) {
      granted?.release();
      return false;
    }
    if (!granted) {
      state.status = 'blocked';
      state.blockedReason = sessionActive() ? 'session-active' : 'unavailable';
      return false;
    }
    lease = granted;
    state.blockedReason = null;
    metronome.stop();
    return true;
  }

  // A 30s segment moves ~3px per timeupdate tick, so playback reads the
  // element every frame; timeupdate still owns the segment-end check.
  function syncFrame() {
    frameId = null;
    if (!state.isOpen || state.status !== 'playing') return;
    // Loading the next track keeps 'playing' while the old time lingers.
    if (ownsSource() && pendingSeek === null && !audio.paused) {
      state.currentTime = audio.currentTime;
    }
    frameId = requestFrame(syncFrame);
  }

  function startFrameSync() {
    if (frameId === null && requestFrame) frameId = requestFrame(syncFrame);
  }

  function stopFrameSync() {
    if (frameId === null) return;
    cancelFrame?.(frameId);
    frameId = null;
  }

  // Entering mid-song ramps the volume up instead of cutting in.
  function stopFadeIn() {
    if (fadeFrameId !== null) cancelFrame?.(fadeFrameId);
    fadeFrameId = null;
    audio.volume = targetVolume;
  }

  function fadeIn() {
    let startedAt = null;
    const step = (timestamp) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / FADE_IN_MS);
      audio.volume = targetVolume * progress;
      fadeFrameId = progress < 1 ? requestFrame(step) : null;
    };
    fadeFrameId = requestFrame(step);
  }

  async function startPlayback() {
    const generation = trackGeneration;
    const fades = Boolean(requestFrame);
    if (fades) {
      stopFadeIn();
      audio.volume = 0;
    }
    try {
      await audio.play();
      if (generation === trackGeneration && lease) {
        state.status = 'playing';
        startFrameSync();
        if (fades) fadeIn();
      } else if (generation === trackGeneration) {
        stopFadeIn();
      }
    } catch (error) {
      // A newer source or an explicit pause aborts the pending play().
      if (generation !== trackGeneration) return;
      stopFadeIn();
      if (error?.name === 'AbortError') return;
      handleMediaError(error);
    }
  }

  async function loadTrack(index, { autoplay }) {
    const generation = ++trackGeneration;
    pausedByFocus = false;
    const track = state.tracks[index];
    if (!track) return;
    audio.pause();
    state.index = index;
    state.currentTime = 0;
    state.segment = resolvePreviewSegment({ durationSeconds: track.duration });

    // Both are optional evidence; a failed read just falls back. A card
    // switch may still be waiting for the lane, so its answer joins them.
    const [structure, lyrics, canPlay] = await Promise.all([
      settle(() => getMusicStructure(track.id)),
      settle(() => getLyrics(track)),
      settle(() => autoplay),
    ]);
    if (generation !== trackGeneration) return;

    state.segment = resolvePreviewSegment({
      durationSeconds: track.duration,
      structure,
      lyrics,
    });
    state.currentTime = state.segment.start;
    pendingSeek = state.segment.start;
    audio.src = track.url;
    sourceGeneration = generation;
    if (canPlay && lease) await startPlayback();
    else if (state.status !== 'blocked') state.status = 'paused';
  }

  async function open({ title = '', tracks = [], startIndex = 0 } = {}) {
    const playable = tracks.filter((track) => track?.id && track?.url);
    if (playable.length === 0) return false;
    if (state.isOpen) close();

    openGeneration += 1;
    failedInRow = 0;
    Object.assign(state, {
      isOpen: true,
      title,
      tracks: playable,
      index: 0,
      status: 'acquiring',
      blockedReason: null,
      segment: null,
      currentTime: 0,
    });
    targetVolume = getDefaultVolume();
    audio.volume = targetVolume;
    audio.muted = state.isMuted;
    const index = Math.max(
      0,
      playable.findIndex((track) => track.id === tracks[startIndex]?.id),
    );

    const generation = openGeneration;
    const granted = await acquire();
    if (generation !== openGeneration) return false;
    await loadTrack(index, { autoplay: granted });
    return true;
  }

  function close() {
    if (!state.isOpen) return;
    openGeneration += 1;
    trackGeneration += 1;
    pausedByFocus = false;
    stopFrameSync();
    stopFadeIn();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    lease?.release();
    lease = null;
    pendingSeek = null;
    Object.assign(state, {
      isOpen: false,
      title: '',
      tracks: [],
      index: 0,
      status: 'idle',
      blockedReason: null,
      segment: null,
      currentTime: 0,
    });
  }

  // A feed plays whichever card it lands on; there is no pause to keep, so
  // only the lane (record／live or a refusal) can keep it silent.
  function select(index) {
    if (!state.isOpen || index < 0 || index >= state.tracks.length) {
      return Promise.resolve();
    }
    failedInRow = 0;
    return loadTrack(index, { autoplay: acquire() });
  }

  const next = () => select(state.index + 1);
  const previous = () => select(state.index - 1);

  async function toggle() {
    pausedByFocus = false;
    if (!state.isOpen) return;
    if (state.status === 'playing') {
      audio.pause();
      state.status = 'paused';
      return;
    }
    if (!(await acquire())) return;
    // Resuming outside the window restarts the segment instead of drifting on.
    const { start, end } = state.segment ?? {};
    if (!(audio.currentTime >= start && audio.currentTime < end)) {
      audio.currentTime = start ?? 0;
    }
    await startPlayback();
  }

  function setMuted(isMuted) {
    state.isMuted = Boolean(isMuted);
    audio.muted = state.isMuted;
  }

  // A finished segment replays like a looping clip; moving on is always the
  // operator's choice (wheel, arrow keys or the feed buttons).
  function replaySegment() {
    const start = state.segment?.start ?? 0;
    audio.currentTime = start;
    state.currentTime = start;
    void startPlayback();
  }

  // Only a track that cannot play is skipped automatically.
  function skipFailedTrack() {
    if (state.index < state.tracks.length - 1) {
      void loadTrack(state.index + 1, { autoplay: true });
      return;
    }
    audio.pause();
    state.status = 'paused';
  }

  function handleMediaError(error) {
    if (!state.isOpen) return;
    const track = currentTrack();
    recordError(error ?? audio.error, {
      code: 'TRACK_PREVIEW_PLAYBACK_FAILED',
      title: '無法試聽曲目',
      message: '這首曲目目前無法試聽。',
      source: 'track-preview',
      operation: 'play',
      context: { trackId: track?.id, retryable: true },
    });
    failedInRow += 1;
    if (failedInRow >= state.tracks.length) {
      audio.pause();
      state.status = 'error';
      return;
    }
    skipFailedTrack();
  }

  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek === null || !ownsSource()) return;
    audio.currentTime = pendingSeek;
    pendingSeek = null;
  });
  audio.addEventListener('playing', () => {
    failedInRow = 0;
  });
  audio.addEventListener('timeupdate', () => {
    if (!state.isOpen || !ownsSource() || pendingSeek !== null) return;
    state.currentTime = audio.currentTime;
    if (state.status === 'playing' && audio.currentTime >= state.segment?.end) {
      replaySegment();
    }
  });
  audio.addEventListener('ended', () => {
    if (ownsSource() && state.status === 'playing') replaySegment();
  });
  audio.addEventListener('error', () => {
    if (ownsSource()) handleMediaError(audio.error);
  });

  // Like a feed, leaving the window (focus elsewhere, tray or minimise)
  // pauses but keeps the lane; coming back resumes that pause only.
  function pauseForFocus() {
    if (state.status !== 'playing') return;
    audio.pause();
    state.status = 'paused';
    pausedByFocus = true;
  }

  function resumeAfterFocus() {
    if (!pausedByFocus) return;
    pausedByFocus = false;
    if (state.isOpen && state.status === 'paused' && lease) void toggle();
  }

  windowRef?.addEventListener?.('blur', pauseForFocus);
  windowRef?.addEventListener?.('focus', resumeAfterFocus);
  documentRef?.addEventListener?.('visibilitychange', () => {
    if (documentRef.visibilityState === 'hidden') pauseForFocus();
  });

  return {
    state: readonly(state),
    open,
    close,
    select,
    next,
    previous,
    toggle,
    setMuted,
  };
}

let sharedPreview = null;

export function useTrackPreview() {
  if (!sharedPreview) {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    sharedPreview = createTrackPreview({
      audio,
      bgm: useBgmSession(),
      metronome: useMetronome(),
      getMusicStructure: (trackId) =>
        window.Utawakui?.getTrackMusicStructure?.(trackId) ?? null,
      getLyrics: loadPreviewLyrics,
      getDefaultVolume: () => usePlayer().state.volume,
      recordError: useAppDiagnostics().recordError,
    });
  }
  return sharedPreview;
}
