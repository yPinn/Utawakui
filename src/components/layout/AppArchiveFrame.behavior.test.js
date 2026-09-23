import { h } from 'vue';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import AppArchiveFrame from './AppArchiveFrame.vue';
import AppInnerPage from './AppInnerPage.vue';
import AppTopTabs from './AppTopTabs.vue';
import UiSurface from '../ui/UiSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [AppArchiveFrame, './AppArchiveFrame.vue'],
  [AppInnerPage, './AppInnerPage.vue'],
  [AppTopTabs, './AppTopTabs.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function findByClass(root, className) {
  return findAll(root, (node) =>
    String(node.props?.class ?? '')
      .split(' ')
      .includes(className),
  );
}

function ancestorClasses(node) {
  const classes = [];
  let current = node.parent;
  while (current) {
    classes.push(...String(current.props?.class ?? '').split(' '));
    current = current.parent;
  }
  return classes;
}

describe('AppArchiveFrame context plane', () => {
  it('keeps the shell and Inspector on one compact-context breakpoint', () => {
    const frameSource = readFileSync(
      new URL('./AppArchiveFrame.vue', import.meta.url),
      'utf8',
    );
    const inspectorSource = readFileSync(
      new URL(
        '../playlists/StudioLibraryContextInspector.vue',
        import.meta.url,
      ),
      'utf8',
    );
    const breakpointPattern = /@media \(max-width: ([^)]+)\)/g;
    const frameBreakpoints = [...frameSource.matchAll(breakpointPattern)].map(
      (match) => match[1],
    );
    const inspectorBreakpoints = [
      ...inspectorSource.matchAll(breakpointPattern),
    ].map((match) => match[1]);

    expect(frameBreakpoints).toEqual(['70rem']);
    expect(inspectorBreakpoints).toEqual(frameBreakpoints);
  });

  it('aligns the context plane to the primary column top baseline, without doubling up its shared bottom gutter', () => {
    const source = readFileSync(
      new URL('./AppArchiveFrame.vue', import.meta.url),
      'utf8',
    );

    // Only the primary column has AppTopTabs above it, so the context
    // plane needs its own explicit top inset to match that column's actual
    // card start (--ui-archive-content-inset, shared with App.vue's
    // .shell__sidebar). No matching padding-bottom, though: .shell__main
    // already wraps this whole frame (both columns) in its own
    // padding-bottom, so one here too would double the gutter and leave
    // this column's bottom edge higher than the primary column's.
    expect(source).toMatch(
      /\.app-archive-frame__context\s*\{[^}]*padding-top:\s*var\(--ui-archive-content-inset\);[^}]*\}/su,
    );
    const contextBlockMatch = source.match(
      /\.app-archive-frame__context\s*\{([^}]*)\}/su,
    );
    expect(contextBlockMatch[1]).not.toMatch(/padding-bottom\s*:/);
    expect(source).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*\.app-archive-frame__context\s*\{[^}]*inset-block:\s*0;/u,
    );
  });

  it('does not create an empty outer rail when the page has no context content', () => {
    const { app, root } = mount(
      AppArchiveFrame,
      { activeView: 'setlist' },
      { default: () => h('p', '主要頁面') },
    );

    expect(findByClass(root, 'app-archive-frame__context')).toHaveLength(0);
    expect(textContent(root)).toContain('主要頁面');
    app.unmount();
  });

  it('keeps context content outside AppInnerPage while preserving the primary slot', () => {
    const { app, root } = mount(
      AppArchiveFrame,
      { activeView: 'setlist' },
      {
        default: () => h('p', { 'data-plane': 'primary' }, '主要頁面'),
        context: () => h('p', { 'data-plane': 'context' }, '外部資料'),
      },
    );
    const primary = findAll(
      root,
      (node) => node.props?.['data-plane'] === 'primary',
    )[0];
    const context = findAll(
      root,
      (node) => node.props?.['data-plane'] === 'context',
    )[0];

    expect(findByClass(root, 'app-archive-frame__context')).toHaveLength(1);
    expect(ancestorClasses(primary)).toContain('app-inner-page__content');
    expect(ancestorClasses(context)).not.toContain('app-inner-page');
    expect(ancestorClasses(context)).not.toContain('app-inner-page__content');
    app.unmount();
  });
});
