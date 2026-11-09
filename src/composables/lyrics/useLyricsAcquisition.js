import { FEATURE_IDS } from '../../constants/featureGates.js';
import { t } from '../../utils/i18n.js';

function providerSaveFailureMessage(reason) {
  return t(
    ['cache-miss', 'stale-search', 'record-mismatch'].includes(reason)
      ? 'lyricsAcquisition.saveSearchAgain'
      : 'lyricsAcquisition.saveIncomplete',
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
  state.candidateSearch.extensionFailed = false;
  state.manualSave.committed = false;
  let musixmatchProbeRequestId = 0;
  let candidateSearchRequestId = 0;
  let candidateSearchQueryKey = null;
  let activeCandidateSave = null;

  function invalidateCandidateSave() {
    if (activeCandidateSave !== null) {
      activeCandidateSave = null;
      state.manualSave.isSaving = false;
    }
    state.manualSave.error = null;
    state.manualSave.committed = false;
  }

  function clearMusixmatchProbe() {
    musixmatchProbeRequestId += 1;
    state.musixmatchProbe.isLoading = false;
    state.musixmatchProbe.trackId = null;
    state.musixmatchProbe.result = null;
    state.musixmatchProbe.error = null;
  }

  function clearCandidateSearch() {
    candidateSearchRequestId += 1;
    candidateSearchQueryKey = null;
    state.candidateSearch.isLoading = false;
    state.candidateSearch.trackId = null;
    state.candidateSearch.providerId = null;
    state.candidateSearch.status = null;
    state.candidateSearch.reason = null;
    state.candidateSearch.candidates = [];
    state.candidateSearch.groups = { best: [], related: [] };
    state.candidateSearch.recordingGroups = { best: [], related: [] };
    state.candidateSearch.providerStatuses = [];
    state.candidateSearch.extensionFailed = false;
    state.candidateSearch.partial = false;
    state.candidateSearch.invalidRecordCount = 0;
    state.candidateSearch.error = null;
    invalidateCandidateSave();
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

  function markStoredSourceRemoved(trackId, filename) {
    const search = state.candidateSearch;
    if (search.trackId !== trackId) return;
    const candidate = search.candidates.find(
      (item) => item.storedSourceFilename === filename,
    );
    if (!candidate) return;

    const unsaved = { ...candidate, alreadySaved: false, saveState: 'unsaved' };
    delete unsaved.storedSourceFilename;
    delete unsaved.retrievedAt;
    replaceCandidate(unsaved);
  }

  async function ensureLyricsFlow(options = {}) {
    const enabled = await requireFeatureGate(FEATURE_IDS.LYRICS_FLOW, {
      source: 'lyrics',
      operation: options.operation || 'external-source',
      message: t('lyricsAcquisition.flowRequired'),
    });
    if (options.isCurrent && !options.isCurrent()) return false;
    if (!enabled) {
      const message = t('lyricsAcquisition.flowRequiredShort');
      if (options.errorTarget === 'musixmatchProbe') {
        state.musixmatchProbe.error = message;
      } else if (options.errorTarget === 'manualSave') {
        state.manualSave.error = message;
      } else if (options.errorTarget === 'sourceAction') {
        state.sourceAction.operation = options.operation;
        state.sourceAction.attempt += 1;
        state.sourceAction.error = message;
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
      state.musixmatchProbe.error = t('lyricsAcquisition.probeRestart');
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
        t('lyricsAcquisition.probeFailed'),
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
    const queryKey = JSON.stringify([
      options?.query?.title ?? '',
      options?.query?.artist ?? '',
    ]);
    const retained =
      options?.mode === 'broaden' &&
      candidateSearchQueryKey === queryKey &&
      state.candidateSearch.trackId === track.id &&
      state.candidateSearch.providerId === providerId &&
      state.candidateSearch.candidates.length > 0
        ? {
            candidates: state.candidateSearch.candidates,
            groups: state.candidateSearch.groups,
            recordingGroups: state.candidateSearch.recordingGroups,
          }
        : null;
    candidateSearchQueryKey = queryKey;
    candidateSearchRequestId += 1;
    invalidateCandidateSave();
    const requestId = candidateSearchRequestId;
    state.candidateSearch.extensionFailed = false;
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
      state.candidateSearch.error = t('lyricsAcquisition.searchRestart');
      return;
    }

    try {
      let result =
        typeof genericSearch === 'function'
          ? await genericSearch(providerId, track.id, options)
          : await legacySearch(track.id, options);
      if (requestId !== candidateSearchRequestId) return;
      if (retained) {
        const outcomes = result?.providerStatuses?.length
          ? result.providerStatuses
          : [result];
        // Main can already have merged the old choices into a partial result.
        // Only an entirely failed extension without new content needs a notice.
        const hasNewContent = (result?.candidates || []).some(
          (next) =>
            !retained.candidates.some(
              (previous) =>
                candidateKey(previous, providerId) ===
                  candidateKey(next, providerId) &&
                previous.previewFingerprint === next.previewFingerprint,
            ),
        );
        state.candidateSearch.extensionFailed =
          !hasNewContent &&
          outcomes.every(
            (outcome) =>
              (outcome?.status === 'error' || outcome?.partial === true) &&
              ![
                'request-budget-exhausted',
                'cancelled',
                'cache-miss',
                'not-found',
                'low-confidence-match',
              ].includes(outcome.reason),
          );
      }
      if (retained && !result?.candidates?.length) {
        result = {
          ...result,
          ...retained,
          status: 'ok',
          partial: result?.status === 'error' || result?.partial === true,
          providerStatuses: result?.providerStatuses?.length
            ? result.providerStatuses
            : result?.status === 'error'
              ? [
                  {
                    provider: providerId,
                    status: 'error',
                    reason: result.reason,
                  },
                ]
              : [],
        };
      }
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
        : result?.partial === true
          ? [
              {
                provider: providerId,
                status: result.status,
                partial: true,
                reason: result.reason,
              },
            ]
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
          t('lyricsAcquisition.searchUnavailable'),
          { persist: false },
        );
      }
      return result;
    } catch (error) {
      if (requestId !== candidateSearchRequestId) return;
      if (retained) {
        state.candidateSearch.extensionFailed = true;
        const result = {
          provider: providerId,
          status: 'ok',
          partial: true,
          reason: 'request-failed',
          ...retained,
          providerStatuses: [
            { provider: providerId, status: 'error', reason: 'request-failed' },
          ],
        };
        state.candidateSearch.status = result.status;
        state.candidateSearch.partial = true;
        state.candidateSearch.reason = result.reason;
        state.candidateSearch.providerStatuses = result.providerStatuses;
        state.candidateSearch.error = null;
        return result;
      }
      state.candidateSearch.error = reportLyricsError(
        error,
        'search',
        t('lyricsAcquisition.searchUnavailable'),
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
    const searchRequestId = candidateSearchRequestId;
    const selectedTrackId = state.selectedTrackId;
    const submittedCandidate = { ...candidate };
    const attempt = {};
    activeCandidateSave = attempt;
    const isCurrent = () =>
      activeCandidateSave === attempt &&
      searchRequestId === candidateSearchRequestId &&
      state.selectedTrackId === selectedTrackId;
    const saveOptions = candidateSaveOptions(query);
    let committed = false;
    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    state.manualSave.committed = false;
    try {
      if (!(await ensureLyricsFlow({ errorTarget: 'manualSave', isCurrent })))
        return null;
      const genericSave = preferLegacyBridge
        ? null
        : window.Utawakui?.saveLyricsProviderCandidate;
      const legacySave =
        providerId === 'lrclib' ? window.Utawakui?.saveLyricsCandidate : null;
      if (
        typeof genericSave !== 'function' &&
        typeof legacySave !== 'function'
      ) {
        state.manualSave.error = t('lyricsAcquisition.restartToSave');
        return null;
      }
      const args = [
        track.id,
        submittedCandidate.id,
        submittedCandidate.previewFingerprint,
        saveOptions,
      ];
      const result =
        typeof genericSave === 'function'
          ? await genericSave(providerId, ...args)
          : await legacySave(...args);
      // A completed Main transaction still needs a library refresh even if its
      // preview was dismissed. Only the current preview may consume its result.
      if (result?.status === 'saved' && result.source) {
        committed = true;
        if (isCurrent()) state.manualSave.committed = true;
        await refreshLibrary();
      }
      if (!isCurrent()) return null;
      if (result?.status === 'record-changed') {
        if (
          searchRequestId === candidateSearchRequestId &&
          state.candidateSearch.trackId === track.id
        ) {
          const key = candidateKey(submittedCandidate, providerId);
          for (const group of [
            ...state.candidateSearch.recordingGroups.best,
            ...state.candidateSearch.recordingGroups.related,
          ]) {
            if (!Array.isArray(group.timelineDifferences)) continue;
            group.timelineDifferences = group.timelineDifferences.filter(
              (difference) =>
                difference.referenceCandidateKey !== key &&
                difference.candidateKey !== key,
            );
          }
        }
        return result;
      }
      if (result?.status !== 'saved' || !result.source) {
        const reason = result?.reason || 'unknown';
        state.manualSave.error = reportLyricsError(
          new Error(`${providerId} save unavailable: ${reason}`),
          'save-candidate',
          providerSaveFailureMessage(reason),
          { persist: false },
        );
        return null;
      }
      const keepProviderIdentity =
        Boolean(
          submittedCandidate.providerId || submittedCandidate.candidateKey,
        ) || state.candidateSearch.providerId === 'all';
      replaceCandidate({
        ...submittedCandidate,
        ...(keepProviderIdentity
          ? {
              providerId: submittedCandidate.providerId || providerId,
              candidateKey: candidateKey(submittedCandidate, providerId),
            }
          : {}),
        alreadySaved: true,
        saveState: 'current',
        storedSourceFilename: result.source.filename,
        ...(result.retrievedAt ? { retrievedAt: result.retrievedAt } : {}),
      });
      if (
        state.selectedTrackId === track.id &&
        result.preserveSelection !== true
      ) {
        selectSource(result.source.filename);
      }
      return result;
    } catch (error) {
      if (!isCurrent()) return null;
      state.manualSave.error = reportLyricsError(
        error,
        'save-candidate',
        committed
          ? t('lyricsAcquisition.savedRefreshFailed')
          : t('lyricsAcquisition.saveIncomplete'),
        { persist: false },
      );
      return null;
    } finally {
      if (activeCandidateSave === attempt) {
        activeCandidateSave = null;
        state.manualSave.isSaving = false;
      }
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
    if (
      !(await ensureLyricsFlow({
        errorTarget: 'sourceAction',
        operation: 'backfill-labels',
      }))
    )
      return null;

    const action = state.sourceAction;
    action.operation = 'backfill-labels';
    action.attempt += 1;
    if (typeof window.Utawakui?.backfillLyricsSourceLabels !== 'function') {
      action.error = t('lyricsAcquisition.restartToSave');
      return null;
    }

    action.isSaving = true;
    action.error = null;
    try {
      const result = await window.Utawakui.backfillLyricsSourceLabels(track.id);
      await refreshLibrary();
      return result;
    } catch (error) {
      action.error = reportLyricsError(
        error,
        'backfill-labels',
        t('common.tryAgain'),
      );
      return null;
    } finally {
      action.isSaving = false;
    }
  }

  return {
    clearMusixmatchProbe,
    clearCandidateSearch,
    markStoredSourceRemoved,
    ensureLyricsFlow,
    probeMusixmatch,
    searchLyricsProviderCandidates,
    searchLyricsCandidates,
    saveLyricsProviderCandidate,
    saveLyricsCandidate,
    backfillSourceLabels,
  };
}
