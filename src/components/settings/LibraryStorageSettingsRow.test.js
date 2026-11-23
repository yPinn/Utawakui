import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';
import LibraryStorageSettingsRow from './LibraryStorageSettingsRow.vue';

const source = readCatalogSource(
  new URL('./LibraryStorageSettingsRow.vue', import.meta.url),
);
const GB = 1024 ** 3;

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
  it('keeps the closed summary to one title and one status', async () => {
    const html = await renderRow();
    const summary = html.slice(
      html.indexOf('<summary'),
      html.indexOf('</summary>'),
    );

    expect(summary.match(/曲庫空間/gu)).toHaveLength(1);
    expect(summary).toContain('已用 18.6 GB · 磁碟可用 132 GB');
    expect(summary).not.toContain('library-storage__bar');
    expect(source).toContain('<UiDisclosure');
    expect(html).toMatch(/<details\b[^>]*class="[^"]*ui-disclosure/);
    expect(source).not.toContain('ChevronRight');
    expect(source).not.toContain('估算曲數');
    expect(source).not.toContain('重新掃描');
  });

  it('shows category shares of library usage in legend order before the policy controls', async () => {
    const html = await renderRow({
      storage: {
        totalBytes: 8 * GB,
        songBytes: 2 * GB,
        separationBytes: 4 * GB,
        videoBytes: GB,
        otherBytes: GB,
        driveFreeBytes: 417 * GB,
      },
    });
    const body = html.slice(
      html.indexOf('</summary>'),
      html.indexOf('</details>'),
    );
    const segments = [
      ...body.matchAll(
        /data-category="([^"]+)" style="inline-size:([^;]+);"/gu,
      ),
    ];
    expect(segments.map(([, key, width]) => [key, width])).toEqual([
      ['songs', '25%'],
      ['instrumental', '50%'],
      ['videos', '12.5%'],
      ['other', '12.5%'],
    ]);
    const legend = [
      ...body.matchAll(/<dt\b[^>]*>([^<]+)<\/dt><dd\b[^>]*>([^<]+)<\/dd>/gu),
    ];
    expect(legend.map(([, label, size]) => [label, size])).toEqual([
      ['歌曲', '2 GB'],
      ['去人聲', '4 GB'],
      ['影片', '1 GB'],
      ['其他', '1 GB'],
    ]);
    expect(body.indexOf('library-storage__categories')).toBeLessThan(
      body.indexOf('library-storage__controls'),
    );
    expect(body).toContain('自動清理去人聲');
    expect(body).toContain('超過上限或磁碟空間不足時清理，保留原始歌曲。');
  });

  it('shows an empty breakdown and omits unavailable drive space', async () => {
    const html = await renderRow({
      storage: { totalBytes: 0, driveFreeBytes: null },
    });
    expect(html.match(/inline-size:0%;/gu)).toHaveLength(4);
    expect(html).toContain('已用 0 B');
    expect(html).not.toContain('磁碟可用');
    expect(html).not.toContain('NaN');
  });

  it('represents an unlimited policy with an empty select value', async () => {
    const html = await renderRow({
      policy: { autoManageSeparation: false, separationLimitBytes: null },
    });
    expect(html).toMatch(
      /<select[^>]*id="separation-storage-limit"[^>]* value(?:=""|(?=\s|>))/u,
    );
    expect(html).toMatch(/<option\b[^>]*value=""[^>]*>不限量<\/option>/u);
  });

  it('keeps both cleanup actions together after the policy controls', async () => {
    const html = await renderRow();
    const body = html.slice(
      html.indexOf('</summary>'),
      html.indexOf('</details>'),
    );
    const cleanup = body.slice(body.indexOf('library-storage__cleanup'));
    const buttons = cleanup.match(/<button[\s\S]*?<\/button>/gu) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain('清理去人聲');
    expect(buttons[1]).toContain('清理影片');
    expect(buttons[1]).toContain('disabled');
    for (const button of buttons) {
      expect(button).toContain('ui-btn--intent-danger');
      expect(button).toContain('ui-btn--secondary');
    }
    expect(source).toContain(`@click="emit('cleanup-videos')"`);
    expect(body).toMatch(/<dt\b[^>]*>影片<\/dt>\s*<dd[^>]*>\s*0 B/u);
    expect(body.indexOf('去人聲上限')).toBeLessThan(
      body.indexOf('library-storage__cleanup'),
    );
  });

  it('keeps loading and errors but does not replay completed cleanup snapshots', async () => {
    const loading = await renderRow({ storage: null, loading: true });
    expect(loading.match(/計算中/gu)).toHaveLength(1);
    expect(loading).not.toContain('library-storage__bar');
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
      if (props.readError) expect(html).toContain('重新讀取');
    },
  );
});
