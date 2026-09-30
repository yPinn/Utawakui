import { h } from 'vue';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import AppArchiveFrame from './AppArchiveFrame.vue';
import AppInnerPage from './AppInnerPage.vue';
import AppTopTabs from './AppTopTabs.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
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
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
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

describe('AppArchiveFrame primary workspace', () => {
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

  it('does not own the shell-level Inspector slot or layout', () => {
    const source = readFileSync(
      new URL('./AppArchiveFrame.vue', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('<slot name="context"');
    expect(source).not.toContain('app-archive-frame--with-context');
    expect(source).not.toContain('app-archive-frame__context');
  });

  it('keeps the inner page content inset equal on all four sides', () => {
    const source = readFileSync(
      new URL('./AppInnerPage.vue', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /\.app-inner-page__content\s*\{[\s\S]*?padding:\s*var\(--ui-space-4\);/u,
    );
    expect(source).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-inner-page__content\s*\{[\s\S]*?padding:\s*var\(--ui-space-3\);/u,
    );
    expect(source).not.toMatch(
      /\.app-inner-page__content\s*\{[\s\S]*?padding:[^;]*--ui-archive-rail-size/u,
    );
  });
});
