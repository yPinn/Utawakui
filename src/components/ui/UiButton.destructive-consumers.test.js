import { readFileSync } from 'node:fs';
import { baseParse } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function actionControl(component, action) {
  const expression = action.slice('@click="'.length, -1);
  const template = baseParse(parse(component).descriptor.template.content);
  function find(node) {
    if (
      node.type === 1 &&
      ['UiButton', 'UiIconButton'].includes(node.tag) &&
      node.props.some(
        (prop) =>
          prop.type === 7 &&
          prop.name === 'on' &&
          prop.arg?.content === 'click' &&
          prop.exp?.content === expression,
      )
    )
      return node;
    for (const child of node.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  }
  return find(template);
}

describe('UiButton destructive consumers', () => {
  it.each([
    [
      'automatic reference boundary merge',
      '../analysis/MusicAnalysisReferenceEditor.vue',
      '@click="emit(\'remove-boundary\', section.index)"',
      '../analysis/MusicAnalysisReferenceAnnotation.vue',
      'confirmAction',
    ],
    [
      'immediate playlist cover removal',
      '../playlists/PlaylistDetailsModal.vue',
      '@click="emit(\'clearCover\')"',
      '../../composables/usePlaylistActions.js',
      'confirmAction',
    ],
    [
      'separation version cleanup',
      '../settings/LibraryStorageSettingsRow.vue',
      '@click="emit(\'cleanup\')"',
      '../settings/SettingsLibrarySection.vue',
      'handleCleanupLibraryStorage',
    ],
    [
      'stored OBS password removal',
      '../settings/ObsIntegrationSettingsBlock.vue',
      '@click="emit(\'clearPassword\')"',
      '../settings/SettingsCapabilitiesSection.vue',
      'handleClearObsPassword',
    ],
    [
      'lyrics source deletion',
      '../lyrics/LyricsSourceManagerModal.vue',
      '@click="handleDelete(source)"',
      '../lyrics/LyricsSourceManagerModal.vue',
      'pendingDeleteSource',
    ],
  ])(
    'marks %s without changing its confirmation owner',
    (_, path, action, confirmationPath, confirmationEvidence) => {
      const component = source(path);
      const button = actionControl(component, action);
      expect(button, `${path}: ${action}`).not.toBeNull();
      expect(
        button.props.some(
          (prop) =>
            prop.type === 6 &&
            prop.name === 'intent' &&
            prop.value?.content === 'danger',
        ),
      ).toBe(true);
      expect(component).toContain(action);
      expect(source(confirmationPath)).toContain(confirmationEvidence);
      expect(source(confirmationPath)).not.toContain('window.confirm');
    },
  );

  it('keeps session clear and replacement in danger menu items with the original confirmation owner', () => {
    const workspace = source(
      '../performance-session/PerformanceSessionWorkspace.vue',
    );
    expect(workspace.match(/id: 'clear',[\s\S]*?disabled:/u)?.[0]).toContain(
      "intent: 'danger'",
    );
    expect(workspace.match(/id: 'prepare',[\s\S]*?disabled:/u)?.[0]).toContain(
      "intent: hasItems.value ? 'danger' : 'default'",
    );
    expect(workspace).toContain('await clearDraft()');
    expect(workspace).toContain('await prepareSelectedCollection()');
    expect(workspace).toContain('useAppConfirmation');
    expect(workspace).not.toContain('window.confirm');
  });
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
    for (const path of [
      '../library/ArtworkPreviewPane.vue',
      '../analysis/MusicAnalysisSelectionToolbar.vue',
      '../separation/SeparationToolbarList.vue',
      '../import/ImportCollectionExecutionList.vue',
      '../output/ObsOutputRuntimeStatus.vue',
    ])
      expect(source(path), path).not.toContain('intent="danger"');
  });

  it('marks durable playlist membership loss while preserving the emergency cut exception', () => {
    expect(
      source('../track/TrackActionMenu.vue').match(
        /id: 'remove-from-playlist',[\s\S]*?value:/u,
      )?.[0],
    ).toContain("intent: 'danger'");
    expect(source('../library/LibraryBrowseContent.vue')).toContain(
      'await confirmRemovePlaylistTrack(track, value.playlistId)',
    );
    expect(
      source('../library/LibraryBrowseContent.vue').match(
        /id: ARTIST_PHOTO_ACTIONS.clear,[\s\S]*?value:/u,
      )?.[0],
    ).toContain("intent: 'danger'");
    expect(source('../library/LibraryBrowseContent.vue')).toContain(
      'void confirmClearArtistPhoto()',
    );
    expect(source('../bgm/BgmPlayerTransport.vue')).toMatch(
      /label="立即停止 BGM（不淡出）"\s*intent="danger"/u,
    );
  });
  it.each([
    [
      '../analysis/MusicAnalysisReferenceAnnotation.vue',
      '@click="openWorklist"',
      "annotation.dirty.value ? 'danger' : 'neutral'",
    ],
  ])(
    'only marks replacement as destructive when existing work would be lost: %s',
    (path, action, expression) => {
      const button = actionControl(source(path), action);
      expect(
        button.props.find(
          (prop) =>
            prop.type === 7 &&
            prop.name === 'bind' &&
            prop.arg?.content === 'intent',
        )?.exp?.content,
      ).toBe(expression);
    },
  );
});
