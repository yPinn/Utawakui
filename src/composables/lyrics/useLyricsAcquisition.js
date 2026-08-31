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

const NETEASE_FAILURE_MESSAGES = Object.freeze({
  'rate-limited': '網易雲音樂暫時限制搜尋請求，請稍後再試。',
  offline: '目前無法連線至網易雲音樂，請檢查網路後再試。',
  'fetch-unavailable': '目前無法連線至網易雲音樂，請稍後再試。',
  timeout: '網易雲音樂回應逾時，請稍後再試。',
  'service-unavailable': '網易雲音樂服務暫時無法使用，請稍後再試。',
  'invalid-json': '網易雲音樂回傳了無法讀取的資料，請稍後再試。',
  'invalid-record': '網易雲音樂回傳的候選資料不完整，請調整條件後再試。',
  'response-too-large': '網易雲音樂回傳資料超出安全限制，請縮小搜尋範圍。',
  busy: '已有一筆網易雲音樂搜尋正在進行，請稍候。',
});

const BETTER_LYRICS_FAILURE_MESSAGES = Object.freeze({
  'cache-miss': '這首歌目前不在 Better Lyrics 公開快取中。',
  'not-found': 'Better Lyrics 找不到這首歌的歌詞。',
  'low-confidence-match': 'Better Lyrics 的符合度不足，已略過可能錯配的歌詞。',
  'missing-track-identity':
    'Better Lyrics 需要歌曲名稱、歌手與長度才能安全搜尋。',
  'rate-limited': 'Better Lyrics 暫時限制搜尋請求，請稍後再試。',
  offline: '目前無法連線至 Better Lyrics，請檢查網路後再試。',
  'fetch-unavailable': '目前無法連線至 Better Lyrics，請稍後再試。',
  timeout: 'Better Lyrics 回應逾時，請稍後再試。',
  'service-unavailable': 'Better Lyrics 服務暫時無法使用，請稍後再試。',
  'invalid-json': 'Better Lyrics 回傳了無法讀取的資料，請稍後再試。',
  'invalid-record': 'Better Lyrics 回傳的資料不完整，已停止使用。',
  'invalid-ttml': 'Better Lyrics 歌詞不符合安全的逐字格式。',
  'response-too-large': 'Better Lyrics 回傳資料超出安全限制。',
  busy: '已有一筆 Better Lyrics 搜尋正在進行，請稍候。',
});

const PROVIDER_FAILURE_MESSAGES = Object.freeze({
  all: Object.freeze({
    'all-providers-failed': '目前無法搜尋任何線上歌詞來源，請稍後再試。',
    'all-providers-unavailable': '目前沒有可用的線上歌詞來源。',
  }),
  lrclib: LRCLIB_FAILURE_MESSAGES,
  netease: NETEASE_FAILURE_MESSAGES,
  betterlyrics: BETTER_LYRICS_FAILURE_MESSAGES,
});

const BETTER_LYRICS_SAVE_FAILURE_MESSAGES = Object.freeze({
  'cache-miss': '這首歌已不在 Better Lyrics 公開快取中，請重新搜尋。',
  offline: '保存時無法連線至 Better Lyrics，請檢查網路後再試。',
  'fetch-unavailable': '保存時無法連線至 Better Lyrics，請稍後再試。',
  timeout: 'Better Lyrics 保存驗證逾時，請稍後再試。',
  'service-unavailable': 'Better Lyrics 服務暫時無法完成保存驗證。',
  'stale-search': 'Better Lyrics 搜尋結果已過期，請重新搜尋。',
  'record-mismatch': 'Better Lyrics 的歌詞已不再符合目前曲目，請重新搜尋。',
  busy: '已有一筆歌詞正在儲存，請稍候。',
});

function providerSaveFailureMessage(providerId, reason) {
  return (
    (providerId === 'betterlyrics'
      ? BETTER_LYRICS_SAVE_FAILURE_MESSAGES[reason]
      : null) ||
    PROVIDER_FAILURE_MESSAGES[providerId]?.[reason] ||
    '歌詞未儲存，請再試一次。'
  );
}

function candidateKey(candidate, fallbackProviderId) {
  return (
    candidate?.candidateKey ||
    `${candidate?.providerId || fallbackProviderId}:${candidate?.id}`
  );
}

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

