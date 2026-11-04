import { onScopeDispose, reactive, readonly } from 'vue';
import { t } from '../utils/i18n.js';

const SEARCH_FAILURE_MESSAGES = Object.freeze({
  disabled: t('artist.photo.needsProvider'),
  'rate-limited': t('artist.photo.rateLimited'),
  'circuit-open': t('artist.photo.rateLimited'),
  'provider-rejected': t('artist.photo.providerUnavailable'),
  'schema-error': t('artist.photo.providerUnavailable'),
  busy: t('artist.photo.busy'),
});

const APPLY_FAILURE_MESSAGES = Object.freeze({
  'candidate-stale': t('artist.photo.stale'),
  'candidate-unavailable': t('artist.photo.stale'),
  disabled: t('artist.photo.needsProvider'),
});

function searchFailureMessage(result) {
  return (
    SEARCH_FAILURE_MESSAGES[result?.reason ?? result?.status] ??
    t('artist.photo.searchFailed')
  );
}

function applyFailureMessage(result) {
  return (
    APPLY_FAILURE_MESSAGES[result?.reason ?? result?.status] ??
    t('artist.photo.applyFailed')
  );
}

function previewBytes(result) {
  const value = result?.image?.buffer;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value?.data)) return Uint8Array.from(value.data);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

export function useArtistPhotoCandidates({
  api = typeof window === 'undefined' ? null : window.Utawakui,
  refreshArtistIndex = null,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  let generation = 0;
  const state = reactive({
    open: false,
    artistId: '',
    artistName: '',
    status: 'idle',
    candidates: [],
    selectedCandidateId: null,
    error: '',
  });

  function revokePreviews(candidates = state.candidates) {
    for (const candidate of candidates) {
      if (!candidate.previewUrl?.startsWith('blob:')) continue;
      try {
        revokeObjectURL(candidate.previewUrl);
      } catch {
        // Revocation is cleanup only; a platform failure must not block close.
      }
    }
  }

  function resetResults() {
    revokePreviews();
    state.candidates = [];
    state.selectedCandidateId = null;
    state.error = '';
  }

  function candidatePreviewUrl(result) {
    const bytes = previewBytes(result);
    if (
      result?.status !== 'ok' ||
      !bytes?.byteLength ||
      typeof Blob !== 'function'
    ) {
      return '';
    }
    try {
      return createObjectURL(
        new Blob([bytes], {
          type: result.image?.mimeType || 'application/octet-stream',
        }),
      );
    } catch {
      return '';
    }
  }

  async function loadPreviews(artistId, candidates, currentGeneration) {
    if (typeof api?.loadArtistPhotoCandidatePreview !== 'function') {
      if (currentGeneration === generation) {
        state.candidates = state.candidates.map((candidate) => ({
          ...candidate,
          previewStatus: 'error',
        }));
      }
      return;
    }

    await Promise.all(
      candidates.map(async (candidate) => {
        let previewUrl = '';
        try {
          const result = await api.loadArtistPhotoCandidatePreview(
            artistId,
            candidate.candidateId,
          );
          previewUrl = candidatePreviewUrl(result);
        } catch {
          // A candidate remains selectable only when its validated preview loads.
        }

        if (currentGeneration !== generation) {
          if (previewUrl.startsWith('blob:')) revokeObjectURL(previewUrl);
          return;
        }
        const index = state.candidates.findIndex(
          (entry) => entry.candidateId === candidate.candidateId,
        );
        if (index < 0) {
          if (previewUrl.startsWith('blob:')) revokeObjectURL(previewUrl);
          return;
        }
        state.candidates[index] = {
          ...state.candidates[index],
          previewUrl,
          previewStatus: previewUrl ? 'ready' : 'error',
        };
      }),
    );
  }

  async function search() {
    if (!state.open || !state.artistId) return null;
    if (typeof api?.searchArtistPhotoCandidates !== 'function') {
      state.status = 'error';
      state.error = t('artist.photo.restart');
      return null;
    }

    const artistId = state.artistId;
    const currentGeneration = ++generation;
    resetResults();
    state.status = 'searching';
    try {
      const result = await api.searchArtistPhotoCandidates(artistId);
      if (currentGeneration !== generation) return null;
      if (result?.status === 'no-match') {
        state.status = 'empty';
        return [];
      }
      if (!['ok', 'partial'].includes(result?.status)) {
        if (result?.reason === 'cancelled') return null;
        state.status = 'error';
        state.error = searchFailureMessage(result);
        return null;
      }

      const candidates = (
        Array.isArray(result.candidates) ? result.candidates : []
      )
        .filter(
          (candidate) =>
            typeof candidate?.candidateId === 'string' &&
            typeof candidate?.name === 'string',
        )
        .slice(0, 3)
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          name: candidate.name,
          previewUrl: '',
          previewStatus: 'loading',
        }));
      if (candidates.length === 0) {
        state.status = 'empty';
        return [];
      }
      state.candidates = candidates;
      state.status = 'ready';
      await loadPreviews(artistId, candidates, currentGeneration);
      return currentGeneration === generation ? state.candidates : null;
    } catch {
      if (currentGeneration !== generation) return null;
      state.status = 'error';
      state.error = searchFailureMessage(null);
      return null;
    }
  }

  async function openForArtist(artist) {
    close();
    state.open = true;
    state.artistId = typeof artist?.id === 'string' ? artist.id : '';
    state.artistName = typeof artist?.name === 'string' ? artist.name : '';
    return search();
  }

  function selectCandidate(candidateId) {
    const candidate = state.candidates.find(
      (entry) => entry.candidateId === candidateId,
    );
    if (candidate?.previewStatus === 'ready') {
      state.selectedCandidateId = candidateId;
      state.error = '';
    }
  }

  async function applySelected() {
    if (
      !state.open ||
      !state.artistId ||
      !state.selectedCandidateId ||
      typeof api?.applyArtistPhotoCandidate !== 'function'
    ) {
      return null;
    }
    const artistId = state.artistId;
    const candidateId = state.selectedCandidateId;
    const currentGeneration = generation;
    state.status = 'applying';
    state.error = '';
    try {
      const result = await api.applyArtistPhotoCandidate(artistId, candidateId);
      if (currentGeneration !== generation) return null;
      if (result?.status !== 'ok') {
        state.status = 'ready';
        state.error = applyFailureMessage(result);
        return null;
      }
      await refreshArtistIndex?.();
      if (currentGeneration !== generation) return result;
      close();
      return result;
    } catch {
      if (currentGeneration !== generation) return null;
      state.status = 'ready';
      state.error = applyFailureMessage(null);
      return null;
    }
  }

  function close() {
    const artistId = state.artistId;
    const shouldCancel = state.open && state.status === 'searching';
    generation += 1;
    resetResults();
    state.open = false;
    state.artistId = '';
    state.artistName = '';
    state.status = 'idle';
    if (shouldCancel && artistId) {
      Promise.resolve(api?.cancelArtistPhotoCandidates?.(artistId)).catch(
        () => {},
      );
    }
  }

  onScopeDispose(close);

  return {
    state: readonly(state),
    openForArtist,
    retry: search,
    selectCandidate,
    applySelected,
    close,
  };
}
