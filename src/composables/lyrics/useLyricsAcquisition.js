import { FEATURE_IDS } from '../../constants/featureGates.js';

const LRCLIB_FAILURE_MESSAGES = Object.freeze({
  'rate-limited': 'LRCLIB 暫時限制搜尋請求，請稍後再試。',
  offline: '目前無法連線至 LRCLIB，請檢查網路後再試。',
  'fetch-unavailable': '目前無法連線至 LRCLIB，請稍後再試。',
  timeout: 'LRCLIB 回應逾時，請稍後再試。',
  'service-unavailable': 'LRCLIB 服務暫時無法使用，請稍後再試。',
  'invalid-json': 'LRCLIB 回傳了無法讀取的資料，請稍後再試。',
  'invalid-record': 'LRCLIB 回傳的候選資料不完整，請調整條件後再試。',
  'response-too-large': 'LRCLIB 回傳資料超出安全限制，請縮小搜尋範圍。',
  busy: '已有一筆 LRCLIB 搜尋正在進行，請稍候。',
});

function candidateGroups(result) {
  if (result?.groups) {
    return {
      best: Array.isArray(result.groups.best) ? result.groups.best : [],
      related: Array.isArray(result.groups.related)
        ? result.groups.related
        : [],
    };
  }
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  return {
    best: candidates.filter((candidate) => candidate.matchBand !== 'related'),
    related: candidates.filter(
      (candidate) => candidate.matchBand === 'related',
    ),
  };
}

function candidateSaveOptions(query) {
  if (!query) return undefined;
  const plainQuery = {};
  for (const field of ['title', 'artist']) {
    if (typeof query[field] === 'string') plainQuery[field] = query[field];
  }
  return { query: plainQuery };
}

