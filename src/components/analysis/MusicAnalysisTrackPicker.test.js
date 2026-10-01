import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisTrackPicker from './MusicAnalysisTrackPicker.vue';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('./MusicAnalysisTrackPicker.vue', import.meta.url),
  'utf8',
);

describe('MusicAnalysisTrackPicker', () => {
  it('keeps single-track browsing free of batch selection controls', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisTrackPicker, {
        tracks: [{ id: 'track-1', title: 'Selected song' }],
        selectedTrackId: 'track-1',
        disabled: true,
      }),
    );

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('單曲');
    expect(html).toContain('批次選取');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('批次已選');
    expect(html).not.toContain('role="button"');
    expect(source).toContain('<UiSegmentedControl');
  });

  it('renders batch selection controls without completed-row chip noise', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisTrackPicker, {
        mode: 'batch',
        tracks: [
          { id: 'track-1', title: '第一首' },
          { id: 'track-2', title: '第二首' },
        ],
        batchSelectedTrackIds: ['track-1'],
        batchItemsByTrackId: {
          'track-1': { trackId: 'track-1', status: 'completed' },
          'track-2': { trackId: 'track-2', status: 'failed' },
        },
      }),
    );

    expect(html).toContain('批次已選 1 首');
    expect(html).toContain('取消選取搜尋結果');
    expect(html).toContain('清除全部');
    expect(html).toContain('aria-label="選取第一首進行批次分析"');
    expect(html).toContain('checked');
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('>完成<');
    expect(html).toContain('失敗');
    expect(source).toContain('<UiCheckbox');
    expect(source).not.toMatch(/<input\b/gu);
  });

  it('keeps batch entry unavailable until the analysis capability is ready', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisTrackPicker, {
        tracks: [],
        batchAvailable: false,
      }),
    );

    expect(html).toContain('請先到設定準備 BPM 分析');
  });
});
