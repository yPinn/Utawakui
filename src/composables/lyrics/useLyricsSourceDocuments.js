import { shallowRef } from 'vue';

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
}) {
  // Timing documents can contain thousands of immutable lines and segments.
  // Replacing a shallow ref avoids recursively proxying each snapshot.
  const lyricsTiming = shallowRef(EMPTY_TIMING);
  let lyricsRequestId = 0;
  let offsetSaveRequestId = 0;
  let selectedLyricsLoad = Promise.resolve();

  async function performSelectedLyricsLoad() {
    const track = selectedTrack.value;
    const filename = state.selectedSourceFilename;
    lyricsRequestId += 1;
    const requestId = lyricsRequestId;
    offsetSaveRequestId += 1;

    state.lyricsText = '';
    state.lyricSource = null;
    state.offsetSeconds = 0;
    state.offsetSave.isSaving = false;
    state.offsetSave.error = null;
    lyricsTiming.value = EMPTY_TIMING;
    if (!track || !filename) return;

    if (typeof window.Utawakui?.getTrackLyrics !== 'function') {
      state.error = '請重新啟動應用程式後再讀取歌詞。';
      return;
    }

    state.isLoadingLyrics = true;
    try {
      const result = await window.Utawakui.getTrackLyrics(track.id, filename);
      if (requestId !== lyricsRequestId) return;
      state.lyricsText = result?.text ?? '';
      state.lyricSource = result?.source ?? null;
      state.offsetSeconds = Number.isInteger(result?.source?.offsetMs)
        ? result.source.offsetMs / 1000
        : 0;
      lyricsTiming.value = result?.timing ?? EMPTY_TIMING;
      state.error = null;
    } catch (error) {
      if (requestId !== lyricsRequestId) return;
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

  async function persistSelectedOffset() {
    const trackId = state.selectedTrackId;
    const sourceFilename = state.selectedSourceFilename;
    const offsetMs = Math.round(state.offsetSeconds * 1000);
    if (!trackId || !sourceFilename) return null;

    offsetSaveRequestId += 1;
    const requestId = offsetSaveRequestId;
    state.offsetSave.isSaving = true;
    state.offsetSave.error = null;
    try {
      if (typeof window.Utawakui?.setLyricsSourceOffset !== 'function') {
        throw new Error('lyrics offset bridge unavailable');
      }
      return await window.Utawakui.setLyricsSourceOffset(
        trackId,
        sourceFilename,
        offsetMs,
      );
    } catch (error) {
      if (requestId === offsetSaveRequestId) {
        state.offsetSave.error = reportLyricsError(
          error,
          'offset-save',
          '同步調整未儲存，請再試一次。',
        );
      }
      return null;
    } finally {
      if (requestId === offsetSaveRequestId) {
        state.offsetSave.isSaving = false;
      }
    }
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

  async function saveTimingDocument(document) {
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

    state.timingSave.isSaving = true;
    state.timingSave.error = null;
    try {
      const timing = await window.Utawakui.saveLyricsTiming(
        trackId,
        sourceFilename,
        sourceFingerprint,
        document,
      );
      if (
        state.selectedTrackId === trackId &&
        state.selectedSourceFilename === sourceFilename &&
        lyricsTiming.value.sourceFingerprint === sourceFingerprint
      ) {
        lyricsTiming.value = timing;
      }
      return timing?.document ?? document;
    } catch (error) {
      state.timingSave.error = reportLyricsError(
        error,
        'save-timing',
        '歌詞時間未儲存，請再試一次。',
      );
      return null;
    } finally {
      state.timingSave.isSaving = false;
    }
  }

  async function setSourceLabel(filename, label) {
    const track = selectedTrack.value;
    if (!track) return null;

    if (typeof window.Utawakui?.setLyricsSourceLabel !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再編輯標籤。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const result = await window.Utawakui.setLyricsSourceLabel(
        track.id,
        filename,
        label,
      );
      await refreshLibrary();
      return result;
    } catch (error) {
      state.manualSave.error = reportLyricsError(
        error,
        'set-label',
        '標籤未更新，請再試一次。',
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  async function deleteSource(filename) {
    const track = selectedTrack.value;
    if (!track) return null;

    if (typeof window.Utawakui?.deleteLyricsSource !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再刪除歌詞來源。';
      return null;
    }

    state.manualSave.isSaving = true;
    state.manualSave.error = null;
    try {
      const result = await window.Utawakui.deleteLyricsSource(
        track.id,
        filename,
      );
      await refreshLibrary();
      if (state.selectedSourceFilename === filename) {
        selectSource(result.sources[0]?.filename ?? '', {
          persistPreference: false,
        });
      }
      return result;
    } catch (error) {
      state.manualSave.error = reportLyricsError(
        error,
        'delete-source',
        '無法刪除歌詞來源，請再試一次。',
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  async function importManualLyricsText(payload) {
    const track = selectedTrack.value;
    if (!track) return null;

    if (typeof window.Utawakui?.importLyricsText !== 'function') {
      state.manualSave.error = '請重新啟動應用程式後再匯入歌詞。';
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
        '歌詞未匯入，請再試一次。',
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
      state.manualSave.error = '請重新啟動應用程式後再匯入歌詞檔。';
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
        '歌詞未匯入，請再試一次。',
      );
      return null;
    } finally {
      state.manualSave.isSaving = false;
    }
  }

  return {
    lyricsTiming,
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
