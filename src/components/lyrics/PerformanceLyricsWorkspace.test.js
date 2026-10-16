import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const controls = readFileSync(
  new URL('./LyricsDisplayControls.vue', import.meta.url),
  'utf8',
);
const source = readFileSync(
  new URL('./PerformanceLyricsWorkspace.vue', import.meta.url),
  'utf8',
);

describe('PerformanceLyricsWorkspace live controls', () => {
  it('shares the source control and manager without navigating to authoring', () => {
    expect(source).toContain('<LyricsDisplayControls');
    expect(source).toContain('<LyricsSourceManagerModal');
    expect(source).toContain('@source-change="selectSource"');
    expect(source).toContain('@manage-sources="openSourceManager"');
    expect(source).toContain(':is-loading-sources="state.isLoadingLyrics"');
    expect(source).not.toContain('sourceOptions.length < 2');
    expect(source).toContain('@click="openLyricsAuthoring"');
    expect(source).not.toContain('searchLyricsCandidates');
    expect(source).not.toContain('deleteLyricsSource');
  });

  it('uses the reading option as the single prepare and retry entry', () => {
    expect(controls).toContain('@reselect="selectReadingVariant"');
    expect(controls).toContain('正在產生讀音…');
    expect(controls).toContain('正在讀取讀音…');
    expect(source).not.toContain('action-label=');
    expect(source).not.toContain('generateSelectedReading');
  });

  it('keeps only display and edit on the toolbar, settings in one popover', () => {
    const actions = source.slice(
      source.indexOf('<template #actions>'),
      source.indexOf('</AppFolderWorkspaceToolbar>'),
    );
    const popover = actions.slice(
      actions.indexOf('<UiPopover'),
      actions.indexOf('</UiPopover>'),
    );
    expect(popover).toContain('aria-label="歌詞顯示設定"');
    expect(popover).toContain('<LyricsDisplayControls');
    expect(controls).toContain('aria-label="歌詞讀音顯示"');
    expect(controls).toContain('role="status"');
    expect(controls).toContain('label="放大歌詞"');
    expect(actions.slice(actions.indexOf('</UiPopover>'))).toContain(
      '編輯歌詞',
    );
    expect(source).toContain('presentation="sheet"');
  });
});
