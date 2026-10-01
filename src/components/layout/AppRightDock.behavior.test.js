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
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
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
const activeTokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const v2TokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [AppRightDock, './AppRightDock.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
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
      (node) => node.type === 'button' && textContent(node) === '展開播放佇列',
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

  it('owns a fixed-density 52/40 row with Sidebar-aligned 8/4/4 insets', () => {
    for (const tokenSource of [activeTokenSource, v2TokenSource]) {
      expect(tokenSource).toContain(
        '--ui-right-dock-content-inset: var(--ui-space-2);',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-row-min-height: 3.25rem;',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-artwork-size: 2.5rem;',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-row-padding-inline: var(--ui-space-1);',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-row-state-surface-outset-inline: var(--ui-space-1);',
      );
    }

    const compactBlock = v2TokenSource.match(
      /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    expect(compactBlock).not.toContain('--ui-right-dock-content-inset');
    expect(compactBlock).not.toContain('--ui-right-dock-track-row-min-height');
    expect(compactBlock).not.toContain('--ui-right-dock-track-artwork-size');
    expect(compactBlock).not.toContain(
      '--ui-right-dock-track-row-padding-inline',
    );
    expect(compactBlock).not.toContain(
      '--ui-right-dock-track-row-state-surface-outset-inline',
    );
  });

  it('scopes the fixed Track Row recipe to Right Dock descendants', () => {
    expect(source).toMatch(
      /\.app-right-dock\s*\{[^}]*--ui-track-row-min-height:\s*var\(--ui-right-dock-track-row-min-height\);[^}]*--ui-track-row-thumb-size:\s*var\(--ui-right-dock-track-artwork-size\);/su,
    );
    expect(source).toMatch(
      /--ui-track-row-padding-inline:\s*var\(\s*--ui-right-dock-track-row-padding-inline\s*\);/su,
    );
    expect(source).toMatch(
      /--ui-track-row-state-surface-outset-inline:\s*var\(\s*--ui-right-dock-track-row-state-surface-outset-inline\s*\);/su,
    );
    expect(source).toContain('--ui-track-row-selected-surface: color-mix(');
    expect(source).toContain('var(--ui-color-text) 8%');
    expect(source).toContain('--ui-track-row-active-shadow: none;');
    expect(source).not.toContain('--ui-sidebar-row-min-height');
    expect(source).not.toContain('--ui-sidebar-artwork-size');
  });
});
