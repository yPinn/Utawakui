import { describe, it, expect } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LyricsAcousticSettingsRow from './LyricsAcousticSettingsRow.vue';
const render = (capability) =>
  renderToString(createSSRApp(LyricsAcousticSettingsRow, { capability }));
describe('optional lyrics environment settings', () => {
  it('explains the release gate without offering automatic or default downloads', async () => {
    const html = await render({
      status: 'blocked',
      installed: false,
      canPrepare: false,
      blockReason: 'weights-evidence-pending',
    });
    expect(html).toContain('歌詞時間估計');
    expect(html).toContain('尚未開放準備');
    expect(html).not.toContain('準備環境</button>');
  });
  it('offers explicit loading validation after restart and only enabled lifecycle intents', async () => {
    const html = await render({
      status: 'unverified',
      installed: true,
      canVerify: true,
      canRepair: true,
      canRemove: true,
    });
    expect(html).toContain('待檢查');
    expect(html).toMatch(/>檢查(?:<!--[^>]*-->|<\/?span[^>]*>)*<\/button>/u);
    expect(html).toContain('歌詞時間估計選項');
    const busy = await render({
      status: 'preparing',
      installed: false,
      busy: true,
      canCancel: true,
    });
    expect(busy).toContain('取消操作');
    expect(busy).not.toContain('自動');
  });
});
