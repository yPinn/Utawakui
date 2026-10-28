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
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
describe('DemoFieldReadonlyAppearance', () => {
  it('defines one Candidate readonly surface alias and keeps text fully readable and selectable', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );
    expect(tokenSource).toContain(
      '--ui-field-background-readonly: var(--ui-color-surface);',
    );
    expect(componentSource).toMatch(
      /\.demo-field-readonly-layer--candidate[\s\S]*?:deep\(\.ui-text-field:read-only\)[\s\S]*?:deep\(\.ui-textarea:read-only\)[\s\S]*?background: var\(--ui-field-background-readonly\);[\s\S]*?border-color: var\(--ui-field-border\);/u,
    );
    expect(componentSource).toMatch(
      /\.demo-field-readonly-layer--candidate[\s\S]*?:read-only:hover[\s\S]*?background: var\(--ui-field-background-readonly\);[\s\S]*?border-color: var\(--ui-field-border\);/u,
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
          {
            key: 'field',
            title: '欄位共用外觀',
            components: ['UiField'],
          },
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
