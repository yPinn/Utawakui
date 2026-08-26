import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./ObsTemplateThumbnail.vue', import.meta.url)),
  'utf8',
);

describe('output template thumbnail', () => {
  it('prefers a bundled image and keeps the mockup as the missing-image fallback', () => {
    expect(source).toContain('getOutputTemplateThumbnail');
    expect(source).toContain('<img');
    expect(source).toContain('v-if="showBundledThumbnail"');
    expect(source).toContain('<ObsTemplateMockup');
    expect(source).toContain('v-else');
    expect(source).toContain(':animated="false"');
  });

  it('reserves a 16:9 image slot and handles failed image decoding locally', () => {
    expect(source).toContain('class="obs-template-thumbnail__frame"');
    expect(source).toContain('loading="lazy"');
    expect(source).toContain('decoding="async"');
    expect(source).toContain('width="1280"');
    expect(source).toContain('height="720"');
    expect(source).toContain('alt=""');
    expect(source).toContain('@error="markThumbnailFailed"');
    expect(source).toContain(
      'aspect-ratio: var(--ui-output-preview-aspect-ratio)',
    );
    expect(source).toContain('max-width: 100%');
    expect(source).toContain('height: 100%');
    expect(source).toContain('overflow: hidden');
    expect(source).toContain('object-fit: cover');
    expect(source).toContain('pointer-events: none');
  });

  it('uses the live replacement mockup for the stable Karaoke Stack id', () => {
    expect(source).toContain("props.preset?.id === 'karaoke-stack'");
    expect(source).toContain('prefersLiveMockup');
    expect(source).toContain('!prefersLiveMockup.value');
  });
});
