import { describe, expect, it, vi } from 'vitest';
import AppRightDockHeader from './AppRightDockHeader.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [AppRightDockHeader, './AppRightDockHeader.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
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
      (node) => node.props['aria-label'] === '關閉播放資訊',
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
});