export function useLyricsAcquisition({
  state,
  selectedTrack,
  requireFeatureGate,
  reportLyricsError,
  refreshLibrary,
  selectSource,
}) {
  let musixmatchProbeRequestId = 0;
  let candidateSearchRequestId = 0;

  function clearMusixmatchProbe() {
    musixmatchProbeRequestId += 1;
    state.musixmatchProbe.isLoading = false;
    state.musixmatchProbe.trackId = null;
    state.musixmatchProbe.result = null;
    state.musixmatchProbe.error = null;
  }

  function clearCandidateSearch() {
    candidateSearchRequestId += 1;
    state.candidateSearch.isLoading = false;
    state.candidateSearch.trackId = null;
    state.candidateSearch.status = null;
    state.candidateSearch.reason = null;
    state.candidateSearch.candidates = [];
    state.candidateSearch.groups = { best: [], related: [] };
    state.candidateSearch.invalidRecordCount = 0;
    state.candidateSearch.error = null;
    state.manualSave.error = null;
  }

  function replaceCandidate(candidate) {
    const candidates = state.candidateSearch.candidates.map((item) =>
      item.id === candidate.id ? candidate : item,
    );
    state.candidateSearch.candidates = candidates;
    state.candidateSearch.groups = candidateGroups({ candidates });
  }

  async function ensureLyricsFlow(options = {}) {
    const enabled = await requireFeatureGate(FEATURE_IDS.LYRICS_FLOW, {
      source: 'lyrics',
      operation: options.operation || 'external-source',
      message: '請先到設定啟用歌詞來源，才能搜尋、保存或整理線上歌詞。',
    });
    if (!enabled) {
      const message = '請先到設定啟用歌詞來源';
      if (options.errorTarget === 'musixmatchProbe') {
        state.musixmatchProbe.error = message;
      } else if (options.errorTarget === 'manualSave') {
        state.manualSave.error = message;
      } else {
        state.candidateSearch.error = message;
      }
    }
    return enabled;
  }

  async function probeMusixmatch() {
    const track = selectedTrack.value;
    if (!track) return null;
    if (!(await ensureLyricsFlow({ errorTarget: 'musixmatchProbe' }))) {
      return null;
    }

    musixmatchProbeRequestId += 1;
    const requestId = musixmatchProbeRequestId;
    state.musixmatchProbe.isLoading = true;
    state.musixmatchProbe.trackId = track.id;
    state.musixmatchProbe.result = null;
    state.musixmatchProbe.error = null;

    if (typeof window.Utawakui?.probeMusixmatchLyrics !== 'function') {
      state.musixmatchProbe.isLoading = false;
      state.musixmatchProbe.error = '請重新啟動應用程式後再檢查歌詞來源。';
      return null;
    }

    try {
      const result = await window.Utawakui.probeMusixmatchLyrics(track.id);
      if (requestId !== musixmatchProbeRequestId) return null;
      state.musixmatchProbe.result = result;
      return result;
    } catch (error) {
      if (requestId !== musixmatchProbeRequestId) return null;
      state.musixmatchProbe.error = reportLyricsError(
        error,
        'probe-source',
        '目前無法檢查歌詞來源，請再試一次。',
      );
      return null;
    } finally {
      if (requestId === musixmatchProbeRequestId) {
        state.musixmatchProbe.isLoading = false;
      }
    }
  }

  async function searchLyricsCandidates(
    options,
    trackId = state.selectedTrackId,
  ) {
    const track = state.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    candidateSearchRequestId += 1;
    const requestId = candidateSearchRequestId;
    if (!(await ensureLyricsFlow())) return;
    if (requestId !== candidateSearchRequestId) return;

    state.candidateSearch.isLoading = true;
    state.candidateSearch.trackId = track.id;
    state.candidateSearch.error = null;

    if (typeof window.Utawakui?.searchLyricsCandidates !== 'function') {
      state.candidateSearch.isLoading = false;
      state.candidateSearch.error = '請重新啟動應用程式後再搜尋歌詞。';
      return;
    }

    try {
      const result = await window.Utawakui.searchLyricsCandidates(
        track.id,
        options,
      );
      if (requestId !== candidateSearchRequestId) return;
      state.candidateSearch.status = result?.status ?? null;
      state.candidateSearch.reason = result?.reason ?? null;
      state.candidateSearch.candidates = Array.isArray(result?.candidates)
        ? result.candidates
        : [];
      state.candidateSearch.groups = candidateGroups(result);
      state.candidateSearch.invalidRecordCount = Number.isSafeInteger(
        result?.invalidRecordCount,
      )
        ? result.invalidRecordCount
        : 0;
      if (result?.status === 'error') {
        state.candidateSearch.error = reportLyricsError(
          new Error(`lrclib search failed: ${result.reason || 'unknown'}`),
          'search',
          LRCLIB_FAILURE_MESSAGES[result.reason] ||
            '目前無法搜尋歌詞，請稍後再試。',
          { persist: false },
        );
      }
      return result;
    } catch (error) {
      if (requestId !== candidateSearchRequestId) return;
      state.candidateSearch.error = reportLyricsError(
        error,
        'search',
        '目前無法搜尋歌詞，請再試一次。',
        { persist: false },
      );
    } finally {
      if (requestId === candidateSearchRequestId) {
        state.candidateSearch.isLoading = false;
      }
    }
  }

  async function saveLyricsCandidate(
    candidate,
    trackId = state.selectedTrackId,
    query = undefined,
  ) {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) return null;
    if (!(await ensureLyricsFlow())) return null;

    if (typeof window.Utawakui?.saveLyricsCandidate !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再儲存歌詞。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const result = await window.Utawakui.saveLyricsCandidate(
        track.id,
        candidate.id,
        candidate.previewFingerprint,
        candidateSaveOptions(query),
      );
      if (result?.status === 'record-changed') return result;
      if (result?.status !== 'saved' || !result.source) {
        throw new Error(
          `lrclib save unavailable: ${result?.reason || 'unknown'}`,
        );
      }
      await refreshLibrary();
      replaceCandidate({
        ...candidate,
        alreadySaved: true,
        saveState: 'current',
        ...(result.retrievedAt ? { retrievedAt: result.retrievedAt } : {}),
      });
      if (state.selectedTrackId === track.id) {
        selectSource(result.source.filename);
      }
      return result;
    } catch (error) {
      state.manualSave.error = reportLyricsError(
        error,
        'save-candidate',
        '歌詞未儲存，請再試一次。',
        { persist: false },
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  async function backfillSourceLabels() {
    const track = selectedTrack.value;
    if (!track) return null;
    if (!(await ensureLyricsFlow())) return null;

    if (typeof window.Utawakui?.backfillLyricsSourceLabels !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再更新標籤。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const result = await window.Utawakui.backfillLyricsSourceLabels(track.id);
      await refreshLibrary();
      return result;
    } catch (error) {
      state.manualSave.error = reportLyricsError(
        error,
        'backfill-labels',
        '標籤未更新，請再試一次。',
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  return {
    clearMusixmatchProbe,
    clearCandidateSearch,
    ensureLyricsFlow,
    probeMusixmatch,
    searchLyricsCandidates,
    saveLyricsCandidate,
    backfillSourceLabels,
  };
}
