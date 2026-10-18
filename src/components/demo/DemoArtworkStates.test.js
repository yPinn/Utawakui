import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('formal artwork state catalogue entry', () => {
  it('mounts the formal composition from the registered track-thumb section', () => {
    const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(read('./DemoContent.vue')).toContain(
      "section.key === 'track-thumb'",
    );
    const source = read('./DemoTrackThumbAppearance.vue');
    expect(source).toContain('data-artwork-source="production"');
    expect(source).toContain('<DemoArtworkStates');
    expect(source).toContain('<DemoTrackThumbPrimitive :layer="layer"');
  });
});
