import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('formal collage catalogue entry', () => {
  it('exposes the formal composition separately from the Candidate', () => {
    const source = readFileSync(
      new URL('./DemoCollageThumbAppearance.vue', import.meta.url),
      'utf8',
    );
    expect(source).toContain('<DemoCollageThumbProduction');
    expect(source).toContain('data-collage-thumb-source="production"');
    expect(source).toContain('<DemoProposalSpecimen');
  });
});
