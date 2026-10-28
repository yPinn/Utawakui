import { nextTick } from 'vue';
import { expect, it } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Component from './KeyboardShortcutReference.vue';
import Keys from './KeyboardShortcutKeys.vue';
import UiKbd from '../ui/UiKbd.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import { SHORTCUT_REFERENCE_SECTIONS } from '../../utils/keyboardShortcutSettingsPresentation.js';
for (const [component, file] of [
  [Component, './KeyboardShortcutReference.vue'],
  [Keys, './KeyboardShortcutKeys.vue'],
  [UiKbd, '../ui/UiKbd.vue'],
  [UiDisclosure, '../ui/UiDisclosure.vue'],
  [UiHint, '../ui/UiHint.vue'],
])
  attachClientRender(component, file, import.meta.url);
it('keeps a newly opened reference section open when the previous native disclosure reports its close later', async () => {
  const { app, root } = mount(Component);
  const sections = findAll(root, (node) => node.type === 'details').slice(1);
  expect(sections[0].props.open).toBe(true);
  trigger(sections[1], 'onToggle', { currentTarget: { open: true } });
  await nextTick();
  expect(sections[1].props.open).toBe(true);
  trigger(sections[0], 'onToggle', { currentTarget: { open: false } });
  await nextTick();
  expect(sections[1].props.open).toBe(true);
  expect(findAll(root, (node) => node.type === 'kbd').length).toBeGreaterThan(
    0,
  );
  app.unmount();
});
it('groups matching contexts once without losing any product-specific key/action row', () => {
  const { app, root } = mount(Component);
  const headings = findAll(root, (n) => n.type === 'dt').map(textContent);
  expect(headings.filter((text) => text === '上方全曲波形')).toHaveLength(1);
  expect(headings.filter((text) => text === '欄位邊緣')).toHaveLength(1);
  expect(
    findAll(root, (n) => n.props?.class === 'keyboard-shortcut-reference__row'),
  ).toHaveLength(
    SHORTCUT_REFERENCE_SECTIONS.reduce((count, s) => count + s.rows.length, 0),
  );
  app.unmount();
});
