import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_FRAMES,
  mangaFrameLengthTier,
} from '../shared/mangaFrameContract.mjs';
import {
  applyMangaFramePresentation,
  renderMangaFrameSvg,
} from './mangaFrame.mjs';

function svgNode(ownerDocument = null) {
  return {
    ownerDocument,
    attributes: {},
    children: [],
    dataset: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function svgFixture() {
  const documentApi = {
    createElementNS: vi.fn((_namespace, tag) => {
      const shape = svgNode(documentApi);
      shape.tag = tag;
      return shape;
    }),
  };
  return svgNode(documentApi);
}

describe('manga frame contract', () => {
  it('keeps the real template vertical and loads GSAP before the module runtime', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');

    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('text-orientation: upright');
    expect(css).toContain('will-change: opacity, transform');
    expect(html).toContain('id="lyrics-manga-frame"');
    expect(html.indexOf('/overlay/vendor/gsap.min.js')).toBeLessThan(
      html.indexOf('/overlay/lyrics/lyrics.mjs'),
    );
  });

  it('keeps the real template vertical and loads GSAP before the module runtime', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');

    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('text-orientation: upright');
    expect(css).toContain('will-change: opacity, transform');
    expect(html).toContain('id="lyrics-manga-frame"');
    expect(html.indexOf('/overlay/vendor/gsap.min.js')).toBeLessThan(
      html.indexOf('/overlay/lyrics/lyrics.mjs'),
    );
  });

  it('keeps the real template vertical and loads GSAP before the module runtime', () => {
    const directory = path.dirname(new URL(import.meta.url).pathname.slice(1));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');

    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('text-orientation: upright');
    expect(css).toContain('will-change: opacity, transform');
    expect(html).toContain('id="lyrics-manga-frame"');
    expect(html.indexOf('/overlay/vendor/gsap.min.js')).toBeLessThan(
      html.indexOf('/overlay/lyrics/lyrics.mjs'),
    );
  });

  it('registers the bounded scenario set without assigning song sections', () => {
    expect(MANGA_FRAMES.map((frame) => frame.id)).toEqual([
      'spoken',
      'shout',
      'whisper',
      'thought',
      'narration',
      'mechanical',
      'frameless',
    ]);
    expect(MANGA_FRAMES.every((frame) => !('musicSection' in frame))).toBe(
      true,
    );
  });

  it('renders every frame from trusted SVG elements and falls back to spoken', () => {
    const svg = svgFixture();

    for (const frame of MANGA_FRAMES) {
      const rendered = renderMangaFrameSvg(svg, frame.id);
      expect(rendered.id).toBe(frame.id);
      expect(svg.dataset.frameId).toBe(frame.id);
      expect(svg.children).toHaveLength(frame.elements.length);
      expect(
        svg.children.every(
          (shape) =>
            shape.attributes.class === 'lyrics-overlay__manga-frame-shape',
        ),
      ).toBe(true);
    }

    expect(renderMangaFrameSvg(svg, 'not-registered').id).toBe(
      DEFAULT_MANGA_FRAME_ID,
    );
    expect(svg.dataset.frameId).toBe(DEFAULT_MANGA_FRAME_ID);

    const calls = svg.ownerDocument.createElementNS.mock.calls.length;
    renderMangaFrameSvg(svg, DEFAULT_MANGA_FRAME_ID);
    expect(svg.ownerDocument.createElementNS).toHaveBeenCalledTimes(calls);
  });

  it('projects an explicit frame and bounded length tier without inferring emotion', () => {
    const elements = {
      mangaFrame: svgFixture(),
      root: { dataset: {} },
    };

    const frame = applyMangaFramePresentation(
      elements,
      { currentText: 'これは少し長い縦書きの歌詞です' },
      { mangaFrameId: 'whisper' },
    );

    expect(frame.id).toBe('whisper');
    expect(elements.root.dataset).toEqual({
      mangaFrame: 'whisper',
      mangaLength: 'medium',
    });
    expect(mangaFrameLengthTier('短い歌詞')).toBe('short');
    expect(mangaFrameLengthTier('長'.repeat(25))).toBe('long');
  });
});
