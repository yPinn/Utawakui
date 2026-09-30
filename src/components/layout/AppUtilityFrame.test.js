import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import AppUtilityFrame from './AppUtilityFrame.vue';
import UiButton from '../ui/UiButton.vue';
import UiSurface from '../ui/UiSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [AppUtilityFrame, './AppUtilityFrame.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const source = readFileSync(
  new URL('./AppUtilityFrame.vue', import.meta.url),
  'utf8',
);

describe('AppUtilityFrame', () => {
  it('provides one labelled utility surface and an explicit return action', () => {
    const onBack = vi.fn();
    const { app, root } = mount(
      AppUtilityFrame,
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

    expect(heading.props.id).toBe('app-utility-frame-title');
    expect(heading.props.tabindex).toBe('-1');
    expect(surface.props['aria-labelledby']).toBe('app-utility-frame-title');
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
      /\.app-utility-frame\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.app-utility-frame__body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su,
    );
  });
});
