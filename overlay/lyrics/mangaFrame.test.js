import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_FRAMES,
  mangaFrameLengthTier,
  mangaFramePlacementForBubble,
  mangaFrameRequiredBlockSizeEm,
  mangaFrameSideForLine,
  mangaFrameTextLayout,
  mangaFrameTextScript,
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
    expect(css).toContain('text-orientation: mixed');
    expect(css).toMatch(
      /\.lyrics-overlay__manga-text\s*{[^}]*text-orientation: mixed/s,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-text rt\s*{[^}]*text-align: center;[^}]*text-orientation: upright/s,
    );
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

  it('sizes every Manga frame from its fixed type measure before applying the placement cap', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toContain(
      '--ovl-manga-bubble-base-block-size: min(36vh, 24rem)',
    );
    expect(css).toContain('var(--ovl-manga-frame-required-block-size)');
    expect(css).toContain('--ovl-manga-bubble-row-cap: min(55.556vh, 37.5rem)');
    expect(css).toContain('--ovl-manga-bubble-row-cap: min(55vh, 37rem)');
    expect(css).toContain('--ovl-manga-bubble-row-cap: min(30vh, 20rem)');
  });

  it('grows the frame instead of resizing the fixed Manga type', () => {
    expect(mangaFrameRequiredBlockSizeEm()).toBe(1.61);
    expect(mangaFrameRequiredBlockSizeEm('   ')).toBe(1.61);
    expect(mangaFrameRequiredBlockSizeEm('短い歌詞')).toBe(6.44);
    expect(mangaFrameRequiredBlockSizeEm('長'.repeat(8))).toBe(12.89);
    expect(mangaFrameRequiredBlockSizeEm(`長${' '.repeat(4)}長`)).toBe(
      mangaFrameRequiredBlockSizeEm('長 長'),
    );

    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');
    expect(css).toContain('--ovl-manga-text-size-by-count: 2.9em');
    expect(css).not.toContain('--ovl-manga-text-fit-size');
    expect(css).not.toContain('--ovl-manga-text-size-by-length');
  });

  it('uses a fixed script class and sideways-run measure for pure Latin copy', () => {
    expect(mangaFrameTextScript('STAND-ALONE')).toBe('latin');
    expect(mangaFrameTextScript('地下鉄')).toBe('cjk');
    expect(mangaFrameTextScript('愛 LOVE')).toBe('mixed');
    expect(mangaFrameTextScript('123')).toBe('other');
    expect(mangaFrameRequiredBlockSizeEm('STAND-ALONE')).toBe(7.73);
    expect(mangaFrameRequiredBlockSizeEm('STAND-ALONE')).toBeLessThan(
      mangaFrameRequiredBlockSizeEm('長'.repeat(11)),
    );
  });

  it('uses forward five-unit columns before choosing the Manga frame height', () => {
    const tenGlyphs = mangaFrameTextLayout('長'.repeat(10), 1, {
      language: 'ja',
    });
    const twelveGlyphs = mangaFrameTextLayout('長'.repeat(12), 3, {
      language: 'ja',
    });

    expect(
      tenGlyphs.columns.map((column) => Array.from(column).length),
    ).toEqual([5, 5]);
    expect(tenGlyphs.displayText).toBe(`${'長'.repeat(5)}\n${'長'.repeat(5)}`);
    expect(tenGlyphs.requiredBlockSizeEm).toBe(8.06);
    expect(
      twelveGlyphs.columns.map((column) => Array.from(column).length),
    ).toEqual([5, 5, 2]);
    expect(twelveGlyphs.requiredBlockSizeEm).toBe(8.06);
  });

  it('fills Japanese columns forward to five visual units instead of rebalancing them', () => {
    const layout = mangaFrameTextLayout('その勘違い最高', 3, {
      language: 'ja',
    });

    expect(layout.columns).toEqual(['その勘違い', '最高']);
    expect(layout.displayText).toBe('その勘違い\n最高');
  });

  it('keeps compact punctuation with its phrase and prefers authored punctuation boundaries', () => {
    expect(mangaFrameTextLayout('え、ほんと？', 3).columns).toEqual([
      'え、ほんと？',
    ]);
    expect(mangaFrameTextLayout('今日は、最高！', 1).columns).toEqual([
      '今日は、',
      '最高！',
    ]);
    expect(mangaFrameTextLayout('夢だ。まだ行く', 1).columns).toEqual([
      '夢だ。',
      'まだ行く',
    ]);
    expect(mangaFrameTextLayout('「本当？」まだ行く', 1).columns).toEqual([
      '「本当？」',
      'まだ行く',
    ]);
    expect(mangaFrameTextLayout('“本当？”まだ行く', 1).columns).toEqual([
      '“本当？”',
      'まだ行く',
    ]);
    expect(mangaFrameTextLayout('(本当?)まだ行く', 1).columns).toEqual([
      '(本当?)',
      'まだ行く',
    ]);
    expect(mangaFrameTextLayout('待って……まだ', 1).columns).toEqual([
      '待って……',
      'まだ',
    ]);
  });

  it('uses matched Japanese quotes as phrase boundaries for adjacent long clauses', () => {
    expect(
      mangaFrameTextLayout('「アンタちょっと問題がある」「次だよ」', 1, {
        language: 'ja',
      }).columns,
    ).toEqual(['「アンタち', 'ょっと問題', 'がある」', '「次だよ」']);
  });

  it('separates surrounding copy from matched Japanese and curly quotes', () => {
    expect(
      mangaFrameTextLayout('前置き「本当だ」後ろ', 1, {
        language: 'ja',
      }).columns,
    ).toEqual(['前置き', '「本当だ」', '後ろ']);
    expect(
      mangaFrameTextLayout('前置き“本当だ”後ろ', 1, {
        language: 'ja',
      }).columns,
    ).toEqual(['前置き', '“本当だ”', '後ろ']);
  });

  it('keeps sentence punctuation after a matched closing quote', () => {
    expect(
      mangaFrameTextLayout('「本当だ」。次', 1, { language: 'ja' }).columns,
    ).toEqual(['「本当だ」。', '次']);
    expect(
      mangaFrameTextLayout('“本当だ”！次', 1, { language: 'ja' }).columns,
    ).toEqual(['“本当だ”！', '次']);
  });

  it('hangs closing quotes and sentence punctuation from a full Japanese column', () => {
    expect(
      mangaFrameTextLayout('「本当です」', 1, { language: 'ja' }).columns,
    ).toEqual(['「本当です」']);
    expect(
      mangaFrameTextLayout('本当に最高。次', 1, { language: 'ja' }).columns,
    ).toEqual(['本当に最高。', '次']);
    expect(
      mangaFrameTextLayout('「本当です」。次', 1, { language: 'ja' }).columns,
    ).toEqual(['「本当です」。', '次']);
  });

  it('keeps nested quotes inside one top-level quoted phrase', () => {
    const layout = mangaFrameTextLayout('「彼は『本当』と言った」次', 1, {
      language: 'ja',
    });

    expect(layout.columns.join('')).toBe('「彼は『本当』と言った」次');
    expect(layout.columns.at(-1)).toBe('次');
    expect(layout.columns.slice(0, -1).at(-1).endsWith('」')).toBe(true);
  });

  it('falls back to sentence punctuation when an opening quote is unmatched', () => {
    expect(
      mangaFrameTextLayout('「夢だ。まだ行く', 1, { language: 'ja' }).columns,
    ).toEqual(['「夢だ。', 'まだ行く']);
  });

  it('keeps ruby groups atomic inside a matched quoted phrase', () => {
    const layout = mangaFrameTextLayout('「地下鉄最高」次', 1, {
      language: 'ja',
      sourceRanges: [{ start: 0, end: 8 }],
      readingLine: {
        text: '「地下鉄最高」次',
        segments: [
          { text: '「' },
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: '最高', reading: 'さいこう' },
          { text: '」次' },
        ],
      },
    });

    expect(layout.columns).toEqual(['「地下鉄', '最高」', '次']);
    expect(layout.columnTokens.flat()).toEqual(
      expect.arrayContaining([
        { text: '地下鉄', reading: 'ちかてつ' },
        { text: '最高', reading: 'さいこう' },
      ]),
    );
  });

  it('treats explicit newlines as phrase boundaries while wrapping each phrase independently', () => {
    expect(
      mangaFrameTextLayout(`${'長'.repeat(6)}\n短い`, 1, {
        language: 'ja',
      }).columns,
    ).toEqual(['長'.repeat(5), '長', '短い']);
  });

  it('keeps non-Japanese CJK copy on its established balanced layout', () => {
    const layout = mangaFrameTextLayout('漫画保持穩定', 1, {
      language: 'zh-Hant',
    });

    expect(layout.columns).toEqual(['漫画保持穩定']);
    expect(layout.language).toBe('other');
  });

  it('marks Japanese typography from language, kana content, or an existing reading', () => {
    const readingLine = {
      text: '地下鉄',
      segments: [{ text: '地下鉄', reading: 'ちかてつ' }],
    };

    expect(mangaFrameTextLayout('地下鉄', 1, { language: 'ja' }).language).toBe(
      'ja',
    );
    expect(mangaFrameTextLayout('これは歌', 1).language).toBe('ja');
    expect(
      mangaFrameTextLayout('地下鉄', 1, { language: 'und', readingLine })
        .language,
    ).toBe('ja');
  });

  it('keeps ruby groups atomic even when the five-unit boundary crosses a group', () => {
    const layout = mangaFrameTextLayout('これは地下鉄最高', 1, {
      sourceRanges: [{ start: 0, end: 8 }],
      readingLine: {
        text: 'これは地下鉄最高',
        segments: [
          { text: 'これは' },
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: '最高', reading: 'さいこう' },
        ],
      },
    });

    expect(layout.columns).toEqual(['これは', '地下鉄最高']);
    expect(layout.columnTokens[1]).toEqual([
      { text: '地下鉄', reading: 'ちかてつ' },
      { text: '最高', reading: 'さいこう' },
    ]);
  });

  it('keeps pure-kanji Japanese columns stable when ruby display is disabled', () => {
    const options = {
      language: 'und',
      sourceRanges: [{ start: 0, end: 7 }],
      readingLine: {
        text: '地下鉄最高品質',
        segments: [
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: '最高', reading: 'さいこう' },
          { text: '品質', reading: 'ひんしつ' },
        ],
      },
    };
    const ruby = mangaFrameTextLayout('地下鉄最高品質', 1, options);
    const plain = mangaFrameTextLayout('地下鉄最高品質', 1, {
      ...options,
      includeRuby: false,
    });

    expect(plain.columns).toEqual(ruby.columns);
    expect(plain.hasRuby).toBe(false);
    expect(ruby.hasRuby).toBe(true);
  });

  it('preserves ruby tokens across explicit Japanese line breaks', () => {
    const layout = mangaFrameTextLayout('地下鉄\n最高', 1, {
      language: 'ja',
      sourceRanges: [{ start: 0, end: 6 }],
      readingLine: {
        text: '地下鉄\n最高',
        segments: [
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: '\n' },
          { text: '最高', reading: 'さいこう' },
        ],
      },
    });

    expect(layout.columns).toEqual(['地下鉄', '最高']);
    expect(layout.columnTokens).toEqual([
      [{ text: '地下鉄', reading: 'ちかてつ' }],
      [{ text: '最高', reading: 'さいこう' }],
    ]);
    expect(layout.hasRuby).toBe(true);
  });

  it('keeps ruby groups atomic and reserves an annotation lane without resizing type', () => {
    const plain = mangaFrameTextLayout('地下鉄に飲み込まれる', 1);
    const ruby = mangaFrameTextLayout('地下鉄に飲み込まれる', 1, {
      sourceRanges: [{ start: 0, end: 10 }],
      readingLine: {
        text: '地下鉄に飲み込まれる',
        segments: [
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: 'に' },
          { text: '飲み込まれる', reading: 'のみこまれる' },
        ],
      },
    });

    expect(ruby.columnTokens.flat()).toEqual(
      expect.arrayContaining([
        { text: '地下鉄', reading: 'ちかてつ' },
        { text: '飲み込まれる', reading: 'のみこまれる' },
      ]),
    );
    expect(ruby.hasRuby).toBe(true);
    expect(ruby.requiredBlockSizeEm).toBeGreaterThan(plain.requiredBlockSizeEm);
  });

  it('keeps Japanese columns at the five-glyph cap and permits a short ending', () => {
    for (const bubbleCount of [1, 2, 3]) {
      for (let glyphCount = 1; glyphCount <= 30; glyphCount += 1) {
        const lengths = mangaFrameTextLayout(
          '長'.repeat(glyphCount),
          bubbleCount,
          { language: 'ja' },
        ).columns.map((column) => Array.from(column).length);
        expect(lengths.every((length) => length <= 5)).toBe(true);
        expect(lengths.slice(0, -1).every((length) => length === 5)).toBe(true);
      }
    }
  });

  it('keeps count and script sizing fixed while containing the visible text box', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toMatch(
      /data-manga-count='2'[^}]*--ovl-manga-text-size-by-count: 2\.35em/s,
    );
    expect(css).toMatch(
      /data-manga-count='3'[^}]*--ovl-manga-text-size-by-count: 1\.9em/s,
    );
    expect(css).toMatch(
      /data-manga-script='latin'[^}]*\.lyrics-overlay__manga-text[^}]*font-size: 0\.82em/s,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__manga-text\s*{[^}]*min-inline-size: 0;[^}]*max-inline-size: 72%;[^}]*min-block-size: 0;[^}]*max-block-size: 72%;[^}]*overflow: hidden;/s,
    );
  });

  it('centers the text block while start-aligning and balancing wrapped columns', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toMatch(
      /\.lyrics-overlay__manga-text\s*{[^}]*inline-size: max-content;[^}]*max-inline-size: 72%;[^}]*block-size: fit-content;[^}]*max-block-size: 72%;[^}]*display: block;[^}]*place-self: center;[^}]*text-align: start;[^}]*text-orientation: mixed;[^}]*text-wrap: balance;[^}]*writing-mode: vertical-rl;/s,
    );
  });
});
