import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../composables/usePerformerViewState.js', () => ({
  usePerformerViewState: () => ({
    frame: shallowRef({
      trackId: 'a',
      revision: 7,
      track: { title: 'Test track' },
      currentLine: { text: 'A line' },
    }),
    snapshot: shallowRef({
      state: {
        revision: 7,
        playback: {
          track: { id: 'a' },
          status: 'paused',
          positionMs: 5000,
          durationMs: 20000,
        },
        queue: {
          items: [
            {
              state: 'queued',
              track: { id: 'b', title: 'Next track fixture' },
            },
          ],
        },
      },
    }),
    readingScale: shallowRef('near'),
    setReadingScale: vi.fn(),
  }),
}));
vi.mock('./CompanionLyrics.vue', () => ({
  default: {
    props: ['frame', 'layout'],
    setup: (props) => () =>
      h(
        'section',
        { 'data-layout': props.layout },
        `surface:${props.frame.trackId}`,
      ),
  },
}));

import CompanionApp from './CompanionApp.vue';
import CompanionOutputTemplates from './CompanionOutputTemplates.vue';
import CompanionQueue from './CompanionQueue.vue';
import templates from '../../shared/outputTemplateValues.json';
import { projectCompanionOutputSlot } from '../../shared/companionOutput.mjs';

const render = (status, remote = null) =>
  renderToString(
    createSSRApp({
      render: () => h(CompanionApp, { status: shallowRef(status), remote }),
    }),
  );

describe('CompanionApp', () => {
  it('opens lyrics by default and renders four tabs in navigation order', async () => {
    const html = await render('live');
    expect(html).toContain('surface:a');
    expect(html).toContain('data-layout="list"');
    expect(html).toContain('已連線');
    expect(html).toMatch(
      /id="companion-queue-tab"[\s\S]*id="companion-lyrics-tab"[\s\S]*id="companion-player-tab"[\s\S]*id="companion-templates-tab"/u,
    );
    expect(html).not.toContain('Next track fixture');
    expect(html).not.toContain('監聽混音');
  });

  it('keeps lyrics and inline connection status while reconnecting', async () => {
    const html = await render('reconnecting');
    expect(html).toContain('surface:a');
    expect(html).toContain('重新連線中');
    expect(html).not.toContain('ui-notice--warning');
  });

  it('places page dots above playback and outside the scrollable panels', async () => {
    const html = await render('live', { sendCommand: vi.fn() });
    expect(html).toMatch(
      /<\/main><footer[^>]*>[\s\S]+companion-app__page-tabs[\s\S]+type="range"[\s\S]+<\/footer>/u,
    );
  });

  it('uses the desktop artwork URL directly for the preview playback cover', async () => {
    const thumbnailUrl = 'utawakui-media://track/a/thumbnail.jpg';
    const html = await render('live', {
      sendCommand: vi.fn(),
      withThumbnail: (track) => ({ ...track, thumbnailUrl }),
    });
    expect(html).toContain(`src="${thumbnailUrl}"`);
  });

  it.each([
    ['unpaired', '尚未配對'],
    ['pairing-failed', '配對碼可能已過期或已使用'],
    ['devices-full', '已達配對上限'],
    ['connecting', '正在連線到電腦'],
  ])('explains the %s state without the surface', async (status, text) => {
    const html = await render(status);
    expect(html).toContain(text);
    expect(html).not.toContain('surface:');
  });

  it('shows the product identity and ordered setup steps before pairing', async () => {
    const html = await render('unpaired');
    expect(html).toContain('src="/assets/icons/app-icon.png"');
    expect(html).toMatch(/<h1[^>]*>Utawakui<\/h1>/u);
    expect(html).toMatch(
      /<ol[^>]*>[\s\S]+同一個網路[\s\S]+標題列的手機按鈕[\s\S]+掃描電腦顯示的 QR 碼[\s\S]+<\/ol>/u,
    );
    expect(await render('connecting')).not.toContain('<ol');
  });

  it('adds the remote buttons only when commands are available', async () => {
    const withRemote = await render('live', { sendCommand: vi.fn() });
    for (const label of ['上一首', '下一首', '播放'])
      expect(withRemote).toContain(label);
    expect(withRemote).toContain('type="range"');
    expect(withRemote).toContain('Test track');
    expect(await render('live')).not.toContain('下一首');
  });

  it('keeps lyric adjustments in their own group above the fixed playback bar', async () => {
    const html = await render('live', { sendCommand: vi.fn() });
    expect(html).toMatch(
      /<main[\s\S]+歌詞快調[\s\S]+放大歌詞字級[\s\S]+<\/main><footer[\s\S]+播放控制[\s\S]+下一首/u,
    );
  });

  it('shows the match code while waiting for the computer', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(CompanionApp, {
            status: shallowRef('awaiting-approval'),
            matchCode: shallowRef('4321'),
          }),
      }),
    );
    expect(html).toContain('確認相同後按「允許」');
    expect(html).toContain('對照代碼');
    expect(html).toContain('4321');
    expect(html).not.toContain('surface:');
  });

  it('offers to take the connection back after another phone took over', async () => {
    const html = await render('displaced', {
      sendCommand: vi.fn(),
      resume: vi.fn(),
    });
    expect(html).toContain('目前由另一支手機連線');
    expect(html).toMatch(/ui-btn--accent[\s\S]*改用這支手機/u);
    expect(html).not.toContain('surface:');
    expect(await render('displaced')).not.toContain('改用這支手機');
  });

  it.each([
    ['pairing-denied', '配對已被拒絕'],
    ['pairing-busy', '正在確認另一支手機'],
  ])('explains %s', async (status, text) => {
    expect(await render(status)).toContain(text);
  });
});

