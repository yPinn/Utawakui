import fs from 'fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = fs.readFileSync(
  new URL('./LyricsWorkspace.vue', import.meta.url),
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

describe('LyricsWorkspace information hierarchy', () => {
  it('orders preparation above the reader and overlays compact live controls after it', () => {
    const headerIndex = workspaceSource.indexOf('<LyricsWorkspaceHeader');
    const preparationIndex = workspaceSource.indexOf('<LyricsPreparationBar');
    const readerIndex = workspaceSource.indexOf('<LyricsDocumentPanel');
    const liveControlsIndex = workspaceSource.indexOf('<LyricsLiveControls');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(preparationIndex).toBeGreaterThan(headerIndex);
    expect(readerIndex).toBeGreaterThan(preparationIndex);
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

  it('keeps preparation controls compact while preserving accessible names', () => {
    const preparationSource = readComponent('./LyricsPreparationBar.vue');

    expect(preparationSource).toContain('閱讀與預先設定');
    expect(preparationSource).toContain('>來源<');
    expect(preparationSource).toMatch(/>\s*管理\s*</);
    expect(preparationSource).toContain('>讀音<');
    expect(preparationSource).toContain('>字級<');
    expect(preparationSource).not.toContain('伴奏準備');
    expect(preparationSource).toContain('lyrics-preparation__label');
    expect(preparationSource).toContain('border-inline-start');
    expect(preparationSource).not.toContain('歌詞時間偏移');
    expect(preparationSource).not.toContain('已自動套用');
    expect(preparationSource).not.toContain('重新建立讀音資料');
    expect(preparationSource).not.toContain('重試建立讀音資料');
    expect(preparationSource).not.toContain('isGeneratingReading');
    expect(preparationSource).not.toContain('hasReadingDocument');
    expect(preparationSource).not.toContain("emit('generateReading')");
    expect(preparationSource).not.toMatch(/>\s*產生\s*</);
    expect(preparationSource).toContain('@container (max-width: 46rem)');
    expect(preparationSource).toContain('flex-wrap: wrap');
    expect(preparationSource).toContain('.lyrics-preparation__group--source {');
    expect(preparationSource).toContain('min-width: 0');
    expect(preparationSource).toContain('<UiNotice');
    expect(preparationSource).toContain(':message="readingError"');
    expect(preparationSource).toContain('tone="danger"');
    expect(preparationSource).not.toContain('data-message');
    expect(workspaceSource).not.toContain(':is-generating-reading=');
    expect(workspaceSource).not.toContain('@generate-reading=');
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

  it('keeps a visible track picker and moves the shared model control into the header', () => {
    const headerSource = readComponent('./LyricsWorkspaceHeader.vue');

    expect(headerSource).toContain('title="選擇歌詞曲目"');
    expect(headerSource).toContain('aria-label="選擇歌詞曲目"');
    expect(headerSource).toMatch(/>\s*選曲\s*</);
    expect(headerSource).toContain('<SeparationPresetControl');
    expect(headerSource).toContain('lyrics-workspace-header__divider');
    expect(workspaceSource).toContain('container-type: inline-size');
    expect(headerSource).toContain('@container (max-width: 48rem)');
    expect(headerSource).not.toContain('@media (max-width: 900px)');
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
});
