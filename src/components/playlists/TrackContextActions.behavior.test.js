import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import TrackContextActions from './TrackContextActions.vue';

describe('TrackContextActions', () => {
  it('bridges the hero More action to the established track menu and metadata modal', () => {
    expect(TrackContextActions).toBeTruthy();
    const source = readFileSync(
      new URL('./TrackContextActions.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      "import { Ellipsis } from '../../icons/index.js';",
    );
    expect(source).toContain(
      "import TrackActionMenu from '../track/TrackActionMenu.vue';",
    );
    expect(source).toContain(
      "import TrackMetadataModal from '../library/TrackMetadataModal.vue';",
    );
    expect(source).toContain('variant="overlay"');
    expect(source).toContain('label="歌曲選項"');
    expect(source).toContain('context="current"');
    expect(source).toContain('@select="handleTrackMenuSelect"');
    expect(source).toContain('@close="closeTrackMenu"');
  });

  it('reuses current queue, playlist, album, and metadata authorities without adding transport controls', () => {
    const source = readFileSync(
      new URL('./TrackContextActions.vue', import.meta.url),
      'utf8',
    );

    for (const action of [
      'TRACK_MENU_ACTIONS.createPlaylist',
      'TRACK_MENU_ACTIONS.addToQueue',
      'TRACK_MENU_ACTIONS.addToPlaylist',
      'TRACK_MENU_ACTIONS.editMetadata',
      'TRACK_MENU_ACTIONS.goToAlbum',
    ]) {
      expect(source).toContain(action);
    }
    expect(source).toContain('usePlaybackQueue()');
    expect(source).toContain('usePlaylists()');
    expect(source).toContain('useAlbumNavigation()');
    expect(source).toContain(
      'useTrackMetadataEditor({ refresh: refreshLibrary })',
    );
    expect(source).not.toMatch(/\b(?:playTrack|togglePlayerPlayback|seek)\b/u);
  });
});