it('keeps the clear action in the manual queue header', async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(CompanionQueue, {
          queueView: { tab: 'queue' },
          manualQueueCount: 1,
          queue: {
            items: [
              { state: 'queued', track: { id: 'manual', title: 'Manual' } },
              { state: 'queued', track: { id: 'source', title: 'Source' } },
            ],
          },
        }),
    }),
  );
  const headers = html.match(/<header[^>]*>[\s\S]*?<\/header>/gu);
  expect(headers).toHaveLength(2);
  expect(headers[0]).toMatch(/<h2[^>]*>[^<]+<\/h2>[\s\S]*<button/u);
  expect(headers[1]).not.toContain('<button');
});

it.each([
  ['side-card', 'phantomCardStyle', 'phantomChatShape'],
  ['chat', 'phantomChatShape', 'phantomCardStyle'],
])(
  'shows the desktop inspector categories and the matching layout fields in %s mode',
  async (mode, visible, hidden) => {
    const slots = templates.slots.map(({ id, defaultTemplateId }) =>
      projectCompanionOutputSlot(
        id === 'lyrics'
          ? { templateId: 'phantom-thieves', settings: { phantomMode: mode } }
          : { templateId: defaultTemplateId },
      ),
    );
    const html = await renderToString(
      createSSRApp({
        render: () => h(CompanionOutputTemplates, { slots, disabled: true }),
      }),
    );
    expect(html).toContain('幻影怪盜');
    expect(html).toMatch(
      /class="companion-output__summary".*<li class="ui-track".*src="[^"]*phantom-thieves[^"]*\.png".*companion-output-slot-lyrics-tab/su,
    );
    expect(html).toMatch(
      /class="ui-tabs ui-tabs--folder[^"]*"[^>]*aria-orientation="horizontal".*class="companion-output__controls"/su,
    );
    const categories = [
      ...html.matchAll(
        /<button[^>]*id="companion-output-category-[^"]*-tab"[^>]*aria-label="([^"]+)"[^>]*>[\s\S]*?lucide-([\w-]+)[\s\S]*?<\/button>/gu,
      ),
    ].map(([, label, icon]) => [label, icon]);
    expect(categories).toEqual([
      ['文字', 'type'],
      ...(mode === 'side-card' ? [['人物', 'user-round']] : []),
      ['外觀', 'palette'],
      ['版面', 'layout-template'],
    ]);
    expect(html).toMatch(
      /<h2 class="obs-inspector-header__title"[^>]*>版面<\/h2>/u,
    );
    expect(html).toContain('companion-output-lyrics-phantomMode');
    expect(html).toContain('companion-output-lyrics-phantomCorner');
    expect(html).toContain(`companion-output-lyrics-${visible}`);
    expect(html).not.toContain(`companion-output-lyrics-${hidden}`);
    expect(html).not.toContain('phantomPortraitPhoto');
    expect(html).toMatch(/<select[^>]*disabled/u);
  },
);
