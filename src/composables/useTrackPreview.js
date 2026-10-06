import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useBgmSession } from './useBgmSession.js';
import { useMetronome } from './useMetronome.js';
import { usePlayer } from './usePlayer.js';
import { resolvePreviewSegment } from '../utils/trackPreviewSegment.js';

// Monitor-only track preview (docs/contracts/track-preview.md). It owns its
// own audio element and never writes the performance player's state.
export function createTrackPreview({
  audio,
  bgm,
  metronome,
  getMusicStructure,
  getDefaultVolume = () => 1,
  recordError = () => {},
  documentRef = typeof document === 'undefined' ? null : document,
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
  let pendingSeek = null;
  let failedInRow = 0;

  const currentTrack = () => state.tracks[state.index] ?? null;
  const sessionActive = () => bgm.handoffState.sessionMode !== 'inactive';

  function handlePreempt() {
    lease = null;
    audio.pause();
    state.status = 'paused';
    state.blockedReason = sessionActive() ? 'session-active' : 'preempted';
  }

  async function acquire() {
    if (lease) return true;
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

  async function startPlayback() {
    const generation = trackGeneration;
    try {
      await audio.play();
      if (generation === trackGeneration && lease) state.status = 'playing';
    } catch (error) {
      // A newer source or an explicit pause aborts the pending play().
      if (generation !== trackGeneration || error?.name === 'AbortError')
        return;
      handleMediaError(error);
    }
  }

  async function loadTrack(index, { autoplay }) {
    const generation = ++trackGeneration;
    const track = state.tracks[index];
    if (!track) return;
    audio.pause();
    state.index = index;
    state.currentTime = 0;
    state.segment = resolvePreviewSegment({ durationSeconds: track.duration });

    let structure;
    try {
      structure = await getMusicStructure(track.id);
    } catch {
      structure = null;
    }
    if (generation !== trackGeneration) return;

    state.segment = resolvePreviewSegment({
      durationSeconds: track.duration,
      structure,
    });
    state.currentTime = state.segment.start;
    pendingSeek = state.segment.start;
    audio.src = track.url;
    if (autoplay && lease) await startPlayback();
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
    audio.volume = getDefaultVolume();
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

  function select(index) {
    if (!state.isOpen || index < 0 || index >= state.tracks.length) {
      return Promise.resolve();
    }
    failedInRow = 0;
    const autoplay = state.status === 'playing';
    return loadTrack(index, { autoplay });
  }

  const next = () => select(state.index + 1);
  const previous = () => select(state.index - 1);

  async function toggle() {
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

  function finishSegment() {
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
    finishSegment();
  }

  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek === null) return;
    audio.currentTime = pendingSeek;
    pendingSeek = null;
  });
  audio.addEventListener('playing', () => {
    failedInRow = 0;
  });
  audio.addEventListener('timeupdate', () => {
    if (!state.isOpen || pendingSeek !== null) return;
    state.currentTime = audio.currentTime;
    if (state.status === 'playing' && audio.currentTime >= state.segment?.end) {
      finishSegment();
    }
  });
  audio.addEventListener('ended', () => {
    if (state.status === 'playing') finishSegment();
  });
  audio.addEventListener('error', () => handleMediaError(audio.error));

  // Hiding the window (tray or minimise) pauses but keeps the lane.
  documentRef?.addEventListener?.('visibilitychange', () => {
    if (documentRef.visibilityState !== 'hidden') return;
    if (state.status !== 'playing') return;
    audio.pause();
    state.status = 'paused';
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
      getDefaultVolume: () => usePlayer().state.volume,
      recordError: useAppDiagnostics().recordError,
    });
  }
  return sharedPreview;
}
