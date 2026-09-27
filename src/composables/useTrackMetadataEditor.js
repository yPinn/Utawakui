import { computed, reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';

const REQUIRED_TITLE_MESSAGE = '歌名必填';
const RESTART_REQUIRED_MESSAGE = '需要重新啟動應用程式';
const { recordError } = useAppDiagnostics();
const { requireFeatureGate } = useFeatureGateAccess();

const ARTWORK_FAILURE_MESSAGES = Object.freeze({
  'invalid-query': '請輸入 200 字以內的歌曲名稱、演唱者或專輯。',
  'provider-unavailable': 'MusicBrainz 或 Cover Art Archive 暫時無法使用。',
  'candidate-expired': '這批封面候選已過期，請重新搜尋。',
  'track-unavailable': '找不到這首歌曲。',
});

function reportMetadataError(error, operation, message) {
  return recordError(error, {
    code: `TRACK_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title: '曲目資訊未更新',
    message,
    source: 'track-metadata',
    operation,
    context: { retryable: true },
  }).message;
}

export function useTrackMetadataEditor({ refresh = null } = {}) {
  const state = reactive({
    track: null,
    titleDraft: '',
    artistDraft: '',
    isSaving: false,
    isArtworkSaving: false,
    isArtworkSearching: false,
    artworkSearchOpen: false,
    artworkSearchCompleted: false,
    artworkQuery: { title: '', artist: '', album: '' },
    artworkCandidates: [],
    selectedArtworkCandidateId: null,
    error: null,
  });

  const isOpen = computed(() => Boolean(state.track));

  function revokeArtworkPreviews() {
    if (typeof URL?.revokeObjectURL !== 'function') return;
    for (const candidate of state.artworkCandidates) {
      if (candidate.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(candidate.previewUrl);
      }
    }
  }

  function resetArtworkSearch() {
    revokeArtworkPreviews();
    state.artworkSearchOpen = false;
    state.artworkSearchCompleted = false;
    state.artworkQuery = { title: '', artist: '', album: '' };
    state.artworkCandidates = [];
    state.selectedArtworkCandidateId = null;
    state.isArtworkSearching = false;
  }

  function reset() {
    resetArtworkSearch();
    state.track = null;
    state.titleDraft = '';
    state.artistDraft = '';
    state.isArtworkSaving = false;
    state.error = null;
  }

  function open(track) {
    resetArtworkSearch();
    state.track = track;
    state.titleDraft = track?.title ?? '';
    state.artistDraft = track?.artist ?? '';
    state.error = null;
  }

  function close() {
    if (state.isSaving || state.isArtworkSaving || state.isArtworkSearching) {
      return;
    }
    reset();
  }

  function setTitleDraft(value) {
    state.titleDraft = value;
  }

  function setArtistDraft(value) {
    state.artistDraft = value;
  }

  function openArtworkSearch() {
    if (!state.track) return;
    revokeArtworkPreviews();
    state.artworkSearchOpen = true;
    state.artworkSearchCompleted = false;
    state.artworkQuery = {
      title: state.track.title ?? '',
      artist: state.track.artist ?? '',
      album: state.track.album ?? '',
    };
    state.artworkCandidates = [];
    state.selectedArtworkCandidateId = null;
    state.artworkSearchCompleted = false;
    state.error = null;
  }

  function closeArtworkSearch() {
    if (state.isArtworkSearching || state.isArtworkSaving) return;
    resetArtworkSearch();
  }

  function setArtworkQueryField(field, value) {
    if (!['title', 'artist', 'album'].includes(field)) return;
    state.artworkQuery[field] = String(value ?? '');
  }

  function artworkFailure(result, fallback) {
    return ARTWORK_FAILURE_MESSAGES[result?.reason] || fallback;
  }

  function previewObjectUrl(result) {
    if (
      result?.status !== 'ok' ||
      !result.bytes ||
      typeof Blob !== 'function' ||
      typeof URL?.createObjectURL !== 'function'
    ) {
      return '';
    }
    const bytes =
      result.bytes instanceof Uint8Array
        ? result.bytes
        : Uint8Array.from(result.bytes?.data || []);
    if (bytes.byteLength === 0) return '';
    return URL.createObjectURL(
      new Blob([bytes], {
        type: result.mimeType || 'application/octet-stream',
      }),
    );
  }

  async function loadArtworkPreviews(trackId, candidates) {
    if (typeof window.Utawakui?.loadTrackArtworkPreview !== 'function') {
      return candidates;
    }
    return Promise.all(
      candidates.map(async (candidate) => {
        try {
          const result = await window.Utawakui.loadTrackArtworkPreview(
            trackId,
            candidate.id,
          );
          return { ...candidate, previewUrl: previewObjectUrl(result) };
        } catch {
          return { ...candidate, previewUrl: '' };
        }
      }),
    );
  }

  async function searchArtwork() {
    if (!state.track) return null;
    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.searchTrackArtwork !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }
    const enabled = await requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
      source: 'artwork',
      operation: 'search',
      message: '請先到設定啟用外部來源，才能搜尋 MusicBrainz 封面。',
    });
    if (!enabled) return null;

    state.isArtworkSearching = true;
    state.error = null;
    revokeArtworkPreviews();
    state.artworkCandidates = [];
    state.selectedArtworkCandidateId = null;
    try {
      const result = await window.Utawakui.searchTrackArtwork(state.track.id, {
        title: state.artworkQuery.title,
        artist: state.artworkQuery.artist,
        album: state.artworkQuery.album,
      });
      if (result?.status !== 'ok') {
        state.error = artworkFailure(
          result,
          '目前無法搜尋線上封面，請稍後再試。',
        );
        return null;
      }
      state.artworkCandidates = await loadArtworkPreviews(
        state.track.id,
        Array.isArray(result.candidates) ? result.candidates : [],
      );
      state.selectedArtworkCandidateId =
        state.artworkCandidates.find((candidate) => candidate.recommended)
          ?.id || null;
      state.artworkSearchCompleted = true;
      return state.artworkCandidates;
    } catch (err) {
      state.error = reportMetadataError(
        err,
        'search-artwork',
        '目前無法搜尋線上封面，請稍後再試。',
      );
      return null;
    } finally {
      state.isArtworkSearching = false;
    }
  }

  function selectArtworkCandidate(candidateId) {
    if (
      state.artworkCandidates.some((candidate) => candidate.id === candidateId)
    ) {
      state.selectedArtworkCandidateId = candidateId;
    }
  }

  async function applySelectedArtwork() {
    if (!state.track || !state.selectedArtworkCandidateId) return null;
    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.applyTrackArtwork !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }
    state.isArtworkSaving = true;
    state.error = null;
    try {
      const result = await window.Utawakui.applyTrackArtwork(
        state.track.id,
        state.selectedArtworkCandidateId,
      );
      if (result?.status !== 'ok' || !result.track) {
        state.error = artworkFailure(result, '線上封面未套用，請再試一次。');
        return null;
      }
      updateOpenTrackArtwork(result.track);
      await refresh?.();
      resetArtworkSearch();
      return result.track;
    } catch (err) {
      state.error = reportMetadataError(
        err,
        'apply-artwork',
        '線上封面未套用，請再試一次。',
      );
      return null;
    } finally {
      state.isArtworkSaving = false;
    }
  }

  async function openArtworkSource(candidateId) {
    if (
      !state.track ||
      typeof window === 'undefined' ||
      typeof window.Utawakui?.openTrackArtworkSource !== 'function'
    ) {
      return false;
    }
    return window.Utawakui.openTrackArtworkSource(state.track.id, candidateId);
  }

  async function save() {
    if (!state.track) return null;
    if (state.isArtworkSearching || state.isArtworkSaving) return null;

    const title = state.titleDraft.trim();
    const artist = state.artistDraft.trim();
    if (!title) {
      state.error = REQUIRED_TITLE_MESSAGE;
      return null;
    }

    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.updateTrackMetadata !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }

    state.isSaving = true;
    state.error = null;
    try {
      const updated = await window.Utawakui.updateTrackMetadata(
        state.track.id,
        {
          title,
          artist,
        },
      );
      if (!updated) {
        state.error = '找不到曲目';
        return null;
      }
      await refresh?.();
      reset();
      return updated;
    } catch (err) {
      state.error = reportMetadataError(
        err,
        'save',
        '曲目資訊未儲存，請再試一次。',
      );
      return null;
    } finally {
      state.isSaving = false;
    }
  }

  function updateOpenTrackArtwork(updated) {
    if (!state.track || !updated || updated.id !== state.track.id) return;
    state.track = {
      ...state.track,
      thumbnailUrl: updated.thumbnailUrl,
    };
  }

  async function chooseThumbnail() {
    if (!state.track) return null;
    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.chooseTrackArtwork !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }

    state.isArtworkSaving = true;
    state.error = null;
    try {
      const updated = await window.Utawakui.chooseTrackArtwork(state.track.id);
      updateOpenTrackArtwork(updated);
      resetArtworkSearch();
      await refresh?.();
      return updated;
    } catch (err) {
      state.error = reportMetadataError(
        err,
        'set-artwork',
        '封面未更新，請再試一次。',
      );
      return null;
    } finally {
      state.isArtworkSaving = false;
    }
  }

  async function clearThumbnail() {
    if (!state.track) return null;
    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.clearTrackArtwork !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }

    state.isArtworkSaving = true;
    state.error = null;
    try {
      const updated = await window.Utawakui.clearTrackArtwork(state.track.id);
      updateOpenTrackArtwork(updated);
      resetArtworkSearch();
      await refresh?.();
      return updated;
    } catch (err) {
      state.error = reportMetadataError(
        err,
        'clear-artwork',
        '封面未更新，請再試一次。',
      );
      return null;
    } finally {
      state.isArtworkSaving = false;
    }
  }

  return {
    state: readonly(state),
    isOpen,
    open,
    close,
    save,
    chooseThumbnail,
    clearThumbnail,
    openArtworkSearch,
    closeArtworkSearch,
    setArtworkQueryField,
    searchArtwork,
    selectArtworkCandidate,
    applySelectedArtwork,
    openArtworkSource,
    setTitleDraft,
    setArtistDraft,
  };
}
