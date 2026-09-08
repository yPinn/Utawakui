import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { Download } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';
import DemoButtonAppearance from './DemoButtonAppearance.vue';
import DemoCandidateButton from './DemoCandidateButton.vue';

const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoButtonAppearance.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateButton.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiButton.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoButtonAppearance, './DemoButtonAppearance.vue'],
  [DemoCandidateButton, './DemoCandidateButton.vue'],
  [UiButton, '../ui/UiButton.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoButtonAppearance', () => {
  it('replaces only the Buttons sample with the staged appearance review', () => {
    expect(actionsSource).toContain(
      "import DemoButtonAppearance from './DemoButtonAppearance.vue';",
    );
    expect(actionsSource).toContain(
      '<DemoButtonAppearance v-if="section.key === \'buttons\'" />',
    );
    expect(actionsSource).not.toContain(
      '<div v-if="section.key === \'buttons\'" class="demo-sample-stack">',
    );
    expect(actionsSource).toMatch(
      /<DemoIconButtonAppearance\s+v-else-if="section\.key === 'icon-buttons'"\s+\/>/u,
    );
    expect(actionsSource).toMatch(
      /<DemoTextButtonAppearance\s+v-else-if="section\.key === 'text-button'"\s+\/>/u,
    );
  });

  it('orders Candidate and Current from geometry through the public contract', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));
    const candidateIndex = html.indexOf('data-button-source="candidate"');
    const currentIndex = html.indexOf('data-button-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Button');
    expect(html).toContain('現行 UiButton');

    const sequence = [
      '尺寸與寬度',
      'Field composition',
      'Owned anatomy',
      '內容與 overflow',
      '狀態外觀與覆蓋',
      'Async 與 ARIA',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-button-source="${source}"[\\s\\S]*?(?=<section[^>]*data-button-source=|$)`,
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

  it('visualizes 36 and 32 CSS px Candidate controls against Current 30px', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));

    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-button-size="${size}"`);
    }
    expect(html).toContain('Standard · 36 CSS px');
    expect(html).toContain('Compact · 32 CSS px');
    expect(html).toContain('Current · 30 CSS px');
    expect(componentSource).toContain(
      '.demo-button-size--standard {\n  --demo-button-height: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-button-size--compact {\n  --demo-button-height: 2rem;',
    );
    expect(componentSource).toContain(
      '.demo-button-size--active {\n  --demo-button-height: 1.875rem;',
    );
    expect(candidateSource).toContain('min-height: var(--demo-button-height');
  });

  it('keeps intrinsic sizing and lets the parent own constrained or full width', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));

    for (const width of ['intrinsic', 'constrained', 'fluid']) {
      expect(
        html.match(new RegExp(`data-button-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Intrinsic · content-sized');
    expect(html).toContain('Constrained parent · 12rem');
    expect(html).toContain('Parent-owned full width · 100%');
    expect(candidateSource).toContain('max-width: 100%;');
    expect(candidateSource).toContain('min-width: 0;');
    expect(candidateSource).not.toContain('max-width: 12rem');
    expect(componentSource).toContain(
      '.demo-button-width--fluid :deep(.ui-btn)',
    );
  });

  it('separates discoverable Secondary from contextual Ghost in Candidate only', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));
    const candidateLayer = html.match(
      /<section[^>]*data-button-source="candidate"[\s\S]*?(?=<section[^>]*data-button-source="current")/u,
    )?.[0];
    const currentLayer = html.match(
      /<section[^>]*data-button-source="current"[\s\S]*$/u,
    )?.[0];

    for (const variant of ['accent', 'secondary', 'ghost']) {
      expect(candidateLayer).toContain(`data-button-hierarchy="${variant}"`);
    }
    expect(currentLayer).toContain('data-button-hierarchy="accent"');
    expect(currentLayer).toContain('data-button-hierarchy="ghost"');
    expect(currentLayer).not.toContain('data-button-hierarchy="secondary"');
    expect(candidateLayer).toContain('Secondary · 靜止可辨識');
    expect(candidateLayer).toContain('Ghost · 只供 toolbar／tertiary context');
    expect(currentLayer).toContain('Current 沒有獨立 Secondary');
    expect(candidateLayer).toMatch(
      /data-button-field-row="standard"[\s\S]*?demo-candidate-btn--secondary/u,
    );
    expect(currentLayer).toMatch(
      /data-button-field-row="active"[\s\S]*?ui-btn--ghost/u,
    );
    expect(candidateSource).toContain(
      "['ghost', 'secondary', 'accent'].includes(value)",
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-btn--secondary\s*\{[^}]*border-color:\s*var\(--ui-color-border\);[^}]*background:\s*var\(--ui-color-surface-raised\);/su,
    );
    expect(candidateSource).toContain(
      '.demo-candidate-btn--secondary:not(:disabled):hover',
    );
    expect(candidateSource).toContain(
      '.demo-candidate-btn--secondary:not(:disabled):active',
    );
    expect(candidateSource).toContain(
      'border: var(--ui-border-width) solid transparent;',
    );
    expect(currentSource).not.toContain('ui-btn--secondary');
  });

  it('aligns real Field and Button controls through one density scope', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));

    expect(componentSource).toContain(
      "import UiTextField from '../ui/UiTextField.vue';",
    );
    expect(html.match(/>Field composition</gu)).toHaveLength(2);
    for (const density of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-button-field-row="${density}"`);
    }
    expect(html).toContain('同一 density scope · control boxes 同高');
    expect(html).toContain('Row gap · 8 CSS px');
    expect(html).toContain('Icon／label gap · 4 CSS px');
    expect(componentSource).toContain(
      '.demo-button-field-row--standard {\n  --demo-button-height: 2.25rem;\n  --ui-field-height: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-button-field-row--compact {\n  --demo-button-height: 2rem;\n  --ui-field-height: 2rem;',
    );
    expect(componentSource).toContain(
      '.demo-button-field-row--active {\n  --demo-button-height: 1.875rem;\n  --ui-field-height: 1.875rem;',
    );
    expect(componentSource).toMatch(
      /\.demo-button-field-row\s*\{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*gap:\s*var\(--ui-space-2\);/su,
    );
    expect(componentSource).toMatch(
      /@container \(max-width: 32rem\)[\s\S]*?\.demo-button-field-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/u,
    );
    expect(candidateSource).toContain('gap: var(--ui-space-1);');
  });

  it('maps label, optional leading icon, and loading replacement without owning icon-only', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));

    for (const part of ['leading-icon', 'label', 'loading']) {
      expect(
        html.match(new RegExp(`data-button-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('16-unit leading icon');
    expect(html).toContain('4px icon／label gap');
    expect(html).toContain('Spinner＋loadingLabel replace idle content');
    expect(html).toContain('純圖示操作 → UiIconButton');
    expect(html).toContain(
      '現行仍含 icon-only compatibility branch；新用法 → UiIconButton',
    );
    expect(candidateSource).toContain(':size="ICON_SIZE"');
    expect(candidateSource).not.toContain('ui-btn--icon-only');
    expect(currentSource).toContain('ui-btn--icon-only');
  });

  it('covers real multilingual content and uses static single-line truncation', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));

    for (const content of [
      'short',
      'long-cjk',
      'long-latin',
      'multilingual',
      'number',
    ]) {
      expect(
        html.match(new RegExp(`data-button-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('匯出目前演出清單並保留所有導唱與輸出設定');
    expect(html).toContain(
      'Export the current performance set while preserving every guide-vocal and output setting',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(html).toContain('套用 120 BPM');
    expect(html).toContain('沒有元件級 truncation');
    expect(candidateSource).toContain('text-overflow: ellipsis;');
    expect(candidateSource).toContain('white-space: nowrap;');
    expect(componentSource).not.toContain('UiMarqueeText');
    expect(componentSource).not.toMatch(/\bSave\b/u);
  });

  it('covers both variants and the complete interaction state matrix', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));
    const states = [
      'default',
      'hover',
      'pressed',
      'focus',
      'active',
      'disabled',
      'loading',
    ];

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-button-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-button-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('Secondary／Accent');
    expect(html).toContain('Current Ghost／Accent');
    expect(candidateSource).toMatch(
      /\.demo-candidate-btn--ghost[^}]*background:\s*transparent/su,
    );
    expect(candidateSource).toContain(':not(:disabled):hover');
    expect(candidateSource).toContain(':not(:disabled):active');
    expect(candidateSource).toContain(':focus-visible');
    expect(candidateSource).toContain('.demo-candidate-btn--active');
    expect(html).toContain('No authored :active');
    expect(currentSource).not.toContain(':not(:disabled):active');
  });

  it('keeps async and toggle semantics explicit on the native button', () => {
    const loading = mount(
      DemoCandidateButton,
      {
        type: 'submit',
        loading: true,
        loadingLabel: '正在保存',
        name: 'save-action',
        'data-contract': 'native-forwarding',
      },
      { default: () => '保存' },
    );
    const loadingButton = findAll(
      loading.root,
      (node) => node.type === 'button',
    )[0];
    expect(loadingButton.props).toMatchObject({
      type: 'submit',
      disabled: true,
      'aria-busy': true,
      name: 'save-action',
      'data-contract': 'native-forwarding',
    });
    expect(textContent(loadingButton)).toContain('正在保存');
    expect(textContent(loadingButton)).not.toContain('保存保存');
    loading.app.unmount();

    const toggle = mount(
      DemoCandidateButton,
      { icon: Download, active: true, 'aria-pressed': true },
      { default: () => '自動匯出' },
    );
    const toggleButton = findAll(
      toggle.root,
      (node) => node.type === 'button',
    )[0];
    expect(toggleButton.props['aria-pressed']).toBe(true);
    expect(String(toggleButton.props.class)).toContain(
      'demo-candidate-btn--active',
    );
    toggle.app.unmount();
  });

  it('documents the bounded public contract and isolates Candidate styling', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));

    expect(html).toContain('type · button／submit／reset');
    expect(html).toContain('variant · ghost／accent');
    expect(html).toContain('variant · secondary／ghost／accent');
    expect(html).toContain(
      'active · visual state；toggle caller supplies aria-pressed',
    );
    expect(html).toContain('disabled · loading · loadingLabel');
    expect(html).toContain('icon · default slot · native attrs／events');
    expect(html).toContain(
      'No size prop · No readonly · No destructive variant',
    );
    expect(componentSource).toContain('demo-button-layer--candidate');
    expect(componentSource).toContain('.demo-button-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-button-layer--current)",
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(currentSource).not.toContain('data-button-state');
    expect(currentSource).not.toContain('size: {');
  });
});
