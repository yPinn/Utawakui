import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFieldAppearance from './DemoFieldAppearance.vue';
import DemoInputs from './DemoInputs.vue';

const candidateTokens = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);
const activeTokens = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoFieldAppearance.vue', import.meta.url),
  'utf8',
);
const textFieldSource = readFileSync(
  new URL('../ui/UiTextField.vue', import.meta.url),
  'utf8',
);
const fieldSource = readFileSync(
  new URL('../ui/UiField.vue', import.meta.url),
  'utf8',
);

const states = [
  'default',
  'filled',
  'hover',
  'focus',
  'invalid',
  'disabled',
  'readonly',
];
const coverageCategories = [
  'surface',
  'boundary',
  'content',
  'feedback',
  'semantics',
];

function declarationsFor(source, selector) {
  const selectorIndex = source.indexOf(selector);
  const bodyStart = source.indexOf('{', selectorIndex) + 1;
  const bodyEnd = source.indexOf('\n}', bodyStart);

  expect(selectorIndex).toBeGreaterThanOrEqual(0);
  return Object.fromEntries(
    [
      ...source.slice(bodyStart, bodyEnd).matchAll(/(--[\w-]+):\s*([^;]+);/gu),
    ].map(([, name, value]) => [name, value.trim()]),
  );
}

