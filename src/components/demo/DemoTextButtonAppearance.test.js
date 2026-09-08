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
import DemoCandidateTextButton from './DemoCandidateTextButton.vue';
import DemoTextButtonAppearance from './DemoTextButtonAppearance.vue';

const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
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
  new URL('./DemoCandidateTextButton.vue', import.meta.url),
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
  [DemoCandidateTextButton, './DemoCandidateTextButton.vue'],
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
      'Primitive 提供內容',
      'Inherited geometry',
      'Owned anatomy',
      '內容與 overflow',
      '狀態外觀與覆蓋',
      'ARIA 與 event boundary',
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
    expect(html).toContain('Standalone 32px action → UiButton');
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
    expect(candidateSource).toContain('<UiMarqueeText :text="text" />');
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
    expect(html).toContain('Overflow → existing marquee＋title');
    expect(html).toContain('Reduced motion → single-line ellipsis');
    expect(marqueeSource).toContain('ui-marquee--overflow');
    expect(marqueeSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(candidateSource).not.toMatch(/marqueeMode|marqueeSpeed/u);
  });

  it('shows a quiet default affordance in Candidate and keeps Current gaps truthful', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    for (const state of ['default', 'hover', 'pressed', 'focus', 'disabled']) {
      expect(
        html.match(new RegExp(`data-text-button-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-text-button-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('Candidate · quiet underline at rest');
    expect(html).toContain('Current · underline only on hover／focus');
    expect(html).toContain('Current 無 authored pressed／disabled appearance');
    expect(candidateSource).toMatch(
      /\.demo-candidate-text-btn :deep\(\.ui-marquee__text\)\s*\{[^}]*text-decoration-line:\s*underline;/su,
    );
    expect(candidateSource).toContain(':not(:disabled):hover');
    expect(candidateSource).toContain(':not(:disabled):active');
    expect(candidateSource).toContain(':focus-visible');
    expect(candidateSource).toContain(':disabled');
    expect(currentSource).not.toContain(':active');
    expect(currentSource).not.toContain(':disabled');
  });

  it('preserves native attributes, visible-name fallback, and stopped click propagation', () => {
    for (const Component of [DemoCandidateTextButton, UiTextButton]) {
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

  it('keeps click.stop and the optional ariaLabel override in the bounded API', () => {
    for (const Component of [DemoCandidateTextButton, UiTextButton]) {
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
    expect(html).toContain(
      'Recipe 是 parent-owned composition，不是 UiTextButton variant／prop。',
    );
    expect(html).toContain('Row primary action＋nested destination');
    expect(html).toContain('Prefix static／destination interactive');
    expect(html).toContain('Cell owns available width／metadata columns');
    expect(html).toContain('Navigation intent stays with parent');
    expect(recipesSource).toContain('position: absolute;');
    expect(recipesSource).toContain('z-index: 1;');
    expect(recipesSource).toContain('@container (max-width: 34rem)');
  });

  it('documents a narrow public contract and isolates Candidate styling', async () => {
    const html = await renderToString(createSSRApp(DemoTextButtonAppearance));

    expect(html).toContain('text · String／Number');
    expect(html).toContain('ariaLabel · optional accessible-name override');
    expect(primitiveSource).toContain(
      'type="button" · native attrs fallthrough',
    );
    expect(html).toContain('click event · propagation stopped at root');
    expect(html).toContain(
      'UiMarqueeText owns overflow／title／reduced motion',
    );
    expect(html).toContain(
      'No icon · No variant · No size · No active · No loading · No readonly · No href',
    );
    expect(componentSource).toContain(
      ':class="`demo-text-button-layer--${layer.key}`"',
    );
    expect(componentSource).toContain('.demo-text-button-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-text-button-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-text-btn');
    expect(activeTokensSource).not.toContain('data-text-button-source');
    expect(html).toContain('Candidate 不代表 production adoption');
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
