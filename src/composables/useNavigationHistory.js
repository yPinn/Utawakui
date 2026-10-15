import { computed, effectScope, shallowRef, watch } from 'vue';
import { useAppView } from './useAppView.js';
import { usePlaylists } from './usePlaylists.js';
import {
  createNavigationLocation,
  isNavigationLocationValid,
} from '../utils/navigationLocation.js';
import {
  canTraverse,
  createNavigationStack,
  recordLocation,
  traverse,
} from '../utils/navigationHistoryStack.js';

// Renderer navigation history (ADR 0025). Module-scope like useAppView.js and
// usePlaylists.js; the first call starts recording, so App.vue instantiates it
// during setup. It watches the location owners instead of wrapping each caller, so
// sidebar clicks, album jumps and shortcuts are all recorded without changes.

const stack = shallowRef(null);
let scope = null;
let api = null;

function start() {
  if (scope) return;
  const appView = useAppView();
  const playlists = usePlaylists();

  const location = computed(() =>
    createNavigationLocation({
      view: appView.activeView.value,
      libraryWorkspace: appView.libraryWorkspace.value,
      returnView: appView.returnView.value,
      selection: {
        playlistId: playlists.state.selectedId,
        artistId: playlists.state.selectedArtistId,
        albumReference: playlists.state.selectedAlbumReference,
        libraryView: playlists.state.libraryView,
      },
    }),
  );

  const playlistIds = computed(
    () => new Set(playlists.state.playlists.map((playlist) => playlist.id)),
  );
  const isValid = (entry) =>
    isNavigationLocationValid(entry, playlistIds.value);

  function record(next) {
    if (!next) return;
    if (!stack.value) {
      stack.value = createNavigationStack(next);
      return;
    }
    // A dead current entry (its playlist was deleted) is replaced, not kept.
    const current = stack.value.entries[stack.value.index];
    stack.value = recordLocation(stack.value, next, {
      replace: !isValid(current),
    });
  }

  function applyLocation(target) {
    appView.restoreLocation(target);
    const selection = target.selection;
    if (!selection) return;
    if (selection.playlistId) playlists.select(selection.playlistId);
    else if (selection.artistId) playlists.selectArtist(selection.artistId);
    else if (selection.albumReference) {
      playlists.selectAlbumReference(selection.albumReference);
    } else playlists.select(null);
    playlists.setLibraryView(selection.libraryView);
  }

  function move(direction) {
    if (!stack.value) return false;
    const result = traverse(stack.value, direction, isValid);
    if (!result) return false;
    stack.value = result.stack;
    applyLocation(result.entry);
    // The watcher then sees the entry's own key, so the restore is not recorded.
    return true;
  }

  function leaveSettings() {
    if (!appView.isSettingsView.value || !stack.value) return false;
    const previous = traverse(stack.value, -1, isValid)?.entry;
    if (!previous || previous.view !== appView.returnView.value) return false;
    return move(-1);
  }

  scope = effectScope(true);
  scope.run(() => {
    record(location.value);
    watch(
      () => location.value?.key,
      () => record(location.value),
    );
  });

  api = {
    canGoBack: computed(
      () => !!stack.value && canTraverse(stack.value, -1, isValid),
    ),
    canGoForward: computed(
      () => !!stack.value && canTraverse(stack.value, 1, isValid),
    ),
    back: () => move(-1),
    forward: () => move(1),
    leaveSettings,
  };
}

export function useNavigationHistory() {
  start();
  return api;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    scope?.stop();
    scope = null;
    stack.value = null;
  });
}
