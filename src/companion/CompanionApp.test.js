import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../composables/usePerformerViewState.js', () => ({
  usePerformerViewState: () => ({
    frame: shallowRef({ trackId: 'a' }),
    readingScale: shallowRef('near'),
    controlPending: shallowRef(false),
    setReadingScale: vi.fn(),
    setDisplayBoundary: vi.fn(),
  }),
}));
vi.mock('../components/performer/PerformerSurface.vue', () => ({
  default: {
    props: ['frame', 'mode', 'readingScale'],
    setup: (props) => () =>
      h(
        'section',
        { 'data-mode': props.mode },
        `surface:${props.frame.trackId}`,
      ),
  },
}));

import CompanionApp from './CompanionApp.vue';

const render = (status) =>
  renderToString(
    createSSRApp({
      render: () => h(CompanionApp, { status: shallowRef(status) }),
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
    ['unpaired', '這支手機尚未配對'],
    ['pairing-failed', '配對碼可能已過期或已使用'],
    ['devices-full', '已達上限'],
    ['connecting', '正在連線到電腦'],
  ])('explains the %s state without the surface', async (status, text) => {
    const html = await render(status);
    expect(html).toContain(text);
    expect(html).not.toContain('surface:');
  });
});
