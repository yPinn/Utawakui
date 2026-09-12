import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { Play, Repeat } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';
import DemoCandidateIconButton from './DemoCandidateIconButton.vue';
import DemoIconButtonAppearance from './DemoIconButtonAppearance.vue';

const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoIconButtonAppearance.vue', import.meta.url),
  'utf8',
);
const primitiveSource = readFileSync(
  new URL('./DemoIconButtonPrimitive.vue', import.meta.url),
  'utf8',
);
const recipesSource = readFileSync(
  new URL('./DemoIconButtonRecipes.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateIconButton.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiIconButton.vue', import.meta.url),
  'utf8',
);
const activeTokensSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoIconButtonAppearance, './DemoIconButtonAppearance.vue'],
  [DemoCandidateIconButton, './DemoCandidateIconButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoIconButtonAppearance', () => {
  it('replaces only the Icon Button sample with the staged appearance review', () => {
    expect(actionsSource).toContain(
      "import DemoIconButtonAppearance from './DemoIconButtonAppearance.vue';",
    );
    expect(actionsSource).toMatch(
      /<DemoIconButtonAppearance\s+v-else-if="section\.key === 'icon-buttons'"\s+\/>/u,
    );
    expect(actionsSource).not.toContain(
      '<div v-else-if="section.key === \'icon-buttons\'" class="demo-sample-stack">',
    );
    expect(actionsSource).toContain(
      '<DemoButtonAppearance v-if="section.key === \'buttons\'" />',
    );
    expect(actionsSource).toMatch(
      /<DemoTextButtonAppearance\s+v-else-if="section\.key === 'text-button'"\s+\/>/u,
    );
  });

  it('separates the context-neutral primitive contract from parent-owned recipes', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));
    const candidateIndex = html.indexOf('data-icon-button-source="candidate"');
    const currentIndex = html.indexOf('data-icon-button-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Icon Button');
    expect(html).toContain('現行 UiIconButton');

    expect(html.match(/data-icon-button-group="primitive"/gu)).toHaveLength(2);
    expect(html.match(/data-icon-button-group="recipes"/gu)).toHaveLength(2);

    const primitiveSequence = [
      'Primitive 提供內容',
      '尺寸與 glyph',
      'Owned anatomy',
      '內容與 accessible name',
      '狀態外觀與覆蓋',
      'ARIA 與行為',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-icon-button-source="${source}"[\\s\\S]*?(?=<section[^>]*data-icon-button-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of primitiveSequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
      expect(layer.indexOf('Parent-owned recipes')).toBeGreaterThan(
        previousIndex,
      );
    }
  });

  it('visualizes density-owned routine targets, a primary transport target, and a 16-unit glyph', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));

    for (const size of [
      'candidate-standard',
      'candidate-compact',
      'candidate-primary-transport',
      'current-md',
      'current-lg',
    ]) {
      expect(html).toContain(`data-icon-button-size="${size}"`);
    }
    expect(html).toContain('Standard routine · 36 CSS px');
    expect(html).toContain('Compact routine · 32 CSS px');
    expect(html).toContain('Candidate Primary transport · 44 CSS px');
    expect(html).toContain('Current md · 32 CSS px');
    expect(html).toContain('Current lg · 44 CSS px');
    expect(html).toContain('Glyph · fixed 16 units');
    expect(html).toContain('48px emergency · 尚未映射');
    expect(primitiveSource).toContain(
      '.demo-icon-button-size--standard {\n  --demo-icon-button-size: 2.25rem;',
    );
    expect(primitiveSource).toContain(
      '.demo-icon-button-size--compact {\n  --demo-icon-button-size: 2rem;',
    );
    expect(candidateSource).toContain(':size="ICON_SIZE"');
    expect(candidateSource).not.toMatch(/\['md', 'lg', 'xl'\]/u);
  });

  it('makes appearance, shape, stretch, and glyph fill responsibilities explicit', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));

    for (const anatomy of [
      'glyph',
      'target',
      'appearance',
      'shape',
      'stretch',
      'fill',
    ]) {
      expect(
        html.match(new RegExp(`data-icon-button-anatomy="${anatomy}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('square · routine toolbar');
    expect(html).toContain('circle · primary transport');
    expect(html).toContain('inherit＋stretch · parent-owned hit area');
    expect(html).toContain('fill 只控制 glyph rendering，不代表 selected');
    expect(candidateSource).toContain("['square', 'circle', 'inherit']");
    expect(candidateSource).toContain('demo-candidate-icon-btn--stretch');
  });

  it('covers multilingual accessible names without changing geometry', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));

    for (const content of [
      'cjk',
      'latin',
      'long-cjk',
      'multilingual',
      'number',
    ]) {
      expect(
        html.match(new RegExp(`data-icon-button-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('播放目前選取的東京事変演出清單並切換至主舞台輸出');
    expect(html).toContain(
      'Open the detailed performance routing and monitoring settings',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(html).toContain('套用 120 BPM');
    expect(html).toContain('label／title 不參與 target geometry');
    expect(html).toContain('不在 primitive phase 建立自訂 tooltip');
  });

  it('covers the complete state matrix while keeping Current truthful', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));
    const states = [
      'default',
      'hover',
      'pressed',
      'focus',
      'active',
      'disabled',
    ];

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-icon-button-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-icon-button-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('Ghost／Accent／Overlay');
    expect(html).toContain('Current Accent／Overlay 無 authored pressed');
    expect(candidateSource).toContain(
      '.demo-candidate-icon-btn--overlay:not(:disabled):hover',
    );
    expect(candidateSource).toContain(
      '.demo-candidate-icon-btn--overlay:not(:disabled):active',
    );
    expect(candidateSource).toContain(
      '.demo-candidate-icon-btn--accent:not(:disabled):active',
    );
    expect(currentSource).not.toContain(
      '.ui-icon-btn--overlay:not(:disabled):active',
    );
    expect(currentSource).not.toContain(
      '.ui-icon-btn--accent:not(:disabled):active',
    );
  });

  it('lists bounded recipes separately and keeps their sizing parent-owned', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));

    for (const recipe of [
      'routine-control-row',
      'primary-transport',
      'artwork-overlay',
      'stretch-rail',
      'titlebar',
    ]) {
      expect(
        html.match(new RegExp(`data-icon-button-recipe="${recipe}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain(
      'Recipe 是 parent-owned 組合，不是 UiIconButton variant／prop。',
    );
    expect(html).toContain('Candidate 同列 control boxes · 36／32px');
    expect(html).toContain('Current icon 32px／Field＋Button 30px');
    expect(html).toContain('Primary transport · 44px fixed');
    expect(html).toContain('lg + circle + accent + filled glyph');
    expect(html).toContain('Artwork overlay · theme-independent scrim');
    expect(html).toContain('Title bar · 40px parent＋inset focus');
    expect(html).not.toContain('Live transport · 44px fixed');
    expect(
      `${componentSource}${primitiveSource}${recipesSource}`,
    ).not.toContain("size: 'live'");
    expect(
      `${componentSource}${primitiveSource}${recipesSource}`,
    ).not.toContain("variant: 'live'");
    expect(recipesSource).toMatch(
      /\.demo-icon-button-titlebar--candidate[^}]*--demo-icon-button-size:\s*2\.25rem;[^}]*--demo-icon-focus-offset:\s*var\(--ui-focus-offset-inset\);/su,
    );
    expect(recipesSource).toContain('@container (max-width: 42rem)');
  });

  it('keeps native button semantics and caller-owned ARIA state', () => {
    const fallbackTitle = mount(DemoCandidateIconButton, {
      icon: Play,
      label: '播放目前曲目',
      disabled: true,
      name: 'transport-action',
      'data-contract': 'native-forwarding',
    });
    const fallbackButton = findAll(
      fallbackTitle.root,
      (node) => node.type === 'button',
    )[0];
    expect(fallbackButton.props).toMatchObject({
      type: 'button',
      disabled: true,
      name: 'transport-action',
      'aria-label': '播放目前曲目',
      title: '播放目前曲目',
      'data-contract': 'native-forwarding',
    });
    const fallbackIcon = findAll(
      fallbackButton,
      (node) => node.props?.['aria-hidden'] === 'true',
    )[0];
    expect(fallbackIcon).toBeTruthy();
    fallbackTitle.app.unmount();

    const toggle = mount(DemoCandidateIconButton, {
      icon: Repeat,
      label: '重複播放',
      title: '重複播放 (R)',
      active: true,
      'aria-pressed': true,
    });
    const toggleButton = findAll(
      toggle.root,
      (node) => node.type === 'button',
    )[0];
    expect(toggleButton.props).toMatchObject({
      title: '重複播放 (R)',
      'aria-pressed': true,
    });
    expect(String(toggleButton.props.class)).toContain(
      'demo-candidate-icon-btn--active',
    );
    toggle.app.unmount();
  });

  it('documents the bounded public contract without inventing component states', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));

    expect(html).toContain('icon · required；fixed 16-unit decorative glyph');
    expect(html).toContain('label · required accessible name');
    expect(html).toContain('title · optional；defaults to label');
    expect(html).toContain('variant · ghost／accent／overlay');
    expect(html).toContain('size · md／lg；density owns routine md');
    expect(html).toContain('shape · square／circle／inherit');
    expect(html).toContain(
      'active · visual only；caller supplies aria-pressed',
    );
    expect(html).toContain(
      'stretch · parent-owned hit area；fill · glyph only',
    );
    expect(html).toContain('native disabled · attrs／events fallthrough');
    expect(html).toContain(
      'No readonly · No loading · No permission · No emergency prop',
    );
    expect(candidateSource).not.toMatch(/readonly|loading|permission/u);
  });

  it('isolates Candidate styling from Current and active tokens', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));
    const currentLayer = componentSource.match(
      /\.demo-icon-button-layer--current\s*\{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(componentSource).toContain(
      ':class="`demo-icon-button-layer--${layer.key}`"',
    );
    expect(componentSource).toContain('.demo-icon-button-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-icon-button-layer--current)",
    );
    expect(activeTokensSource).toContain(
      '--ui-motion-easing-standard: ease-out;',
    );
    expect(activeTokensSource).toContain('--ui-color-overlay-contrast: #fff;');
    expect(currentLayer).toContain('--ui-motion-easing-standard: ease-out;');
    expect(currentLayer).toContain('--ui-color-overlay-contrast: #fff;');
    expect(currentSource).not.toContain('demo-candidate-icon-btn');
    expect(activeTokensSource).not.toContain('overlay-scrim-hover');
    expect(activeTokensSource).not.toContain('data-icon-button-source');
    expect(html).not.toContain('Candidate 不代表 production adoption');
  });
});
