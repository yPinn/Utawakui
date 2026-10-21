// Pure navigation-location model for the renderer history (ADR 0025). A location
// is a place the operator can return to, never application state: playback,
// queue, search, sort, row selection and the Performance tool are not part of it.
// An archived performance's session id is a collection location, like a playlist.

export const HISTORY_VIEWS = Object.freeze([
  'library',
  'performance',
  'display',
  'settings',
]);

const TRACKED_VIEWS = new Set(HISTORY_VIEWS);

function librarySelection(selection) {
  return Object.freeze({
    playlistId: selection?.playlistId ?? null,
    artistId: selection?.artistId ?? null,
    albumReference: selection?.albumReference ?? null,
    libraryView: selection?.libraryView ?? 'all',
  });
}

// Settings keys on the destination alone: the view it returns to is restore data,
// not identity.
export function createNavigationLocation({
  view,
  libraryWorkspace,
  returnView,
  selection,
  performanceArchiveId,
}) {
  if (!TRACKED_VIEWS.has(view)) return null;

  if (view === 'library') {
    const workspace = libraryWorkspace ?? 'browse';
    const frozenSelection = librarySelection(selection);
    return Object.freeze({
      key: JSON.stringify([
        view,
        workspace,
        frozenSelection.playlistId,
        frozenSelection.artistId,
        frozenSelection.albumReference,
        frozenSelection.libraryView,
      ]),
      view,
      workspace,
      returnView: null,
      selection: frozenSelection,
    });
  }

  if (view === 'performance' && performanceArchiveId) {
    return Object.freeze({
      key: JSON.stringify([view, 'archive', performanceArchiveId]),
      view,
      archiveId: performanceArchiveId,
      workspace: null,
      returnView: null,
      selection: null,
    });
  }

  return Object.freeze({
    key: view,
    view,
    workspace: null,
    returnView: view === 'settings' ? (returnView ?? 'library') : null,
    selection: null,
  });
}

// Only a deleted playlist is detectable; artist and album-reference pages render
// their own empty state when the target has vanished.
export function isNavigationLocationValid(location, playlistIds) {
  const playlistId = location?.selection?.playlistId;
  return playlistId == null || playlistIds.has(playlistId);
}
