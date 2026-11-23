import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const source = readCatalogSource(
  new URL('./ObsTemplateThumbnail.vue', import.meta.url),
);

describe('output template thumbnail', () => {
  it('uses bundled images and gives Textured Credits a static mockup fallback', () => {
    expect(source).toContain('getOutputTemplateThumbnail');
    expect(source).toContain('<img');
    expect(source).toContain('v-if="showBundledThumbnail"');
    expect(source).toMatch(
      /<ObsTemplateMockup\s+v-else-if="preset\?\.id === 'textured-credits'"\s+:preset="preset"\s+size="thumbnail"\s+class="obs-template-thumbnail__mockup"\s*\/>/u,
    );
    expect(source).toContain('<span v-else');
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

  it('clips image corners once at the frame and supports embedding in a clipped parent', () => {
    const frame = source.match(
      /\.obs-template-thumbnail__frame \{[^}]+\}/u,
    )?.[0];
    const image = source.match(/\.obs-template-thumbnail \{[^}]+\}/u)?.[0];
    expect(frame).toContain('overflow: hidden');
    expect(frame).toContain(
      'var(--obs-template-preview-frame-radius, var(--ui-radius-sm))',
    );
    expect(image).not.toContain('border');
  });
});
