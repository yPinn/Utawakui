import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisTrackPicker from './MusicAnalysisTrackPicker.vue';

describe('MusicAnalysisTrackPicker', () => {
  it('exposes selected and busy states to assistive technology', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisTrackPicker, {
        tracks: [{ id: 'track-1', title: 'Selected song' }],
        selectedTrackId: 'track-1',
        selectedLevel: 'M1',
        disabled: true,
      }),
    );

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('role="button"');
  });

  it('renders batch selection controls and per-track status', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisTrackPicker, {
        tracks: [
          { id: 'track-1', title: '第一首' },
          { id: 'track-2', title: '第二首' },
        ],
        batchSelectedTrackIds: ['track-1'],
        batchItemsByTrackId: {
          'track-1': { trackId: 'track-1', status: 'completed' },
          'track-2': { trackId: 'track-2', status: 'pending' },
        },
      }),
    );

    expect(html).toContain('已選 1 首');
    expect(html).toContain('選取篩選結果');
    expect(html).toContain('清除');
    expect(html).toContain('aria-label="選取第一首進行批次分析"');
    expect(html).toContain('checked');
    expect(html).toContain('完成');
    expect(html).toContain('等待');
  });
});
