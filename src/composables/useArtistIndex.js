import { reactive, readonly, watch } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGates } from './useFeatureGates.js';
import { useLibrary } from './useLibrary.js';

// Module-scope, read-only projection of main's derived artist index (ADR 0022).
// Requested lazily by the first artist-aware surface, then refetched whenever
// the library track list changes; main caches sidecar reads, so refetch is cheap.
const state = reactive({
  index: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  isMutating: false,
  identityLookup: {
    status: 'idle',
    artistId: '',
    candidates: [],
    error: '',
  },
});

const { state: libraryState } = useLibrary();
const { recordError } = useAppDiagnostics();
const { isFeatureEnabled } = useFeatureGates();

let stopWatch = null;
let stopFeatureGateWatch = null;
let requestRevision = 0;
let identityRequestRevision = 0;
let lastAutomaticIdentityTrackKey = null;
let automaticIdentityRequestRevision = 0;

function automaticIdentityTrackKey(tracks) {
  return (Array.isArray(tracks) ? tracks : [])
    .map((track) =>
      [track?.id, track?.title, track?.artist, track?.duration]
        .map((value) => String(value ?? ''))
        .join('\u0001'),
    )
    .join('\u0002');
}

function requestAutomaticIdentityResolution() {
  const api = typeof window === 'undefined' ? null : window.Utawakui;
  if (!api?.autoResolveArtistIdentities) return;

  const trackKey = automaticIdentityTrackKey(libraryState.tracks);
  if (trackKey === lastAutomaticIdentityTrackKey) return;
  lastAutomaticIdentityTrackKey = trackKey;
  const revision = ++automaticIdentityRequestRevision;
  void api
    .autoResolveArtistIdentities()
    .then((result) => {
      if (
        revision === automaticIdentityRequestRevision &&
        result?.status === 'disabled'
      ) {
        lastAutomaticIdentityTrackKey = null;
      }
    })
    .catch(() => {
      if (revision === automaticIdentityRequestRevision) {
        lastAutomaticIdentityTrackKey = null;
      }
    });
}

async function refresh() {
  if (typeof window === 'undefined' || !window.Utawakui?.getArtistIndex) {
    return;
  }
  const revision = ++requestRevision;
  state.isLoading = !state.index;
  try {
    const index = await window.Utawakui.getArtistIndex();
    if (revision !== requestRevision) return;
    state.index = index;
    state.error = null;
    requestAutomaticIdentityResolution();
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
  } finally {
    if (revision === requestRevision) {
      state.isLoading = false;
      state.isInitialized = true;
    }
  }
}

function ensureLoaded() {
  stopWatch ??= watch(() => libraryState.tracks, refresh, { immediate: true });
  stopFeatureGateWatch ??= watch(
    () => isFeatureEnabled(FEATURE_IDS.PROVIDER_FLOW),
    (enabled, wasEnabled) => {
      if (!enabled || wasEnabled || !state.index) return;
      lastAutomaticIdentityTrackKey = null;
      requestAutomaticIdentityResolution();
    },
  );
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

const ORGANIZATION_CONFLICT_NOTICE = Object.freeze({
  code: 'ARTIST_ORGANIZATION_CONFLICT',
  title: '藝人資料已更新',
  message: '藝人資料已更新，請確認最新內容後再試一次。',
});
const ORGANIZATION_ERROR_NOTICE = Object.freeze({
  code: 'ARTIST_ORGANIZATION_FAILED',
  title: '藝人整理未完成',
  message: '目前無法更新藝人整理，請稍後再試。',
});

async function mutateOrganization(apiAction, args) {
  const api = typeof window === 'undefined' ? null : window.Utawakui;
  if (!api?.[apiAction]) return null;
  if (state.isMutating) return { status: 'busy' };
  state.isMutating = true;
  state.error = null;
  try {
    const expectedRevision = Number.isSafeInteger(
      state.index?.organizationRevision,
    )
      ? state.index.organizationRevision
      : 0;
    const result = await api[apiAction](...args, expectedRevision);
    if (result?.status === 'conflict') {
      await refresh();
      state.error = { ...ORGANIZATION_CONFLICT_NOTICE };
      return result;
    }
    if (result?.status !== 'ok') {
      state.error = { ...ORGANIZATION_ERROR_NOTICE };
      return result ?? null;
    }
    if (result.changed) await refresh();
    return result;
  } catch (err) {
    state.error = recordError(err, {
      ...ORGANIZATION_ERROR_NOTICE,
      source: 'library',
      operation: 'artist-organization',
      context: { retryable: true },
    });
    return null;
  } finally {
    state.isMutating = false;
  }
}

function mergeArtists(artistIds) {
  return mutateOrganization('mergeArtists', [artistIds]);
}

function splitArtistCredit(artistId, creditId) {
  return mutateOrganization('splitArtistCredit', [artistId, creditId]);
}

function setDisplayName(artistId, displayName) {
  return mutateOrganization('setArtistDisplayName', [artistId, displayName]);
}

function undoOrganization() {
  return mutateOrganization('undoArtistOrganization', []);
}

function resetIdentityLookup() {
  state.identityLookup = {
    status: 'idle',
    artistId: '',
    candidates: [],
    error: '',
  };
}

async function searchCatalog(artistId) {
  const api = typeof window === 'undefined' ? null : window.Utawakui;
  if (!api?.searchArtistIdentityCandidates) return null;
  const revision = ++identityRequestRevision;
  state.identityLookup = {
    status: 'searching',
    artistId,
    candidates: [],
    error: '',
  };
  try {
    const result = await api.searchArtistIdentityCandidates(artistId);
    if (revision !== identityRequestRevision) return result;
    if (result?.status === 'disabled') {
      state.identityLookup = {
        status: 'disabled',
        artistId,
        candidates: [],
        error: '請先在設定中啟用外部來源，再查詢 MusicBrainz。',
      };
      return result;
    }
    if (result?.status !== 'ok') {
      state.identityLookup = {
        status: 'error',
        artistId,
        candidates: [],
        error: 'MusicBrainz 目前無法使用，仍可手動整理藝人。',
      };
      return result ?? null;
    }
    const candidates = Array.isArray(result.candidates)
      ? result.candidates.slice(0, 5)
      : [];
    state.identityLookup = {
      status: candidates.length ? 'ready' : 'empty',
      artistId,
      candidates,
      error: '',
    };
    return result;
  } catch (err) {
    if (revision !== identityRequestRevision) return null;
    const notice = recordError(err, {
      code: 'ARTIST_IDENTITY_LOOKUP_FAILED',
      title: '無法查詢藝人資料',
      message: 'MusicBrainz 目前無法使用，仍可手動整理藝人。',
      source: 'artist-identity',
      operation: 'search',
      context: { retryable: true },
    });
    state.identityLookup = {
      status: 'error',
      artistId,
      candidates: [],
      error: notice.message,
    };
    return null;
  }
}

async function applyCatalogCandidate(artistId, candidateId) {
  const result = await mutateOrganization('applyArtistIdentityCandidate', [
    artistId,
    candidateId,
  ]);
  if (result?.status === 'ok') resetIdentityLookup();
  return result;
}

async function cancelCatalogSearch(artistId) {
  identityRequestRevision += 1;
  try {
    await window.Utawakui?.cancelArtistIdentityCandidates?.(artistId);
  } finally {
    resetIdentityLookup();
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopWatch?.();
    stopFeatureGateWatch?.();
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
    mergeArtists,
    splitArtistCredit,
    setDisplayName,
    undoOrganization,
    searchCatalog,
    applyCatalogCandidate,
    cancelCatalogSearch,
  };
}
