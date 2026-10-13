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
    expect(source).toContain(
      "import TrackMetadataModal from '../../library/TrackMetadataModal.vue';",
    );
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
      "validator: (value) => ['current', 'queued', 'source'].includes(value)",
    );
    expect(source).toContain(
      "validator: (value) => ['overlay', 'row'].includes(value)",
    );
    expect(source).toContain(
      "import RightDockTrackMenuButton from '../../queue/RightDockTrackMenuButton.vue';",
    );
    expect(source).toContain('v-if="trigger === \'overlay\'"');
    expect(source).toContain(':menu-open="Boolean(trackMenu)"');
    expect(source).toContain('defineExpose({ open: openTrackMenu });');
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
    expect(source).toContain(
      'useTrackMetadataEditor({ refresh: refreshLibrary })',
    );
    expect(source).not.toMatch(/\b(?:playTrack|togglePlayerPlayback|seek)\b/u);
  });

  it('binds the metadata modal to the public editor refs and readonly state contract', () => {
    const source = readFileSync(
      new URL('./TrackContextActions.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('v-if="trackMetadataEditor.isOpen.value"');
    expect(source).toContain(':title="trackMetadataEditor.state.titleDraft"');
    expect(source).toContain(':artist="trackMetadataEditor.state.artistDraft"');
    expect(source).toContain(
      ':thumbnail-url="trackMetadataEditor.state.artworkPreviewUrl"',
    );
    expect(source).toContain(':saving="trackMetadataEditor.state.isSaving"');
    expect(source).toContain(':dirty="trackMetadataEditor.isDirty.value"');
    expect(source).not.toContain('trackMetadataEditor.state.open');
  });
});
