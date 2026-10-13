import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFieldAppearance from './DemoFieldAppearance.vue';
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoFieldAppearance.vue', import.meta.url),
  'utf8',
);
describe('DemoFieldAppearance', () => {
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
      expect(tokenSource).toContain(declaration);
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
});
