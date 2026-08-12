// 'selected' isn't a filter tab — checkbox state is already visible per-row
// in the list, and the toolbar's 選取未下載/全選/重試失敗 actions already
// manipulate + auto-switch to the relevant status filter (see
// useImportSession.js's selectMissingTracks/selectFailedTracks). A separate
// tab for it would just duplicate what's below.
export const IMPORT_FILTERS = Object.freeze([
  { key: 'all', label: '全部' },
  { key: 'missing', label: '未下載' },
  { key: 'downloaded', label: '已下載' },
  { key: 'failed', label: '失敗' },
]);

function isDone(track) {
  return track?.status === 'done';
}

function isFailed(track) {
  return track?.status === 'error';
}

function isDownloading(track) {
  return track?.status === 'downloading';
}

function isAlreadyDownloaded(track) {
  return Boolean(track?.alreadyDownloaded);
}

function isDownloadable(track) {
  return !isAlreadyDownloaded(track) && !isDone(track);
}

export function getPlaylistImportStats(tracks) {
  const source = Array.isArray(tracks) ? tracks : [];

  return source.reduce(
    (stats, track) => {
      stats.total += 1;
      if (track.selected) stats.selected += 1;
      if (isAlreadyDownloaded(track)) stats.alreadyDownloaded += 1;
      if (track.status === 'pending' && !isAlreadyDownloaded(track)) {
        stats.pending += 1;
      }
      if (isDownloading(track)) stats.downloading += 1;
      if (isDone(track)) stats.done += 1;
      if (isFailed(track)) stats.error += 1;
      if (track.selected && isDownloadable(track)) {
        stats.downloadableSelected += 1;
      }
      if (isAlreadyDownloaded(track) || isDone(track)) stats.completedLike += 1;
      return stats;
    },
    {
      total: 0,
      selected: 0,
      alreadyDownloaded: 0,
      pending: 0,
      downloading: 0,
      done: 0,
      error: 0,
      downloadableSelected: 0,
      completedLike: 0,
    },
  );
}

export function filterPlaylistImportTracks(tracks, filter) {
  const source = Array.isArray(tracks) ? tracks : [];

  if (filter === 'selected') {
    return source.filter((track) => track.selected);
  }

  if (filter === 'missing') {
    return source.filter(
      (track) => !isAlreadyDownloaded(track) && !isDone(track),
    );
  }

  if (filter === 'downloaded') {
    return source.filter(
      (track) => isAlreadyDownloaded(track) || isDone(track),
    );
  }

  if (filter === 'failed') {
    return source.filter(isFailed);
  }

  return source;
}

// Any selected track counts, not just ones that still need downloading — a
// selected already-downloaded track still needs to end up in the synced
// playlist/album's trackIds (see useImportSession.js's syncImportedPlaylist).
export function hasImportableSelection(tracks) {
  return (Array.isArray(tracks) ? tracks : []).some((track) => track.selected);
}
