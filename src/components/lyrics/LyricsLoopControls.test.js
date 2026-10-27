import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import Controls from './LyricsLoopControls.vue';
const render = (state) =>
  renderToString(
    createSSRApp({
      render: () =>
        h(Controls, {
          practice: {
            a: null,
            b: null,
            enabled: false,
            gapSeconds: 0,
            canEnable: false,
            ...state,
          },
        }),
    }),
  );
describe('practice controls', () => {
  it('starts with capture and loop actions while precise fields and waiting stay collapsed', async () => {
    const html = await render({});
    expect(html).not.toContain('起點（秒）');
    expect(html).not.toContain('終點（秒）');
    expect(html).toContain('將目前位置設為起點');
    expect(html).toContain('開始片段練習');
    expect(html).not.toContain('每輪等待');
    expect(html.indexOf('進階設定')).toBeGreaterThan(
      html.indexOf('開始片段練習'),
    );
    expect(html.indexOf('清除練習區間')).toBeLessThan(
      html.indexOf('開始片段練習'),
    );
    expect(html).toContain('清除練習區間');
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(html).not.toContain('保存');
  });
  it('uses Pause for active playback or rest and keeps clear available during source confirmation', async () => {
    const html = await render({ a: 1, b: 4, running: true, enabled: true });
    expect(html).toContain('暫停片段練習');
    expect(html).toContain('lucide-pause');
    expect(html).not.toContain('lucide-repeat');
    const pending = await render({ a: 1, b: 4, loading: true });
    const clear = pending.slice(
      pending.lastIndexOf('<button', pending.indexOf('清除練習區間')),
      pending.indexOf('清除練習區間'),
    );
    expect(clear).not.toContain('disabled');
  });
  it('shows minute and second markers without displaying milliseconds', async () => {
    const html = await render({ a: 61.234, b: 125.789 });
    expect(html).toContain('01:01');
    expect(html).toContain('02:05');
    expect(html).not.toContain('61.234');
    expect(html).not.toContain('125.789');
  });
  it('keeps a bounded fault message and the current lap wait snapshot', async () => {
    expect(
      await render({
        phase: 'gap',
        gapSeconds: 1,
        waitingSeconds: 4,
        enabled: true,
      }),
    ).toContain('等待 4 秒後續唱');
    expect(await render({ error: 'source-or-range' })).toContain(
      '請重新選曲或設定起點與終點',
    );
    expect(await render({ unavailableReason: '請先選擇曲目。' })).toContain(
      'disabled',
    );
  });
});
