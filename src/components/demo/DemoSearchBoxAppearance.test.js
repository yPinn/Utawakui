import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { ICON_SIZE } from '../../icons/index.js';
import DemoInputs from './DemoInputs.vue';
import DemoSearchBoxAppearance from './DemoSearchBoxAppearance.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  DemoSearchBoxAppearance,
  './DemoSearchBoxAppearance.vue',
  import.meta.url,
);
attachClientRender(UiSearchBox, '../ui/UiSearchBox.vue', import.meta.url);

const componentSource = readFileSync(
  new URL('./DemoSearchBoxAppearance.vue', import.meta.url),
  'utf8',
);
const searchBoxSource = readFileSync(
  new URL('../ui/UiSearchBox.vue', import.meta.url),
  'utf8',
);

describe('DemoSearchBoxAppearance', () => {
  it('separates the Token v2 candidate from the active implementation', async () => {
    const html = await renderToString(createSSRApp(DemoSearchBoxAppearance));
    const candidateIndex = html.indexOf('data-search-source="candidate"');
    const currentIndex = html.indexOf('data-search-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選基礎');
    expect(html).toContain('現行 Search Box 基礎');
    expect(html).toContain(
      'Search Box 組合單行搜尋輸入與 Clear action；結果回饋由 caller 擁有。',
    );
    expect(html).not.toContain('本輪依互動順序');
  });

  it('visualizes inherited height and parent-owned width without inventing width tokens', async () => {
    const html = await renderToString(createSSRApp(DemoSearchBoxAppearance));

    expect(html.match(/data-search-size=/gu)).toHaveLength(3);
    expect(html).toContain('data-search-size="standard"');
    expect(html).toContain('data-search-size="compact"');
    expect(html).toContain('data-search-size="active"');
    expect(html.match(/data-search-width-test=/gu)).toHaveLength(6);
    for (const width of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-search-width-test="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Standard 36 CSS px');
    expect(html).toContain('Compact 32 CSS px');
    expect(html).toContain('Active 30 CSS px');
    expect(html).toContain('Default 100% parent');
    expect(html).toContain('Min 0 · layout floor');
    expect(html).toContain('Max none · parent owns');
    expect(componentSource).not.toContain('--ui-search-box-min-width');
    expect(componentSource).not.toContain('--ui-search-box-max-width');

    for (const [selector, declaration] of [
      ['.demo-search-size--standard', '--ui-field-height: 2.25rem;'],
      ['.demo-search-size--compact', '--ui-field-height: 2rem;'],
      ['.demo-search-size--active', '--ui-field-height: 1.875rem;'],
      ['.demo-search-width-test--narrow', 'width: min(12rem, 100%);'],
      ['.demo-search-width-test--reference', 'width: min(20rem, 100%);'],
      ['.demo-search-width-test--fluid', 'width: 100%;'],
    ]) {
      const selectorIndex = componentSource.indexOf(`${selector} {`);
      const bodyEnd = componentSource.indexOf('\n}', selectorIndex);
      expect(selectorIndex).toBeGreaterThanOrEqual(0);
      expect(componentSource.slice(selectorIndex, bodyEnd)).toContain(
        declaration,
      );
    }
  });

  it('shows mirrored 32 CSS px icon slots with one owned clear action', async () => {
    const html = await renderToString(createSSRApp(DemoSearchBoxAppearance));
    const candidateStart = html.indexOf('data-search-source="candidate"');
    const currentStart = html.indexOf('data-search-source="current"');
    const candidateHtml = html.slice(candidateStart, currentStart);
    const currentHtml = html.slice(currentStart);

    for (const part of ['label', 'leading', 'input', 'clear']) {
      expect(
        html.match(new RegExp(`data-search-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Hidden label');
    expect(html).toContain('Search glyph · 16 unit');
    expect(html).toContain('Input · fluid／min 0');
    expect(html).toContain('Clear action · conditional');
    expect(candidateHtml).toContain(
      '32 CSS px inline slot · full control height',
    );
    expect(candidateHtml).toContain(
      '32 CSS px inline slot · 16-unit glyph centered',
    );
    expect(html).toContain('現行只有 16-unit glyph，未擁有命中區 token');
    expect(html).toContain('Fixed anatomy · no slots');
    expect(candidateHtml).toContain(
      '左右各保留 32 CSS px icon slot；16-unit glyph 居中，文字區兩側各留 4 CSS px。',
    );
    expect(html).toContain(
      'Active 30 CSS px 只容納 16-unit glyph，命中區尚未制定',
    );
    expect(candidateHtml).toContain('data-search-label-selection="candidate"');
    expect(candidateHtml).toContain('Select none／仍可點擊聚焦');
    expect(currentHtml).toContain('data-search-label-selection="current"');
    expect(currentHtml).toContain('可選取（待補）／仍可點擊聚焦');
    expect(candidateHtml).toContain('data-search-native-cancel="hidden"');
    expect(candidateHtml).toContain('只保留自訂 Clear');
    expect(currentHtml).toContain('data-search-native-cancel="unowned"');
    expect(currentHtml).toContain('原生 × 與自訂 Clear 可能同時出現');

    for (const alignment of [
      'leading-center',
      'leading-gap',
      'trailing-gap',
      'trailing-center',
    ]) {
      expect(
        candidateHtml.match(
          new RegExp(`data-search-alignment="${alignment}"`, 'gu'),
        ),
      ).toHaveLength(1);
    }
    expect(candidateHtml.match(/>32 CSS px icon slot<\/span>/gu)).toHaveLength(
      2,
    );
    expect(candidateHtml.match(/>4 CSS px gap<\/span>/gu)).toHaveLength(2);

    for (const [selector, declarations] of [
      [
        '.demo-search-layer--candidate .demo-search-anatomy-visual__leading',
        ['width: 2rem;', 'align-self: stretch;'],
      ],
      [
        '.demo-search-layer--candidate .demo-search-anatomy-visual__clear',
        ['width: 2rem;', 'align-self: stretch;'],
      ],
      [
        '.demo-search-layer--current .demo-search-anatomy-visual__clear',
        ['width: 1rem;', 'height: 1rem;'],
      ],
    ]) {
      const selectorIndex = componentSource.indexOf(`${selector} {`);
      const bodyEnd = componentSource.indexOf('\n}', selectorIndex);
      expect(selectorIndex).toBeGreaterThanOrEqual(0);
      for (const declaration of declarations) {
        expect(componentSource.slice(selectorIndex, bodyEnd)).toContain(
          declaration,
        );
      }
    }

    for (const contract of [
      '.demo-search-layer--candidate :deep(.ui-search-box__control)',
      '.demo-search-layer--candidate :deep(.ui-search-box__icon)',
      '.demo-search-layer--candidate :deep(.ui-search-box__clear)',
    ]) {
      expect(componentSource).toContain(`${contract} {`);
    }
    const clearSelector =
      '.demo-search-layer--candidate :deep(.ui-search-box__clear)';
    const clearSelectorIndex = componentSource.indexOf(`${clearSelector} {`);
    const clearBodyEnd = componentSource.indexOf('\n}', clearSelectorIndex);
    for (const declaration of [
      'position: absolute;',
      'inset-block: calc(-1 * var(--ui-border-width));',
      'inset-inline-end: 0;',
      'width: 2rem;',
    ]) {
      expect(componentSource.slice(clearSelectorIndex, clearBodyEnd)).toContain(
        declaration,
      );
    }
    expect(componentSource).toMatch(
      /\.demo-search-layer--candidate :deep\(\.ui-search-box__clear\)::before\s*\{[\s\S]*?content: '';[\s\S]*?z-index: 0;[\s\S]*?inset-block: var\(--ui-border-width\);[\s\S]*?inset-inline: 0 var\(--ui-border-width\);[\s\S]*?border-start-end-radius: calc\([\s\S]*?var\(--ui-field-radius\) - var\(--ui-border-width\)[\s\S]*?border-end-end-radius: calc\([\s\S]*?var\(--ui-field-radius\) - var\(--ui-border-width\)[\s\S]*?pointer-events: none;[\s\S]*?\}/u,
    );
    expect(componentSource).toMatch(
      /\.demo-search-layer--candidate :deep\(\.ui-search-box__clear > svg\)\s*\{[\s\S]*?position: relative;[\s\S]*?z-index: 1;[\s\S]*?\}/u,
    );
    expect(componentSource).toMatch(
      /\.demo-search-layer--candidate\s+:deep\(\.ui-search-box__input::-webkit-search-cancel-button\)\s*\{/u,
    );
    expect(componentSource).toContain(
      'padding-inline: calc(2rem + var(--ui-space-1));',
    );
    expect(componentSource).toMatch(
      /\.demo-search-layer--candidate :deep\(\.ui-search-box__icon\)[\s\S]*?inset-inline-start: var\(--ui-space-2\);[\s\S]*?width: 1rem;[\s\S]*?height: 1rem;/u,
    );
    expect(componentSource).toContain('transform: translateY(-50%);');
    expect(componentSource).toContain('-webkit-appearance: none;');
  });

  it('keeps every F8 search specimen controlled so Clear removes its query', async () => {
    expect(componentSource).toContain("import { reactive } from 'vue';");
    expect(componentSource).toContain(
      'v-model="specimenValues[layer.key].sizes[size[0]]"',
    );
    expect(componentSource).toContain(
      'v-model="specimenValues[layer.key].widths[width.key]"',
    );
    expect(componentSource).toContain(
      'v-model="specimenValues[layer.key].states[state.key]"',
    );

    const { app, root } = mount(DemoSearchBoxAppearance);
    const findInput = () =>
      findAll(
        root,
        (node) =>
          node.type === 'input' &&
          node.props.id === 'demo-search-candidate-state-clear-hover',
      )[0];
    expect(findInput().props.value).toBe('Hover Clear');

    const clear = findAll(
      findInput().parent,
      (node) => node.props?.['aria-label'] === '清除搜尋',
    )[0];
    trigger(clear, 'onClick');
    await nextTick();

    expect(findInput().props.value).toBe('');
    expect(
      findAll(
        findInput().parent,
        (node) => node.props?.['aria-label'] === '清除搜尋',
      ),
    ).toHaveLength(0);
    app.unmount();
  });

  it('visualizes the complete Search and Clear state contract before composition', async () => {
    const html = await renderToString(createSSRApp(DemoSearchBoxAppearance));
    const candidateStart = html.indexOf('data-search-source="candidate"');
    const currentStart = html.indexOf('data-search-source="current"');
    const candidateHtml = html.slice(candidateStart, currentStart);
    const currentHtml = html.slice(currentStart);

    const states = [
      'default',
      'filled',
      'field-hover',
      'input-focus',
      'clear-hover',
      'clear-pressed',
      'clear-focus',
      'disabled',
    ];
    expect(html.match(/data-search-state-review="true"/gu)).toHaveLength(2);
    expect(html.match(/data-search-coverage-matrix="true"/gu)).toHaveLength(2);
    for (const state of states) {
      expect(
        html.match(new RegExp(`data-search-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(candidateHtml).toContain('data-search-coverage-status="complete"');
    expect(candidateHtml).not.toContain(
      'data-search-coverage-status="partial"',
    );
    expect(candidateHtml).not.toContain(
      'data-search-coverage-status="pending"',
    );
    expect(currentHtml).toContain('data-search-coverage-status="partial"');
    expect(currentHtml).toContain('data-search-coverage-status="pending"');
    expect(html).toContain(
      'Loading、結果、無結果與搜尋錯誤由使用 Search Box 的 consumer 呈現。',
    );

    const columns = ['surface', 'boundary', 'query', 'clear', 'semantics'];
    const expectedCoverage = {
      candidate: {
        default: ['Base', 'Base border', 'Placeholder', 'Hidden', 'Editable'],
        filled: ['Base', 'Base border', 'Value', 'Available', 'Button label'],
        'field-hover': [
          'Hover surface',
          'Strong border',
          'Value',
          'Available',
          ':hover',
        ],
        'input-focus': [
          'Base',
          '2px＋2px outer ring',
          'Caret／value',
          'Available',
          'Input focus',
        ],
        'clear-hover': [
          'Base',
          'Base border',
          'Value',
          'Hover surface＋fg',
          'Button :hover',
        ],
        'clear-pressed': [
          'Base',
          'Base border',
          'Value',
          'Active surface＋fg',
          'Button :active',
        ],
        'clear-focus': [
          'Base',
          '2px inset target ring',
          'Value',
          'Target identified',
          'Button focus',
        ],
        disabled: [
          'Whole control · 50%',
          'Base border',
          'Value',
          'Disabled',
          'Not-allowed／select none',
        ],
      },
      current: {
        default: ['Base', 'Base border', 'Placeholder', 'Hidden', 'Editable'],
        filled: [
          'Base',
          'Base border',
          'Value',
          '16-unit only',
          'Button label',
        ],
        'field-hover': [
          'No hover surface',
          'No hover border',
          'Value',
          '16-unit only',
          ':hover',
        ],
        'input-focus': [
          'Base',
          '2px＋2px outer ring',
          'Caret／value',
          '16-unit only',
          'Input focus',
        ],
        'clear-hover': [
          'Base',
          'Base border',
          'Value',
          'Foreground only',
          'Button :hover',
        ],
        'clear-pressed': [
          'Base',
          'Base border',
          'Value',
          'No pressed style',
          'Button :active',
        ],
        'clear-focus': [
          'Base',
          'Outer ring only',
          'Value',
          'Target not identified',
          'Button focus',
        ],
        disabled: [
          'Children only',
          'Base border',
          'Input · 50%',
          'Clear · 50%',
          'Disabled',
        ],
      },
    };
    const incompleteCoverage = {
      'current-filled-clear': 'partial',
      'current-field-hover-surface': 'pending',
      'current-field-hover-boundary': 'pending',
      'current-field-hover-clear': 'partial',
      'current-input-focus-clear': 'partial',
      'current-clear-hover-clear': 'partial',
      'current-clear-pressed-clear': 'pending',
      'current-clear-focus-boundary': 'partial',
      'current-clear-focus-clear': 'pending',
      'current-disabled-surface': 'partial',
      'current-disabled-query': 'partial',
      'current-disabled-clear': 'partial',
    };
    for (const [layer, rows] of Object.entries(expectedCoverage)) {
      for (const [state, values] of Object.entries(rows)) {
        for (const [index, value] of values.entries()) {
          const cellId = `${layer}-${state}-${columns[index]}`;
          const status = incompleteCoverage[cellId] ?? 'complete';
          const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
          expect(html).toMatch(
            new RegExp(
              `<td[^>]*data-search-coverage="${cellId}"[^>]*data-search-coverage-status="${status}"[^>]*>${escapedValue}</td>`,
              'u',
            ),
          );
        }
      }
    }

    for (const [state, target] of [
      ['field-hover', 'control'],
      ['input-focus', 'control'],
      ['clear-hover', 'clear'],
      ['clear-pressed', 'clear'],
      ['clear-focus', 'clear'],
      ['disabled', 'control'],
    ]) {
      expect(componentSource).toMatch(
        new RegExp(
          `\\.demo-search-layer--candidate\\s+\\.demo-search-state\\[data-search-state='${state}'\\]\\s+:deep\\(\\.ui-search-box__${target}\\)\\s*\\{`,
          'u',
        ),
      );
    }
    expect(componentSource).toMatch(
      /\.demo-search-layer--current\s+\.demo-search-state\[data-search-state='clear-focus'\]\s+:deep\(\.ui-search-box__control\)\s*\{[\s\S]*?outline: var\(--ui-focus-width\) solid var\(--ui-color-focus\);[\s\S]*?outline-offset: var\(--ui-focus-offset\);[\s\S]*?\}/u,
    );
    for (const [state, target, declarations] of [
      [
        'field-hover',
        'control',
        [
          'border-color: var(--ui-field-border-hover);',
          'background: var(--ui-field-bg-hover);',
        ],
      ],
      [
        'input-focus',
        'control',
        [
          'outline: var(--ui-focus-width) solid var(--ui-color-focus);',
          'outline-offset: var(--ui-focus-offset);',
        ],
      ],
      ['clear-hover', 'clear', ['color: var(--ui-color-text);']],
      ['clear-pressed', 'clear', ['color: var(--ui-color-text);']],
      [
        'clear-focus',
        'clear',
        [
          'outline: var(--ui-focus-width) solid var(--ui-color-focus);',
          'outline-offset: var(--ui-focus-offset-inset);',
        ],
      ],
      [
        'disabled',
        'control',
        ['cursor: not-allowed;', 'opacity: var(--ui-opacity-disabled);'],
      ],
    ]) {
      const block = componentSource.match(
        new RegExp(
          `\\.demo-search-layer--candidate\\s+\\.demo-search-state\\[data-search-state='${state}'\\]\\s+:deep\\(\\.ui-search-box__${target}\\)\\s*\\{([\\s\\S]*?)\\}`,
          'u',
        ),
      )?.[1];
      expect(block).toBeDefined();
      for (const declaration of declarations)
        expect(block).toContain(declaration);
    }
    for (const [state, background] of [
      ['clear-hover', '--ui-color-surface-hover'],
      ['clear-pressed', '--ui-color-surface-active'],
      ['clear-focus', '--ui-color-surface-hover'],
    ]) {
      expect(componentSource).toMatch(
        new RegExp(
          `\\.demo-search-layer--candidate\\s+\\.demo-search-state\\[data-search-state='${state}'\\]\\s+:deep\\(\\.ui-search-box__clear\\)::before\\s*\\{[\\s\\S]*?background: var\\(${background}\\);[\\s\\S]*?\\}`,
          'u',
        ),
      );
    }
    expect(componentSource).toMatch(
      /\.demo-search-layer--candidate\s+\.demo-search-state\[data-search-state='disabled'\][\s\S]*?:deep\(\.ui-search-box__input\),[\s\S]*?:deep\(\.ui-search-box__clear\)\s*\{[\s\S]*?user-select: none;[\s\S]*?opacity: 1;[\s\S]*?\}/u,
    );
    expect(componentSource).toContain(
      ':deep(.ui-search-box__clear:focus-visible)',
    );
    expect(componentSource).toContain(
      ':deep(.ui-search-box__control:has(.ui-search-box__clear:focus-visible))',
    );
    expect(componentSource).toContain(
      ':deep(.ui-search-box__control:has(.ui-search-box__input:disabled))',
    );
  });

  it('anchors the inspection to the real public API and current implementation gaps', async () => {
    const html = await renderToString(createSSRApp(DemoSearchBoxAppearance));

    for (const contract of [
      'id／label／modelValue／placeholder／disabled',
      'update:modelValue',
      'native attrs → input',
      'Clear 僅在有值時出現',
      'Hover surface 尚未制定',
      'Disabled 整體外觀尚未制定',
      '原生 search cancel ownership 未落地',
    ]) {
      expect(html).toContain(contract);
    }
    expect(searchBoxSource).toContain('type="search"');
    expect(searchBoxSource).toContain('v-if="modelValue"');
    expect(searchBoxSource).toContain('aria-label="清除搜尋"');
    expect(searchBoxSource).toContain(':size="ICON_SIZE"');
    expect(ICON_SIZE).toBe(16);
    expect(searchBoxSource).not.toContain('<slot');
    expect(searchBoxSource).not.toContain('--ui-search-box-clear-size');
    expect(html).toContain('data-search-state="default"');
    expect(html).toContain('data-search-coverage-matrix="true"');
    expect(searchBoxSource).not.toContain('data-search-state');
  });

  it('mounts the foundation in the search-box catalogue section', async () => {
    const html = await renderToString(
      createSSRApp(DemoInputs, {
        sections: [
          { key: 'search-box', title: '搜尋欄', components: ['UiSearchBox'] },
        ],
      }),
    );

    expect(html).toContain('data-search-source="candidate"');
    expect(html).toContain('data-search-source="current"');
    expect(html).not.toContain(
      '空白、輸入中與一鍵清除共用同一個可存取搜尋合約。',
    );
  });
});
