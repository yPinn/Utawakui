import { readFileSync } from 'node:fs';
import { h, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AppRightDockHeader from './AppRightDockHeader.vue';
import AppRightDockPanel from './AppRightDockPanel.vue';
import AppRightDockSection from './AppRightDockSection.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
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
const sectionSource = readFileSync(
  new URL('./AppRightDockSection.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [AppRightDockPanel, './AppRightDockPanel.vue'],
  [AppRightDockSection, './AppRightDockSection.vue'],
  [AppRightDockHeader, './AppRightDockHeader.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('AppRightDockPanel', () => {
  it('maps Dock content insets into the shared scroll-layout boundary', () => {
    for (const [layoutRole, featureRole] of [
      ['block-start', 'content-inset'],
      ['block-end', 'content-inset'],
      ['inline-start', 'content-inset'],
      ['inline-end', 'track-row-state-surface-outset-inline'],
    ]) {
      expect(panelSource).toMatch(
        new RegExp(
          `--ui-scroll-layout-padding-${layoutRole}:\\s*var\\(\\s*--ui-right-dock-${featureRole}\\s*\\);`,
          'u',
        ),
      );
    }
    expect(panelSource).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue';",
    );
    expect(panelSource).toContain('<UiScrollLayout');
    expect(panelSource).not.toContain('<UiScrollRegion');
    expect(panelSource).toMatch(
      /\.app-right-dock-panel__body\s*\{[^}]*display:\s*(?:flex|grid);[^}]*gap:\s*var\(--ui-right-dock-section-gap\);/su,
    );
    expect(panelSource).not.toMatch(
      /\.app-right-dock-panel__body\s*\{[^}]*padding(?:-|:)/su,
    );
  });

  it('owns one labelled panel, fixed header, and vertical scroll viewport', () => {
    const onCollapse = vi.fn();
    const { app, root } = mount(
      AppRightDockPanel,
      {
        title: '播放資訊',
        subtitle: '目前佇列',
        collapseLabel: '摺疊播放資訊',
        onCollapse,
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
    const collapse = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '摺疊播放資訊',
    )[0];

    expect(panel.props['aria-label']).toBe('播放資訊');
    expect(textContent(root)).toContain('Identity controls');
    expect(textContent(root)).toContain('Panel content');
    expect(viewports).toHaveLength(1);
    trigger(collapse, 'onClick');
    expect(onCollapse).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('adds header elevation only after its own viewport scrolls', async () => {
    const { app, root } = mount(
      AppRightDockPanel,
      {
        title: '播放清單',
        collapseLabel: '摺疊播放清單',
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

  it('keeps the viewport as scroll-state authority during imperative scrolling', async () => {
    const panelRef = shallowRef(null);
    const TestHost = {
      setup: () => () =>
        h(
          AppRightDockPanel,
          {
            ref: panelRef,
            title: '播放清單',
            collapseLabel: '摺疊播放清單',
          },
          { default: () => 'Queue content' },
        ),
    };
    const { app, root } = mount(TestHost);
    const chrome = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('app-right-dock-panel__chrome'),
    )[0];
    const viewport = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-scroll-region__viewport'),
    )[0];
    viewport.scrollTo = vi.fn();

    trigger(viewport, 'onScroll', { currentTarget: { scrollTop: 12 } });
    await nextTick();
    expect(String(chrome.props.class)).toContain(
      'app-right-dock-panel__chrome--scrolled',
    );

    panelRef.value.scrollTo({ top: 0, behavior: 'smooth' });
    await nextTick();
    expect(viewport.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
    expect(String(chrome.props.class)).toContain(
      'app-right-dock-panel__chrome--scrolled',
    );

    trigger(viewport, 'onScroll', { currentTarget: { scrollTop: 0 } });
    await nextTick();
    expect(String(chrome.props.class)).not.toContain(
      'app-right-dock-panel__chrome--scrolled',
    );
    app.unmount();
  });

  it('owns the complete scroll-elevation visual recipe', () => {
    expect(panelSource).toMatch(
      /\.app-right-dock-panel__chrome--scrolled\s*\{[^}]*backdrop-filter:\s*blur\(var\(--ui-right-dock-sticky-blur\)\);[^}]*box-shadow:\s*var\(--ui-right-dock-sticky-shadow\);/su,
    );
    expect(tokenSource).toContain('--ui-right-dock-sticky-background:');
    expect(tokenSource).toContain('--ui-right-dock-sticky-blur: 0.75rem;');
    expect(tokenSource).toContain('--ui-right-dock-sticky-shadow:');
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
    expect(String(section.props.class)).toContain(
      'app-right-dock-section--plain',
    );
    app.unmount();
  });

  it('offers a contained block without coupling it to divider semantics', () => {
    const { app, root } = mount(
      AppRightDockSection,
      { heading: '曲目資訊', appearance: 'contained' },
      { default: () => 'Track facts' },
    );
    const section = findAll(root, (node) => node.type === 'section')[0];
    const separators = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-separator'),
    );

    expect(String(section.props.class)).toContain(
      'app-right-dock-section--contained',
    );
    expect(separators).toHaveLength(0);
    app.unmount();
  });

  it('owns header/body rhythm while the parent owns spacing between sections', () => {
    expect(tokenSource).toContain(
      '--ui-right-dock-content-inset: var(--ui-side-panel-content-inset);',
    );
    expect(tokenSource).toContain(
      '--ui-right-dock-section-gap: var(--ui-side-panel-section-gap);',
    );
    expect(tokenSource).toContain(
      '--ui-right-dock-content-gap: var(--ui-side-panel-content-gap);',
    );
    expect(tokenSource).toContain(
      '--ui-right-dock-section-surface-padding: var(--ui-space-3);',
    );
    expect(sectionSource).toMatch(
      /\.app-right-dock-section--contained\s*\{[^}]*padding:\s*var\(--ui-right-dock-section-surface-padding\);/su,
    );
    expect(sectionSource).toMatch(
      /\.app-right-dock-section\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-right-dock-content-gap\);/su,
    );
    expect(sectionSource).toMatch(
      /\.app-right-dock-section__header\s*\{[^}]*gap:\s*var\(--ui-right-dock-content-gap\);/su,
    );
    expect(sectionSource).toMatch(
      /\.app-right-dock-section__body\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-right-dock-content-gap\);/su,
    );
    expect(sectionSource).not.toMatch(
      /\.app-right-dock-section__divider\s*\{[^}]*margin/u,
    );
  });
});