function resolveVariable(name, declarations, seen = new Set()) {
  expect(seen.has(name)).toBe(false);
  const value = declarations[name];
  expect(value, `Missing ${name}`).toBeTruthy();
  const reference = value.match(/^var\((--[\w-]+)\)$/u)?.[1];
  return reference
    ? resolveVariable(reference, declarations, new Set([...seen, name]))
    : value;
}

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color
      .slice(1)
      .match(/.{2}/gu)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('DemoFieldAppearance', () => {
  it('shows the candidate contract before the active implementation snapshot', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));
    const candidateIndex = html.indexOf('data-field-source="candidate"');
    const currentIndex = html.indexOf('data-field-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選外觀');
    expect(html).toContain('現行 Field 外觀');
    expect(html).toContain('尚未套用正式元件');
  });

  it('renders the same seven visual states in both layers', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-field-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-field-state=/gu)).toHaveLength(14);
    expect(html).toContain('預設／空白');
    expect(html).toContain('Focus-visible');
    expect(html).toContain('請輸入曲目名稱。');
    expect(html).toContain('由系統管理');
    expect(html).toContain('Readonly');
  });

  it('orders foundation checks before state coverage and supporting values', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    for (const [source, firstValue] of [
      ['candidate', 'Standard 2.25rem／36 CSS px'],
      ['current', '1.875rem／30 CSS px'],
    ]) {
      const layerIndex = html.indexOf(`data-field-source="${source}"`);
      const foundationIndex = html.indexOf(
        'data-field-foundation="true"',
        layerIndex,
      );
      const stateIndex = html.indexOf('data-field-state="default"', layerIndex);
      const coverageIndex = html.indexOf(
        'data-field-coverage-matrix="true"',
        layerIndex,
      );
      const valueIndex = html.indexOf(firstValue, layerIndex);

      expect(foundationIndex).toBeGreaterThan(layerIndex);
      expect(stateIndex).toBeGreaterThan(foundationIndex);
      expect(coverageIndex).toBeGreaterThan(stateIndex);
      expect(valueIndex).toBeGreaterThan(coverageIndex);
    }
  });

  it('visualizes height, parent-owned width behavior, and non-token test slots', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    expect(html.match(/data-field-size=/gu)).toHaveLength(3);
    expect(html).toContain('data-field-size="standard"');
    expect(html).toContain('data-field-size="compact"');
    expect(html).toContain('data-field-size="active"');
    expect(html.match(/data-field-width-test=/gu)).toHaveLength(6);
    for (const width of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-field-width-test="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const label of [
      'Default',
      '100% parent',
      'Min',
      '0 · layout floor',
      'Max',
      'none · parent owns',
      '12rem 檢查槽 · 非元件 token',
      '20rem 檢查槽 · 非元件 token',
    ]) {
      expect(html).toContain(label);
    }
    expect(candidateTokens).not.toContain('--ui-field-min-width');
    expect(candidateTokens).not.toContain('--ui-field-max-width');
    expect(candidateTokens).not.toContain('--ui-field-default-width');

    for (const [id, label] of [
      ['demo-field-candidate-size-standard', 'Standard 高度檢查'],
      ['demo-field-candidate-size-compact', 'Compact 高度檢查'],
      ['demo-field-current-size-active', 'Active default 高度檢查'],
      [
        'demo-field-candidate-width-narrow',
        '12rem 檢查槽 · 非元件 token 寬度檢查',
      ],
      [
        'demo-field-candidate-width-reference',
        '20rem 檢查槽 · 非元件 token 寬度檢查',
      ],
      ['demo-field-candidate-width-fluid', '可用寬度檢查槽 寬度檢查'],
    ]) {
      expect(html).toMatch(
        new RegExp(`<label[^>]*for="${id}"[^>]*>${label}`, 'u'),
      );
    }

    for (const [selector, declaration] of [
      ['.demo-field-size--standard', '--ui-field-height: 2.25rem;'],
      ['.demo-field-size--compact', '--ui-field-height: 2rem;'],
      ['.demo-field-size--active', '--ui-field-height: 1.875rem;'],
      ['.demo-field-width-test--narrow', 'width: min(12rem, 100%);'],
      ['.demo-field-width-test--reference', 'width: min(20rem, 100%);'],
      ['.demo-field-width-test--fluid', 'width: 100%;'],
    ]) {
      const selectorIndex = componentSource.indexOf(`${selector} {`);
      const bodyEnd = componentSource.indexOf('\n}', selectorIndex);
      expect(selectorIndex).toBeGreaterThanOrEqual(0);
      expect(componentSource.slice(selectorIndex, bodyEnd)).toContain(
        declaration,
      );
    }
  });

  it('visualizes the prop-driven label and support regions around the control slot', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    for (const region of ['label', 'control', 'support']) {
      expect(
        html.match(new RegExp(`data-field-structure="${region}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Label prop');
    expect(html).toContain('Control scoped slot');
    expect(html).toContain('Hint／Error prop');
    expect(html).toContain('Leading／Trailing 由具體元件負責');
  });

  it('shows a complete style-and-semantics coverage matrix for every state', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    for (const source of ['candidate', 'current']) {
      for (const state of states) {
        for (const category of coverageCategories) {
          expect(html).toContain(
            `data-field-coverage="${source}-${state}-${category}"`,
          );
        }
      }
    }
    expect(html.match(/data-field-coverage=/gu)).toHaveLength(70);
    expect(html).toContain(
      'Readonly 使用 quiet surface · 保留文字選取、複製與 focus',
    );
    expect(html).toMatch(
      /data-field-coverage="candidate-readonly-surface"[^>]*data-coverage-status="complete"[^>]*>Quiet surface</u,
    );
    expect(html).toMatch(
      /data-field-coverage="current-readonly-surface"[^>]*data-coverage-status="base"[^>]*>Same as editable</u,
    );
    expect(html).toContain(
      'Readonly 與 Editable 同表面 · Label／Disabled Select none 尚未套用',
    );
    expect(html).not.toContain('Readonly 專屬外觀待決');
    expect(html).toContain('data-coverage-status="pending"');
  });

  it('anchors candidate values to Token v2 and states to the shared field contract', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    for (const declaration of [
      '--ui-field-height: var(--ui-control-height);',
      '--ui-control-height: 2.25rem;',
      '--ui-field-padding-block: var(--ui-space-1);',
      '--ui-field-padding-inline: var(--ui-space-2);',
      '--ui-field-radius: var(--ui-radius-md);',
      '--ui-field-bg: var(--ui-color-surface-raised);',
      '--ui-field-bg-hover: var(--ui-color-surface-hover);',
      '--ui-field-border: var(--ui-color-border);',
      '--ui-field-border-hover: var(--ui-color-border-strong);',
      '--ui-field-border-invalid: var(--ui-color-danger);',
      '--ui-opacity-disabled: 0.5;',
      '--ui-focus-width: 2px;',
      '--ui-focus-offset: 2px;',
    ]) {
      expect(candidateTokens).toContain(declaration);
    }

    for (const value of [
      'Standard 2.25rem／36 CSS px',
      'Compact 2rem／32 CSS px',
      'Block 0.25rem／4 CSS px',
      'Inline 0.5rem／8 CSS px',
      '0.375rem／6 CSS px',
      '1 CSS px',
      '2 CSS px＋2 CSS px offset',
      '50%',
      'Light 7.37:1 · AA',
    ]) {
      expect(html).toContain(value);
    }
  });

  it('uses an explicit active-token snapshot instead of inheriting the F8 candidate palette', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    for (const declaration of [
      '--ui-control-height: 1.875rem;',
      '--ui-field-bg: var(--ui-color-surface-hover);',
      '--ui-field-bg-hover: var(--ui-color-surface-active);',
      '--ui-color-focus: #dd7a64;',
    ]) {
      expect(activeTokens).toContain(declaration);
    }

    expect(componentSource).toContain('--demo-current-field-height: 1.875rem;');
    expect(componentSource).toContain('--demo-current-field-bg: #344046;');
    expect(componentSource).toContain('--demo-current-focus: #dd7a64;');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-field-layer--current)",
    );
    expect(html).toContain('1.875rem／30 CSS px');
    expect(html).toContain('Coral 外框');
    expect(html).toContain('Light 4.23:1 · 未達 4.5:1');
  });

  it('locks every current dark and light snapshot value to its active token', () => {
    const activeDark = declarationsFor(activeTokens, ':root {');
    const activeLight = {
      ...activeDark,
      ...declarationsFor(activeTokens, ":root[data-ui-theme='light'],"),
    };
    const snapshotDark = declarationsFor(
      componentSource,
      '.demo-field-layer--current {',
    );
    const snapshotLight = {
      ...snapshotDark,
      ...declarationsFor(
        componentSource,
        ":global(:root[data-ui-theme='light'] .demo-field-layer--current)",
      ),
    };
    const mappings = [
      ['--demo-current-field-height', '--ui-field-height'],
      ['--demo-current-field-bg', '--ui-field-bg'],
      ['--demo-current-field-bg-hover', '--ui-field-bg-hover'],
      ['--demo-current-field-fg', '--ui-field-fg'],
      ['--demo-current-field-placeholder', '--ui-field-placeholder'],
      ['--demo-current-field-border', '--ui-field-border'],
      ['--demo-current-field-border-hover', '--ui-field-border-hover'],
      ['--demo-current-field-invalid', '--ui-field-border-invalid'],
      ['--demo-current-focus', '--ui-color-focus'],
    ];

    for (const [theme, snapshot, active] of [
      ['dark', snapshotDark, activeDark],
      ['light', snapshotLight, activeLight],
    ]) {
      for (const [snapshotName, activeName] of mappings) {
        expect(
          resolveVariable(snapshotName, snapshot),
          `${theme} ${snapshotName}`,
        ).toBe(resolveVariable(activeName, active));
      }
    }
  });

  it('derives every displayed placeholder contrast ratio from its token layer', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));
    const candidateDark = declarationsFor(
      candidateTokens,
      ":root[data-ui-system='v2'] {",
    );
    const candidateLight = {
      ...candidateDark,
      ...declarationsFor(
        candidateTokens,
        ":root[data-ui-system='v2'][data-ui-theme='light'] {",
      ),
    };
    const activeDark = declarationsFor(activeTokens, ':root {');
    const activeLight = {
      ...activeDark,
      ...declarationsFor(activeTokens, ":root[data-ui-theme='light'],"),
    };

    for (const [label, tokens] of [
      ['Dark 5.69:1', candidateDark],
      ['Light 7.37:1 · AA', candidateLight],
      ['Dark 5.25:1', activeDark],
      ['Light 4.23:1 · 未達 4.5:1', activeLight],
    ]) {
      const ratio = contrastRatio(
        resolveVariable('--ui-field-placeholder', tokens),
        resolveVariable('--ui-field-bg', tokens),
      ).toFixed(2);

      expect(label).toContain(`${ratio}:1`);
      expect(html).toContain(label);
    }
  });

  it('preserves native state semantics and the error-description relationship', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));
    const inputTag = (source, state) =>
      html.match(
        new RegExp(`<input[^>]*id="demo-field-${source}-${state}"[^>]*>`, 'u'),
      )?.[0];

    for (const source of ['candidate', 'current']) {
      expect(inputTag(source, 'filled')).toContain('required');
      expect(inputTag(source, 'filled')).toContain(
        `aria-describedby="demo-field-${source}-filled-hint"`,
      );
      expect(inputTag(source, 'invalid')).toContain('required');
      expect(inputTag(source, 'invalid')).toContain('aria-invalid="true"');
      expect(inputTag(source, 'invalid')).toContain(
        `aria-describedby="demo-field-${source}-invalid-error"`,
      );
      expect(inputTag(source, 'disabled')).toContain('disabled');
      expect(inputTag(source, 'readonly')).toContain('readonly');
      expect(html).toContain(
        `id="demo-field-${source}-invalid-error" class="ui-field__message is-error" role="alert"`,
      );
    }
  });

  it('prevents selection for candidate labels and disabled values while keeping readonly content copyable', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));
    const selectNoneBlocks = [
      ...componentSource.matchAll(
        /([^{}]+)\{[^{}]*-webkit-user-select:\s*none;[^{}]*user-select:\s*none;[^{}]*\}/gu,
      ),
    ];

    expect(html).toMatch(
      /data-field-coverage="candidate-disabled-feedback"[^>]*data-coverage-status="complete"[^>]*>Not-allowed · Select none</u,
    );
    expect(html).toMatch(
      /data-field-coverage="current-disabled-feedback"[^>]*data-coverage-status="pending"[^>]*>Not-allowed · 可選取（待補）</u,
    );
    expect(componentSource).toMatch(
      /\.demo-field-layer--candidate\s+\.demo-field-state\[data-field-state='disabled'\]\s+:deep\(\.ui-text-field:disabled\)\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(componentSource).not.toMatch(
      /data-field-state='readonly'[^{]*\{[^}]*user-select:\s*none;/su,
    );
    expect(componentSource).toMatch(
      /data-field-state='readonly'[\s\S]*?background: var\(--ui-field-bg-readonly\);[\s\S]*?border-color: var\(--ui-field-border\);/u,
    );
    const disabledBlock = selectNoneBlocks.find(([, selector]) =>
      selector.includes("data-field-state='disabled'"),
    );
    const labelBlock = selectNoneBlocks.find(([, selector]) =>
      selector.includes('.ui-field__label'),
    );

    expect(selectNoneBlocks).toHaveLength(2);
    expect(disabledBlock?.[1]).toContain('.demo-field-layer--candidate');
    expect(disabledBlock?.[1]).toContain('.ui-text-field:disabled');
    expect(disabledBlock?.[1]).not.toContain('current');
    expect(disabledBlock?.[1]).not.toContain('readonly');
    expect(labelBlock?.[1]).toContain('.demo-field-layer--candidate');
    expect(labelBlock?.[1]).toContain('.ui-field__required');
    expect(labelBlock?.[1]).not.toContain('current');
    expect(textFieldSource).toMatch(
      /\.ui-text-field\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/su,
    );
    expect(textFieldSource).not.toMatch(
      /\.ui-text-field:disabled\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(fieldSource).not.toMatch(
      /\.ui-field__label\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(html).toMatch(
      /data-field-label-selection="candidate"[^>]*data-selection-status="complete"[^>]*>[\s\S]*?<small[^>]*>Select none<\/small><\/div>/u,
    );
    expect(html).toMatch(
      /data-field-label-selection="current"[^>]*data-selection-status="pending"[^>]*>[\s\S]*?<small[^>]*>可選取（待補）<\/small><\/div>/u,
    );
    expect(html).toContain('Readonly 使用 quiet surface');
  });

  it('keeps the specimen responsive to its catalogue container', () => {
    expect(componentSource).toContain('container-type: inline-size;');
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(componentSource).toContain(
      'repeat(auto-fit, minmax(min(13rem, 100%), 1fr))',
    );
    expect(componentSource).toContain(
      'repeat(auto-fit, minmax(min(7rem, 100%), 1fr))',
    );
  });

  it('keeps this review scoped to the shared text-like field shell', () => {
    expect(componentSource).toContain(
      "import UiTextField from '../ui/UiTextField.vue'",
    );
    expect(componentSource).not.toContain('UiCheckbox');
    expect(componentSource).not.toContain('UiRange');
    expect(componentSource).not.toContain('UiTextarea');
    expect(componentSource).not.toContain('UiSelect');
    expect(componentSource).not.toContain('UiSearchBox');
  });

  it('mounts the contract inside the field catalogue section', async () => {
    const html = await renderToString(
      createSSRApp(DemoInputs, {
        sections: [
          { key: 'field', title: '欄位共用外觀', components: ['UiField'] },
        ],
      }),
    );

    expect(html).toContain('data-field-source="candidate"');
    expect(html).toContain('data-field-source="current"');
  });
});
