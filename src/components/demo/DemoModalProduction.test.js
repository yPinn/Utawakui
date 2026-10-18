import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('formal modal catalogue entry', () => {
  it('exposes the production composition before the retained Candidate', () => {
    const source = readFileSync(
      new URL('./DemoModalAppearance.vue', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      "import DemoModalProduction from './DemoModalProduction.vue'",
    );
    expect(source).toContain('<DemoModalProduction');
    expect(source).toContain('data-modal-source="production"');
    expect(source.indexOf('data-modal-source="production"')).toBeLessThan(
      source.indexOf('v-for="layer in LAYERS"'),
    );
    expect(source).toContain('<DemoModalLayer :layer="layer"');
  });
});
