import {
  describeDownloadFailure,
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import { normalizeAppError } from '../../utils/appErrors.js';
import {
  getPlaylistImportStats,
  hasImportableSelection,
} from '../../utils/importPlaylist.js';
import { usePlaylists } from '../usePlaylists.js';

const PROVIDER_DOWNLOAD_CONCURRENCY = 2;

export function useImportExecution({
  state,
  canConfirmImport,
  canRetryFailed,
  dominantFailureCode,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
}) {
  const {
    create: createPlaylist,
    setTracks: setPlaylistTracks,
    upsertAlbum,
  } = usePlaylists();
  let cancelRequested = false;
  const activeDownloadIds = new Set();

  function setSingleStatus(status, errorCode = null) {
    if (state.singleTrack) {
      state.singleTrack.status = status;
      state.singleTrack.errorCode = errorCode;
    }
    const selectedCandidate = state.singleResolution?.candidates?.find(
      (candidate) =>
        (candidate.playbackVideoId || candidate.id) ===
        state.selectedCandidateId,
    );
    if (selectedCandidate) {
      selectedCandidate.status = status;
      selectedCandidate.errorCode = errorCode;
    }
  }

  async function importSingle() {
    const input = state.input.trim();
    const downloadInput =
      state.singleTrack?.downloadInput ||
      state.singleTrack?.playbackVideoId ||
      input;
    setStatus('下載中...', 'pending');
    setSingleStatus('downloading');
    state.isImporting = true;
    activeDownloadIds.add(downloadInput);

    try {
      const result = await window.Utawakui.downloadAudio(downloadInput);
      setSingleStatus('done');
      setStatus(
        result.title ? `已下載：${result.title}` : '歌曲已下載',
        'success',
        'object',
      );
    } catch (error) {
      const appError = normalizeAppError(error, {
        source: 'import',
        operation: 'download-track',
      });
      if (appError.code === 'IMPORT_DOWNLOAD_CANCELLED') {
        setSingleStatus('pending');
        setStatus('已停止下載', 'pending');
        return;
      }
      if (handleProviderSetupError(error)) {
        setSingleStatus('pending');
        return;
      }
      const failure = describeDownloadFailure(error);
      setSingleStatus('error', failure.code);
      reportImportError(error, 'download-track', '下載未完成，請再試一次。');
      setStatus(`下載失敗：${failure.label}`, 'error');
      state.failureHint = failure.hint;
    } finally {
      activeDownloadIds.delete(downloadInput);
      state.isImporting = false;
    }
  }

  function selectFailedTracks() {
    if (!state.playlistTracks) return;
    for (const track of state.playlistTracks) {
      if (track.status === 'error') track.selected = true;
    }
    state.activeFilter = 'failed';
  }

  async function downloadPlaylistTrack(track) {
    if (track.alreadyDownloaded || track.status === 'done') return;

    track.status = 'downloading';
    track.errorCode = null;
    activeDownloadIds.add(track.id);

    try {
      await window.Utawakui.downloadAudio(track.id);
      track.status = 'done';
    } catch (error) {
      const appError = normalizeAppError(error, {
        source: 'import',
        operation: 'download-track',
      });
      if (appError.code === 'IMPORT_DOWNLOAD_CANCELLED') {
        track.status = 'pending';
        track.errorCode = null;
        return;
      }
      track.status = 'error';
      track.errorCode = describeDownloadFailure(error).code;
      reportImportError(error, 'download-track', '部分曲目未下載。');
    } finally {
      activeDownloadIds.delete(track.id);
    }
  }

  async function downloadPlaylistTracks(tracks) {
    let nextIndex = 0;
    async function runWorker() {
      while (!cancelRequested) {
        const track = tracks[nextIndex];
        nextIndex += 1;
        if (!track) return;
        await downloadPlaylistTrack(track);
      }
    }

    const workerCount = Math.min(PROVIDER_DOWNLOAD_CONCURRENCY, tracks.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  async function syncImportedPlaylist() {
    const trackIds = state.playlistTracks
      .filter(
        (track) =>
          track.selected &&
          (track.status === 'done' || track.alreadyDownloaded),
      )
      .map((track) => track.id);
    if (trackIds.length === 0) return null;

    if (state.collectionKind === 'album') {
      const upserted = await upsertAlbum({
        name: state.playlistTitle,
        source: state.collectionSource,
        trackIds,
        thumbnailUrl: state.collectionThumbnailUrl,
      });
      return Boolean(upserted);
    }

    if (!state.createdPlaylistId) {
      const created = await createPlaylist(state.playlistTitle);
      if (!created) return false;
      state.createdPlaylistId = created.id;
    }
    return setPlaylistTracks(state.createdPlaylistId, trackIds);
  }

  async function importPlaylist() {
    if (
      !state.playlistTracks ||
      !hasImportableSelection(state.playlistTracks)
    ) {
      return;
    }

    cancelRequested = false;
    state.isImporting = true;
    setStatus('下載選取曲目中...', 'pending');

    try {
      const tracks = state.playlistTracks.filter(
        (track) =>
          track.selected && !track.alreadyDownloaded && track.status !== 'done',
      );
      await downloadPlaylistTracks(tracks);

      const playlistSynced = await syncImportedPlaylist();
      const stats = getPlaylistImportStats(state.playlistTracks);
      if (cancelRequested) {
        setStatus('已停止，未完成的曲目仍留在預覽中', 'pending');
      } else if (stats.error > 0) {
        const dominant = dominantFailureCode.value;
        setStatus(
          dominant
            ? `下載完成，${stats.error} 首失敗（${downloadFailureLabel(dominant)}）`
            : `下載完成，${stats.error} 首失敗`,
          'error',
        );
        if (dominant) state.failureHint = downloadFailureHint(dominant);
      } else if (playlistSynced === true) {
        setStatus(
          state.collectionKind === 'album'
            ? `已加入專輯「${state.playlistTitle}」`
            : `已加入播放清單「${state.playlistTitle}」`,
          'success',
        );
      } else if (playlistSynced === false) {
        setStatus('曲目已下載，但播放清單未儲存。請再試一次。', 'error');
      } else {
        setStatus('下載完成', 'success');
      }
    } finally {
      state.isImporting = false;
    }
  }

  async function cancelTrackDownload(trackId) {
    if (!activeDownloadIds.has(trackId)) return false;
    if (typeof window.Utawakui.cancelAudioDownload !== 'function') return false;
    return window.Utawakui.cancelAudioDownload(trackId);
  }

  async function cancelImport() {
    cancelRequested = true;
    if (typeof window.Utawakui.cancelAudioDownload !== 'function') return;
    await Promise.allSettled(
      [...activeDownloadIds].map((trackId) =>
        window.Utawakui.cancelAudioDownload(trackId),
      ),
    );
  }

  async function confirmImport() {
    if (state.isImporting) {
      await cancelImport();
      return;
    }
    if (!canConfirmImport.value) return;
    if (!(await ensureProviderFlow())) return;
    if (state.sourceKind === 'single') {
      await importSingle();
      return;
    }
    await importPlaylist();
  }

  async function retryFailedTracks() {
    if (!canRetryFailed.value) return;
    if (!(await ensureProviderFlow())) return;
    selectFailedTracks();
    await importPlaylist();
  }

  function resetCancellation() {
    cancelRequested = false;
  }

  return {
    cancelTrackDownload,
    confirmImport,
    resetCancellation,
    retryFailedTracks,
  };
}