function candidateRecordingGroups(result) {
  if (result?.recordingGroups) {
    return {
      best: Array.isArray(result.recordingGroups.best)
        ? result.recordingGroups.best
        : [],
      related: Array.isArray(result.recordingGroups.related)
        ? result.recordingGroups.related
        : [],
    };
  }
  const groups = candidateGroups(result);
  const providerId = result?.provider;
  function singleCandidateGroup(candidate) {
    const key = candidateKey(candidate, providerId);
    return {
      recordingKey: `candidate:${key}`,
      matchBand: candidate.matchBand,
      recommendedCandidateKey: key,
      candidates: [candidate],
    };
  }
  return {
    best: groups.best.map(singleCandidateGroup),
    related: groups.related.map(singleCandidateGroup),
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
    state.candidateSearch.providerId = null;
    state.candidateSearch.status = null;
    state.candidateSearch.reason = null;
    state.candidateSearch.candidates = [];
    state.candidateSearch.groups = { best: [], related: [] };
    state.candidateSearch.recordingGroups = { best: [], related: [] };
    state.candidateSearch.providerStatuses = [];
    state.candidateSearch.partial = false;
    state.candidateSearch.invalidRecordCount = 0;
    state.candidateSearch.error = null;
    state.manualSave.error = null;
  }

  function replaceCandidate(candidate) {
    const replacementKey = candidateKey(
      candidate,
      state.candidateSearch.providerId,
    );
    const candidates = state.candidateSearch.candidates.map((item) =>
      candidateKey(item, state.candidateSearch.providerId) === replacementKey
        ? candidate
        : item,
    );
    state.candidateSearch.candidates = candidates;
    state.candidateSearch.groups = candidateGroups({ candidates });
    const existingGroups = [
      ...state.candidateSearch.recordingGroups.best,
      ...state.candidateSearch.recordingGroups.related,
    ].map((group) => {
      const groupCandidates = group.candidates.map((item) =>
        candidateKey(item, state.candidateSearch.providerId) === replacementKey
          ? candidate
          : item,
      );
      const recommended =
        groupCandidates.find(
          (item) =>
            candidateKey(item, state.candidateSearch.providerId) ===
            group.recommendedCandidateKey,
        ) || groupCandidates[0];
      return {
        ...group,
        matchBand: recommended?.matchBand || group.matchBand,
        candidates: groupCandidates,
      };
    });
    state.candidateSearch.recordingGroups = {
      best: existingGroups.filter((group) => group.matchBand !== 'related'),
      related: existingGroups.filter((group) => group.matchBand === 'related'),
    };
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

  async function searchLyricsProviderCandidates(
    providerId,
    options,
    trackId = state.selectedTrackId,
    preferLegacyBridge = false,
  ) {
    const track = state.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    candidateSearchRequestId += 1;
    const requestId = candidateSearchRequestId;
    if (!(await ensureLyricsFlow())) return;
    if (requestId !== candidateSearchRequestId) return;

    state.candidateSearch.isLoading = true;
    state.candidateSearch.trackId = track.id;
    state.candidateSearch.providerId = providerId;
    state.candidateSearch.error = null;

    const genericSearch = preferLegacyBridge
      ? null
      : window.Utawakui?.searchLyricsProviderCandidates;
    const legacySearch =
      providerId === 'lrclib' ? window.Utawakui?.searchLyricsCandidates : null;
    if (
      typeof genericSearch !== 'function' &&
      typeof legacySearch !== 'function'
    ) {
      state.candidateSearch.isLoading = false;
      state.candidateSearch.error = '請重新啟動應用程式後再搜尋歌詞。';
      return;
    }

    try {
      const result =
        typeof genericSearch === 'function'
          ? await genericSearch(providerId, track.id, options)
          : await legacySearch(track.id, options);
      if (requestId !== candidateSearchRequestId) return;
      state.candidateSearch.status = result?.status ?? null;
      state.candidateSearch.reason = result?.reason ?? null;
      state.candidateSearch.candidates = Array.isArray(result?.candidates)
        ? result.candidates
        : [];
      state.candidateSearch.groups = candidateGroups(result);
      state.candidateSearch.recordingGroups = candidateRecordingGroups(result);
      state.candidateSearch.providerStatuses = Array.isArray(
        result?.providerStatuses,
      )
        ? result.providerStatuses
        : [];
      state.candidateSearch.partial = result?.partial === true;
      state.candidateSearch.invalidRecordCount = Number.isSafeInteger(
        result?.invalidRecordCount,
      )
        ? result.invalidRecordCount
        : 0;
      if (result?.status === 'error') {
        state.candidateSearch.error = reportLyricsError(
          new Error(
            `${providerId} search failed: ${result.reason || 'unknown'}`,
          ),
          'search',
          PROVIDER_FAILURE_MESSAGES[providerId]?.[result.reason] ||
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

  async function searchLyricsCandidates(
    options,
    trackId = state.selectedTrackId,
  ) {
    return searchLyricsProviderCandidates('lrclib', options, trackId, true);
  }

  async function saveLyricsProviderCandidate(
    providerId,
    candidate,
    trackId = state.selectedTrackId,
    query = undefined,
    preferLegacyBridge = false,
  ) {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) return null;
    if (!(await ensureLyricsFlow())) return null;

    const genericSave = preferLegacyBridge
      ? null
      : window.Utawakui?.saveLyricsProviderCandidate;
    const legacySave =
      providerId === 'lrclib' ? window.Utawakui?.saveLyricsCandidate : null;
    if (typeof genericSave !== 'function' && typeof legacySave !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再儲存歌詞。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const args = [
        track.id,
        candidate.id,
        candidate.previewFingerprint,
        candidateSaveOptions(query),
      ];
      const result =
        typeof genericSave === 'function'
          ? await genericSave(providerId, ...args)
          : await legacySave(...args);
      if (result?.status === 'record-changed') return result;
      if (result?.status !== 'saved' || !result.source) {
        const reason = result?.reason || 'unknown';
        state.manualSave.error = reportLyricsError(
          new Error(`${providerId} save unavailable: ${reason}`),
          'save-candidate',
          providerSaveFailureMessage(providerId, reason),
          { persist: false },
        );
        return null;
      }
      await refreshLibrary();
      const keepProviderIdentity =
        Boolean(candidate.providerId || candidate.candidateKey) ||
        state.candidateSearch.providerId === 'all';
      replaceCandidate({
        ...candidate,
        ...(keepProviderIdentity
          ? {
              providerId: candidate.providerId || providerId,
              candidateKey: candidateKey(candidate, providerId),
            }
          : {}),
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

  async function saveLyricsCandidate(
    candidate,
    trackId = state.selectedTrackId,
    query = undefined,
  ) {
    return saveLyricsProviderCandidate(
      'lrclib',
      candidate,
      trackId,
      query,
      true,
    );
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
    searchLyricsProviderCandidates,
    searchLyricsCandidates,
    saveLyricsProviderCandidate,
    saveLyricsCandidate,
    backfillSourceLabels,
  };
}
