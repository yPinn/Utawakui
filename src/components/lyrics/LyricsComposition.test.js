import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readComponent(filename) {
  const url = new URL(filename, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('lyrics contextual compositions', () => {
  it('removes the legacy destination adapters after contextual cutover', () => {
    const workspaceUrl = new URL('./LyricsWorkspace.vue', import.meta.url);
    const viewUrl = new URL('../../views/LyricsView.vue', import.meta.url);

    expect(existsSync(workspaceUrl)).toBe(false);
    expect(existsSync(viewUrl)).toBe(false);
  });

  it('keeps acquisition and correction controls in the Library authoring composition', () => {
    const source = readComponent('./LyricsAuthoringWorkspace.vue');

    expect(source).toContain('<LyricsWorkspaceHeader');
    expect(source).toContain('<LyricsPreparationBar');
    expect(source).toContain('<LyricsTimingToolbar');
    expect(source).toContain('<LyricsSegmentEditor');
    expect(source).toContain('<LyricsTrackPickerModal');
    expect(source).toContain('<LyricsSourceManagerModal');
    expect(source).toContain('<LyricsLiveTool');
    expect(source).not.toContain("from './LyricsDocumentPanel.vue'");
    expect(source).not.toContain("from './LyricsLiveControls.vue'");
    expect(source).toContain('selection-hint="從「編輯 → 選擇曲目」開始。"');
    expect(source).toContain(
      'unchecked-hint="從「編輯 → 重新掃描歌詞」檢查歌詞。"',
    );
  });

  it('owns the reader and synchronization controls in a reusable live tool', () => {
    const source = readComponent('./LyricsLiveTool.vue');

    expect(source).toContain(
      "import LyricsDocumentPanel from './LyricsDocumentPanel.vue';",
    );
    expect(source).toContain(
      "import LyricsLiveControls from './LyricsLiveControls.vue';",
    );
    expect(source).toContain('<LyricsDocumentPanel');
    expect(source).toContain('<LyricsLiveControls');
    expect(source).not.toContain('LyricsWorkspaceHeader');
    expect(source).not.toContain('LyricsPreparationBar');
    expect(source).not.toContain('LyricsSourceManagerModal');
    expect(source).not.toContain('LyricsTimingToolbar');
  });

  it('keeps performance guidance on the available authoring entry instead of an absent edit menu', () => {
    const source = readComponent('./PerformanceLyricsWorkspace.vue');
    expect(source).toContain('selection-hint="從曲庫播放曲目，即可查看歌詞。"');
    expect(source).toContain(
      'unchecked-hint="按「編輯歌詞」，從「編輯」重新掃描。"',
    );
    expect(source).toContain('@click="openLyricsAuthoring"');
  });

  it('uses the shared library scope vocabulary in the track picker', () => {
    const source = readComponent('./LyricsTrackPickerModal.vue');

    expect(source).toContain("label: '全部曲目'");
    expect(source).toContain("label: '本機檔案'");
    expect(source).not.toContain("label: '本機曲目'");
  });

  it('windows long track picker lists inside the scroll region', () => {
    const source = readComponent('./LyricsTrackPickerModal.vue');

    expect(source).toContain('useVirtualList({');
    expect(source).toContain('threshold: () => 100,');
    expect(source).toContain('ref="trackList"');
    expect(source).toContain('v-bind="rowAttrs({ key, index, gap })"');
  });

  it('uses the shared identity-navigation row recipe in the track picker', () => {
    const source = readComponent('./LyricsTrackPickerModal.vue');

    expect(source).toContain(
      "import TrackIdentityRow from '../track/TrackIdentityRow.vue';",
    );
    expect(source).toContain('<TrackIdentityRow');
    expect(source).toContain('navigation="album"');
    expect(source).toContain('@navigate="emit(\'close\')"');
    expect(source).not.toContain('useAlbumNavigation');
    expect(source).not.toContain('jumpableTrackIds');
  });
});
