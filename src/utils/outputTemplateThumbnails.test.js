import { describe, expect, it } from 'vitest';
import {
  buildOutputTemplateThumbnailRegistry,
  getOutputTemplateThumbnail,
} from './outputTemplateThumbnails.js';
import { OUTPUT_TEMPLATES } from '../constants/outputTemplates.js';
import provenance from '../assets/output-template-thumbnails/provenance.json';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

describe('bundled output template thumbnails', () => {
  it('requires one traceable content record per active template without blessing filename-only matches', () => {
    expect(Object.keys(provenance.templates).sort()).toEqual(
      OUTPUT_TEMPLATES.map((p) => p.id).sort(),
    );
    const blocked = [];
    for (const preset of OUTPUT_TEMPLATES) {
      const record = provenance.templates[preset.id];
      expect(record.file).toBe(`${preset.id}.jpg`);
      const bytes = readFileSync(
        new URL(
          `../assets/output-template-thumbnails/${record.file}`,
          import.meta.url,
        ),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        record.sha256,
      );
      expect(record.humanReview).toBe('not-tested');
      if (record.content === 'style-reference') {
        blocked.push(preset.id);
        expect(record.delivery).toBe('blocked-G01');
        expect(record.rights).toBe('unverified');
      } else if (preset.id === 'receipt-setlist') {
        expect(record.content).toBe('current-runtime-capture');
        expect(record.delivery).toBe('pending-user-visual-acceptance');
        expect(record.rights).toBe('project-owned-runtime-and-generated-paper');
      } else {
        expect(record.content).toBe('legacy-programmatic-capture');
        expect(record.delivery).toBe('pending-current-runtime-review');
      }
    }
    expect(blocked.sort()).toEqual([
      'art-card',
      'karaoke-stack',
      'live-stage',
      'manga-frame',
    ]);
    expect(provenance.generation.overwriteBundledAssets).toBe(false);
  });
  it('supplies a static asset for every registered template', () => {
    for (const preset of OUTPUT_TEMPLATES) {
      expect(getOutputTemplateThumbnail(preset.id), preset.id).toBeTruthy();
    }
  });
  it('keys Vite asset URLs by the existing template id filename', () => {
    const registry = buildOutputTemplateThumbnailRegistry({
      '../assets/output-template-thumbnails/focus-line.webp':
        '/assets/focus-line.abc123.webp',
      '../assets/output-template-thumbnails/live-stage.png':
        '/assets/live-stage.def456.png',
    });

    expect(registry).toEqual({
      'focus-line': '/assets/focus-line.abc123.webp',
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
