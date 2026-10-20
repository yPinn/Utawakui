import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LibraryStorageSettingsRow from './LibraryStorageSettingsRow.vue';

const source = readFileSync(
  new URL('./LibraryStorageSettingsRow.vue', import.meta.url),
  'utf8',
);

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LibraryStorageSettingsRow, {
          storage: {
            totalBytes: 19971597926,
            songBytes: 6871947674,
            separationBytes: 12884901888,
            otherBytes: 214748364,
            trackCount: 238,
            separationTrackCount: 160,
            driveFreeBytes: 141733920768,
            driveCapacityBytes: 512000000000,
          },
          policy: {
            autoManageSeparation: true,
            separationLimitBytes: 26843545600,
          },
          loading: false,
          saving: false,
          cleaning: false,
          error: '',
          lastCleanup: null,
          ...props,
        }),
    }),
  );
}

describe('LibraryStorageSettingsRow', () => {
  it('keeps the closed summary to one title, one status line, and one disclosure', async () => {
    const html = await renderRow();

    expect(html).toContain('曲庫空間');
    expect(html).toContain('18.6 GB 已使用 · 132 GB 可用');
    expect(html).toContain('查看曲庫空間');
    expect(source).toContain('<UiDisclosure');
    expect(html).toMatch(/<details\b[^>]*class="[^"]*ui-disclosure/);
    expect(source).not.toContain('ChevronRight');
    expect(source).not.toContain('估算曲數');
    expect(source).not.toContain('重新掃描');
  });

  it('puts categories and policy controls inside the single disclosure body', () => {
    expect(source).toContain('歌曲');
    expect(source).toContain('去人聲');
    expect(source).toContain('其他');
    expect(source).toContain('自動清理去人聲版本');
    expect(source).toContain('label="去人聲容量上限"');
    expect(source).toContain('原始歌曲保留。啟用後會立即檢查');
    expect(source).toContain('<UiIconButton');
    expect(source).toContain('label="清理去人聲空間"');
    expect(source).toContain('loading-label="清理中"');
    expect(source).toContain('@click=' + '"emit(\'refresh\')"');
    expect(source).not.toContain('>清理<');
  });

  it('keeps loading and errors but does not replay completed cleanup snapshots', async () => {
    expect(await renderRow({ storage: null, loading: true })).toContain(
      '計算中',
    );
    expect(await renderRow({ error: '目前無法讀取曲庫空間。' })).toContain(
      '目前無法讀取曲庫空間。',
    );
    expect(
      await renderRow({
        lastCleanup: {
          freedBytes: 8589934592,
          removedCount: 4,
          remainingBytesToFree: 0,
        },
      }),
    ).not.toContain('已釋放 8 GB');
  });

  it.each([
    [{ error: '設定未儲存。' }, '空間設定未儲存'],
    [{ readError: '目前無法讀取曲庫空間。' }, '無法讀取空間資訊'],
  ])(
    'keeps the failure visible in the summary when details are collapsed',
    async (props, label) => {
      const html = await renderRow(props);
      expect(html).toMatch(/<details\b[^>]*\bopen/);
      expect(
        html.slice(html.indexOf('<summary'), html.indexOf('</summary>')),
      ).toContain(label);
      expect(
        html.slice(html.indexOf('</summary>'), html.indexOf('</details>')),
      ).toContain(props.error || props.readError);
    },
  );
});
