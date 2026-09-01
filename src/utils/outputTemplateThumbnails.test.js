import { describe, expect, it } from 'vitest';
import {
  buildOutputTemplateThumbnailRegistry,
  getOutputTemplateThumbnail,
} from './outputTemplateThumbnails.js';

describe('bundled output template thumbnails', () => {
  it('keys Vite asset URLs by the existing template id filename', () => {
    const registry = buildOutputTemplateThumbnailRegistry({
      '../assets/output-template-thumbnails/quiet-caption.webp':
        '/assets/quiet-caption.abc123.webp',
      '../assets/output-template-thumbnails/live-stage.png':
        '/assets/live-stage.def456.png',
    });

    expect(registry).toEqual({
      'quiet-caption': '/assets/quiet-caption.abc123.webp',
      'live-stage': '/assets/live-stage.def456.png',
    });
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('ignores unrelated files and unusable module values', () => {
    const registry = buildOutputTemplateThumbnailRegistry({
      '../assets/output-template-thumbnails/README.md': '/README.hash.md',
      '../assets/output-template-thumbnails/Bad_Name.webp': '/bad.webp',
      '../assets/output-template-thumbnails/queue-board.avif': undefined,
      '../assets/output-template-thumbnails/focus-line.jpg': '/focus.jpg',
    });

    expect(registry).toEqual({ 'focus-line': '/focus.jpg' });
  });

  it('rejects duplicate image files for one template id', () => {
    expect(() =>
      buildOutputTemplateThumbnailRegistry({
        '../assets/output-template-thumbnails/manga-frame.webp': '/manga.webp',
        '../assets/output-template-thumbnails/manga-frame.png': '/manga.png',
      }),
    ).toThrow(/duplicate bundled thumbnail.*manga-frame/i);
  });

  it('returns null while a bundled asset has not been supplied', () => {
    expect(getOutputTemplateThumbnail('not-yet-supplied')).toBeNull();
    expect(getOutputTemplateThumbnail()).toBeNull();
  });

  it('maps the Classic KTV asset to its stable Karaoke Stack template id', () => {
    expect(getOutputTemplateThumbnail('karaoke-stack')).toMatch(
      /karaoke-stack.*\.jpg$/,
    );
  });

  it('maps the bundled vinyl artwork to the stable Art Card template id', () => {
    expect(getOutputTemplateThumbnail('art-card')).toMatch(/art-card.*\.jpg$/);
  });
});
