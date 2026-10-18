import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./UiCombobox.vue', import.meta.url),
  'utf8',
);

describe('UiCombobox appearance contract', () => {
  it('separates flat and grouped options and reserves a token gap before the arrow', () => {
    for (const selector of [
      '.ui-combobox__listbox :deep(.ui-combobox__listbox-viewport)',
      '.ui-combobox__group-options',
    ]) {
      const rule = source
        .slice(source.lastIndexOf(`${selector} {`))
        .split('}')[0];
      expect(rule).toContain('display: flex;');
      expect(rule).toContain('flex-direction: column;');
      expect(rule).toContain('gap: var(--ui-space-1);');
    }
    expect(source).toMatch(
      /padding-inline-end:\s*calc\(\s*var\(--ui-field-padding-inline\)\s*\+\s*var\(--ui-space-4\)\s*\+\s*var\(--ui-space-2\)\s*\);/s,
    );
  });
  it('truncates the actual option text container while preserving its indicator', () => {
    expect(source).toMatch(
      /\.ui-combobox__option-content\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
  });
  it('keeps the input in the field family and the listbox in the floating family', () => {
    expect(source).toMatch(
      /\.ui-combobox__native\s*\{[^}]*border-radius:\s*var\(--ui-field-radius\);/s,
    );
    expect(source).toMatch(
      /\.ui-combobox__listbox\s*\{[^}]*border:\s*var\(--ui-border-width\) solid var\(--ui-floating-list-border\);[^}]*border-radius:\s*var\(--ui-floating-list-radius\);[^}]*background:\s*var\(--ui-floating-list-bg\);[^}]*box-shadow:\s*var\(--ui-floating-list-shadow\);/s,
    );
  });

  it('uses the shared floating inset around compact listbox options', () => {
    expect(source).toMatch(
      /\.ui-combobox__listbox\s+:deep\(\.ui-combobox__listbox-viewport\)\s*\{[^}]*padding:\s*var\(--ui-floating-list-padding\);/s,
    );
    expect(source).toMatch(
      /\.ui-combobox__option\s*\{[^}]*min-block-size:\s*var\(--ui-floating-row-min-height\);[^}]*padding:\s*var\(--ui-floating-row-padding-block\)\s+var\(--ui-floating-row-padding-inline\);[^}]*border-radius:\s*var\(--ui-floating-row-radius\);/s,
    );
  });

  it('keeps select-only and option states aligned without text selection', () => {
    expect(source).toMatch(
      /\.ui-combobox__select-trigger\s*\{[^}]*align-items:\s*center;[^}]*text-align:\s*start;[^}]*user-select:\s*none;/s,
    );
    expect(source).toMatch(
      /\.ui-combobox__option-indicator\s*\{[^}]*inline-size:\s*var\(--ui-space-4\);[^}]*flex:\s*0 0 var\(--ui-space-4\);/s,
    );
    expect(source).toMatch(
      /\.ui-combobox__option\[aria-selected='true'\]\s*\{[^}]*background:\s*var\(--ui-color-surface-selected\);/s,
    );
    expect(source).toMatch(
      /\.ui-combobox__option:hover:not\(\[aria-disabled='true'\]\)\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/s,
    );
  });

  it('indents grouped content without insetting the full-row state surface', () => {
    expect(source).toContain("'ui-combobox__option--grouped': group.label");
    expect(source).toMatch(
      /\.ui-combobox__option--grouped\s+\.ui-combobox__option-content\s*\{[^}]*margin-inline-start:\s*var\(--ui-space-2\);/s,
    );
    expect(source).not.toContain('ui-combobox__group-options--labeled');
    expect(source).toMatch(
      /\.ui-combobox__option\[aria-selected='true'\]\s*\{[^}]*color:\s*var\(--ui-color-text\);/s,
    );
    expect(source).not.toMatch(
      /\.ui-combobox__option\[aria-selected='true'\]\s*\{[^}]*font-weight:/s,
    );
  });
});
