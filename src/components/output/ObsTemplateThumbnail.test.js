import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./ObsTemplateThumbnail.vue', import.meta.url)),
  'utf8',
);

describe('output template thumbnail', () => {
  it('uses bundled images without mounting a live mockup even when an image is missing', () => {
    expect(source).toContain('getOutputTemplateThumbnail');
    expect(source).toContain('<img');
    expect(source).toContain('v-if="showBundledThumbnail"');
    expect(source).not.toContain('ObsTemplateMockup');
    expect(source).toContain('v-else');
    expect(source).toContain('暫無縮圖');
  });

  it('reserves a 16:9 image slot and handles failed image decoding locally', () => {
    expect(source).toContain('class="obs-template-thumbnail__frame"');
    expect(source).toContain("default: 'lazy'");
    expect(source).toContain(':loading="loading"');
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

  it('does not bypass bundled thumbnails for the stable Karaoke Stack id', () => {
    expect(source).not.toContain("props.preset?.id === 'karaoke-stack'");
    expect(source).not.toContain('prefersLiveMockup');
  });
});
