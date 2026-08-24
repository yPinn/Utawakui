import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_FRAMES,
  mangaFrameLengthTier,
  mangaFramePlacementForBubble,
  mangaFrameSideForLine,
  mangaFrameTextFitEm,
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
    expect(html).toContain('id="lyrics-manga-bubbles"');
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

  it('projects an explicit frame, occasional side variant, and bounded size tier', () => {
    const elements = {
      mangaFrame: svgFixture(),
      root: { dataset: {} },
    };

    const frame = applyMangaFramePresentation(
      elements,
      { currentText: 'これは少し長い縦書きの歌詞です', lineIndex: 3 },
      { mangaFrameId: 'whisper' },
    );

    expect(frame.id).toBe('whisper');
    expect(elements.root.dataset).toEqual({
      mangaFrame: 'whisper',
      mangaLength: 'medium',
      mangaSide: 'left',
    });
    expect(mangaFrameLengthTier('短い歌詞')).toBe('short');
    expect(mangaFrameLengthTier('短 い 歌 詞')).toBe('short');
    expect(mangaFrameLengthTier('長'.repeat(25))).toBe('long');
    expect(mangaFrameSideForLine(0)).toBe('right');
    expect(mangaFrameSideForLine(1)).toBe('right');
    expect(mangaFrameSideForLine(2)).toBe('right');
    expect(mangaFrameSideForLine(3)).toBe('left');
    expect(mangaFrameSideForLine(undefined)).toBe('right');
  });

  it('maps one-to-three bubbles to stable right-to-left reading bands', () => {
    const one = mangaFramePlacementForBubble({
      bubbleCount: 1,
      bubbleIndex: 0,
      lineIndex: 12,
      text: '一人で歌う',
    });
    const two = [0, 1].map((bubbleIndex) =>
      mangaFramePlacementForBubble({
        bubbleCount: 2,
        bubbleIndex,
        lineIndex: 12,
        text: ['先に読む', '次に読む'][bubbleIndex],
      }),
    );
    const three = [0, 1, 2].map((bubbleIndex) =>
      mangaFramePlacementForBubble({
        bubbleCount: 3,
        bubbleIndex,
        lineIndex: 12,
        text: ['一', '二', '三'][bubbleIndex],
      }),
    );

    const singleSides = Array.from(
      { length: 8 },
      (_, lineIndex) =>
        mangaFramePlacementForBubble({
          bubbleCount: 1,
          bubbleIndex: 0,
          lineIndex,
          text: '一人で歌う',
        }).side,
    );
    expect(singleSides).toEqual([
      'right',
      'right',
      'right',
      'left',
      'right',
      'right',
      'right',
      'left',
    ]);
    expect(one.anchorYPercent).toBeGreaterThanOrEqual(46);
    expect(one.anchorYPercent).toBeLessThanOrEqual(54);
    expect(two.map(({ side }) => side)).toEqual(['right', 'left']);
    expect(two[0].anchorYPercent).toBeLessThan(two[1].anchorYPercent);
    expect(two[1].anchorYPercent - two[0].anchorYPercent).toBeLessThanOrEqual(
      12,
    );
    expect(three.map(({ side }) => side)).toEqual(['right', 'left', 'right']);
    expect(three.map(({ anchorYPercent }) => anchorYPercent)).toEqual(
      [...three]
        .map(({ anchorYPercent }) => anchorYPercent)
        .sort((a, b) => a - b),
    );
    expect(
      three[2].anchorYPercent - three[0].anchorYPercent,
    ).toBeGreaterThanOrEqual(32);
  });

  it('keeps bounded placement deterministic across seek and reconnect renders', () => {
    const input = {
      bubbleCount: 2,
      bubbleIndex: 1,
      lineIndex: 31,
      text: '同じ歌詞',
    };
    const first = mangaFramePlacementForBubble(input);
    const repeated = mangaFramePlacementForBubble(input);
    const nextLine = mangaFramePlacementForBubble({ ...input, lineIndex: 32 });

    expect(repeated).toEqual(first);
    expect(first.anchorYPercent).toBeGreaterThanOrEqual(53);
    expect(first.anchorYPercent).toBeLessThanOrEqual(55);
    expect(first.inlineJitterRem).toBeGreaterThanOrEqual(0);
    expect(first.inlineJitterRem).toBeLessThanOrEqual(1);
    expect(nextLine).not.toEqual(first);
  });

  it('positions each bubble independently and mirrors only right-side frame SVGs', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toContain(
      ".lyrics-overlay__manga-bubble[data-manga-side='left']",
    );
    expect(css).toContain(
      ".lyrics-overlay__manga-bubble[data-manga-side='right']",
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-bubble\s*{[^}]*position: absolute;[^}]*inset-block-start: var\(--ovl-manga-anchor-y\);/s,
    );
    expect(css).toContain('--ovl-manga-lane-inline-size');
    expect(css).toContain('--ovl-manga-stage-edge: 66.667vw');
    expect(css).toMatch(
      /\.lyrics-overlay__manga-bubble\[data-manga-side='right'\][^{]*\s+\.lyrics-overlay__manga-frame\s*{[^}]*transform: scaleX\(-1\);/s,
    );
    expect(css).not.toMatch(
      /\.lyrics-overlay__manga-bubble\[data-manga-side='right'\]\s*{[^}]*transform: scaleX\(-1\)/s,
    );
  });

  it('fits every Manga bubble to its phrase length before applying the row cap', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toContain(
      '--ovl-manga-bubble-content-block-size: min(36vh, 24rem)',
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-bubble\[data-manga-length='medium'\][^{]*{[^}]*--ovl-manga-bubble-content-block-size: min\(46vh, 31rem\)/s,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-bubble\[data-manga-length='long'\][^{]*{[^}]*--ovl-manga-bubble-content-block-size: min\(55\.556vh, 37\.5rem\)/s,
    );
    expect(css).toContain(
      'var(--ovl-manga-bubble-content-block-size),\n      var(--ovl-manga-bubble-row-cap)',
    );
    expect(css).toContain('--ovl-manga-bubble-row-cap: min(38vh, 25rem)');
    expect(css).toContain('--ovl-manga-bubble-row-cap: min(27vh, 18rem)');
  });

  it('reduces vertical text size when a long phrase shares a three-bubble lane', () => {
    expect(mangaFrameTextFitEm('短い歌詞', 1)).toBe(2.9);
    expect(mangaFrameTextFitEm('中'.repeat(18), 1)).toBe(2.55);
    expect(mangaFrameTextFitEm('長'.repeat(25), 1)).toBe(2.15);

    const twentyFiveGlyphs = mangaFrameTextFitEm('長'.repeat(25), 3);
    const fiftyGlyphs = mangaFrameTextFitEm('長'.repeat(50), 3);
    expect(twentyFiveGlyphs).toBeLessThan(1.9);
    expect(fiftyGlyphs).toBeLessThan(twentyFiveGlyphs);
    expect(mangaFrameTextFitEm('長 '.repeat(18), 3)).toBeLessThan(
      mangaFrameTextFitEm('長'.repeat(18), 3),
    );
    expect(mangaFrameTextFitEm(`長${' '.repeat(4)}長`, 3)).toBe(
      mangaFrameTextFitEm('長 長', 3),
    );
  });

  it('centers the content-fit vertical column group inside its bubble', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toMatch(
      /\.lyrics-overlay__manga-text\s*{[^}]*inline-size: 66%;[^}]*block-size: fit-content;[^}]*max-block-size: 66%;[^}]*display: block;[^}]*place-self: center;[^}]*text-align: center;[^}]*writing-mode: vertical-rl;/s,
    );
  });
});
