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
const trackRowSource = readFileSync(
  new URL('../ui/UiTrackRow.vue', import.meta.url),
  'utf8',
);
const activeTokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const v2TokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
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
  it('mounts the resize hook only while the Dock is expanded', () => {
    expect(source).toContain('useAppRightDockWidth');
    expect(source).toMatch(
      /<div\s+v-if="expanded"\s+class="app-right-dock__handle"/u,
    );
    expect(source).toContain('role="separator"');
    expect(source).toContain('@pointerdown="dockWidth.startResize($event)"');
    expect(source).toContain('cursor: col-resize');
    expect(source).toMatch(
      /\.app-right-dock--expanded\s*\{[^}]*width:\s*var\(--ui-right-dock-width\);/su,
    );

    const collapsed = mount(AppRightDock, {
      expanded: false,
      label: '播放資訊',
      contentId: 'app-right-dock-content',
    });
    const expanded = mount(AppRightDock, {
      expanded: true,
      label: '播放資訊',
      contentId: 'app-right-dock-content',
    });

    expect(
      findAll(collapsed.root, (node) => node.props.role === 'separator'),
    ).toHaveLength(0);
    expect(
      findAll(expanded.root, (node) => node.props.role === 'separator'),
    ).toHaveLength(1);
    collapsed.app.unmount();
    expanded.app.unmount();
  });

  it('keeps keyboard resizing and double-click folding on the expanded hook', () => {
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
    trigger(handle, 'onDblclick');
    expect(onToggleExpanded).toHaveBeenCalledTimes(3);

    dockWidth.width.value = originalWidth;
    app.unmount();
  });

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
    expect(String(aside.props.class)).toContain('ui-surface--stroke-inset');
    expect(content.props.inert).toBe(false);
    expect(content.props['aria-hidden']).toBe(false);
    expect(textContent(content)).toContain('Queue content');
    app.unmount();
  });

  it('uses the persistent Chrome semantic boundary in both Dock states', () => {
    for (const expanded of [true, false]) {
      const { app, root } = mount(AppRightDock, {
        expanded,
        label: '播放資訊',
        contentId: 'app-right-dock-content',
      });
      const aside = findAll(root, (node) => node.type === 'aside')[0];

      expect(aside.props['data-ui-region']).toBe('chrome');
      app.unmount();
    }

    expect(source).toMatch(
      /<UiSurface[\s\S]*?data-ui-region="chrome"[\s\S]*?tag="aside"/u,
    );
    expect(source).toMatch(
      /\.app-right-dock\.app-right-dock--collapsed\s*\{[^}]*background:\s*transparent;/su,
    );
  });

  it('re-resolves Dock paint aliases inside the Chrome boundary', () => {
    expect(source).toMatch(
      /\.app-right-dock\s*\{[^}]*--ui-right-dock-section-surface-background:\s*var\(\s*--ui-color-surface-raised\s*\);/su,
    );
    expect(source).toMatch(
      /\.app-right-dock\s*\{[^}]*--ui-right-dock-sticky-background:\s*color-mix\(\s*in srgb,\s*var\(--ui-color-surface\) 88%,\s*transparent\s*\);/su,
    );
  });

  it('turns the collapsed local boundary into an explicit restore action', () => {
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
    expect(String(expand.props.class)).toContain('ui-icon-btn--md');
    expect(String(expand.props.class)).toContain('ui-icon-btn--command');
    expect(String(expand.props.class)).not.toContain('ui-icon-btn--ghost');
    expect(String(expand.props.class)).not.toContain('ui-icon-btn--active');
    expect(String(expand.props.class)).not.toContain('ui-icon-btn--entry');
    expect(String(expand.props.class)).not.toContain('ui-icon-btn--stretch');
    trigger(expand, 'onClick');
    expect(onExpand).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('shrinks the collapsed root to the lower-right restore control boundary', () => {
    expect(source).toMatch(
      /\.app-right-dock\s*\{[^}]*pointer-events:\s*auto;/su,
    );
    expect(source).toMatch(
      /\.app-right-dock--expanded\s*\{[^}]*width:\s*var\(--ui-right-dock-width\);[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.app-right-dock--collapsed\s*\{[^}]*width:\s*var\(--ui-right-dock-rail-width\);[^}]*height:\s*calc\(var\(--ui-right-dock-rail-width\) \+ var\(--ui-space-1\)\);/su,
    );
    expect(source).not.toMatch(/\.app-right-dock\s*\{[^}]*height:\s*100%;/su);
    expect(source).toMatch(
      /\.app-right-dock__expand\s*\{[^}]*--ui-icon-button-size-override:\s*var\(--ui-right-dock-rail-width\);[^}]*position:\s*absolute;[^}]*inset-inline-end:\s*0;[^}]*inset-block-end:\s*var\(--ui-space-1\);/su,
    );
    expect(source).toMatch(
      /\.app-right-dock\.app-right-dock--collapsed\s*\{[^}]*overflow:\s*clip;[^}]*overflow-clip-margin:\s*var\(--ui-space-2\);/su,
    );
    expect(source).toMatch(
      /\.app-right-dock\.app-right-dock--collapsed::after\s*\{[^}]*border-color:\s*transparent;/su,
    );
    expect(source).not.toMatch(
      /<UiIconButton[\s\S]*?class="app-right-dock__expand"[\s\S]*?\sstretch(?:\s|\/>)/u,
    );
  });

  it('keeps content mounted and animates only composited properties', () => {
    expect(source).not.toContain(':hidden="!expanded"');
    expect(source).toMatch(
      /\.app-right-dock__content\s*\{[^}]*opacity:[^}]*transform:[^}]*transition:/su,
    );
    expect(source).toMatch(
      /\.app-right-dock--collapsed\s+\.app-right-dock__content\s*\{[^}]*opacity:\s*0;[^}]*transform:/su,
    );
    // Geometry snaps after the composited exit; it is never interpolated.
    expect(source).toContain('width 0s linear var(--ui-motion-duration-fast)');
    expect(source).toContain('height 0s linear var(--ui-motion-duration-fast)');
    expect(source).toContain('--ui-motion-easing-enter');
    expect(source).toContain('--ui-motion-easing-exit');
    expect(source).toContain("data-ui-motion='reduced'");
    expect(source).toContain('prefers-reduced-motion: reduce');
  });

  it('lets a bottom-origin surface own motion without adding a parent displacement', () => {
    const { app, root } = mount(AppRightDock, {
      expanded: false,
      motionOrigin: 'bottom',
      label: '播放佇列',
      contentId: 'queue-motion',
    });
    const aside = findAll(root, (node) => node.type === 'aside')[0];
    expect(String(aside.props.class)).toContain('app-right-dock--bottom');
    expect(source).toMatch(
      /\.app-right-dock--bottom \.app-right-dock__content\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;/su,
    );
    expect(source).toMatch(
      /\.app-right-dock--bottom\.app-right-dock--expanded\s*\{[^}]*transition:\s*none;/su,
    );
    app.unmount();
  });

  it('uses shared optical and spacing tokens for the expanded resize axis', () => {
    for (const tokenSource of [activeTokenSource, v2TokenSource]) {
      expect(tokenSource).toContain(
        '--ui-resize-handle-hit-size: var(--ui-space-3);',
      );
    }
    expect(source).toContain('inline-size: var(--ui-resize-handle-hit-size);');
    expect(source).toContain('inline-size: var(--ui-drag-indicator-width);');
    expect(source).not.toContain('width: 6px;');
    expect(source).not.toContain('width: 2px;');
  });

  it('owns a fixed-density 52/40 row with the shared side-panel boundary', () => {
    for (const tokenSource of [activeTokenSource, v2TokenSource]) {
      expect(tokenSource).toContain(
        '--ui-right-dock-content-inset: var(--ui-side-panel-content-inset);',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-section-gap: var(--ui-side-panel-section-gap);',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-content-gap: var(--ui-side-panel-content-gap);',
      );
      expect(tokenSource).not.toContain(
        '--ui-right-dock-scroll-content-inset-inline-end',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-row-min-height: 3.25rem;',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-artwork-size: var(--ui-track-artwork-size-standard);',
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-row-padding-inline: var(--ui-space-1);',
      );
      expect(tokenSource).toMatch(
        /--ui-right-dock-track-row-state-surface-outset-inline:\s*var\(\s*--ui-side-panel-row-state-surface-outset-inline\s*\);/u,
      );
      expect(tokenSource).toContain(
        '--ui-right-dock-track-row-radius: var(--ui-side-panel-row-radius);',
      );
    }

    const compactBlock = v2TokenSource.match(
      /:root\[data-ui-density='compact'\]\s+\[data-ui-system='v2'\]\[data-ui-surface-root='true'\]\s*\{([\s\S]*?)\n\}/u,
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
    expect(compactBlock).not.toContain('--ui-right-dock-track-row-radius');
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
    expect(source).toMatch(
      /--ui-track-row-radius:\s*var\(\s*--ui-right-dock-track-row-radius\s*\);/su,
    );
    expect(trackRowSource).toContain(
      'border-radius: var(--ui-track-row-radius, var(--ui-radius-md));',
    );
    expect(source).not.toContain('--ui-track-row-selected-surface');
    expect(source).not.toContain('--ui-track-row-active-shadow');
    expect(source).not.toContain('--ui-sidebar-row-min-height');
    expect(source).not.toContain('--ui-sidebar-artwork-size');
  });

  it('paints hover and pressed feedback on the same state surface as selection', () => {
    expect(trackRowSource).toMatch(
      /\.ui-track--interactive:not\(\.ui-track--active\):hover::before\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(trackRowSource).toMatch(
      /\.ui-track--interactive:has\(\.ui-track__action:active\)::before\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/su,
    );
    expect(trackRowSource).not.toMatch(
      /\.ui-track__action:(?:hover|active)\s*\{[^}]*background:/su,
    );
  });
});
