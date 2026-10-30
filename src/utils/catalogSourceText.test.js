import { describe, expect, it } from 'vitest';
import { expandCatalogText } from './catalogSourceText.js';

describe('expandCatalogText', () => {
  it('expands bound attributes, interpolations and script calls', () => {
    expect(
      expandCatalogText(
        [
          `<UiButton :label="t('common.save')" />`,
          `<p>{{\n  t('common.cancel')\n}}</p>`,
          `const label = t('common.close');`,
        ].join('\n'),
      ),
    ).toBe(
      [
        '<UiButton label="儲存" />',
        '<p>取消</p>',
        "const label = '關閉';",
      ].join('\n'),
    );
  });

  it('leaves parameterized calls and unknown keys untouched', () => {
    const source = `t('ui.colorField.picker', { label }) t('common.missing')`;
    expect(expandCatalogText(source)).toBe(source);
  });
});
