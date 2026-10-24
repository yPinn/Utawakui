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
      "import { Ellipsis } from '../../../icons/index.js';",
    );
    expect(source).toContain(
      "import TrackActionMenu from '../../track/TrackActionMenu.vue';",
    );
    expect(source).toContain('useSongEditor');
    expect(source).not.toContain('TrackMetadataModal');
    expect(source).toContain('variant="overlay"');
    expect(source).toContain('label="歌曲選項"');
    expect(source).toContain(':context="context"');
    expect(source).toContain('@select="handleTrackMenuSelect"');
    expect(source).toContain('@close="closeTrackMenu"');
  });

  it('adapts the same menu controller to overlay and Right Dock row triggers', () => {
    const source = readFileSync(
      new URL('./TrackContextActions.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      "['current', 'queued', 'source', 'editor'].includes(value)",
    );
    expect(source).toContain(
      "validator: (value) => ['overlay', 'row', 'inline'].includes(value)",
    );
    expect(source).toContain(
      "import RightDockTrackMenuButton from '../../queue/RightDockTrackMenuButton.vue';",
    );
    expect(source).toContain('v-if="trigger === \'overlay\'"');
    expect(source).toContain(':menu-open="Boolean(trackMenu)"');
    expect(source).toContain('defineExpose({ open: openTrackMenu });');
    expect(source).toContain('v-else-if="trigger === \'inline\'"');
    expect(source).toContain("emit('openChange', true)");
    expect(source).toContain("emit('openChange', false)");
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
      'TRACK_MENU_ACTIONS.removeFromQueue',
    ]) {
      expect(source).toContain(action);
    }
    expect(source).toContain('removeQueuedTrack(track.id)');
    expect(source).toContain('usePlaybackQueue()');
    expect(source).toContain('usePlaylists()');
    expect(source).toContain('useAlbumNavigation()');
    expect(source).toContain('useSongEditor()');
    expect(source).not.toMatch(/\b(?:playTrack|togglePlayerPlayback|seek)\b/u);
  });

  it('routes editing to the shared workspace and exposes context-specific unlink intent', () => {
    const source = readFileSync(
      new URL('./TrackContextActions.vue', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('<TrackMetadataModal');
    expect(source).toContain('await songEditor.open(track)');
    expect(source).toContain(':can-unlink-work="canUnlinkWork"');
    expect(source).toContain("emit('unlinkWork')");
  });
});
