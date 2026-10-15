import { describe, expect, it } from 'vitest';
import {
  createNavigationLocation,
  HISTORY_VIEWS,
  isNavigationLocationValid,
} from './navigationLocation.js';

const ALL_SELECTION = {
  playlistId: null,
  artistId: null,
  albumReference: null,
  libraryView: 'all',
};

function library(overrides = {}) {
  return createNavigationLocation({
    view: 'library',
    libraryWorkspace: 'browse',
    returnView: 'library',
    selection: { ...ALL_SELECTION, ...overrides },
  });
}

describe('createNavigationLocation', () => {
  it('records only the four product destinations', () => {
    expect(HISTORY_VIEWS).toEqual([
      'library',
      'performance',
      'display',
      'settings',
    ]);

    for (const view of [
      'music-analysis',
      'diagnostics-workbench',
      'lyrics-provider-review',
      'visual-system',
      '',
      undefined,
    ]) {
      expect(
        createNavigationLocation({
          view,
          libraryWorkspace: 'browse',
          returnView: 'library',
          selection: ALL_SELECTION,
        }),
      ).toBe(null);
    }
  });

  it('captures the library workspace and selection', () => {
    expect(library({ playlistId: 'playlist-a' })).toMatchObject({
      view: 'library',
      workspace: 'browse',
      returnView: null,
      selection: {
        playlistId: 'playlist-a',
        artistId: null,
        albumReference: null,
        libraryView: 'all',
      },
    });
  });

  it('distinguishes every library selection and workspace by key', () => {
    const keys = [
      library().key,
      library({ libraryView: 'local' }).key,
      library({ playlistId: 'playlist-a' }).key,
      library({ playlistId: 'playlist-b' }).key,
      library({ artistId: 'artist-a' }).key,
      library({ albumReference: 'Album A' }).key,
      createNavigationLocation({
        view: 'library',
        libraryWorkspace: 'lyrics-authoring',
        returnView: 'library',
        selection: ALL_SELECTION,
      }).key,
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the same key for the same library location', () => {
    expect(library({ playlistId: 'playlist-a' }).key).toBe(
      library({ playlistId: 'playlist-a' }).key,
    );
  });

  it('ignores workspace and selection outside the library', () => {
    const performance = createNavigationLocation({
      view: 'performance',
      libraryWorkspace: 'lyrics-authoring',
      returnView: 'performance',
      selection: { ...ALL_SELECTION, playlistId: 'playlist-a' },
    });

    expect(performance).toMatchObject({
      view: 'performance',
      key: 'performance',
      workspace: null,
      selection: null,
      returnView: null,
    });
    expect(
      createNavigationLocation({
        view: 'display',
        libraryWorkspace: 'browse',
        returnView: 'display',
        selection: ALL_SELECTION,
      }).key,
    ).toBe('display');
  });

  it('keeps the Settings return view out of the key', () => {
    const fromLibrary = createNavigationLocation({
      view: 'settings',
      libraryWorkspace: 'browse',
      returnView: 'library',
      selection: ALL_SELECTION,
    });
    const fromDisplay = createNavigationLocation({
      view: 'settings',
      libraryWorkspace: 'browse',
      returnView: 'display',
      selection: ALL_SELECTION,
    });

    expect(fromLibrary).toMatchObject({
      key: 'settings',
      returnView: 'library',
      workspace: null,
      selection: null,
    });
    expect(fromDisplay.key).toBe(fromLibrary.key);
    expect(fromDisplay.returnView).toBe('display');
  });

  it('returns immutable locations', () => {
    const location = library({ playlistId: 'playlist-a' });

    expect(Object.isFrozen(location)).toBe(true);
    expect(Object.isFrozen(location.selection)).toBe(true);
  });
});

describe('isNavigationLocationValid', () => {
  const playlistIds = new Set(['playlist-a']);

  it('requires the selected playlist to still exist', () => {
    expect(
      isNavigationLocationValid(
        library({ playlistId: 'playlist-a' }),
        playlistIds,
      ),
    ).toBe(true);
    expect(
      isNavigationLocationValid(library({ playlistId: 'gone' }), playlistIds),
    ).toBe(false);
  });

  it('accepts locations that do not reference a playlist', () => {
    expect(isNavigationLocationValid(library(), playlistIds)).toBe(true);
    expect(
      isNavigationLocationValid(library({ artistId: 'artist-a' }), playlistIds),
    ).toBe(true);
    expect(
      isNavigationLocationValid(
        library({ albumReference: 'Album A' }),
        playlistIds,
      ),
    ).toBe(true);
    expect(
      isNavigationLocationValid(
        createNavigationLocation({
          view: 'display',
          libraryWorkspace: 'browse',
          returnView: 'display',
          selection: ALL_SELECTION,
        }),
        playlistIds,
      ),
    ).toBe(true);
  });
});
