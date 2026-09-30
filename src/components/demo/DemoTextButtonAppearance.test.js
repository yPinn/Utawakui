import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';
import DemoTextButtonAppearance from './DemoTextButtonAppearance.vue';

const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
  'utf8',
);
const catalogueSource = readFileSync(
  new URL('../../constants/uiDemoSections.js', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoTextButtonAppearance.vue', import.meta.url),
  'utf8',
);
const primitiveSource = readFileSync(
  new URL('./DemoTextButtonPrimitive.vue', import.meta.url),
  'utf8',
);
const recipesSource = readFileSync(
  new URL('./DemoTextButtonRecipes.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('../ui/UiTextButton.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiTextButton.vue', import.meta.url),
  'utf8',
);
const marqueeSource = readFileSync(
  new URL('../ui/UiMarqueeText.vue', import.meta.url),
  'utf8',
);
const activeTokensSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoTextButtonAppearance, './DemoTextButtonAppearance.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', {});

describe('DemoTextButtonAppearance', () => {
  it('replaces only the Text Button sample with the staged appearance review', () => {
    expect(catalogueSource).toMatch(
      /key: 'text-button',[\s\S]*?title: '文字操作',[\s\S]*?components: \['UiTextButton'\]/u,
    );
    expect(actionsSource).toContain(
      "import DemoTextButtonAppearance from './DemoTextButtonAppearance.vue';",
    );
    expect(actionsSource).toMatch(
      /<DemoTextButtonAppearance\s+v-else-if="section\.key === 'text-button'"\s+\/>/u,
    );
    expect(actionsSource).not.toContain(
      '<div v-else-if="section.key === \'text-button\'" class="demo-sample-stack">',
    );
    expect(actionsSource).toContain(
      '<DemoButtonAppearance v-if="section.key === \'buttons\'" />',
    );
    expect(actionsSource).toMatch(
      /<DemoIconButtonAppearance\s+v-else-if="section\.key === 'icon-buttons'"\s+\/>/u,
    );
  });

  it('separates primitive evidence from parent-owned destination recipes', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));
    const candidateIndex = html.indexOf('data-text-button-source="candidate"');
    const currentIndex = html.indexOf('data-text-button-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html.match(/data-text-button-group="primitive"/gu)).toHaveLength(2);
    expect(html.match(/data-text-button-group="recipes"/gu)).toHaveLength(2);

    const sequence = [
      'Primitive contract',
      'Inherited geometry',
      'Anatomy＋accessibility',
      'Content＋overflow',
      'Affordance＋states',
      'Public contract',
      'Parent-owned recipes',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-text-button-source="${source}"[\\s\\S]*?(?=<section[^>]*data-text-button-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
    expect(html).not.toContain('Primitive 提供內容');
    expect(html).not.toContain('Underline affordance');
    expect(html).not.toContain('ARIA 與 event boundary');
  });

  it('keeps typography inherited and width intrinsic without inventing density or size props', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    for (const geometry of ['label-context', 'body-context']) {
      expect(
        html.match(new RegExp(`data-text-button-geometry="${geometry}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const width of ['intrinsic', 'constrained']) {
      expect(
        html.match(new RegExp(`data-text-button-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Typography · inherit from caller');
    expect(html).toContain('Intrinsic width · fit-content');
    expect(html).toContain('Constrained parent · 10rem');
    expect(html).toContain('獨立 32px 動作使用 UiButton');
    expect(candidateSource).toContain('width: fit-content;');
    expect(candidateSource).toContain('max-width: 100%;');
    expect(candidateSource).toContain('min-width: 0;');
    expect(candidateSource).not.toContain('size: {');
    expect(candidateSource).not.toContain('variant: {');
    expect(candidateSource).not.toContain('data-ui-density');
  });

  it('makes the native button, visible text, optional name override, and marquee lane explicit', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    for (const anatomy of [
      'button',
      'visible-text',
      'accessible-name',
      'overflow-lane',
    ]) {
      expect(
        html.match(new RegExp(`data-text-button-anatomy="${anatomy}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(primitiveSource).toContain('native button[type="button"]');
    expect(html).toContain('visible text 是預設 accessible name');
    expect(html).toContain('ariaLabel · optional override');
    expect(html).toContain('UiMarqueeText · overflow owner');
    expect(candidateSource).toContain(
      '<UiMarqueeText v-if="overflow === \'marquee\'" :text="displayText" />',
    );
  });

  it('covers real multilingual content while preserving the existing overflow contract', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    for (const content of [
      'short-cjk',
      'long-cjk',
      'long-latin',
      'multilingual',
      'number',
    ]) {
      expect(
        html.match(new RegExp(`data-text-button-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('東京事変／椎名林檎／非常に長い日本語の選択肢');
    expect(html).toContain(
      'A deliberately long Latin destination title for overflow inspection',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(html).toContain('前往第 12 首');
    expect(html).toContain('溢位沿用 UiMarqueeText');
    expect(html).toContain('reduced motion 回到單行省略');
    expect(marqueeSource).toContain('ui-marquee--overflow');
    expect(marqueeSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(candidateSource).not.toMatch(/marqueeMode|marqueeSpeed/u);
  });

  it('summarizes the interaction-only underline without a duplicate variation section', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    expect(html).toContain('Token v2／已遷移 UiTextButton');
    expect(html).toContain('Active token compatibility');
    expect(html).toContain('預設無底線；hover／focus-visible 顯示底線。');
    expect(html).toContain(
      '同一正式元件維持 Default 無底線，hover／focus-visible 顯示底線。',
    );
    expect(html).not.toContain('data-text-action-affordance-sample');
    expect(html).not.toContain('Default · persistent quiet underline');
    expect(html).not.toContain('Current · hover／focus only');
    expect(html).not.toContain('quiet underline is always visible');

    expect(candidateSource).not.toContain('emphasis:');
    expect(candidateSource).not.toContain('data-text-action-emphasis');
    expect(candidateSource).not.toContain('demo-candidate-text-btn--quiet');
    expect(candidateSource).not.toContain('demo-candidate-text-btn--accent');
    expect(candidateSource).not.toContain('currentcolor 40%');
    expect(candidateSource).not.toContain('var(--ui-color-accent) 70%');
    expect(candidateSource).toContain('text-underline-offset: 0.18em;');
    expect(candidateSource).toMatch(
      /\.ui-text-btn:not\(:disabled\):hover[\s\S]*?\.ui-text-btn:focus-visible[\s\S]*?\{[^}]*text-decoration:\s*underline;/su,
    );
    expect(candidateSource).not.toMatch(
      /\.demo-candidate-text-btn\s+:deep\(\.ui-marquee__text\)[\s\S]*?\{[^}]*text-decoration-line:\s*underline;/su,
    );
    expect(candidateSource).not.toContain('var(--ui-color-accent-active)');
    expect(candidateSource).not.toMatch(/dotted|dashed|reveal/u);
  });

  it('shows the adopted interaction-only underline in both token scopes', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    for (const state of ['default', 'hover', 'pressed', 'focus', 'disabled']) {
      expect(
        html.match(new RegExp(`data-text-button-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-text-button-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain(
      'Default 無底線；hover／focus-visible 顯示底線；pressed 沿用 hover；Token v2 disabled 50%。',
    );
    expect(html).not.toContain('Current · underline only on hover／focus');
    expect(candidateSource).toContain(':not(:disabled):hover');
    expect(candidateSource).not.toContain(':not(:disabled):active');
    expect(candidateSource).toContain(':focus-visible');
    expect(candidateSource).toContain(':disabled');
    for (const state of ['hover', 'pressed', 'focus']) {
      expect(primitiveSource).toMatch(
        new RegExp(
          `data-text-button-state='${state}'[\\s\\S]*?ui-text-btn[\\s\\S]*?\\{[^}]*text-decoration:\\s*underline;`,
          'su',
        ),
      );
    }
    expect(currentSource).not.toContain(':active');
    expect(currentSource).toContain(':disabled');
  });

  it('preserves native attributes, visible-name fallback, and stopped click propagation', () => {
    for (const Component of [UiTextButton]) {
      const hostClick = vi.fn();
      const mounted = mount(Component, {
        text: '海螺記',
        disabled: true,
        name: 'album-destination',
        'data-contract': 'native-forwarding',
        onClick: hostClick,
      });
      const button = findAll(mounted.root, (node) => node.type === 'button')[0];
      expect(button.props).toMatchObject({
        type: 'button',
        disabled: true,
        name: 'album-destination',
        'data-contract': 'native-forwarding',
      });
      expect(button.props['aria-label']).toBeUndefined();
      expect(textContent(button)).toContain('海螺記');
      mounted.app.unmount();
    }
  });

  it('keeps the adopted appearance prop-free while preserving native attrs', () => {
    const candidate = mount(UiTextButton, {
      text: '前往來源專輯',
      'data-contract': 'candidate-affordance',
    });
    const candidateButton = findAll(
      candidate.root,
      (node) => node.type === 'button',
    )[0];
    expect(candidateButton.props).toMatchObject({
      type: 'button',
      'data-contract': 'candidate-affordance',
    });
    expect(candidateButton.props['data-text-action-emphasis']).toBeUndefined();
    expect(candidateButton.props.class).toBe('ui-text-btn');
    candidate.app.unmount();

    const current = mount(UiTextButton, {
      text: '前往來源專輯',
      'data-contract': 'current-baseline',
    });
    const currentButton = findAll(
      current.root,
      (node) => node.type === 'button',
    )[0];
    expect(currentButton.props).toMatchObject({
      type: 'button',
      'data-contract': 'current-baseline',
    });
    expect(currentButton.props['data-text-action-emphasis']).toBeUndefined();
    current.app.unmount();
  });

  it('keeps click.stop and the optional ariaLabel override in the bounded API', () => {
    for (const Component of [UiTextButton]) {
      const mounted = mount(Component, {
        text: '海螺記',
        ariaLabel: '前往專輯：海螺記',
      });
      const button = findAll(mounted.root, (node) => node.type === 'button')[0];
      const stopPropagation = vi.fn();
      button.props.onClick({ stopPropagation });
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(button.props['aria-label']).toBe('前往專輯：海螺記');
      mounted.app.unmount();
    }
  });

  it('lets high-volume callers choose static ellipsis without mounting marquee work', () => {
    const mounted = mount(UiTextButton, {
      text: 'A deliberately long queue title',
      overflow: 'ellipsis',
    });
    const marquee = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-marquee'),
    );
    const staticText = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-text-btn__text'),
    )[0];

    expect(marquee).toHaveLength(0);
    expect(textContent(staticText)).toBe('A deliberately long queue title');
    expect(staticText.props.title).toBe('A deliberately long queue title');
    mounted.app.unmount();
  });

  it('lists real destination recipes separately and leaves geometry and navigation with parents', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    for (const recipe of [
      'track-row-destination',
      'section-heading-destination',
      'table-cell-destination',
    ]) {
      expect(
        html.match(new RegExp(`data-text-button-recipe="${recipe}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('只示範使用情境，不增加 primitive API。');
    expect(html).toContain('Row primary action＋nested destination');
    expect(html).toContain('Prefix static／destination interactive');
    expect(html).toContain('Cell owns available width／metadata columns');
    expect(html).toContain('幾何與導覽由 parent 擁有。');
    expect(recipesSource).toContain('position: absolute;');
    expect(recipesSource).toContain('z-index: 1;');
    expect(recipesSource).toContain('@container (max-width: 34rem)');
    expect(recipesSource).toContain('v-bind="layer.recipeProps"');
    expect(componentSource.match(/recipeProps: \{\}/gu)).toHaveLength(2);
  });

  it('documents a narrow public contract and isolates token scopes', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    expect(html).toContain('text · String／Number');
    expect(html).toContain('ariaLabel · optional accessible-name override');
    expect(html).toContain(
      '字體、文字色與版面由 caller 擁有；底線由 primitive 擁有。',
    );
    expect(primitiveSource).toContain(
      'type="button" · native attrs fallthrough',
    );
    expect(html).toContain('click event · propagation stopped at root');
    expect(html).toContain(
      'UiMarqueeText owns overflow／title／reduced motion',
    );
    expect(html).toContain(
      'overflow=&quot;ellipsis&quot; skips observer／motion work',
    );
    expect(html).toContain('預設無底線 · hover／focus-visible underline');
    expect(html).toContain('僅 hover／focus-visible 顯示底線');
    expect(html).toContain(
      'No icon · No variant · No size · No full-width · No active · No loading · No readonly · No href',
    );
    expect(currentSource).not.toContain('emphasis');
    expect(componentSource).toContain(
      ':class="`demo-text-button-layer--${layer.key}`"',
    );
    expect(componentSource).toContain('.demo-text-button-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-text-button-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-text-btn');
    expect(activeTokensSource).not.toContain('data-text-button-source');
    expect(html).not.toContain('Candidate 不代表 production adoption');
  });

  it('snapshots every active color consumed by the Current layer', () => {
    for (const declaration of [
      '--ui-color-canvas: #1f2328;',
      '--ui-color-surface: #292f35;',
      '--ui-color-surface-raised: #30383e;',
      '--ui-color-surface-hover: #344046;',
      '--ui-color-text: #f7f1e7;',
      '--ui-color-text-muted: #aeb8b6;',
      '--ui-color-text-subtle: #aeb8b6;',
      '--ui-color-border: #3c4749;',
      '--ui-color-border-strong: #586568;',
      '--ui-color-accent: #55a2a7;',
      '--ui-color-focus: #dd7a64;',
      '--ui-color-canvas: #f7f1e7;',
      '--ui-color-surface: #fffdfa;',
      '--ui-color-surface-raised: #ffffff;',
      '--ui-color-surface-hover: #edf2ef;',
      '--ui-color-text: #1f2328;',
      '--ui-color-text-muted: #69747a;',
      '--ui-color-text-subtle: #69747a;',
      '--ui-color-border: #d8ded9;',
      '--ui-color-border-strong: #b9c4c0;',
      '--ui-color-accent: #327a7f;',
      '--ui-color-focus: #d26a45;',
    ]) {
      expect(componentSource).toContain(declaration);
    }
  });
});
