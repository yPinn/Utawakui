import { readFileSync } from 'node:fs';
import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AppRightDockHeader from './AppRightDockHeader.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const source = readFileSync(
  new URL('./AppRightDockHeader.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [AppRightDockHeader, './AppRightDockHeader.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('AppRightDockHeader', () => {
  it('owns the shared title, optional context, divider, and close action', () => {
    const onClose = vi.fn();
    const { app, root } = mount(AppRightDockHeader, {
      title: '播放資訊',
      subtitle: '深夜練唱清單',
      closeLabel: '關閉播放資訊',
      onClose,
    });
    const header = findAll(root, (node) => node.type === 'header')[0];
    const heading = findAll(root, (node) => node.type === 'h2')[0];
    const subtitle = findAll(root, (node) => node.type === 'p')[0];
    const close = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '關閉播放資訊',
    )[0];

    expect(String(header.props.class)).toContain('app-right-dock-header');
    expect(textContent(heading)).toBe('播放資訊');
    expect(textContent(subtitle)).toBe('深夜練唱清單');
    expect(String(close.props.class)).toContain('app-right-dock-header__close');
    trigger(close, 'onClick');
    expect(onClose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('does not reserve a subtitle line for title-only Queue chrome', () => {
    const { app, root } = mount(AppRightDockHeader, {
      title: '佇列',
      closeLabel: '關閉播放佇列',
    });

    expect(findAll(root, (node) => node.type === 'p')).toHaveLength(0);
    expect(textContent(root)).toContain('佇列');
    app.unmount();
  });

  it('accepts caller-owned identity chrome while preserving the shared close action', () => {
    const onClose = vi.fn();
    const { app, root } = mount(
      AppRightDockHeader,
      {
        title: '播放清單',
        closeLabel: '關閉播放清單',
        onClose,
      },
      {
        identity: () => h('div', { role: 'tablist' }, '佇列 最近播放'),
      },
    );
    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];
    const close = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '關閉播放清單',
    )[0];

    expect(textContent(tablist)).toBe('佇列 最近播放');
    expect(findAll(root, (node) => node.type === 'h2')).toHaveLength(0);
    trigger(close, 'onClick');
    expect(onClose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps Dock title and context on distinct semantic type tiers', () => {
    expect(source).toMatch(
      /\.app-right-dock-header__identity\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-side-panel-list-gap\);/su,
    );
    expect(source).toMatch(
      /\.app-right-dock-header h2\s*\{[^}]*font-size:\s*var\(--ui-font-size-lg\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-title\);/su,
    );
    expect(source).toMatch(
      /\.app-right-dock-header p\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*font-weight:\s*var\(--ui-font-weight-regular\);[^}]*line-height:\s*var\(--ui-line-height-caption\);/su,
    );
    expect(source).not.toMatch(/font-size:\s*(?:\d|\.)+(?:px|rem)/u);
    expect(source).not.toMatch(
      /\.app-right-dock-header p\s*\{[^}]*margin-top:/su,
    );
  });
});
