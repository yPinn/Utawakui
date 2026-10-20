import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LibraryMetadataSettingsRow from './LibraryMetadataSettingsRow.vue';

async function renderRow() {
  return renderToString(
    createSSRApp({
      render: () => h(LibraryMetadataSettingsRow),
    }),
  );
}

describe('LibraryMetadataSettingsRow', () => {
  it('describes the automatic bounded offline maintenance scope without a manual action', async () => {
    const html = await renderRow();

    expect(html).toContain('曲目資訊自動整理');
    expect(html).toContain('啟動時整理名稱、歌手、專輯與年份');
    expect(html).toContain('僅使用已儲存的資訊');
    expect(html).toContain('不連線');
    expect(html).toContain('無法確認的內容保留你的編輯');
    expect(html).toContain('自動');
    expect(html).not.toContain('已啟用');
    expect(html).not.toContain('ui-icon-button');
  });
});
