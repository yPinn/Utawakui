import { h, nextTick } from 'vue';
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
it('shares identical modifiers while retaining every complete alternative in its accessible name', () => {
  const chords = [
    ['Ctrl', 'Shift', 'Page Up'],
    ['Ctrl', 'Shift', 'Page Down'],
  ];
  const { app, root } = mount(Component, { label: '翻頁', chords });
  expect(findAll(root, (n) => n.type === 'kbd').map(textContent)).toEqual([
    'Ctrl',
    'Shift',
    'PgUp',
    'PgDn',
  ]);
  expect(
    findAll(root, (n) => n.props?.role === 'group')[0].props['aria-label'],
  ).toBe('翻頁：Ctrl + Shift + Page Up 或 Ctrl + Shift + Page Down');
  expect(chords).toEqual([
    ['Ctrl', 'Shift', 'Page Up'],
    ['Ctrl', 'Shift', 'Page Down'],
  ]);
  app.unmount();
});
it('compacts four directions but stops sharing when the alternatives change', async () => {
  const { app, root } = mount(Component, {
    chords: ['←', '↑', '↓', '→'].map((key) => ['Shift', key]),
  });
  expect(findAll(root, (n) => n.type === 'kbd').map(textContent)).toEqual([
    'Shift',
    '←',
    '↑',
    '↓',
    '→',
  ]);
  app._instance.subTree.component.props.chords = [
    ['Shift', '←'],
    ['Alt', '→'],
  ];
  await nextTick();
  expect(findAll(root, (n) => n.type === 'kbd').map(textContent)).toEqual([
    'Shift',
    '←',
    'Alt',
    '→',
  ]);
  app.unmount();
});
it.each([
  [
    [
      ['Ctrl', 'Shift', '↑'],
      ['Ctrl', '↓'],
    ],
    ['Ctrl', 'Shift', '↑', 'Ctrl', '↓'],
  ],
  [
    [
      ['A', 'B'],
      ['A', 'C'],
    ],
    ['A', 'B', 'A', 'C'],
  ],
  [[['Shift', 'A']], ['Shift', 'A']],
])(
  'keeps differing modifiers, ordinary keys and single chords explicit: %j',
  (chords, keys) => {
    const { app, root } = mount(Component, { chords });
    expect(findAll(root, (n) => n.type === 'kbd').map(textContent)).toEqual(
      keys,
    );
    app.unmount();
  },
);
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
