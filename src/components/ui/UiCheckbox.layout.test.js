import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./UiCheckbox.vue', import.meta.url),
  'utf8',
);

describe('UiCheckbox layout', () => {
  it('optically aligns the visible label without moving the control hit target', () => {
    expect(source).toContain('--ui-checkbox-label-optical-offset: 1px;');
    expect(source).toMatch(
      /\.ui-checkbox-field:not\(\.has-hidden-label\) :deep\(\.ui-field__label--inline\)[\s\S]*?transform:\s*translateY\(var\(--ui-checkbox-label-optical-offset\)\);/u,
    );
    expect(source).toMatch(
      /\.ui-checkbox__native\s*\{[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/u,
    );
  });

  it('keeps the indicator centered in the shared control target', () => {
    expect(source).toContain(
      '(var(--ui-checkbox-resolved-target-size) - var(--ui-checkbox-size)) / 2',
    );
    expect(source).not.toContain('margin-block-start: 1px;');
  });

  it('uses a length-compatible floor so Chromium keeps the label padding', () => {
    expect(source).toMatch(
      /padding-block:\s*max\(\s*0rem,\s*calc\(\(var\(--ui-checkbox-resolved-target-size\) - 1lh\) \/ 2\)\s*\);/u,
    );
    expect(source).not.toContain('max(\n    var(--ui-space-0),');
  });
});
