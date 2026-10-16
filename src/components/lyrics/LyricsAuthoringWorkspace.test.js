import fs from 'fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = fs.readFileSync(
  new URL('./LyricsAuthoringWorkspace.vue', import.meta.url),
  'utf8',
);
const liveToolSource = fs.readFileSync(
  new URL('./LyricsLiveTool.vue', import.meta.url),
  'utf8',
);
const documentPanelSource = fs.readFileSync(
  new URL('./LyricsDocumentPanel.vue', import.meta.url),
  'utf8',
);
const timingToolbarSource = fs.readFileSync(
  new URL('./LyricsTimingToolbar.vue', import.meta.url),
  'utf8',
);
const segmentEditorSource = fs.readFileSync(
  new URL('./LyricsSegmentEditor.vue', import.meta.url),
  'utf8',
);

function readComponent(filename) {
  const url = new URL(filename, import.meta.url);
  return fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '';
}

describe('LyricsAuthoringWorkspace information hierarchy', () => {
  it('orders preparation above the reader and overlays compact live controls after it', () => {
    const headerIndex = workspaceSource.indexOf('<LyricsWorkspaceHeader');
    const preparationIndex = workspaceSource.indexOf('<LyricsPreparationBar');
    const liveToolIndex = workspaceSource.indexOf('<LyricsLiveTool');
    const readerIndex = liveToolSource.indexOf('<LyricsDocumentPanel');
    const liveControlsIndex = liveToolSource.indexOf('<LyricsLiveControls');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(preparationIndex).toBeGreaterThan(headerIndex);
    expect(liveToolIndex).toBeGreaterThan(preparationIndex);
    expect(readerIndex).toBeGreaterThan(-1);
    expect(liveControlsIndex).toBeGreaterThan(readerIndex);
    expect(workspaceSource).toContain(
      'grid-template-rows: auto auto auto minmax(0, 1fr)',
    );
    expect(workspaceSource).not.toContain(
      'grid-template-rows: auto auto auto minmax(0, 1fr) auto',
    );
  });

  it('keeps low-value library scope counts out of the reader header', () => {
    expect(workspaceSource).not.toContain('trackScopeSummary');
    expect(workspaceSource).not.toContain('TRACK_SCOPE_LABELS');
  });

  it('uses the shared controls inside the bounded preparation bar', () => {
    const preparationSource = readComponent('./LyricsPreparationBar.vue');
    const controls = readComponent('./LyricsDisplayControls.vue');
    expect(preparationSource).toContain('閱讀與預先設定');
    expect(preparationSource).toContain('<LyricsDisplayControls');
    expect(preparationSource).not.toContain('layout="inline"');
    expect(preparationSource).not.toContain('<select');
    expect(controls).toContain('<LyricsSourceControl');
    expect(controls).toContain('<UiSegmentedControl');
    expect(controls).toContain('<UiIconButton');
    expect(controls).toContain('<UiNotice');
    expect(controls).toContain('flex-wrap: wrap');
    expect(workspaceSource).toContain('useLyricsDisplay');
  });

  it('keeps playback-time adjustment as the original compact floating cluster', () => {
    const liveControlsSource = readComponent('./LyricsLiveControls.vue');

    expect(liveControlsSource).toContain('延後 0.1 秒');
    expect(liveControlsSource).toContain('提前 0.1 秒');
    expect(liveControlsSource).toMatch(/>\s*延後\s*</);
    expect(liveControlsSource).toMatch(/>\s*提前\s*</);
    expect(liveControlsSource).toContain("emit('adjustOffset', -0.1)");
    expect(liveControlsSource).toContain("emit('adjustOffset', 0.1)");
    expect(liveControlsSource).toContain("emit('resetOffset')");
    expect(liveControlsSource).not.toContain('lyrics-live-controls__copy');
    expect(liveControlsSource).not.toContain('sourceLabel');
    expect(liveControlsSource).not.toContain('isSaving');
    expect(liveControlsSource).toContain('position: absolute');
    expect(liveControlsSource).toContain('--ui-lyrics-live-control-height');
    expect(documentPanelSource).toContain('--ui-lyrics-live-safe-area');
  });

  it('puts track actions in the shared edit menu and removes duplicate separation controls', () => {
    const headerSource = readComponent('./LyricsWorkspaceHeader.vue');
    expect(headerSource).toContain('<UiActionMenu');
    expect(headerSource).toContain("label: '選擇曲目'");
    expect(headerSource).toContain("label: '重新掃描歌詞'");
    expect(headerSource).not.toContain('SeparationPresetControl');
    expect(headerSource).toContain('<AppFolderWorkspaceToolbar');
  });

  it('exposes the scrolling lyrics reader as a keyboard-focusable region', () => {
    expect(documentPanelSource).toContain('aria-label="歌詞內容"');
    expect(documentPanelSource).toContain('tabindex="0"');
  });

  it('keeps manual lyrics browsing separate from playback and offers one circular return action', () => {
    expect(workspaceSource).toContain(
      ':document-id="lyricsDocument.documentId"',
    );
    expect(documentPanelSource).toContain('isFollowingActiveLine');
    expect(documentPanelSource).toContain(
      '@wheel.passive="pauseActiveLineFollowing"',
    );
    expect(documentPanelSource).toContain(
      '@touchmove.passive="pauseActiveLineFollowing"',
    );
    expect(documentPanelSource).toContain('@keydown="handleLyricsScrollKey"');
    expect(documentPanelSource).toContain('@scroll="handleLyricsScroll"');
    expect(documentPanelSource).toContain('<UiIconButton');
    expect(documentPanelSource).toContain('label="回到目前歌詞"');
    expect(documentPanelSource).toContain(':icon="LocateFixed"');
    expect(documentPanelSource).toContain('size="lg"');
    expect(documentPanelSource).toContain('shape="circle"');
  });

  it('keys repeated lyric rows by canonical line identity', () => {
    expect(documentPanelSource).toContain(':key="line.lineId"');
    expect(documentPanelSource).not.toContain(
      ':key="`${line.start}-${index}`"',
    );
  });

  it('keeps internal granularity out of the idle workspace and shows timing tools contextually', () => {
    expect(workspaceSource).toContain(
      '<div v-if="timingDraft" class="lyrics-timing-stack">',
    );
    expect(timingToolbarSource).toContain('逐字校時');
    expect(timingToolbarSource).toContain('已記錄');
    expect(timingToolbarSource).not.toContain('記錄目前播放位置');
    expect(timingToolbarSource).toMatch(/>\s*復原\s*</);
    expect(timingToolbarSource).toMatch(/>\s*儲存\s*</);
    expect(timingToolbarSource).toMatch(/>\s*取消\s*</);
    expect(timingToolbarSource).not.toContain('時間顆粒度');
    expect(timingToolbarSource).not.toContain('granularity');
    expect(segmentEditorSource).toContain('下一個起點');
    expect(segmentEditorSource).toContain('記錄位置');
    expect(segmentEditorSource).toContain('lyrics-segment-editor__adjustment');
    expect(segmentEditorSource).toContain(
      'lyrics-segment-editor__word--current',
    );
  });

  it('keeps the live tool in the bounded reader row with or without timing tools', () => {
    expect(workspaceSource).toContain(
      '<div v-if="timingDraft" class="lyrics-timing-stack">',
    );
    expect(workspaceSource).toContain('class="lyrics-stage__live-tool"');
    expect(workspaceSource).toMatch(
      /\.lyrics-timing-stack\s*\{(?=[^}]*grid-row:\s*3)[^}]*\}/su,
    );
    expect(workspaceSource).toMatch(
      /\.lyrics-stage__live-tool\s*\{(?=[^}]*grid-row:\s*4)[^}]*\}/su,
    );
  });
});
