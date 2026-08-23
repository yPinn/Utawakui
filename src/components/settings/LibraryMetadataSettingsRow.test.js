import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LibraryMetadataSettingsRow from './LibraryMetadataSettingsRow.vue';

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LibraryMetadataSettingsRow, {
          isRunning: false,
          message: '',
          error: null,
          ...props,
        }),
    }),
  );
}

describe('LibraryMetadataSettingsRow', () => {
  it('describes the bounded offline maintenance scope', async () => {
    const html = await renderRow();

    expect(html).toContain('曲目資訊整理');
    expect(html).toContain('整理名稱、歌手、專輯與年份');
    expect(html).toContain('從已保存的來源資訊');
    expect(html).toContain('aria-label="整理曲目資訊"');
  });

  it('shows stable running and successful result states', async () => {
    const running = await renderRow({ isRunning: true });
    const completed = await renderRow({
      message: '已整理 3 首曲目（名稱或歌手 2 首、其他資訊 2 首）',
    });

    expect(running).toContain('執行中');
    expect(running).toContain('disabled');
    expect(completed).toContain('已整理 3 首曲目');
  });

  it('renders a bounded shared notice for failures', async () => {
    const html = await renderRow({
      error: {
        title: '曲目資訊整理未完成',
        message: '目前無法整理曲目資訊，請再試一次。',
      },
    });

    expect(html).toContain('曲目資訊整理未完成');
    expect(html).toContain('目前無法整理曲目資訊，請再試一次。');
    expect(html).not.toContain('EACCES');
  });
});
