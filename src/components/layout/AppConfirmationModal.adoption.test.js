import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const GLOBAL_CONFIRMATION_OWNERS = [
  '../../views/SettingsView.vue',
  '../../views/SetlistView.vue',
  '../../composables/usePlaylistActions.js',
  '../performance-session/PerformanceSessionWorkspace.vue',
  '../performance-session/PerformanceSessionPanel.vue',
  '../analysis/MusicAnalysisReferenceAnnotation.vue',
];

describe('App confirmation adoption', () => {
  it('mounts one confirmation presenter at the App root', () => {
    const app = source('../../App.vue');

    expect(app).toContain(
      "import AppConfirmationModal from './components/layout/AppConfirmationModal.vue'",
    );
    expect(app).toContain('<AppConfirmationModal />');
  });

  it.each(GLOBAL_CONFIRMATION_OWNERS)(
    'replaces blocking window.confirm in %s with the shared async owner',
    (path) => {
      const component = source(path);

      expect(component).not.toContain('window.confirm');
      expect(component).toContain('useAppConfirmation');
    },
  );

  it('keeps lyrics-source deletion inside its existing modal instead of stacking another modal', () => {
    const manager = source('../lyrics/LyricsSourceManagerModal.vue');

    expect(manager).not.toContain('window.confirm');
    expect(manager).not.toContain('useAppConfirmation');
    expect(manager).toContain('pendingDeleteSource');
    expect(manager).toContain('取消刪除');
    expect(manager).toContain('確認刪除歌詞來源');
  });

  it('gives collection deletion one compact value pair instead of embedding values in prose', () => {
    const actions = source('../../composables/usePlaylistActions.js');

    expect(actions).toContain('subject: name');
    expect(actions).toContain('meta: `${playlist.trackIds.length} 首曲目`');
    expect(actions).toContain(
      'message: `只會移除${collectionType}，不會刪除音檔。`',
    );
    expect(actions).not.toContain('「${name}」包含');
  });
});
