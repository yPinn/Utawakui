import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFieldReadonlyAppearance from './DemoFieldReadonlyAppearance.vue';
import DemoInputs from './DemoInputs.vue';

const componentSource = readFileSync(
  new URL('./DemoFieldReadonlyAppearance.vue', import.meta.url),
  'utf8',
);
const candidateTokens = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);
const activeTokens = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

const layers = ['candidate', 'current'];
const families = ['text-field', 'textarea'];
const states = ['editable', 'readonly', 'disabled'];

describe('DemoFieldReadonlyAppearance', () => {
  it('shows Candidate before Current and keeps feature gates outside the field state model', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );
    const candidateIndex = html.indexOf(
      'data-field-readonly-layer="candidate"',
    );
    const currentIndex = html.indexOf('data-field-readonly-layer="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Field family 狀態語法');
    expect(html).toContain('Feature Gate 是獨立 gated flow');
    expect(html).toContain('不是 readonly／disabled');
  });

  it('describes readonly according to each layer instead of labeling Current as quiet', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );
    const candidate = html.slice(
      html.indexOf('data-field-readonly-layer="candidate"'),
      html.indexOf('data-field-readonly-layer="current"'),
    );
    const current = html.slice(
      html.indexOf('data-field-readonly-layer="current"'),
    );

    expect(candidate).toContain('Quiet · 可選取／複製');
    expect(current).toContain('同 Editable · 可選取／複製');
    expect(current).not.toContain('Quiet · 可選取／複製');
  });

  it('renders Text Field and Textarea across editable, readonly, and disabled in both layers', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );

    for (const layer of layers) {
      for (const family of families) {
        for (const state of states) {
          expect(html).toContain(
            `data-field-readonly-control="${layer}-${family}-${state}"`,
          );
        }
      }
    }
    expect(html.match(/data-field-readonly-control=/gu)).toHaveLength(12);
  });

  it('preserves native readonly and disabled semantics without inventing a permission lock', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );
    const controlTag = (layer, family, state) => {
      const tag = family === 'textarea' ? 'textarea' : 'input';
      return html.match(
        new RegExp(
          `<${tag}[^>]*id="demo-field-readonly-${layer}-${family}-${state}"[^>]*>`,
          'u',
        ),
      )?.[0];
    };

    for (const layer of layers) {
      for (const family of families) {
        expect(controlTag(layer, family, 'editable')).not.toMatch(
          /\sreadonly(?:[=>\s])/u,
        );
        expect(controlTag(layer, family, 'editable')).not.toMatch(
          /\sdisabled(?:[=>\s])/u,
        );
        expect(controlTag(layer, family, 'readonly')).toMatch(
          /\sreadonly(?:[=>\s])/u,
        );
        expect(controlTag(layer, family, 'readonly')).not.toMatch(
          /\sdisabled(?:[=>\s])/u,
        );
        expect(controlTag(layer, family, 'disabled')).toMatch(
          /\sdisabled(?:[=>\s])/u,
        );
        expect(controlTag(layer, family, 'disabled')).not.toMatch(
          /\sreadonly(?:[=>\s])/u,
        );
      }
    }
    expect(html).not.toContain('<svg');
    expect(componentSource).not.toMatch(/import\s+\{?\s*Lock/u);
    expect(html).not.toContain('權限不足');
  });

  it('defines one Candidate readonly surface alias and keeps text fully readable and selectable', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );

    expect(candidateTokens).toContain(
      '--ui-field-bg-readonly: var(--ui-color-surface);',
    );
    expect(componentSource).toMatch(
      /\.demo-field-readonly-layer--candidate[\s\S]*?:deep\(\.ui-text-field:read-only\)[\s\S]*?:deep\(\.ui-textarea:read-only\)[\s\S]*?background: var\(--ui-field-bg-readonly\);[\s\S]*?border-color: var\(--ui-field-border\);/u,
    );
    expect(componentSource).toMatch(
      /\.demo-field-readonly-layer--candidate[\s\S]*?:read-only:hover[\s\S]*?background: var\(--ui-field-bg-readonly\);[\s\S]*?border-color: var\(--ui-field-border\);/u,
    );
    expect(componentSource).not.toMatch(/:read-only[^{}]*\{[^}]*opacity:/u);
    expect(componentSource).not.toMatch(
      /:read-only[^{}]*\{[^}]*user-select:\s*none/u,
    );
    expect(html).toContain('完整文字對比');
    expect(html).toContain('可選取／複製');
    expect(html).toContain('無 Hover 提升');
    expect(html).toContain('Focus-visible 保留');
  });

  it('uses an explicit active-token snapshot for Current instead of the Candidate readonly alias', () => {
    for (const declaration of [
      '--ui-field-bg: var(--ui-color-surface-hover);',
      '--ui-field-border: var(--ui-color-border);',
      '--ui-field-fg: var(--ui-color-text);',
    ]) {
      expect(activeTokens).toContain(declaration);
    }
    expect(componentSource).toContain('.demo-field-readonly-layer--current {');
    expect(componentSource).toContain('--ui-field-bg: #344046;');
    expect(componentSource).toContain('--ui-field-fg: #f7f1e7;');
    expect(componentSource).toContain('--ui-field-border: #3c4749;');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-field-readonly-layer--current)",
    );
    expect(componentSource).not.toMatch(
      /demo-field-readonly-layer--current[^}]*--ui-field-bg-readonly:/u,
    );
  });

  it('keeps the comparison fluid and reflows at a narrow catalogue container', () => {
    expect(componentSource).toContain('container-type: inline-size;');
    expect(componentSource).toContain(
      'repeat(3, minmax(min(12rem, 100%), 1fr))',
    );
    expect(componentSource).toContain('@container (max-width: 42rem)');
    expect(componentSource).toMatch(
      /@container \(max-width: 42rem\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/u,
    );
  });

  it('mounts immediately after the shared Field specimen without adding a production section', async () => {
    const html = await renderToString(
      createSSRApp(DemoInputs, {
        sections: [
          { key: 'field', title: '欄位共用外觀', components: ['UiField'] },
        ],
      }),
    );
    const fieldIndex = html.indexOf('data-field-source="candidate"');
    const readonlyIndex = html.indexOf('data-field-readonly-review');

    expect(fieldIndex).toBeGreaterThanOrEqual(0);
    expect(readonlyIndex).toBeGreaterThan(fieldIndex);
    expect(html).not.toContain('demo-field-readonly-section');
  });
});
