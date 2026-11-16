import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const styles = read('../../styles/fieldSurfaces.css').replace(/\s+/gu, ' ');

describe('shared field appearance', () => {
  it.each([
    ['UiTextField.vue', 'ui-text-field'],
    ['UiTextarea.vue', 'ui-textarea'],
    ['UiSelect.vue', 'ui-select'],
    ['UiColorField.vue', 'ui-color-field__input'],
    ['UiColorField.vue', 'ui-color-field__picker'],
    ['UiCombobox.vue', 'ui-combobox__native'],
    ['UiSearchBox.vue', 'ui-search-box__control'],
  ])('%s delegates %s paint to the shared recipe', (file, control) => {
    const source = read(file);
    expect(source).toContain(`class="ui-field-surface ${control}`);
    expect(source).not.toMatch(
      /var\(--ui-field-background|var\(--ui-field-border-invalid/u,
    );
  });

  it('keeps hover below validation and focus independent from the border', () => {
    expect(styles).toMatch(
      /:hover:not\(\s*:disabled, \[data-field-disabled\], \[readonly\], \[data-field-readonly\]\s*\)/u,
    );
    expect(styles).toMatch(
      /:where\(\[readonly\], \[data-field-readonly\]\)[^}]*var\(--ui-field-background-readonly\)/su,
    );
    expect(styles).toMatch(
      /:is\(\s*\[aria-invalid='true'\], :has\(> input\[aria-invalid='true'\]\)\s*\)[^}]*border-color: var\(--ui-field-border-invalid\);/su,
    );
    expect(styles).toMatch(
      /:where\(:focus-visible, :has\(> input:focus-visible\)\)[^}]*outline: var\(--ui-focus-width\) solid var\(--ui-color-focus\);/su,
    );
    expect(styles).toMatch(
      /:where\(:disabled, \[data-field-disabled\]\)[^}]*opacity: var\(--ui-opacity-disabled\);/su,
    );
  });

  it('lets bare textarea opt out of normal paint while preserving validation and focus', () => {
    const bare = read('UiTextarea.vue').match(
      /\.ui-textarea--bare\s*\{([^}]*)\}/u,
    )?.[1];
    expect(bare).toContain('--_ui-field-surface-background: transparent;');
    expect(bare).toContain('--_ui-field-surface-border: transparent;');
    expect(bare).not.toMatch(
      /(?:^|\n)\s*(?:outline|border-color|background):/u,
    );
  });
});
