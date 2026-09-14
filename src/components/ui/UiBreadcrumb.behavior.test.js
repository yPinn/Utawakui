import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import UiBreadcrumb from './UiBreadcrumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

attachClientRender(UiBreadcrumb, './UiBreadcrumb.vue', import.meta.url);

const ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'imports', label: '匯入紀錄', href: '#imports' },
  { id: 'candidate', label: '候選來源', disabled: true },
  { id: 'session', label: '目前 session' },
];

function nav(root) {
  return findAll(root, (node) => node.type === 'nav')[0];
}

function items(root) {
  return findAll(root, (node) => node.type === 'li');
}

describe('UiBreadcrumb', () => {
  it('renders a labeled nav with the last item marked current and non-interactive', () => {
    const { app, root } = mount(UiBreadcrumb, {
      items: ITEMS,
      ariaLabel: '匯入路徑',
      class: 'demo-trail',
    });
    const navNode = nav(root);
    const rows = items(root);
    const current = findAll(
      root,
      (node) => node.props?.['aria-current'] === 'page',
    )[0];

    expect(navNode.props['aria-label']).toBe('匯入路徑');
    expect(String(navNode.props.class)).toContain('demo-trail');
    expect(rows).toHaveLength(4);
    expect(current.type).toBe('span');
    expect(textContent(current)).toBe('目前 session');
    app.unmount();
  });

  it('renders a real link for items with href and a button otherwise', () => {
    const { app, root } = mount(UiBreadcrumb, {
      items: ITEMS,
      ariaLabel: '匯入路徑',
    });
    const link = findAll(root, (node) => node.type === 'a')[0];
    const buttons = findAll(root, (node) => node.type === 'button');

    expect(link.props.href).toBe('#imports');
    expect(textContent(link)).toBe('匯入紀錄');
    expect(buttons).toHaveLength(2);
    expect(textContent(buttons[0])).toContain('曲庫');
    app.unmount();
  });

  it('emits select for interactive segments and skips disabled ones', () => {
    const select = vi.fn();
    const { app, root } = mount(UiBreadcrumb, {
      items: ITEMS,
      ariaLabel: '匯入路徑',
      onSelect: select,
    });
    const buttons = findAll(root, (node) => node.type === 'button');
    const link = findAll(root, (node) => node.type === 'a')[0];

    expect(buttons[1].props.disabled).toBe(true);
    trigger(buttons[0], 'onClick');
    trigger(link, 'onClick');

    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenNthCalledWith(1, ITEMS[0], 0);
    expect(select).toHaveBeenNthCalledWith(2, ITEMS[1], 1);
    app.unmount();
  });

  it('renders one fewer decorative separator than the item count', () => {
    const { app, root } = mount(UiBreadcrumb, {
      items: ITEMS,
      ariaLabel: '匯入路徑',
    });
    const separators = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-breadcrumb__separator'),
    );

    expect(separators).toHaveLength(ITEMS.length - 1);
    expect(
      separators.every((node) => node.props['aria-hidden'] === 'true'),
    ).toBe(true);
    app.unmount();
  });

  it('uses shared text, muted, focus, and overflow tokens', () => {
    const source = readFileSync(
      new URL('./UiBreadcrumb.vue', import.meta.url),
      'utf8',
    );

    for (const token of [
      '--ui-color-text',
      '--ui-color-text-muted',
      '--ui-color-focus',
      '--ui-focus-width',
      '--ui-opacity-disabled',
      '--ui-breadcrumb-segment-max-inline-size',
      '--ui-font-size-sm',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).toMatch(/overflow-x:\s*auto;/u);
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
