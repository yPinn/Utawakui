import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisPreferenceRow from './MusicAnalysisPreferenceRow.vue';

const render = (props) =>
  renderToString(
    createSSRApp({ render: () => h(MusicAnalysisPreferenceRow, props) }),
  );
describe('music analysis preference', () => {
  it('keeps the everyday setting separate from component management', async () => {
    const html = await render({ autoAnalyze: true });
    expect(html).toContain('歌曲速度與節拍（BPM）');
    expect(html).toContain('不上傳歌曲');
    expect(html).toContain('checked');
    expect(html).not.toContain('準備 BPM 分析');
    expect(html).not.toContain('BPM 分析選項');
    expect(html).not.toContain('可使用');
  });
  it('disables an unconfirmed setting and provides its own read retry', async () => {
    const html = await render({
      loaded: false,
      readError: '無法讀取自動分析設定',
    });
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).not.toContain('checked');
    expect(html).toContain('重新讀取');
  });
  it('associates a failed save with the preference checkbox', async () => {
    const html = await render({ error: '自動分析未儲存' });
    expect(html).toContain('自動分析未儲存');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('auto-music-analysis-error');
  });
});
