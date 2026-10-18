import { readFileSync } from 'node:fs';
import { nextTick, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import UiPageHeader from './UiPageHeader.vue';
import UiSkeleton from './UiSkeleton.vue';
import UiKbd from './UiKbd.vue';
import UiStack from './UiStack.vue';
import UiSurface from './UiSurface.vue';
import UiSeparator from './UiSeparator.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from './uiTestHost.js';
for (const [component, name] of [
  [UiPageHeader, 'UiPageHeader'],
  [UiSkeleton, 'UiSkeleton'],
  [UiKbd, 'UiKbd'],
  [UiStack, 'UiStack'],
  [UiSurface, 'UiSurface'],
  [UiSeparator, 'UiSeparator'],
])
  attachClientRender(component, `./${name}.vue`, import.meta.url);
const source = (name) =>
  readFileSync(new URL(`./${name}.vue`, import.meta.url), 'utf8');
const named = (root, name) =>
  findAll(root, (node) =>
    String(node.props.class || '')
      .split(' ')
      .includes(name),
  )[0];

describe('structural and skeleton specialist contracts', () => {
  it('removes stale layout and paint modifiers when structural props recover', async () => {
    const stackProps = reactive({
      direction: 'column',
      gap: 8,
      align: 'end',
      wrap: true,
    });
    const stack = mount(UiStack, stackProps, { default: () => '內容' });
    stackProps.direction = 'row';
    stackProps.gap = 0;
    stackProps.wrap = false;
    await nextTick();
    const stackNode = named(stack.root, 'ui-stack');
    expect(String(stackNode.props.class)).not.toMatch(
      /--column|--gap-8|--wrap/u,
    );
    expect(textContent(stackNode)).toBe('內容');
    stack.app.unmount();
    const surfaceProps = reactive({
      tone: 'raised',
      radius: 'lg',
      stroke: 'inset',
      tag: 'aside',
      'aria-label': '說明',
    });
    const surface = mount(UiSurface, surfaceProps, { default: () => '表面' });
    surfaceProps.tone = 'canvas';
    surfaceProps.radius = 'sm';
    surfaceProps.stroke = 'border';
    await nextTick();
    const surfaceNode = named(surface.root, 'ui-surface');
    expect(surfaceNode.type).toBe('aside');
    expect(surfaceNode.props['aria-label']).toBe('說明');
    expect(String(surfaceNode.props.class)).not.toMatch(
      /--tone-raised|--radius-lg|--stroke-inset/u,
    );
    expect(String(surfaceNode.props.class)).toContain(
      'ui-surface--tone-canvas',
    );
    surface.app.unmount();
    const separatorProps = reactive({
      decorative: false,
      orientation: 'vertical',
      tone: 'accent',
    });
    const separator = mount(UiSeparator, separatorProps);
    separatorProps.decorative = true;
    separatorProps.orientation = 'horizontal';
    separatorProps.tone = 'neutral';
    await nextTick();
    const separatorNode = named(separator.root, 'ui-separator');
    expect(separatorNode.props.role).toBeUndefined();
    expect(separatorNode.props['aria-orientation']).toBeUndefined();
    expect(separatorNode.props['aria-hidden']).toBe('true');
    expect(String(separatorNode.props.class)).not.toContain('--accent');
    separator.app.unmount();
  });

  it('keeps header identity, optional slots and complete multilingual title through updates', async () => {
    const props = reactive({
      title: '中文／日本語／LongTitle'.repeat(8),
      titleId: 'page-title',
    });
    const { root, app } = mount(UiPageHeader, props, {
      description: () => 'description',
      actions: () => 'action',
    });
    const heading = findAll(root, (n) => n.type === 'h1')[0];
    expect(heading.props.id).toBe('page-title');
    expect(textContent(heading)).toBe(props.title);
    expect(named(root, 'ui-page-header__actions')).toBeDefined();
    props.title = '短';
    await nextTick();
    expect(textContent(heading)).toBe('短');
    app.unmount();
    const bare = mount(UiPageHeader, { title: '標題' });
    expect(named(bare.root, 'ui-page-header__actions')).toBeUndefined();
    expect(findAll(bare.root, (n) => n.type === 'p')).toHaveLength(0);
    bare.app.unmount();
  });

  it('allows narrow header titles and action groups to wrap using shared spacing', () => {
    const css = source('UiPageHeader');
    expect(css).toMatch(
      /\.ui-page-header__row\s*\{[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*var\(--ui-space-3\);/su,
    );
    expect(css).toMatch(
      /\.ui-page-header__title\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/su,
    );
    expect(css).toMatch(
      /\.ui-page-header__actions\s*\{[^}]*flex-wrap:\s*wrap;[^}]*max-width:\s*100%;/su,
    );
    expect(css).toMatch(
      /\.ui-page-header__description\s*\{[^}]*overflow-wrap:\s*anywhere;/su,
    );
  });

  it('switches skeleton announcements without exposing decorative shapes and restores line count', async () => {
    const props = reactive({
      ariaLabel: '',
      lines: 1,
      shape: 'text',
      pattern: 'uniform',
    });
    const { root, app } = mount(UiSkeleton, props);
    const skeleton = named(root, 'ui-skeleton');
    expect(skeleton.props['aria-hidden']).toBe('true');
    expect(skeleton.props.role).toBeUndefined();
    props.ariaLabel = '載入中';
    props.lines = 12;
    props.shape = 'block';
    props.pattern = 'staggered';
    await nextTick();
    expect(skeleton.props).toMatchObject({
      role: 'status',
      'aria-label': '載入中',
      'aria-busy': 'true',
    });
    expect(skeleton.props['aria-hidden']).toBeUndefined();
    expect(findAll(root, (n) => n.type === 'span')).toHaveLength(12);
    expect(
      findAll(root, (n) => n.type === 'span').every(
        (n) => n.props['aria-hidden'] === 'true',
      ),
    ).toBe(true);
    props.lines = 1;
    props.ariaLabel = '';
    props.shape = 'circle';
    await nextTick();
    expect(findAll(root, (n) => n.type === 'span')).toHaveLength(1);
    expect(String(skeleton.props.class)).toContain('ui-skeleton--circle');
    expect(skeleton.props.role).toBeUndefined();
    expect(skeleton.props['aria-hidden']).toBe('true');
    app.unmount();
  });

  it('bounds skeleton line counts and disables pulse for both reduced motion owners', () => {
    for (const n of [1, 12])
      expect(UiSkeleton.props.lines.validator(n)).toBe(true);
    for (const n of [0, 13, 1.5, NaN])
      expect(UiSkeleton.props.lines.validator(n)).toBe(false);
    const css = source('UiSkeleton');
    expect(css).toContain(
      ":global(:root[data-ui-motion='reduced'] .ui-skeleton__shape)",
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none;/u,
    );
    expect(css).toContain('var(--ui-skeleton-pulse-duration)');
  });

  it('renders keyboard notation as semantic text without creating a tab stop', () => {
    const { root, app } = mount(
      UiKbd,
      { 'aria-label': '控制加K' },
      { default: () => 'Ctrl + K' },
    );
    const kbd = findAll(root, (n) => n.type === 'kbd')[0];
    expect(textContent(kbd)).toBe('Ctrl + K');
    expect(kbd.props['aria-label']).toBe('控制加K');
    expect(kbd.props.tabindex).toBeUndefined();
    expect(source('UiKbd')).toContain('var(--ui-color-text)');
    app.unmount();
  });
});
