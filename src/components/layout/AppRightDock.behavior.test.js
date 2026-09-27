import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import AppRightDock from './AppRightDock.vue';
import {
  RIGHT_DOCK_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN,
  useAppRightDockWidth,
} from '../../composables/useAppRightDockWidth.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSurface from '../ui/UiSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const source = readFileSync(
  new URL('./AppRightDock.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [AppRightDock, './AppRightDock.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('AppRightDock', () => {
  it('hosts expanded content in one labelled right-side surface', () => {
    const { app, root } = mount(
      AppRightDock,
      {
        expanded: true,
        label: '播放佇列',
        contentId: 'app-right-dock-content',
      },
      { default: () => 'Queue content' },
    );
    const aside = findAll(root, (node) => node.type === 'aside')[0];
    const content = findAll(
      root,
      (node) => node.props.id === 'app-right-dock-content',
    )[0];

    expect(aside.props['aria-label']).toBe('播放佇列');
    expect(String(aside.props.class)).toContain('app-right-dock--expanded');
    expect(content.props.inert).toBe(false);
    expect(content.props['aria-hidden']).toBe(false);
    expect(textContent(content)).toContain('Queue content');
    app.unmount();
  });

  it('turns the collapsed rail into an explicit restore action', () => {
    const onExpand = vi.fn();
    const { app, root } = mount(AppRightDock, {
      expanded: false,
      label: '播放佇列',
      expandLabel: '展開播放佇列',
      contentId: 'app-right-dock-content',
      onExpand,
    });
    const aside = findAll(root, (node) => node.type === 'aside')[0];
    const content = findAll(
      root,
      (node) => node.props.id === 'app-right-dock-content',
    )[0];
    const expand = findAll(
      root,
      (node) => node.props['aria-label'] === '展開播放佇列',
    )[0];

    expect(aside.props['aria-label']).toBe('播放佇列（已摺疊）');
    expect(String(aside.props.class)).toContain('app-right-dock--collapsed');
    expect(content.props.inert).toBe(true);
    expect(content.props['aria-hidden']).toBe(true);
    expect(expand.props['aria-controls']).toBe('app-right-dock-content');
    expect(expand.props['aria-expanded']).toBe(false);
    trigger(expand, 'onClick');
    expect(onExpand).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps content mounted and animates only composited properties', () => {
    expect(source).not.toContain(':hidden="!expanded"');
    expect(source).toMatch(
      /\.app-right-dock__content\s*\{[^}]*opacity:[^}]*transform:[^}]*transition:/su,
    );
    expect(source).toMatch(
      /\.app-right-dock--collapsed\s+\.app-right-dock__content\s*\{[^}]*opacity:\s*0;[^}]*transform:/su,
    );
    expect(source).not.toMatch(/transition:\s*width/u);
    expect(source).toContain('--ui-motion-easing-enter');
    expect(source).toContain('--ui-motion-easing-exit');
    expect(source).toContain("data-ui-motion='reduced'");
    expect(source).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps the resize axis available for bidirectional double-click folding', () => {
    const onToggleExpanded = vi.fn();
    const expanded = mount(AppRightDock, {
      expanded: true,
      label: '播放資訊',
      contentId: 'app-right-dock-content',
      onToggleExpanded,
    });
    const expandedHandle = findAll(
      expanded.root,
      (node) => node.props.role === 'separator',
    )[0];

    expect(typeof expandedHandle.props.onPointerdown).toBe('function');
    trigger(expandedHandle, 'onDblclick');
    expect(onToggleExpanded).toHaveBeenCalledOnce();
    expanded.app.unmount();

    const collapsed = mount(AppRightDock, {
      expanded: false,
      label: '播放資訊',
      expandLabel: '展開播放資訊',
      contentId: 'app-right-dock-content',
      onToggleExpanded,
    });
    const collapsedHandle = findAll(
      collapsed.root,
      (node) => node.props.role === 'separator',
    )[0];

    expect(typeof collapsedHandle.props.onDblclick).toBe('function');
    trigger(collapsedHandle, 'onDblclick');
    expect(onToggleExpanded).toHaveBeenCalledTimes(2);
    collapsed.app.unmount();
  });

  it('exposes value semantics and keyboard-equivalent resize and folding', () => {
    const dockWidth = useAppRightDockWidth();
    const originalWidth = dockWidth.width.value;
    const onToggleExpanded = vi.fn();
    dockWidth.width.value = 240;
    const { app, root } = mount(AppRightDock, {
      expanded: true,
      label: '播放資訊',
      contentId: 'app-right-dock-content',
      onToggleExpanded,
    });
    const handle = findAll(root, (node) => node.props.role === 'separator')[0];
    const key = (value) => ({ key: value, preventDefault: vi.fn() });

    expect(handle.props).toMatchObject({
      tabindex: '0',
      'aria-orientation': 'vertical',
      'aria-valuemin': RIGHT_DOCK_WIDTH_MIN,
      'aria-valuemax': RIGHT_DOCK_WIDTH_MAX,
      'aria-valuenow': 240,
      'aria-controls': 'app-right-dock-content',
      'aria-expanded': true,
    });

    const left = key('ArrowLeft');
    trigger(handle, 'onKeydown', left);
    expect(left.preventDefault).toHaveBeenCalledOnce();
    expect(dockWidth.width.value).toBe(248);

    trigger(handle, 'onKeydown', key('ArrowRight'));
    expect(dockWidth.width.value).toBe(240);
    trigger(handle, 'onKeydown', key('Home'));
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MIN);
    trigger(handle, 'onKeydown', key('End'));
    expect(dockWidth.width.value).toBe(RIGHT_DOCK_WIDTH_MAX);

    trigger(handle, 'onKeydown', key('Enter'));
    trigger(handle, 'onKeydown', key(' '));
    expect(onToggleExpanded).toHaveBeenCalledTimes(2);

    dockWidth.width.value = originalWidth;
    app.unmount();
  });

  it('uses shared optical and spacing tokens for the resize axis', () => {
    expect(source).toContain('inline-size: var(--ui-space-3);');
    expect(source).toContain('inline-size: var(--ui-drag-indicator-width);');
    expect(source).not.toContain('width: 6px;');
    expect(source).not.toContain('width: 2px;');
  });
});
