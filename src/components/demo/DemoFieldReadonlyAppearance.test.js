import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFieldReadonlyAppearance from './DemoFieldReadonlyAppearance.vue';
import DemoInputs from './DemoInputs.vue';

const source = readFileSync(
  new URL('./DemoFieldReadonlyAppearance.vue', import.meta.url),
  'utf8',
);

describe('F8 field surface comparison', () => {
  it('uses the same interactive sample in every host and keeps the block mapping local', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldReadonlyAppearance),
    );
    expect(html.match(/class="ui-field-surface ui-textarea"/gu)).toHaveLength(
      2,
    );
    expect(html.match(/\sreadonly(?:\s|>)/gu)).toHaveLength(2);
    expect(html.match(/data-field-disabled="true"/gu)).toHaveLength(2);
    expect(html).toContain('data-ui-field-surface="raised"');
    expect(source).toContain('data-ui-field-surface="surface"');
    expect(source).toContain('<UiModal');
    expect(source).toContain('<UiPopover');
    expect(source).not.toMatch(/:deep|--ui-field-background/u);
  });

  it('mounts after the shared Field specimen', async () => {
    const html = await renderToString(
      createSSRApp(DemoInputs, {
        sections: [{ key: 'field', title: 'Field' }],
      }),
    );
    const fieldIndex = html.indexOf('data-field-source="production"');
    expect(fieldIndex).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('data-field-readonly-review')).toBeGreaterThan(
      fieldIndex,
    );
  });
});
