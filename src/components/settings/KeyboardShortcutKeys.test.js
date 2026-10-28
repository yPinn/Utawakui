import { h } from 'vue';
import { expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';
import Component from './KeyboardShortcutKeys.vue';
vi.mock('../ui/UiKbd.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('kbd', slots.default?.()),
  },
}));
attachClientRender(Component, './KeyboardShortcutKeys.vue', import.meta.url);
it('renders each chord as one group of shared keycaps, allowing only alternatives to wrap', () => {
  const { app, root } = mount(Component, {
    label: '欄寬調整',
    chords: [['Ctrl', 'Shift', 'Page Down'], ['Home']],
  });
  expect(
    findAll(root, (n) =>
      Object.hasOwn(n.props ?? {}, 'data-shortcut-chord'),
    ).map((n) => findAll(n, (k) => k.type === 'kbd').map(textContent)),
  ).toEqual([['Ctrl', 'Shift', 'PgDn'], ['Home']]);
  expect(
    findAll(root, (n) => n.props?.['aria-label'] === '欄寬調整'),
  ).toHaveLength(1);
  app.unmount();
});
it('uses compact keyboard legends with descriptive accessible names', () => {
  const { app, root } = mount(Component, {
    chords: [
      ['Page Up'],
      ['Page Down'],
      ['MediaPlayPause'],
      ['MediaTrackPrevious'],
      ['MediaTrackNext'],
      ['ContextMenu'],
      ['BrowserBack'],
      ['BrowserForward'],
    ],
  });
  expect(findAll(root, (n) => n.type === 'kbd').map(textContent)).toEqual([
    'PgUp',
    'PgDn',
    'Play/Pause',
    'Prev',
    'Next',
    'Menu',
    'Back',
    'Fwd',
  ]);
  expect(
    findAll(root, (n) => n.type === 'kbd').map((n) => n.props['aria-label']),
  ).toEqual([
    'Page Up',
    'Page Down',
    '播放／暫停鍵',
    '上一首鍵',
    '下一首鍵',
    '選單鍵',
    '上一頁鍵',
    '下一頁鍵',
  ]);
  expect(textContent(root)).not.toMatch(
    /MediaTrack|MediaPlayPause|BrowserBack|ContextMenu/u,
  );
  app.unmount();
});
