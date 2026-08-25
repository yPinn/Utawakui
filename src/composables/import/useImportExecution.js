import {
  describeDownloadFailure,
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import {
  getPlaylistImportStats,
  hasImportableSelection,
} from '../../utils/importPlaylist.js';
import { usePlaylists } from '../usePlaylists.js';

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

  async function importSingle() {
    const input = state.input.trim();
    const downloadInput =
      state.singleTrack?.downloadInput ||
      state.singleTrack?.playbackVideoId ||
      input;
    setStatus('下載中...', 'pending');
    state.isImporting = true;

    try {
      const result = await window.Utawakui.downloadAudio(downloadInput);
      if (state.singleTrack) state.singleTrack.status = 'done';
      setStatus(
        result.title ? `已下載：${result.title}` : '歌曲已下載',
        'success',
      );
      state.sourceKind = 'idle';
    } catch (error) {
      if (handleProviderSetupError(error)) return;
      const failure = describeDownloadFailure(error);
      reportImportError(error, 'download-track', '下載未完成，請再試一次。');
      setStatus(`下載失敗：${failure.label}`, 'error');
      state.failureHint = failure.hint;
    } finally {
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

    try {
      await window.Utawakui.downloadAudio(track.id);
      track.status = 'done';
    } catch (error) {
      track.status = 'error';
      track.errorCode = describeDownloadFailure(error).code;
      reportImportError(error, 'download-track', '部分曲目未下載。');
    }
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
      for (const track of state.playlistTracks) {
        if (cancelRequested) break;
        if (
          !track.selected ||
          track.alreadyDownloaded ||
          track.status === 'done'
        ) {
          continue;
        }
        await downloadPlaylistTrack(track);
      }

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

  function cancelImport() {
    cancelRequested = true;
  }

  async function confirmImport() {
    if (state.isImporting) {
      cancelImport();
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
    confirmImport,
    resetCancellation,
    retryFailedTracks,
  };
}
