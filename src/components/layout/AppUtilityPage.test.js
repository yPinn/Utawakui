import { h, inject } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import AppUtilityPage from './AppUtilityPage.vue';
import UiButton from '../ui/UiButton.vue';
import UiSurface from '../ui/UiSurface.vue';
import { UI_OVERLAY_HOST_KEY } from '../../composables/useUiOverlayHost.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [AppUtilityPage, './AppUtilityPage.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const source = readFileSync(
  new URL('./AppUtilityPage.vue', import.meta.url),
  'utf8',
);

describe('AppUtilityPage', () => {
  it('owns the complete Utility surface boundary and its overlay host', () => {
    expect(source).toContain("provideUiOverlayHost('app-utility')");
    expect(source).toContain("registeredSurfaceAttributes('app-utility')");
    expect(source).toContain("registeredOverlayHostAttributes('app-utility')");
    expect(source).toContain('v-bind="appUtilityAttributes"');
    expect(source).toContain('v-bind="appUtilityOverlayHostAttributes"');
  });

  it('provides the Utility overlay host to slotted feature descendants', () => {
    const OverlayProbe = {
      setup() {
        const host = inject(UI_OVERLAY_HOST_KEY);
        return () => h('span', { 'data-overlay-host': host });
      },
    };
    const { app, root } = mount(
      AppUtilityPage,
      { title: '設定' },
      { default: () => h(OverlayProbe) },
    );
    const probe = findAll(root, (node) => node.props?.['data-overlay-host'])[0];

    expect(probe.props['data-overlay-host']).toBe('#app-utility-overlay');
    app.unmount();
  });

  it('provides one labelled utility surface and an explicit return action', () => {
    const onBack = vi.fn();
    const { app, root } = mount(
      AppUtilityPage,
      {
        title: '設定',
        description: '管理本機工作流程與應用程式行為。',
        backLabel: '返回歌單',
        onBack,
      },
      { default: () => h('p', '設定內容') },
    );
    const heading = findAll(root, (node) => node.type === 'h1')[0];
    const back = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '返回歌單',
    )[0];
    const surface = findAll(root, (node) => node.type === 'section')[0];

    expect(heading.props.id).toBe('app-utility-page-title');
    expect(heading.props.tabindex).toBe('-1');
    expect(surface.props['aria-labelledby']).toBe('app-utility-page-title');
    expect(textContent(root)).toContain('管理本機工作流程與應用程式行為。');
    expect(textContent(root)).toContain('設定內容');
    trigger(back, 'onClick');
    expect(onBack).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('focuses the heading on mount and leaves scrolling to its content owner', () => {
    expect(source).toContain("const titleElement = useTemplateRef('title')");
    expect(source).toContain('onMounted(() => titleElement.value?.focus())');
    expect(source).not.toContain('UiScrollRegion');
    expect(source).toMatch(
      /\.app-utility-page\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.app-utility-page__body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su,
    );
  });
});
