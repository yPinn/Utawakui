import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../composables/usePerformerViewState.js', () => ({
  usePerformerViewState: () => ({
    frame: shallowRef({ trackId: 'a', revision: 7 }),
    control: vi.fn(),
    adjustLyricsOffset: vi.fn(),
    readingScale: shallowRef('near'),
    controlPending: shallowRef(false),
    setReadingScale: vi.fn(),
    setDisplayBoundary: vi.fn(),
  }),
}));
vi.mock('../components/performer/PerformerSurface.vue', () => ({
  default: {
    props: ['frame', 'mode', 'readingScale'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', { 'data-mode': props.mode }, [
          `surface:${props.frame.trackId}`,
          slots['rail-tools']?.(),
        ]),
  },
}));

import CompanionApp from './CompanionApp.vue';

const render = (status, remote = null) =>
  renderToString(
    createSSRApp({
      render: () => h(CompanionApp, { status: shallowRef(status), remote }),
    }),
  );

describe('CompanionApp', () => {
  it('shows the shared prompter surface while live', async () => {
    const html = await render('live');
    expect(html).toContain('surface:a');
    expect(html).toContain('data-mode="prompter"');
    expect(html).not.toContain('role="status"');
  });

  it('keeps the lyrics visible with a notice while reconnecting', async () => {
    const html = await render('reconnecting');
    expect(html).toContain('surface:a');
    expect(html).toContain('連線中斷，正在重新連線');
  });

  it.each([
    ['unpaired', '尚未配對。請按電腦標題列的手機按鈕'],
    ['pairing-failed', '配對碼可能已過期或已使用'],
    ['devices-full', '已達上限'],
    ['connecting', '正在連線到電腦'],
  ])('explains the %s state without the surface', async (status, text) => {
    const html = await render(status);
    expect(html).toContain(text);
    expect(html).not.toContain('surface:');
  });

  it('adds the remote buttons only when commands are available', async () => {
    const withRemote = await render('live', { sendCommand: vi.fn() });
    for (const label of ['上一首', '下一首', '降 Key', '升 Key', '靜音'])
      expect(withRemote).toContain(label);
    expect(await render('live')).not.toContain('下一首');
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
    expect(html).toContain('請在電腦上按「允許」');
    expect(html).toContain('4321');
    expect(html).not.toContain('surface:');
  });

  it('offers to take the connection back after another phone took over', async () => {
    const html = await render('displaced', {
      sendCommand: vi.fn(),
      resume: vi.fn(),
    });
    expect(html).toContain('已改由其他手機連線。');
    expect(html).toMatch(/ui-btn--accent[\s\S]*改用這支手機/u);
    expect(html).not.toContain('surface:');
    expect(await render('displaced')).not.toContain('改用這支手機');
  });

  it.each([
    ['pairing-denied', '電腦拒絕了這次配對'],
    ['pairing-busy', '正在確認另一支手機'],
  ])('explains %s', async (status, text) => {
    expect(await render(status)).toContain(text);
  });
});
