import { afterEach, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import ObsSessionExportModal from './ObsSessionExportModal.vue';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';

afterEach(() => {
  useObsSessionExport().close();
  vi.unstubAllGlobals();
});
const render = () => renderToString(createSSRApp(ObsSessionExportModal));

it('shows the full editing reference and keeps copy and CSV in the footer', async () => {
  vi.stubGlobal('window', {
    Utawakui: {
      getObsLatestSession: async () => ({
        id: 'test',
        entries: Array.from({ length: 10 }, (_, index) => ({
          type: 'marker',
          label: `安可 ${index + 1}`,
          record: { timecode: `00:00:${12 + index}.345` },
        })),
      }),
    },
  });
  const owner = useObsSessionExport();
  await owner.open();
  owner.mode.value = 'markers';
  const html = await render();
  const footer = html.slice(html.indexOf('class="ui-modal__footer"'));
  expect(footer).toContain('儲存 CSV');
  expect(footer).toContain('複製對照');
  expect(html).toContain('00:00:12.345 安可 1');
  expect(html).toContain('00:00:21.345 安可 10');
  expect(html).toContain('手動定位');
  expect(html).toContain('時間來源：錄影');
  expect(html).toContain('id="obs-session-export-offset"');
  expect(html).not.toContain('<details');
  expect(html).not.toContain('章節有');
});

it('keeps repeated starts and omits unperformed arrangements in both export previews', async () => {
  vi.stubGlobal('window', {
    Utawakui: {
      getPerformanceSession: async () => ({
        ok: true,
        plan: {
          id: 'same-session',
          items: [{ displayTitle: '未演出曲目', progress: 'queued' }],
          timeline: ['00:00:20.125', '00:00:42.625'].map((timecode) => ({
            type: 'track',
            trackId: 'same-song',
            title: '重唱曲目',
            stream: { timecode },
          })),
        },
      }),
    },
  });
  const owner = useObsSessionExport();
  await owner.openForArrangement('same-session');
  const youtube = await render();
  expect(youtube).toContain('0:20 重唱曲目\n0:43 重唱曲目');
  expect(youtube).not.toContain('未演出曲目');
  owner.mode.value = 'markers';
  const editing = await render();
  expect(editing).toContain('00:00:20.125 重唱曲目\n00:00:42.625 重唱曲目');
  expect(editing).not.toContain('未演出曲目');
});

it('groups chapter issues once and exposes selectable readonly text', async () => {
  const entries = [12, 14, 16].map((seconds, index) => ({
    type: 'track',
    title: `曲目 ${index}`,
    stream: { timecode: `00:00:${seconds}.000` },
  }));
  vi.stubGlobal('window', {
    Utawakui: { getObsLatestSession: async () => ({ entries }) },
  });
  await useObsSessionExport().open();
  const html = await render();
  expect(html).toContain('章節有 3 項需確認');
  expect(html).toMatch(/<textarea[^>]*readonly/);
  expect(html).not.toMatch(/<textarea[^>]*disabled/);
  expect(html).toContain('0:12 曲目 0');
  expect(html).toContain('YouTube Studio 的影片說明');
  expect(html).toContain('複製時間點');
  expect(html).not.toContain('儲存 CSV');
  expect(html.match(/class="ui-notice /g)).toBeNull();
});

it('shows a single chapter issue next to the opening action without another disclosure', async () => {
  const entries = [20, 30, 40].map((seconds) => ({
    type: 'track',
    title: '曲目',
    stream: { timecode: `00:00:${seconds}.000` },
  }));
  vi.stubGlobal('window', {
    Utawakui: { getObsLatestSession: async () => ({ entries }) },
  });
  await useObsSessionExport().open();
  const html = await render();
  expect(html.match(/<details\b/gu)).toHaveLength(1);
  expect(html).toContain('時間校正與影片簡介');
  const issue = html.indexOf('第一章須從 00:00 開始。');
  const opening = html.indexOf('加入 00:00 開場章節');
  const preview = html.indexOf('id="obs-session-export-text"');
  expect(issue).toBeGreaterThan(html.indexOf('</details>'));
  expect(opening).toBeGreaterThan(issue);
  expect(preview).toBeGreaterThan(opening);
});

it('previews and copies a video description with the timestamp list below the intro', async () => {
  const entries = [
    { type: 'marker', label: '開場', stream: { timecode: '00:00:00.000' } },
    { type: 'track', title: '第一首', stream: { timecode: '00:00:20.000' } },
    { type: 'marker', label: '談話', stream: { timecode: '00:00:40.000' } },
  ];
  const copyObsText = vi.fn(async () => true);
  vi.stubGlobal('window', {
    Utawakui: { getObsLatestSession: async () => ({ entries }), copyObsText },
  });
  const owner = useObsSessionExport();
  await owner.open();
  const expectedTimeline = '00:00 開場\n0:20 第一首\n0:40 談話';
  expect(owner.previewText.value).toBe(expectedTimeline);
  owner.descriptionIntro.value = '  今晚的歌回  ';
  const expected = `今晚的歌回\n\n時間表\n${expectedTimeline}`;
  const html = await render();
  expect(html).toContain(expected);
  expect(html).toContain('複製影片說明');
  expect(html).not.toContain('章節有');
  await owner.copyPreview();
  expect(copyObsText).toHaveBeenCalledWith(expected);

  owner.descriptionIntro.value = '字'.repeat(5000);
  expect(await render()).toContain('5,000 字元上限');
  owner.mode.value = 'markers';
  expect(owner.previewText.value).toContain('00:00:40.000 談話');
  expect(await render()).not.toContain('5,000 字元上限');
  await owner.open();
  expect(owner.descriptionIntro.value).toBe('');
});

it('explains an empty preview when calibration excludes every timestamp', async () => {
  vi.stubGlobal('window', {
    Utawakui: {
      getObsLatestSession: async () => ({
        entries: [{ type: 'marker', stream: { timecode: '00:00:01.000' } }],
      }),
    },
  });
  const owner = useObsSessionExport();
  await owner.open();
  owner.offsetSeconds.value = '3';
  const html = await render();
  expect(html).toContain('時間校正與影片簡介（+3 秒）');
  expect(html).toContain('這個片段沒有可匯出的時間點');
  expect(html).not.toContain('章節有');
  expect(html).not.toContain('id="obs-session-export-text"');
});

it('waits for a segment choice before offering calibration and preview', async () => {
  const entries = ['first', 'second'].map((segmentId) => ({
    type: 'track',
    title: '曲目',
    stream: { timecode: '00:00:12.125', segmentId },
    record: { timecode: '00:00:12.345', segmentId },
  }));
  vi.stubGlobal('window', {
    Utawakui: { getObsLatestSession: async () => ({ entries }) },
  });
  const owner = useObsSessionExport();
  await owner.open();
  const awaitingSelection = await render();
  expect(awaitingSelection).toContain('選擇要匯出的片段');
  expect(awaitingSelection).not.toContain('id="obs-session-export-offset"');
  expect(awaitingSelection).not.toContain('<textarea');

  owner.segmentIndex.value = 1;
  const selected = await render();
  expect(selected).toContain('id="obs-session-export-offset"');
  expect(selected).toContain('0:12 曲目');
});

it.each(['empty', 'failure'])(
  'offers reload for a %s session',
  async (mode) => {
    vi.stubGlobal('window', {
      Utawakui: {
        getObsLatestSession: async () => {
          if (mode === 'failure') throw Error('private');
          return null;
        },
      },
    });
    await useObsSessionExport().open();
    const html = await render();
    expect(html).toContain('重新讀取場次');
    expect(html).not.toContain('id="obs-session-export-text"');
    expect(html).not.toContain('private');
  },
);
