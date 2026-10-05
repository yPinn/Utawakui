import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('UiButton destructive consumers', () => {
  it.each([
    [
      'library track deletion',
      '../../views/SetlistView.vue',
      '@click="removeTrack(track)"',
      '../../views/SetlistView.vue',
    ],
    [
      'lyrics source deletion',
      '../lyrics/LyricsSourceManagerModal.vue',
      '@click="handleDelete(source)"',
      '../lyrics/LyricsSourceManagerModal.vue',
    ],
    [
      'session draft clearing',
      '../performance-session/PerformanceSessionWorkspace.vue',
      '@click="clearDraft"',
      '../performance-session/PerformanceSessionWorkspace.vue',
    ],
  ])(
    'marks %s without changing its confirmation owner',
    (_, path, action, confirmationPath) => {
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
      expect(source(confirmationPath)).toContain('window.confirm');
    },
  );

  it('keeps collection deletion in a danger menu item with confirmation in its action owner', () => {
    const collectionMenu = source('../../utils/collectionMenuItems.js');
    expect(collectionMenu).toMatch(
      /key: 'delete',[\s\S]*?danger: true,[\s\S]*?action: PLAYLIST_MENU_ACTIONS\.delete/u,
    );
    expect(source('../../composables/usePlaylistActions.js')).toContain(
      'window.confirm',
    );
  });

  it('does not relabel reversible clearing or transport stop as destructive', () => {
    expect(source('../queue/QueuePanel.vue')).not.toContain('intent="danger"');
    expect(source('../output/ObsOutputSettings.vue')).not.toContain(
      'intent="danger"',
    );
  });
});
