import { readonly, shallowRef } from 'vue';
import { useLyricsTimingReview } from './useLyricsTimingReview.js';

const EMPTY_TIMING = Object.freeze({
  status: 'missing',
  sourceFingerprint: null,
});

export function useLyricsSourceDocuments({
  state,
  selectedTrack,
  reportLyricsError,
  refreshLibrary,
  selectSource,
  prepareLyrics = () => null,
}) {
  // Timing documents can contain thousands of immutable lines and segments.
  // Replacing a shallow ref avoids recursively proxying each snapshot.
  const lyricsTiming = shallowRef(EMPTY_TIMING);
  const lyricsAcousticEstimate = shallowRef({ status: 'missing' });
  const sourceSession = shallowRef(null),
    savedOffsetMs = shallowRef(0);
  let lyricsRequestId = 0;
  let offsetSaveRequestId = 0;
  let timingSaveRequestId = 0,
    offsetQueue = Promise.resolve();
  let selectedLyricsLoad = Promise.resolve();
  let selectedAcousticLoad = Promise.resolve();
  let loadedContext = null;
  let offsetIntentRevision = 0;
  let offsetContextGeneration = 0;
  // Source-list maintenance (label, delete, backfill). `operation` titles the
  // failure; `attempt` lets a view hide one result without owning the state.
  state.sourceAction ??= {
    isSaving: false,
    operation: null,
    attempt: 0,
    error: null,
  };
  function cancelSession(value) {
    if (!value?.id || !window.Utawakui?.cancelLyricsSourceSession) return;
    try {
      Promise.resolve(
        window.Utawakui.cancelLyricsSourceSession(value.id),
      ).catch(() => {});
    } catch {
      /* Closing source must not block selection. */
    }
  }
  function applySession(value, field) {
    if (value && sourceSession.value && value.id === sourceSession.value.id)
      sourceSession.value = { ...sourceSession.value, [field]: value[field] };
  }
  function releaseUnusedRead(value, trackId, filename) {
    if (
      selectedTrack.value?.id !== trackId ||
      state.selectedSourceFilename !== filename
    )
      cancelSession(value);
  }

  async function loadAcousticEstimate(trackId, filename, requestId) {
    if (typeof window.Utawakui?.getLyricsAcousticEstimate !== 'function')
      return;
    const isCurrent = () =>
      requestId === lyricsRequestId &&
      selectedTrack.value?.id === trackId &&
      state.selectedSourceFilename === filename;
    try {
      const result = await window.Utawakui.getLyricsAcousticEstimate(
        trackId,
        filename,
      );
      if (isCurrent())
        lyricsAcousticEstimate.value = result ?? { status: 'missing' };
    } catch {
      if (isCurrent()) lyricsAcousticEstimate.value = { status: 'unavailable' };
    }
  }

  async function performSelectedLyricsLoad() {
    const track = selectedTrack.value;
    const filename = state.selectedSourceFilename;
    lyricsRequestId += 1;
    const requestId = lyricsRequestId;
    timingSaveRequestId++;
    const previousSession = sourceSession.value;
    const sameSource =
      loadedContext &&
      track &&
      loadedContext.trackId === track.id &&
      loadedContext.filename === filename;
    if (!sameSource) {
      cancelSession(previousSession);
      offsetContextGeneration++;
      offsetSaveRequestId++;
      sourceSession.value = null;
      savedOffsetMs.value = 0;
      offsetQueue = Promise.resolve();
      state.lyricsText = '';
      state.lyricSource = null;
      state.offsetSeconds = 0;
      state.offsetSave.isSaving = false;
      state.offsetSave.error = null;
      lyricsTiming.value = EMPTY_TIMING;
    }
    if (state.timingSave) {
      state.timingSave.isSaving = false;
      state.timingSave.error = null;
    }
    if (state.sourceAction && loadedContext?.trackId !== track?.id) {
      state.sourceAction.operation = null;
      state.sourceAction.error = null;
    }

    lyricsAcousticEstimate.value = { status: 'missing' };
    selectedAcousticLoad = Promise.resolve();
    if (!track || !filename) {
      state.isLoadingLyrics = false;
      return;
    }

    if (typeof window.Utawakui?.getTrackLyrics !== 'function') {
      state.error = '請重新啟動應用程式後再讀取歌詞。';
      return;
    }

    state.isLoadingLyrics = true;
    try {
      if (sameSource) await offsetQueue;
      if (requestId !== lyricsRequestId) return;
      const offsetAtRead = offsetIntentRevision;
      const result = await window.Utawakui.getTrackLyrics(track.id, filename);
      if (requestId !== lyricsRequestId) {
        releaseUnusedRead(result?.sourceSession, track.id, filename);
        return;
      }
      const preparation = prepareLyrics(result);
      if (preparation) await preparation;
      if (requestId !== lyricsRequestId) {
        releaseUnusedRead(result?.sourceSession, track.id, filename);
        return;
      }
      state.lyricsText = result?.text ?? '';
      state.lyricSource = result?.source ?? null;
      const sameRoot =
        sameSource && previousSession?.id === result?.sourceSession?.id;
      const pendingOffset =
        sameRoot &&
        (state.offsetSave.isSaving || offsetAtRead !== offsetIntentRevision);
      const keepPreview = sameRoot && (pendingOffset || state.offsetSave.error);
      const storedOffset = Number.isInteger(result?.source?.offsetMs)
        ? result.source.offsetMs
        : 0;
      if (!keepPreview) state.offsetSeconds = storedOffset / 1000;
      lyricsTiming.value = result?.timing
        ? { ...result.timing, sourceSession: result.sourceSession ?? null }
        : EMPTY_TIMING;
      const currentOffsetRevision = sourceSession.value?.offsetRevision;
      sourceSession.value = result?.sourceSession
        ? {
            ...result.sourceSession,
            ...(pendingOffset ? { offsetRevision: currentOffsetRevision } : {}),
          }
        : null;
      if (sameSource && !sameRoot) {
        offsetContextGeneration++;
        offsetSaveRequestId++;
        offsetQueue = Promise.resolve();
        state.offsetSave.isSaving = false;
        state.offsetSave.error = null;
      }
      loadedContext = { trackId: track.id, filename };
      if (previousSession?.id !== sourceSession.value?.id)
        cancelSession(previousSession);
      if (!pendingOffset) savedOffsetMs.value = storedOffset;
      state.error = null;
      selectedAcousticLoad = loadAcousticEstimate(
        track.id,
        filename,
        requestId,
      );
    } catch (error) {
      if (requestId !== lyricsRequestId) return;
      cancelSession(previousSession);
      sourceSession.value = null;
      offsetContextGeneration++;
      state.offsetSave.isSaving = false;
      state.error = reportLyricsError(
        error,
        'load',
        '目前無法讀取歌詞，請再試一次。',
      );
    } finally {
      if (requestId === lyricsRequestId) state.isLoadingLyrics = false;
    }
  }

  function loadSelectedLyrics() {
    selectedLyricsLoad = performSelectedLyricsLoad();
    return selectedLyricsLoad;
  }

  function waitForSelectedLyricsLoad() {
    return selectedLyricsLoad;
  }

  function persistSelectedOffset() {
    offsetIntentRevision++;
    const trackId = state.selectedTrackId;
    const sourceFilename = state.selectedSourceFilename;
    const offsetMs = Math.round(state.offsetSeconds * 1000);
    if (!trackId || !sourceFilename) return Promise.resolve(null);

    offsetSaveRequestId += 1;
    const requestId = offsetSaveRequestId;
    const generation = offsetContextGeneration;
    const current = () =>
      generation === offsetContextGeneration &&
      state.selectedTrackId === trackId &&
      state.selectedSourceFilename === sourceFilename;
    state.offsetSave.isSaving = true;
    state.offsetSave.error = null;
    const saving = offsetQueue.then(async () => {
      if (!current()) return null;
      try {
        if (typeof window.Utawakui?.setLyricsSourceOffset !== 'function') {
          throw new Error('lyrics offset bridge unavailable');
        }
        const saved = await window.Utawakui.setLyricsSourceOffset(
          trackId,
          sourceFilename,
          offsetMs,
          sourceSession.value,
        );
        if (current()) {
          savedOffsetMs.value = saved?.source?.offsetMs ?? 0;
          applySession(saved?.sourceSession, 'offsetRevision');
        }
        return saved;
      } catch (error) {
        if (current() && requestId === offsetSaveRequestId) {
          state.offsetSave.error = reportLyricsError(
            error,
            'offset-save',
            '同步調整未儲存，請再試一次。',
          );
        }
        return null;
      } finally {
        if (current() && requestId === offsetSaveRequestId) {
          state.offsetSave.isSaving = false;
        }
      }
    });
    offsetQueue = saving;
    return saving;
  }

  function adjustOffset(deltaSeconds) {
    state.offsetSeconds =
      Math.round((state.offsetSeconds + deltaSeconds) * 10) / 10;
    persistSelectedOffset();
  }

  function resetOffset() {
    state.offsetSeconds = 0;
    persistSelectedOffset();
  }

  async function saveTimingDocument(document, baseline = sourceSession.value) {
    const trackId = state.selectedTrackId;
    const sourceFilename = state.selectedSourceFilename;
    const sourceFingerprint = lyricsTiming.value.sourceFingerprint;
    if (!trackId || !sourceFilename || !sourceFingerprint) {
      state.timingSave.error = '目前歌詞來源缺少可驗證的版本資訊。';
      return null;
    }
    if (typeof window.Utawakui?.saveLyricsTiming !== 'function') {
      state.timingSave.error = '請重新啟動應用程式後再儲存歌詞時間。';
      return null;
    }
    if (
      !baseline ||
      !sourceSession.value ||
      baseline.id !== sourceSession.value.id
    ) {
      if (!state.timingSave.isSaving)
        state.timingSave.error =
          '這份時間草稿的來源版本已變更，請重新讀取後再試一次。';
      return null;
    }
    const generation = lyricsRequestId,
      requestId = ++timingSaveRequestId;
    const current = () =>
      generation === lyricsRequestId &&
      requestId === timingSaveRequestId &&
      state.selectedTrackId === trackId &&
      state.selectedSourceFilename === sourceFilename;

    state.timingSave.isSaving = true;
    state.timingSave.error = null;
    try {
      const timing = await window.Utawakui.saveLyricsTiming(
        trackId,
        sourceFilename,
        sourceFingerprint,
        document,
        {
          id: baseline.id,
          timingRevision: baseline.timingRevision,
          offsetRevision: baseline.offsetRevision,
        },
      );
      if (current()) {
        lyricsTiming.value = timing;
        applySession(timing?.sourceSession, 'timingRevision');
      }
      if (current()) return timing?.document ?? document;
      if (
        state.selectedTrackId === trackId &&
        state.selectedSourceFilename === sourceFilename
      ) {
        await selectedLyricsLoad;
        if (
          sourceSession.value?.id === baseline.id &&
          timing?.sourceSession?.id === baseline.id &&
          timing.sourceSession.timingRevision ===
            sourceSession.value.timingRevision
        )
          return timing.document ?? document;
      }
      return null;
    } catch (error) {
      if (current())
        state.timingSave.error = reportLyricsError(
          error,
          'save-timing',
          '歌詞時間未儲存，請再試一次。',
        );
      return null;
    } finally {
      if (current()) state.timingSave.isSaving = false;
    }
  }

  async function runSourceAction(operation, bridgeName, work) {
    if (!selectedTrack.value) return null;
    const action = state.sourceAction;
    action.operation = operation;
    action.attempt += 1;
    if (typeof window.Utawakui?.[bridgeName] !== 'function') {
      action.error = '請重新啟動應用程式後再試。';
      return null;
    }
    action.isSaving = true;
    action.error = null;
    try {
      return await work(window.Utawakui[bridgeName], selectedTrack.value);
    } catch (error) {
      action.error = reportLyricsError(error, operation, '請再試一次。');
      return null;
    } finally {
      action.isSaving = false;
    }
  }

  function setSourceLabel(filename, label) {
    return runSourceAction(
      'set-label',
      'setLyricsSourceLabel',
      async (bridge, track) => {
        const result = await bridge(track.id, filename, label);
        await refreshLibrary();
        return result;
      },
    );
  }

  function deleteSource(filename) {
    return runSourceAction(
      'delete-source',
      'deleteLyricsSource',
      async (bridge, track) => {
        const result = await bridge(track.id, filename);
        await refreshLibrary();
        if (state.selectedSourceFilename === filename) {
          selectSource(result.sources[0]?.filename ?? '', {
            persistPreference: false,
          });
        }
        return result;
      },
    );
  }

  async function importManualLyricsText(payload) {
    const track = selectedTrack.value;
    if (!track) return null;

    if (typeof window.Utawakui?.importLyricsText !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再試。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const result = await window.Utawakui.importLyricsText(track.id, payload);
      await refreshLibrary();
      if (result?.source?.filename) selectSource(result.source.filename);
      return result;
    } catch (error) {
      state.manualSave.error = reportLyricsError(
        error,
        'import-text',
        '請再試一次。',
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  async function importManualLyricsFile() {
    const track = selectedTrack.value;
    if (!track) return null;

    if (typeof window.Utawakui?.importLyricsFile !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再試。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const result = await window.Utawakui.importLyricsFile(track.id);
      if (!result) return null;
      await refreshLibrary();
      if (result?.source?.filename) selectSource(result.source.filename);
      return result;
    } catch (error) {
      state.manualSave.error = reportLyricsError(
        error,
        'import-file',
        '請再試一次。',
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  async function waitForSavedOffset() {
    const generation = lyricsRequestId;
    await offsetQueue;
    return (
      Boolean(sourceSession.value) &&
      generation === lyricsRequestId &&
      !state.offsetSave.isSaving &&
      !state.offsetSave.error &&
      savedOffsetMs.value === Math.round(state.offsetSeconds * 1000)
    );
  }
  const timingReview = useLyricsTimingReview({
    state,
    sourceSession,
    waitForSavedOffset,
    saveTimingDocument,
    reportLyricsError,
    getOffsetIntentRevision: () => offsetIntentRevision,
    reloadSource: loadSelectedLyrics,
  });
  return {
    timingReview,
    sourceSession: readonly(sourceSession),
    savedOffsetMs: readonly(savedOffsetMs),
    waitForSavedOffset,
    lyricsTiming,
    lyricsAcousticEstimate,
    waitForSelectedAcousticEstimate: () => selectedAcousticLoad,
    loadSelectedLyrics,
    waitForSelectedLyricsLoad,
    adjustOffset,
    resetOffset,
    retryOffsetSave: persistSelectedOffset,
    saveTimingDocument,
    setSourceLabel,
    deleteSource,
    importManualLyricsText,
    importManualLyricsFile,
  };
}
