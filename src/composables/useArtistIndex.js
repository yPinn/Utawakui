import { reactive, readonly, watch } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLibrary } from './useLibrary.js';

// Module-scope, read-only projection of main's derived artist index (ADR 0022).
// Requested lazily by the first artist-aware surface, then refetched whenever
// the library track list changes; main caches sidecar reads, so refetch is cheap.
const state = reactive({
  index: null,
  error: null,
});

const { state: libraryState } = useLibrary();
const { recordError } = useAppDiagnostics();

let stopWatch = null;
let requestRevision = 0;

async function refresh() {
  if (typeof window === 'undefined' || !window.Utawakui?.getArtistIndex) {
    return;
  }
  const revision = ++requestRevision;
  try {
    const index = await window.Utawakui.getArtistIndex();
    if (revision !== requestRevision) return;
    state.index = index;
    state.error = null;
  } catch (err) {
    if (revision !== requestRevision) return;
    state.error = recordError(err, {
      code: 'ARTIST_INDEX_FAILED',
      title: '藝人整理失敗',
      message: '目前無法整理藝人，請稍後再試。',
      source: 'library',
      operation: 'artist-index',
      context: { retryable: true },
    });
  }
}

function ensureLoaded() {
  stopWatch ??= watch(() => libraryState.tracks, refresh, { immediate: true });
}

// Automatic photos (ADR 0022): one artist at a time, each at most once per
// session from the renderer; main applies the gate and its own session guard.
const MAX_PHOTO_BATCH = 64;
const requestedPhotoIds = new Set();
let photoQueue = Promise.resolve();

function resolvePhotos(artistIds) {
  const api = typeof window === 'undefined' ? null : window.Utawakui;
  if (!api?.resolveArtistPhoto) return photoQueue;
  const ids = (Array.isArray(artistIds) ? artistIds : [])
    .filter((id) => typeof id === 'string' && !requestedPhotoIds.has(id))
    .slice(0, MAX_PHOTO_BATCH);
  ids.forEach((id) => requestedPhotoIds.add(id));
  if (ids.length === 0) return photoQueue;

  photoQueue = photoQueue.then(async () => {
    for (const [position, id] of ids.entries()) {
      let result;
      try {
        result = await api.resolveArtistPhoto(id);
      } catch {
        continue;
      }
      if (result?.status === 'disabled') {
        // The gate may open later in this session; let these ids retry then.
        ids.slice(position).forEach((rest) => requestedPhotoIds.delete(rest));
        return;
      }
      if (result?.changed) await refresh();
    }
  });
  return photoQueue;
}

async function changePhoto(action, artistId, errorOptions) {
  try {
    const result = await window.Utawakui[action](artistId);
    if (result?.changed) await refresh();
    return result;
  } catch (err) {
    state.error = recordError(err, {
      ...errorOptions,
      source: 'artist-photo',
      context: { retryable: true },
    });
    return null;
  }
}

function choosePhoto(artistId) {
  return changePhoto('chooseArtistPhoto', artistId, {
    code: 'ARTIST_PHOTO_CHOOSE_FAILED',
    title: '藝人照片無法更新',
    message: '這張圖片無法作為藝人照片，請換一張再試。',
    operation: 'choose',
  });
}

function clearPhoto(artistId) {
  return changePhoto('clearArtistPhoto', artistId, {
    code: 'ARTIST_PHOTO_CLEAR_FAILED',
    title: '藝人照片無法移除',
    message: '目前無法移除這張藝人照片，請再試一次。',
    operation: 'clear',
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopWatch?.();
  });
}

export function useArtistIndex() {
  return {
    state: readonly(state),
    ensureLoaded,
    refresh,
    resolvePhotos,
    choosePhoto,
    clearPhoto,
  };
}
