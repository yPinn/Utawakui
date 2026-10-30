import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';
import PlaybackHistorySettingsRow from './PlaybackHistorySettingsRow.vue';

const source = readCatalogSource(
  new URL('./PlaybackHistorySettingsRow.vue', import.meta.url),
);

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(PlaybackHistorySettingsRow, {
          recordCount: 0,
          isLoading: false,
          isClearing: false,
          error: '',
          ...props,
        }),
    }),
  );
}

describe('PlaybackHistorySettingsRow', () => {
  it('marks a failed read as unknown and offers one local retry', async () => {
    const html = await renderRow({ error: '讀取失敗', readError: '讀取失敗' });
    expect(html).toContain('暫時無法讀取');
    expect(html).toContain('重新讀取');
    expect(html).not.toContain('尚無播放紀錄');
    expect(html).not.toContain('>無紀錄<');
  });
  it('shows the local playback-history count and one overflow trigger', async () => {
    const html = await renderRow({ recordCount: 7 });

    expect(html).toContain('播放紀錄');
    expect(html).toContain('已保存 7 首');
    expect(html).not.toContain('>有紀錄</span>');
    expect(html).toContain('播放紀錄選項');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain('清除播放紀錄');
  });

  it('marks persisted history deletion as destructive and disables it while empty or busy', () => {
    expect(source).toContain("label: '清除播放紀錄'");
    expect(source).toContain('icon: ListX');
    expect(source).not.toContain('Trash2');
    expect(source.match(/\{\s*id: 'clear',[^}]*\}/u)?.[0]).toContain(
      "intent: 'danger'",
    );
    expect(source).toMatch(
      /disabled:\s*props\.isLoading\s*\|\|\s*props\.isClearing\s*\|\|\s*props\.recordCount === 0/u,
    );
    expect(source).toContain("if (actionId === 'clear') emit('clear');");
  });

  it('presents empty, loading, clearing, and error states', async () => {
    expect(await renderRow()).toContain('尚無播放紀錄');
    expect(await renderRow({ isLoading: true })).toContain('讀取中');
    expect(await renderRow({ recordCount: 2, isClearing: true })).toContain(
      '清除中',
    );
    const errorHtml = await renderRow({
      error: '最近播放紀錄暫時無法清除。',
    });
    expect(errorHtml).toContain('播放紀錄未更新');
    expect(errorHtml).toContain('最近播放紀錄暫時無法清除。');
  });
});
