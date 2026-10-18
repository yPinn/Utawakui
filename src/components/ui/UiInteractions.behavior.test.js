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
import UiScrollLayout from './UiScrollLayout.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import UiTooltip from './UiTooltip.vue';
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
  [UiScrollLayout, './UiScrollLayout.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
  [UiTooltip, './UiTooltip.vue'],
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
    expect(source).toContain(
      ".ui-icon-btn--ghost:not(:disabled):not([aria-disabled='true']):hover",
    );
    expect(source).toContain(
      ".ui-icon-btn--ghost:not(:disabled):not([aria-disabled='true']):active",
    );
    app.unmount();
  });

  it('preserves feedback for an actionable selected icon button and exposes the state in forced colors', () => {
    const source = readFileSync(
      new URL('./UiIconButton.vue', import.meta.url),
      'utf8',
    );

    expect(source.replace(/\s+/gu, '')).toContain(
      ".ui-icon-btn--ghost.ui-icon-btn--active:not(:disabled):not([aria-disabled='true']):hover",
    );
    expect(source.replace(/\s+/gu, '')).toContain(
      ".ui-icon-btn--ghost.ui-icon-btn--active:not(:disabled):not([aria-disabled='true']):active",
    );
    expect(source).toContain('@media (forced-colors: active)');
    expect(source).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.ui-icon-btn--active\s*\{[^}]*outline:[^;]*Highlight;/u,
    );
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

  it('can disable an in-progress notice action', () => {
    const { app, root } = mount(UiNotice, {
      tone: 'warning',
      title: '需要相容轉檔',
      message: '正在建立 FLAC 副本。',
      actionLabel: '轉檔中…',
      actionDisabled: true,
    });
    const action = findAll(root, (node) => node.type === 'button')[0];

    expect(action.props.disabled).toBe(true);
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

  it('renders an opt-in divided icon cell sized by the search height override', () => {
    const plain = mount(UiSearchBox, { modelValue: '' });
    const divided = mount(UiSearchBox, { modelValue: '', iconCell: true });
    const cells = (root) =>
      findAll(root, (node) =>
        String(node.props?.class || '').includes('ui-search-box__icon-cell'),
      );
    const source = readFileSync(
      new URL('./UiSearchBox.vue', import.meta.url),
      'utf8',
    );

    expect(cells(plain.root)).toHaveLength(0);
    expect(cells(divided.root)).toHaveLength(1);
    expect(source).toMatch(
      /--ui-search-box-height:\s*var\(\s*--ui-search-box-height-override,\s*var\(--ui-field-height\)\s*\)/u,
    );
    expect(source).toMatch(
      /\.ui-search-box__icon-cell\s*\{[^}]*flex:\s*0 0 var\(--ui-search-box-height\);/su,
    );
    expect(source).toMatch(
      /\.ui-search-box__icon-cell::after\s*\{[^}]*inset-block:\s*var\(--ui-search-box-divider-inset-block\);/su,
    );
    plain.app.unmount();
    divided.app.unmount();
  });

  it('uses one custom search clear affordance and removes Chromium search chrome', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSearchBox, {
      modelValue: 'eup',
      'onUpdate:modelValue': update,
    });
    const clear = findAll(
      root,
      (node) => node.props?.['aria-label'] === '清除搜尋',
    )[0];
    const source = readFileSync(
      new URL('./UiSearchBox.vue', import.meta.url),
      'utf8',
    );

    expect(
      findAll(root, (node) => node.props?.['aria-label'] === '清除搜尋'),
    ).toHaveLength(1);
    trigger(clear, 'onClick');
    expect(update).toHaveBeenCalledWith('');
    expect(source).toMatch(
      /\.ui-search-box__input::-webkit-search-cancel-button[\s\S]*appearance:\s*none;/u,
    );
    expect(source).toMatch(
      /\.ui-search-box__clear\s*\{[^}]*min-inline-size:\s*var\(--ui-search-clear-hit-size\);[^}]*min-block-size:\s*var\(--ui-search-clear-hit-size\);/su,
    );
    expect(source).toContain("'ui-search-box__control--clearable': modelValue");
    expect(source).toMatch(
      /\.ui-search-box__control--clearable\s*\{[^}]*padding-inline-end:\s*calc\(\s*var\(--ui-search-clear-hit-size\) \+ var\(--ui-space-2\)\s*\);/su,
    );
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

  it('keeps a loading icon action compact while announcing its progress', () => {
    const { app, root } = mount(UiIconButton, {
      icon: Volume2,
      label: '更換圖片',
      loading: true,
      loadingLabel: '準備預覽中',
    });
    const button = findAll(root, (node) => node.type === 'button')[0];

    expect(button.props.disabled).toBe(true);
    expect(button.props['aria-busy']).toBe(true);
    expect(String(button.props.class)).toContain('is-loading');
    expect(textContent(button)).toContain('準備預覽中');
    expect(textContent(button)).not.toContain('更換圖片');
    app.unmount();
  });

  it('keeps a disabled overlay icon action compact and announced', () => {
    const { app, root } = mount(UiIconButton, {
      icon: Volume2,
      label: '新增頁面照片',
      variant: 'overlay',
      disabled: true,
    });
    const button = findAll(root, (node) => node.type === 'button')[0];

    expect(button.props.disabled).toBe(true);
    expect(textContent(button)).toContain('新增頁面照片');
    expect(String(button.props.class)).toContain('ui-icon-btn--overlay');
    app.unmount();
  });

  it('projects destructive meaning through the shared icon-button intent', () => {
    const { app, root } = mount(UiIconButton, {
      icon: Volume2,
      label: '刪除頁面照片',
      variant: 'overlay',
      intent: 'danger',
    });
    const button = findAll(root, (node) => node.type === 'button')[0];

    expect(String(button.props.class)).toContain('ui-icon-btn--overlay');
    expect(String(button.props.class)).toContain('ui-icon-btn--intent-danger');
    expect(textContent(button)).toContain('刪除頁面照片');
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
