import { computed, reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useFeatureGates } from './useFeatureGates.js';

const REQUIRED_TITLE_MESSAGE = '歌名必填';
const RESTART_REQUIRED_MESSAGE = '需要重新啟動應用程式';
const { recordError } = useAppDiagnostics();
const { requireFeatureGate } = useFeatureGateAccess();
const { isFeatureEnabled, refreshConfirmations } = useFeatureGates();

const ARTWORK_FAILURE_MESSAGES = Object.freeze({
  'invalid-query': '請輸入 200 字以內的歌曲名稱、演唱者或專輯。',
  'provider-unavailable': '目前無法搜尋封面，請稍後再試。',
  'candidate-expired': '這批封面候選已過期，請重新搜尋。',
  'draft-unavailable': '封面草稿已失效，請重新選擇封面。',
  'unsupported-file': '無法使用這張圖片，請選擇 JPG、PNG 或 WebP。',
  'artwork-unavailable': '目前無法讀取封面，請重新選擇封面。',
  'invalid-artwork-intent': '封面變更無效，請重新操作。',
  'invalid-metadata': '歌名或演唱者格式無效，請確認內容長度。',
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
  let artworkPreviewGeneration = 0;
  let artworkSearchPromise = null;
  const state = reactive({
    track: null,
    titleDraft: '',
    artistDraft: '',
    isSaving: false,
    isArtworkPreparing: false,
    isArtworkSearching: false,
    artworkDraft: { action: 'keep' },
    artworkPreviewUrl: '',
    artworkSearchOpen: false,
    artworkSearchCompleted: false,
    artworkQuery: { album: '' },
    artworkCandidates: [],
    selectedArtworkCandidateId: null,
    // Field validation stays apart from operation errors.
    titleError: '',
    error: null,
  });

  const isOpen = computed(() => Boolean(state.track));
  const isArtworkDirty = computed(() => state.artworkDraft.action !== 'keep');
  const isDirty = computed(() => {
    if (!state.track) return false;
    return (
      state.titleDraft.trim() !== String(state.track.title ?? '').trim() ||
      state.artistDraft.trim() !== String(state.track.artist ?? '').trim() ||
      state.artworkDraft.action !== 'keep'
    );
  });

  function revokeObjectUrl(url) {
    if (
      url?.startsWith('blob:') &&
      typeof URL?.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(url);
    }
  }

  function revokeArtworkPreviews(preserveUrl = '') {
    if (typeof URL?.revokeObjectURL !== 'function') return;
    for (const candidate of state.artworkCandidates) {
      if (
        candidate.previewUrl?.startsWith('blob:') &&
        candidate.previewUrl !== preserveUrl
      ) {
        revokeObjectUrl(candidate.previewUrl);
      }
    }
  }

  function invalidateArtworkResults({
    preserveDraft = true,
    cancelRemote = true,
  } = {}) {
    const trackId = state.track?.id;
    const hasPendingPreview = state.artworkCandidates.some(
      (candidate) => candidate.previewLoading,
    );
    if (cancelRemote && trackId && hasPendingPreview) {
      Promise.resolve(
        window.Utawakui?.cancelTrackArtworkSearch?.(trackId),
      ).catch(() => {});
    }
    artworkPreviewGeneration += 1;
    const preserveUrl = preserveDraft ? state.artworkPreviewUrl : '';
    revokeArtworkPreviews(preserveUrl);
    state.artworkSearchCompleted = false;
    state.artworkCandidates = [];
    state.selectedArtworkCandidateId = null;
  }

  function resetArtworkSearch(options) {
    invalidateArtworkResults(options);
    state.artworkSearchOpen = false;
    state.artworkQuery = { album: '' };
    state.isArtworkSearching = false;
  }

  // Aborts main-side lookup/preview work and orphans late results: the
  // generation bump makes searchArtwork() discard whatever it resolves with.
  function cancelArtworkSearch() {
    const hasPendingPreview = state.artworkCandidates.some(
      (candidate) => candidate.previewLoading,
    );
    if (!state.isArtworkSearching && !hasPendingPreview) return;
    const trackId = state.track?.id;
    invalidateArtworkResults({ cancelRemote: false });
    state.isArtworkSearching = false;
    artworkSearchPromise = null;
    if (trackId) {
      Promise.resolve(
        window.Utawakui?.cancelTrackArtworkSearch?.(trackId),
      ).catch(() => {});
    }
  }

  function reset() {
    const previewUrl = state.artworkPreviewUrl;
    cancelArtworkSearch();
    resetArtworkSearch({ preserveDraft: false });
    revokeObjectUrl(previewUrl);
    state.track = null;
    state.titleDraft = '';
    state.artistDraft = '';
    state.isArtworkPreparing = false;
    state.artworkDraft = { action: 'keep' };
    state.artworkPreviewUrl = '';
    state.error = null;
    state.titleError = '';
  }

  function open(track, { discoverArtwork = true } = {}) {
    const previousTrackId = state.track?.id;
    if (previousTrackId) {
      Promise.resolve(
        window.Utawakui?.discardTrackArtworkDraft?.(previousTrackId),
      ).catch(() => {});
    }
    reset();
    state.track = track;
    state.titleDraft = track?.title ?? '';
    state.artistDraft = track?.artist ?? '';
    state.artworkPreviewUrl = track?.thumbnailUrl ?? '';
    state.error = null;
    state.titleError = '';
    if (discoverArtwork && track && !track.thumbnailUrl) {
      openArtworkSearch({ promptForGate: false });
    }
  }

  function close() {
    if (state.isSaving || state.isArtworkPreparing) return;
    const trackId = state.track?.id;
    cancelArtworkSearch();
    reset();
    if (trackId) {
      Promise.resolve(
        window.Utawakui?.discardTrackArtworkDraft?.(trackId),
      ).catch(() => {});
    }
  }

  function setTitleDraft(value) {
    const nextValue = String(value ?? '');
    if (state.titleDraft === nextValue) return;
    state.titleDraft = nextValue;
    if (state.titleError && nextValue.trim()) state.titleError = '';
    if (state.artworkSearchOpen) {
      if (state.isArtworkSearching) cancelArtworkSearch();
      else invalidateArtworkResults();
    }
  }

  function setArtistDraft(value) {
    const nextValue = String(value ?? '');
    if (state.artistDraft === nextValue) return;
    state.artistDraft = nextValue;
    if (state.artworkSearchOpen) {
      if (state.isArtworkSearching) cancelArtworkSearch();
      else invalidateArtworkResults();
    }
  }

  function openArtworkSearch({ promptForGate = true } = {}) {
    if (!state.track) return;
    if (!state.artworkSearchOpen) {
      invalidateArtworkResults();
      state.artworkSearchOpen = true;
      state.artworkQuery = {
        album: state.track.album ?? '',
      };
    }
    state.error = null;
    if (
      !state.isArtworkSearching &&
      !state.artworkSearchCompleted &&
      state.titleDraft.trim()
    ) {
      void searchArtwork({ promptForGate });
    }
  }

  function closeArtworkSearch() {
    if (state.isArtworkPreparing) return;
    cancelArtworkSearch();
    resetArtworkSearch();
  }

  function setArtworkQueryField(field, value) {
    if (field !== 'album') return;
    const nextValue = String(value ?? '');
    if (state.artworkQuery.album === nextValue) return;
    state.artworkQuery.album = nextValue;
  }

  function artworkFailure(result, fallback) {
    return ARTWORK_FAILURE_MESSAGES[result?.reason] || fallback;
  }

  function previewBytes(result) {
    if (result?.status !== 'ok' || !result.bytes) {
      return new Uint8Array();
    }
    if (result.bytes instanceof Uint8Array) return result.bytes;
    if (Array.isArray(result.bytes)) return Uint8Array.from(result.bytes);
    return Uint8Array.from(result.bytes?.data || []);
  }

  function samePreviewBytes(first, second) {
    if (first.byteLength !== second.byteLength) return false;
    return first.every((value, index) => value === second[index]);
  }

  function previewObjectUrl(result, bytes = previewBytes(result)) {
    if (
      bytes.byteLength === 0 ||
      typeof Blob !== 'function' ||
      typeof URL?.createObjectURL !== 'function'
    ) {
      return '';
    }
    return URL.createObjectURL(
      new Blob([bytes], {
        type: result.mimeType || 'application/octet-stream',
      }),
    );
  }

  async function loadArtworkPreviews(trackId, candidates, generation) {
    const loadPreview = window.Utawakui?.loadTrackArtworkPreview;
    if (typeof loadPreview !== 'function') return;
    const candidateOrder = new Map(
      candidates.map((candidate, index) => [candidate.id, index]),
    );
    const loadedPreviewBytes = new Map();
    const pending = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );

    function transferSelection(duplicateId, canonicalId) {
      if (state.selectedArtworkCandidateId !== duplicateId) return;
      state.selectedArtworkCandidateId = canonicalId;
      state.artworkDraft = { action: 'candidate', candidateId: canonicalId };
      state.artworkPreviewUrl =
        state.artworkCandidates.find(
          (candidate) => candidate.id === canonicalId,
        )?.previewUrl || '';
    }

    function removeDuplicateCandidate(duplicateId, canonicalId) {
      const duplicateIndex = state.artworkCandidates.findIndex(
        (candidate) => candidate.id === duplicateId,
      );
      if (duplicateIndex < 0) return;
      const [duplicate] = state.artworkCandidates.splice(duplicateIndex, 1);
      loadedPreviewBytes.delete(duplicateId);
      transferSelection(duplicateId, canonicalId);
      if (
        duplicate.previewUrl?.startsWith('blob:') &&
        duplicate.previewUrl !== state.artworkPreviewUrl
      ) {
        revokeObjectUrl(duplicate.previewUrl);
      }
    }

    function keepUniquePreview(candidateId, bytes) {
      for (const [existingId, existingBytes] of loadedPreviewBytes) {
        if (!samePreviewBytes(bytes, existingBytes)) continue;
        const currentFirst =
          candidateOrder.get(candidateId) < candidateOrder.get(existingId);
        const canonicalId = currentFirst ? candidateId : existingId;
        const duplicateId = currentFirst ? existingId : candidateId;
        removeDuplicateCandidate(duplicateId, canonicalId);
        if (!currentFirst) return false;
        break;
      }
      loadedPreviewBytes.set(candidateId, bytes);
      return true;
    }

    function takeNextCandidate() {
      const priorityIds = [
        state.selectedArtworkCandidateId,
        candidates.find((candidate) => candidate.recommended)?.id,
      ];
      for (const candidateId of priorityIds) {
        if (!candidateId || !pending.has(candidateId)) continue;
        const candidate = pending.get(candidateId);
        pending.delete(candidateId);
        return candidate;
      }
      const next = pending.entries().next();
      if (next.done) return null;
      const [candidateId, candidate] = next.value;
      pending.delete(candidateId);
      return candidate;
    }

    async function worker() {
      while (pending.size > 0) {
        const candidate = takeNextCandidate();
        if (!candidate) return;
        let previewUrl = '';
        try {
          const result = await loadPreview(trackId, candidate.id);
          const bytes = previewBytes(result);
          if (bytes.byteLength > 0) {
            if (!keepUniquePreview(candidate.id, bytes)) continue;
            previewUrl = previewObjectUrl(result, bytes);
          }
        } catch {
          // Keep the text candidate available when its preview cannot load.
        }
        if (generation !== artworkPreviewGeneration) {
          if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
          continue;
        }
        const candidateIndex = state.artworkCandidates.findIndex(
          (current) => current.id === candidate.id,
        );
        if (candidateIndex < 0) {
          if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
          continue;
        }
        state.artworkCandidates[candidateIndex] = {
          ...state.artworkCandidates[candidateIndex],
          previewUrl,
          previewLoading: false,
        };
        if (
          state.artworkDraft.action === 'candidate' &&
          state.artworkDraft.candidateId === candidate.id
        ) {
          state.artworkPreviewUrl = previewUrl;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, pending.size) }, () => worker()),
    );
  }

  async function canSearchArtwork({ promptForGate }) {
    if (promptForGate) {
      return requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
        source: 'artwork',
        operation: 'search',
        message: '請先到設定啟用外部來源，才能線上搜尋封面。',
      });
    }
    if (isFeatureEnabled(FEATURE_IDS.PROVIDER_FLOW)) return true;
    await refreshConfirmations();
    return isFeatureEnabled(FEATURE_IDS.PROVIDER_FLOW);
  }

  async function performArtworkSearch({ promptForGate }) {
    if (!state.track) return null;
    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.searchTrackArtwork !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }
    state.isArtworkSearching = true;
    state.error = null;
    artworkPreviewGeneration += 1;
    const generation = artworkPreviewGeneration;
    const trackId = state.track.id;
    const query = {
      title: state.titleDraft,
      artist: state.artistDraft,
      album: state.artworkQuery.album,
    };
    state.artworkCandidates = state.artworkCandidates.map((candidate) => ({
      ...candidate,
      previewLoading: false,
    }));
    try {
      const enabled = await canSearchArtwork({ promptForGate });
      if (
        !enabled ||
        generation !== artworkPreviewGeneration ||
        state.track?.id !== trackId
      ) {
        return null;
      }
      if (state.artworkDraft.action === 'candidate') {
        state.artworkDraft = { action: 'keep' };
        state.artworkPreviewUrl = state.track.thumbnailUrl ?? '';
      }
      const result = await window.Utawakui.searchTrackArtwork(trackId, query);
      if (generation !== artworkPreviewGeneration) return null;
      if (result?.status !== 'ok') {
        state.error = artworkFailure(
          result,
          '目前無法搜尋線上封面，請稍後再試。',
        );
        return null;
      }
      const canLoadPreviews =
        typeof window.Utawakui?.loadTrackArtworkPreview === 'function';
      revokeArtworkPreviews();
      state.artworkCandidates = (
        Array.isArray(result.candidates) ? result.candidates : []
      ).map((candidate) => ({
        ...candidate,
        previewUrl: '',
        previewLoading: canLoadPreviews,
      }));
      state.selectedArtworkCandidateId = null;
      state.artworkSearchCompleted = true;
      void loadArtworkPreviews(trackId, state.artworkCandidates, generation);
      return state.artworkCandidates;
    } catch (err) {
      if (generation !== artworkPreviewGeneration) return null;
      state.error = reportMetadataError(
        err,
        'search-artwork',
        '目前無法搜尋線上封面，請稍後再試。',
      );
      return null;
    } finally {
      if (generation === artworkPreviewGeneration) {
        state.isArtworkSearching = false;
      }
    }
  }

  function searchArtwork({ promptForGate = true } = {}) {
    if (!state.track) return Promise.resolve(null);
    if (artworkSearchPromise) return artworkSearchPromise;
    const request = performArtworkSearch({ promptForGate });
    artworkSearchPromise = request;
    request.then(
      () => {
        if (artworkSearchPromise === request) artworkSearchPromise = null;
      },
      () => {
        if (artworkSearchPromise === request) artworkSearchPromise = null;
      },
    );
    return request;
  }

  function selectArtworkCandidate(candidateId) {
    const candidate = state.artworkCandidates.find(
      (current) => current.id === candidateId,
    );
    if (!candidate) return;
    if (
      state.artworkDraft.action === 'local-draft' &&
      state.artworkPreviewUrl !== candidate.previewUrl
    ) {
      revokeObjectUrl(state.artworkPreviewUrl);
    }
    state.selectedArtworkCandidateId = candidateId;
    state.artworkDraft = { action: 'candidate', candidateId };
    state.artworkPreviewUrl = candidate.previewUrl || '';
    state.error = null;
  }

  async function save({ keepOpen = false } = {}) {
    if (!state.track) return null;
    if (state.isArtworkPreparing) return null;
    if (state.isArtworkSearching) cancelArtworkSearch();

    const title = state.titleDraft.trim();
    const artist = state.artistDraft.trim();
    if (!title) {
      state.titleError = REQUIRED_TITLE_MESSAGE;
      return null;
    }
    if (!isDirty.value) return null;

    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.saveTrackEdits !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }

    state.isSaving = true;
    state.error = null;
    try {
      const result = await window.Utawakui.saveTrackEdits(state.track.id, {
        title,
        artist,
        artwork: { ...state.artworkDraft },
      });
      if (result?.status !== 'ok' || !result.track) {
        state.error = artworkFailure(result, '歌曲變更未儲存，請再試一次。');
        return null;
      }
      await refresh?.();
      reset();
      if (keepOpen) {
        state.track = result.track;
        state.titleDraft = result.track.title ?? title;
        state.artistDraft = result.track.artist ?? artist;
        state.artworkPreviewUrl = result.track.thumbnailUrl ?? '';
      }
      return result.track;
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

  async function chooseThumbnail() {
    if (!state.track) return null;
    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.chooseTrackArtworkDraft !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }

    state.isArtworkPreparing = true;
    state.error = null;
    try {
      const result = await window.Utawakui.chooseTrackArtworkDraft(
        state.track.id,
      );
      if (result?.status === 'cancelled') return null;
      if (result?.status !== 'ok') {
        state.error = artworkFailure(result, '封面無法預覽，請選擇其他圖片。');
        return null;
      }
      const previewUrl = previewObjectUrl(result);
      if (!previewUrl) {
        state.error = '封面無法預覽，請選擇其他圖片。';
        return null;
      }
      if (state.artworkDraft.action === 'local-draft') {
        revokeObjectUrl(state.artworkPreviewUrl);
      }
      state.artworkDraft = { action: 'local-draft' };
      state.artworkPreviewUrl = previewUrl;
      state.selectedArtworkCandidateId = null;
      return previewUrl;
    } catch (err) {
      state.error = reportMetadataError(
        err,
        'set-artwork',
        '封面無法預覽，請再試一次。',
      );
      return null;
    } finally {
      state.isArtworkPreparing = false;
    }
  }

  function clearThumbnail() {
    if (!state.track) return;
    if (state.artworkDraft.action === 'local-draft') {
      revokeObjectUrl(state.artworkPreviewUrl);
    }
    state.error = null;
    state.selectedArtworkCandidateId = null;
    state.artworkDraft = state.track.thumbnailUrl
      ? { action: 'clear' }
      : { action: 'keep' };
    state.artworkPreviewUrl = '';
  }

  return {
    state: readonly(state),
    isOpen,
    isArtworkDirty,
    isDirty,
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
    setTitleDraft,
    setArtistDraft,
  };
}
