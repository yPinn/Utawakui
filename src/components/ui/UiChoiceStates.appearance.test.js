import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const checkbox = read('./UiCheckbox.vue');
const radio = read('./UiRadioGroup.vue');
const switchSource = read('./UiSwitch.vue');

describe('choice state color ownership', () => {
  it.each([
    ['checkbox', checkbox],
    ['radio', radio],
    ['switch', switchSource],
  ])('%s reuses the semantic control boundary', (_, source) => {
    expect(source).toContain(
      'border: var(--ui-border-width) solid var(--ui-color-control-boundary);',
    );
  });

  it('keeps Switch invalid border above hover and selection with independent focus', () => {
    expect(switchSource).toContain(
      '.ui-switch__native:where(:hover:not(:disabled)) + .ui-switch__track',
    );
    const selector =
      ".ui-switch__native[aria-invalid='true'] + .ui-switch__track";
    expect(switchSource.indexOf(selector)).toBeGreaterThan(
      switchSource.indexOf('.ui-switch__native:checked + .ui-switch__track'),
    );
    expect(switchSource).toContain(
      `${selector} {\n  border-color: var(--ui-color-danger);`,
    );
    expect(switchSource).toContain(
      'outline: var(--ui-focus-width) solid var(--ui-color-focus);',
    );
    expect(switchSource).toContain('opacity: var(--ui-opacity-disabled);');
  });

  it('keeps hover specificity below selection and validation, including scoped styles', () => {
    expect(checkbox).toContain(
      '.ui-checkbox__native:where(:hover:not(:disabled)) + .ui-checkbox__indicator',
    );
    expect(checkbox).not.toContain('.ui-checkbox__native:hover:not(:disabled)');
    const selection = checkbox.indexOf('.ui-checkbox__native:checked +');
    const validation = checkbox.indexOf(
      ".ui-checkbox__native[aria-invalid='true'] +",
    );
    expect(selection).toBeGreaterThan(-1);
    expect(validation).toBeGreaterThan(selection);
    expect(checkbox).toContain(".ui-checkbox__native[aria-checked='mixed'] +");
  });
});
