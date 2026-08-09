import { reactive, readonly } from 'vue';

// Single shared instance (module scope, not per-component), same as
// usePlayer.js: SetlistView unmounts on every tab switch, so state that
// lived in its own refs used to vanish from the UI mid-run even though the
// worker kept going. Owning the in-flight promise and progress map here
// fixes that.

const state = reactive({
  // trackId -> { stage, percent? }, only for tracks currently separating.
  // Cleared (not zeroed) on completion so a re-trigger starts blank rather
  // than showing the previous run's stale numbers.
  inFlight: new Map(),
  // Keyed by trackId so one track's error can't clobber another's.
  errors: new Map(),
});

let unsubscribeProgress = null;

// Subscribed once at module load, same lifetime as App.vue's composables.
if (typeof window !== 'undefined' && window.Utawakui) {
  unsubscribeProgress = window.Utawakui.onSeparationProgress(
    ({ trackId, stage, percent }) => {
      state.inFlight.set(trackId, { stage, percent });
    },
  );
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeProgress?.();
  });
}

function isSeparating(trackId) {
  return state.inFlight.has(trackId);
}

// Human-readable label for the button — "準備中" covers the gap between
// clicking and the first progress event actually arriving, so the button
// never shows blank text.
function describe(trackId) {
  const progress = state.inFlight.get(trackId);
  if (!progress) return '準備中';
  switch (progress.stage) {
    case 'downloading-model':
      return '下載模型中';
    case 'loading-model':
      return '載入模型中';
    case 'decoding':
      return '解碼中';
    case 'separating':
      return `分離中 ${progress.percent ?? 0}%`;
    case 'writing':
      return '寫入中';
    default:
      return '準備中';
  }
}

async function separate(track) {
  if (isSeparating(track.id)) return;
  state.errors.delete(track.id);
  // Seeds an entry immediately so isSeparating() is true (and the button
  // shows "準備中") from the very first render after the click, instead of
  // waiting for the first IPC progress event to round-trip.
  state.inFlight.set(track.id, { stage: null });
  try {
    await window.Utawakui.separateTrack(track.id);
  } catch (err) {
    state.errors.set(track.id, `${track.title} 分離失敗:${err.message}`);
  } finally {
    state.inFlight.delete(track.id);
  }
}

export function useSeparation() {
  return {
    state: readonly(state),
    isSeparating,
    describe,
    separate,
  };
}
