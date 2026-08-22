import fs from 'fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = fs.readFileSync(
  new URL('./LyricsWorkspace.vue', import.meta.url),
  'utf8',
);

function readComponent(filename) {
  const url = new URL(filename, import.meta.url);
  return fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '';
}

describe('LyricsWorkspace information hierarchy', () => {
  it('orders preparation above the reader and overlays live controls after it', () => {
    const headerIndex = workspaceSource.indexOf('<LyricsWorkspaceHeader');
    const preparationIndex = workspaceSource.indexOf('<LyricsPreparationBar');
    const readerIndex = workspaceSource.indexOf('class="lyrics-preview"');
    const liveControlsIndex = workspaceSource.indexOf('<LyricsLiveControls');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(preparationIndex).toBeGreaterThan(headerIndex);
    expect(readerIndex).toBeGreaterThan(preparationIndex);
    expect(liveControlsIndex).toBeGreaterThan(readerIndex);
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
    expect(preparationSource).toContain('flex-wrap: nowrap');
    expect(preparationSource).toContain('.lyrics-preparation__group--source {');
    expect(preparationSource).toContain('min-width: 0');
    expect(preparationSource).toContain('tabindex="0"');
    expect(preparationSource).toContain(':data-message="readingError"');
    expect(preparationSource).toContain(
      '.lyrics-preparation__error:focus-visible::after',
    );
    expect(
      preparationSource.indexOf('lyrics-preparation__error-slot'),
    ).toBeLessThan(preparationSource.indexOf('>讀音<'));
  });

  it('uses a floating timer-like control for urgent playback-time adjustment', () => {
    const liveControlsSource = readComponent('./LyricsLiveControls.vue');

    expect(liveControlsSource).toContain('即時同步');
    expect(liveControlsSource).toContain('延後 0.1 秒');
    expect(liveControlsSource).toContain('提前 0.1 秒');
    expect(liveControlsSource).toMatch(/>\s*延後\s*</);
    expect(liveControlsSource).toMatch(/>\s*提前\s*</);
    expect(liveControlsSource).toContain("emit('adjustOffset', -0.1)");
    expect(liveControlsSource).toContain("emit('adjustOffset', 0.1)");
    expect(liveControlsSource).toContain("emit('resetOffset')");
    expect(liveControlsSource).not.toContain(
      'lyrics-live-controls__description',
    );
    expect(liveControlsSource).not.toContain('播放中微調歌詞時間');
    expect(liveControlsSource).toContain('position: absolute');
    expect(liveControlsSource).toContain('--ui-lyrics-live-control-height');
    expect(workspaceSource).toContain('--ui-lyrics-live-safe-area');
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
    expect(workspaceSource).toContain('aria-label="歌詞內容"');
    expect(workspaceSource).toContain('tabindex="0"');
  });

  it('keys repeated lyric rows by canonical line identity', () => {
    expect(workspaceSource).toContain(':key="line.lineId"');
    expect(workspaceSource).not.toContain(':key="`${line.start}-${index}`"');
  });
});
