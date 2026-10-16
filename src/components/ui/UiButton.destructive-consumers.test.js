import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('UiButton destructive consumers', () => {
  it.each([
    [
      'lyrics source deletion',
      '../lyrics/LyricsSourceManagerModal.vue',
      '@click="handleDelete(source)"',
      '../lyrics/LyricsSourceManagerModal.vue',
      'pendingDeleteSource',
    ],
    [
      'session draft clearing',
      '../performance-session/PerformanceSessionWorkspace.vue',
      '@click="clearDraft"',
      '../performance-session/PerformanceSessionWorkspace.vue',
      'useAppConfirmation',
    ],
  ])(
    'marks %s without changing its confirmation owner',
    (_, path, action, confirmationPath, confirmationEvidence) => {
      const component = source(path);
      const buttonStart = component.lastIndexOf(
        '<UiButton',
        component.indexOf(action),
      );
      const button = component.slice(
        buttonStart,
        component.indexOf('>', buttonStart) + 1,
      );

      expect(button).toContain('intent="danger"');
      expect(component).toContain(action);
      expect(source(confirmationPath)).toContain(confirmationEvidence);
      expect(source(confirmationPath)).not.toContain('window.confirm');
    },
  );

  it('keeps library track deletion in the shared danger menu with confirmation in Setlist', () => {
    const trackMenu = source('../track/TrackActionMenu.vue');
    expect(trackMenu).toMatch(
      /id: 'delete-track',[\s\S]*?intent: 'danger',[\s\S]*?action: TRACK_MENU_ACTIONS\.deleteTrack/u,
    );
    const setlist = source('../library/LibraryBrowseContent.vue');
    expect(setlist).toContain('TRACK_MENU_ACTIONS.deleteTrack');
    expect(setlist).toContain('useAppConfirmation');
    expect(setlist).not.toContain('window.confirm');
  });

  it('keeps collection deletion in a danger menu item with confirmation in its action owner', () => {
    const collectionMenu = source('../../utils/collectionMenuItems.js');
    expect(collectionMenu).toMatch(
      /id: 'delete',[\s\S]*?intent: 'danger',[\s\S]*?action: PLAYLIST_MENU_ACTIONS\.delete/u,
    );
    const playlistActions = source('../../composables/usePlaylistActions.js');
    expect(playlistActions).toContain('useAppConfirmation');
    expect(playlistActions).not.toContain('window.confirm');
  });

  it('does not relabel reversible clearing or transport stop as destructive', () => {
    expect(source('../queue/QueuePanel.vue')).not.toContain('intent="danger"');
    expect(source('../settings/OutputRuntimeSettingsBlock.vue')).not.toContain(
      'intent="danger"',
    );
  });
});
