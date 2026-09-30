import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import UiButton from './UiButton.vue';
import UiIconButton from './UiIconButton.vue';
import UiNotice from './UiNotice.vue';
import UiSearchBox from './UiSearchBox.vue';
import UiStatusIcon from './UiStatusIcon.vue';
import UiTabs from './UiTabs.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { Volume2 } from '../../icons/index.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiButton, './UiButton.vue'],
  [UiIconButton, './UiIconButton.vue'],
  [UiNotice, './UiNotice.vue'],
  [UiSearchBox, './UiSearchBox.vue'],
  [UiStatusIcon, './UiStatusIcon.vue'],
  [UiTabs, './UiTabs.vue'],
  [UiScrollRegion, './UiScrollRegion.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('shared UI interaction contracts', () => {
  it('keeps icon glyphs small without exposing a 24px interactive size', () => {
    const source = readFileSync(
      new URL('./UiIconButton.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      "validator: (value) => ['md', 'lg'].includes(value)",
    );
    expect(source).not.toContain("'sm'");
    expect(source).not.toContain('.ui-icon-btn--sm');
    expect(source).toContain(':size="ICON_SIZE"');
  });

  it('lets an icon button stretch into a parent-owned disclosure hit area', () => {
    const { app, root } = mount(UiIconButton, {
      icon: Volume2,
      label: '展開集合資料',
      stretch: true,
    });
    const button = findAll(root, (node) => node.type === 'button')[0];

    expect(String(button.props.class)).toContain('ui-icon-btn--stretch');
    expect(button.props['aria-label']).toBeUndefined();
    expect(textContent(button)).toContain('展開集合資料');

    const source = readFileSync(
      new URL('./UiIconButton.vue', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /\.ui-icon-btn--stretch\s*\{[^}]*min-width:\s*var\(--ui-icon-btn-size\);[^}]*min-height:\s*var\(--ui-icon-btn-size\);[^}]*width:\s*100%;[^}]*height:\s*100%;/su,
    );
    expect(source).toContain('--ui-icon-button-size-override');
    expect(source).toContain('.ui-icon-btn--ghost:not(:disabled):hover');
    expect(source).toContain('.ui-icon-btn--ghost:not(:disabled):active');
    app.unmount();
  });

  it('uses the semantic information glyph for informational notices', () => {
    const { app, root } = mount(UiNotice, {
      tone: 'info',
      title: '遷移切面',
      message: '資料來自目前的本機曲庫。',
      compact: true,
    });
    const notice = findAll(root, (node) => node.props.role === 'status')[0];
    const icon = findAll(root, (node) => node.type === 'svg')[0];

    expect(String(notice.props.class)).toContain('ui-notice--compact');
    expect(String(icon.props.class)).toContain('lucide-info');
    app.unmount();
  });

  it('keeps notice title spacing on the shared spacing scale', () => {
    const source = readFileSync(
      new URL('./UiNotice.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'margin-block-start: calc(var(--ui-space-1) / 2);',
    );
    expect(source).not.toContain('margin-block-start: 0.125rem;');
  });

  it('keeps search labeling, native attributes, disabled state, and clearing explicit', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSearchBox, {
      id: 'library-search',
      label: '搜尋本機曲庫',
      modelValue: 'miku',
      disabled: true,
      name: 'query',
      class: 'review-strata__search',
      'data-control': 'library-query',
      'onUpdate:modelValue': update,
    });

    const input = findAll(root, (node) => node.type === 'input')[0];
    const label = findAll(root, (node) => node.type === 'label')[0];
    const clear = findAll(
      root,
      (node) => node.props?.['aria-label'] === '清除搜尋',
    )[0];
    const searchRoot = findAll(root, (node) =>
      String(node.props.class || '').includes('ui-search-box'),
    )[0];
    expect(String(searchRoot.props.class)).toContain('review-strata__search');
    expect(String(input.props.class)).not.toContain('review-strata__search');
    expect(label.props.for).toBe('library-search');
    expect(input.props).toMatchObject({
      id: 'library-search',
      name: 'query',
      'data-control': 'library-query',
      disabled: true,
    });
    expect(clear.props.disabled).toBe(true);
    trigger(clear, 'onClick');
    expect(update).not.toHaveBeenCalled();
    app.unmount();
  });

  it('turns a loading button into a disabled, announced action', () => {
    const { app, root } = mount(
      UiButton,
      { loading: true, loadingLabel: '正在儲存' },
      { default: () => '儲存' },
    );
    const button = findAll(root, (node) => node.type === 'button')[0];
    expect(button.props.disabled).toBe(true);
    expect(button.props['aria-busy']).toBe(true);
    expect(textContent(button)).toContain('正在儲存');
    expect(textContent(button)).not.toContain('儲存儲存');
    app.unmount();
  });

  it('distinguishes standalone status meaning from a decorative duplicate', () => {
    const standalone = mount(UiStatusIcon, {
      icon: Volume2,
      label: '目前播放',
    });
    const standaloneRoot = findAll(standalone.root, (node) =>
      String(node.props?.class ?? '').includes('ui-status-icon'),
    )[0];

    expect(standaloneRoot.props.role).toBe('img');
    expect(standaloneRoot.props['aria-label']).toBe('目前播放');
    expect(standaloneRoot.props['aria-hidden']).toBeUndefined();
    standalone.app.unmount();

    const decorative = mount(UiStatusIcon, {
      icon: Volume2,
      label: '目前播放',
      decorative: true,
    });
    const decorativeRoot = findAll(decorative.root, (node) =>
      String(node.props?.class ?? '').includes('ui-status-icon'),
    )[0];

    expect(decorativeRoot.props.role).toBeUndefined();
    expect(decorativeRoot.props['aria-label']).toBeUndefined();
    expect(decorativeRoot.props['aria-hidden']).toBe('true');
    decorative.app.unmount();
  });

  it('implements roving tab focus and skips disabled tabs', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiTabs, {
      items: [
        { id: 'library', label: '曲庫' },
        { id: 'disabled', label: '停用', disabled: true },
        { id: 'queue', label: '佇列' },
      ],
      activeId: 'library',
      ariaLabel: '工作區',
      tabIdPrefix: 'workspace',
      panelIdPrefix: 'workspace',
      'onUpdate:activeId': update,
    });

    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];
    const tabs = findAll(root, (node) => node.props.role === 'tab');
    expect(tablist.props['aria-label']).toBe('工作區');
    expect(tabs[0].props).toMatchObject({
      id: 'workspace-library-tab',
      'aria-controls': 'workspace-library-panel',
      'aria-selected': true,
      tabindex: 0,
    });
    expect(tabs[1].props.disabled).toBe(true);

    const event = { key: 'ArrowRight', preventDefault: vi.fn() };
    trigger(tabs[0], 'onKeydown', event);
    await nextTick();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('queue');
    expect(tabs[2].focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
