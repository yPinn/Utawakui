import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AppRightDockHeader from './AppRightDockHeader.vue';
import AppRightDockPanel from './AppRightDockPanel.vue';
import AppRightDockSection from './AppRightDockSection.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const panelSource = readFileSync(
  new URL('./AppRightDockPanel.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [AppRightDockPanel, './AppRightDockPanel.vue'],
  [AppRightDockSection, './AppRightDockSection.vue'],
  [AppRightDockHeader, './AppRightDockHeader.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('AppRightDockPanel', () => {
  it('reserves the overlay scrollbar lane outside the Dock content boundary', () => {
    expect(panelSource).toMatch(
      /\.app-right-dock-panel__body\s*\{[^}]*padding-block:\s*var\(--ui-right-dock-content-inset\);[^}]*padding-inline-start:\s*var\(--ui-right-dock-content-inset\);[^}]*padding-inline-end:\s*calc\(\s*var\(--ui-right-dock-content-inset\)\s*\+\s*var\(--ui-scrollbar-lane-size\)\s*\);/su,
    );
    expect(panelSource).not.toMatch(
      /\.app-right-dock-panel__body\s*\{[^}]*padding:\s*var\(--ui-right-dock-content-inset\);/su,
    );
  });

  it('owns one labelled panel, fixed header, and vertical scroll viewport', () => {
    const onClose = vi.fn();
    const { app, root } = mount(
      AppRightDockPanel,
      {
        title: '播放資訊',
        subtitle: '目前佇列',
        closeLabel: '關閉播放資訊',
        onClose,
      },
      {
        identity: () => 'Identity controls',
        default: () => 'Panel content',
      },
    );
    const panel = findAll(root, (node) => node.type === 'section')[0];
    const viewports = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-scroll-region__viewport'),
    );
    const close = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '關閉播放資訊',
    )[0];

    expect(panel.props['aria-label']).toBe('播放資訊');
    expect(textContent(root)).toContain('Identity controls');
    expect(textContent(root)).toContain('Panel content');
    expect(viewports).toHaveLength(1);
    trigger(close, 'onClick');
    expect(onClose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('adds header elevation only after its own viewport scrolls', async () => {
    const { app, root } = mount(
      AppRightDockPanel,
      {
        title: '播放清單',
        closeLabel: '關閉播放清單',
      },
      { default: () => 'Queue content' },
    );
    const chrome = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('app-right-dock-panel__chrome'),
    )[0];
    const viewport = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-scroll-region__viewport'),
    )[0];

    expect(String(chrome.props.class)).not.toContain(
      'app-right-dock-panel__chrome--scrolled',
    );
    trigger(viewport, 'onScroll', { currentTarget: { scrollTop: 12 } });
    await nextTick();
    expect(String(chrome.props.class)).toContain(
      'app-right-dock-panel__chrome--scrolled',
    );
    app.unmount();
  });
});

describe('AppRightDockSection', () => {
  it('provides a flat labelled section with an optional divider', () => {
    const { app, root } = mount(
      AppRightDockSection,
      { heading: '接下來', divided: true },
      { trailing: () => '3 首', default: () => 'Track rows' },
    );
    const section = findAll(root, (node) => node.type === 'section')[0];
    const separator = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-separator'),
    )[0];

    expect(section.props['aria-labelledby']).toBeTruthy();
    expect(textContent(root)).toContain('接下來');
    expect(textContent(root)).toContain('3 首');
    expect(textContent(root)).toContain('Track rows');
    expect(separator.props['aria-hidden']).toBe('true');
    expect(String(section.props.class)).not.toContain('ui-surface');
    app.unmount();
  });
});
