import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('Field invalid paint authority', () => {
  it.each([
    ['UiTextField.vue', 'ui-text-field'],
    ['UiTextarea.vue', 'ui-textarea'],
    ['UiSelect.vue', 'ui-select'],
    ['UiColorField.vue', 'ui-color-field__input'],
    ['UiColorField.vue', 'ui-color-field__picker'],
    ['UiCombobox.vue', 'ui-combobox__native'],
  ])('%s keeps %s hover below semantic validation', (file, control) => {
    const source = read(`./${file}`);
    expect(source).toContain(`.${control}:where(:hover:not(:disabled))`);
    expect(source).toContain(`.${control}[aria-invalid='true']`);
    expect(source).toContain('border-color: var(--ui-field-border-invalid);');
    expect(source).toContain(
      'outline: var(--ui-focus-width) solid var(--ui-color-focus);',
    );
  });

  it('does not let bare textarea hover hide an invalid border', () => {
    expect(read('./UiTextarea.vue')).toContain(
      '.ui-textarea--bare:where(:hover:not(:disabled))',
    );
  });
});
