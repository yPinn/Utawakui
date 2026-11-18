import { describe, expect, it, vi } from 'vitest';
import {
  clearCutoutDialogue,
  cutoutFramePoints,
  cutoutPhrases,
  planRansomRows,
  renderCutoutDialogue,
} from './cutoutDialogue.mjs';
import { createOutputPreviewSnapshot } from '../../shared/presentation/outputPreviewScene.mjs';
import { selectLyricsOverlayFrame } from '../../shared/presentation/state.mjs';

describe('Cutout Dialogue', () => {
  function ransomLayout(units, capacity) {
    const tokens = units.map(([text, width]) => ({ text, width }));
    const { index, scale } = planRansomRows(tokens, capacity);
    const row = (tokens) =>
      tokens
        .map(({ text }) => text)
        .join('')
        .trim();
    return {
      rows:
        index === null
          ? [row(tokens)]
          : [row(tokens.slice(0, index)), row(tokens.slice(index))],
      scale,
    };
  }

  it('keeps a short mixed-language caption on one row at full size', () => {
    expect(
      ransomLayout(
        [
          ['星', 10],
          ['空', 10],
          [' ', 4],
          ['light', 20],
        ],
        50,
      ),
    ).toEqual({ rows: ['星空 light'], scale: 1 });
  });

  it('uses measured width and keeps a Latin phrase together after the Japanese comma', () => {
    const units = [
      ['ま', 10],
      ['だ', 10],
      ['間', 10],
      ['に', 10],
      ['合', 10],
      ['う', 10],
      ['、', 10],
      [' ', 4],
      ['turn', 15],
      [' ', 4],
      ['it', 6],
      [' ', 4],
      ['up', 8],
      ['，', 10],
      ['今', 10],
      ['晚', 10],
    ];
    expect(ransomLayout(units, 75)).toEqual({
      rows: ['まだ間に合う、', 'turn it up，今晚'],
      scale: 1,
    });
  });

  it('honors an authored newline and keeps opening punctuation with the next glyph', () => {
    expect(
      ransomLayout(
        [
          ['夜', 10],
          ['色', 10],
          ['\n', 4],
          ['「', 10],
          ['Stay', 23],
          ['」', 10],
        ],
        80,
      ),
    ).toEqual({ rows: ['夜色', '「Stay」'], scale: 1 });
  });

  it('falls back to word boundaries for an oversized English phrase', () => {
    expect(
      ransomLayout(
        [
          ['Stay', 23],
          [' ', 4],
          ['with', 20],
          [' ', 4],
          ['me', 14],
          [' ', 4],
          ['tonight', 35],
          [' ', 4],
          ['直', 10],
          ['到', 10],
          ['天', 10],
          ['亮', 10],
        ],
        54,
      ),
    ).toEqual({
      rows: ['Stay with me', 'tonight 直到天亮'],
      scale: 54 / 79,
    });
  });

  function createTestStage() {
    const document = { createElement, createElementNS: createElement };
    function createElement() {
      return {
        ownerDocument: document,
        children: [],
        dataset: {},
        style: {
          setProperty(key, value) {
            this[key] = value;
          },
          removeProperty(key) {
            delete this[key];
          },
        },
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        addEventListener(name, listener) {
          this[`on${name}`] = listener;
        },
        append(node) {
          this.children.push(node);
        },
        replaceChildren() {
          this.children.length = 0;
        },
      };
    }
    return document.createElement();
  }

  it('highlights the current choice and refreshes adjacent lyric rows', () => {
    const stage = createTestStage();
    const snapshot = createOutputPreviewSnapshot();
    const { lines } = snapshot.lyrics;
    snapshot.playback.positionMs = lines[1].startMs + 100;
    snapshot.playback.status = 'paused';
    const frame = selectLyricsOverlayFrame(snapshot, {
      templateId: 'cutout-dialogue',
      nowMs: Date.parse(snapshot.generatedAt),
    });
    const appearance = { cutoutMode: 'choice-stack' };
    const rows = () => stage.children[1].children;
    renderCutoutDialogue(stage, frame, { appearance });
    expect(stage.dataset.corner).toBe('bottom-right');
    expect(rows().map((row) => row.dataset.choice)).toEqual([
      'previous',
      'current',
      'next',
    ]);
    expect(rows().map((row) => row.children[0].textContent)).toEqual([
      lines[0].text,
      lines[1].text,
      lines[2].text,
    ]);
    expect(rows().map((row) => row.attributes['aria-hidden'])).toEqual([
      'true',
      undefined,
      'true',
    ]);
    renderCutoutDialogue(stage, { ...frame, nextText: '' }, { appearance });
    expect(rows()).toHaveLength(2);
    renderCutoutDialogue(stage, frame, {
      appearance: { ...appearance, cutoutCorner: 'top-left' },
    });
    expect(stage.dataset.corner).toBe('top-left');
  });

  it('interleaves sparse accent glyphs and keeps punctuation in the base treatment', () => {
    const stage = createTestStage();
    const frame = {
      visible: true,
      currentText:
        '夜を、越えて。もう一度 Keep singing, don’t stop well-known songs!',
      lineIndex: 0,
    };
    const options = {
      appearance: { cutoutMode: 'ransom' },
      reducedMotion: true,
    };
    const tiles = () =>
      stage.children[0].children.flatMap((word) => word.children);
    renderCutoutDialogue(stage, frame, options);
    expect(tiles().every((tile) => !tile.dataset.ransomAccent)).toBe(true);
    renderCutoutDialogue(stage, frame, {
      ...options,
      appearance: { cutoutMode: 'ransom', cutoutRansomFont: 'kaibunsyo' },
    });
    expect(stage.dataset.ransomFont).toBe('kaibunsyo');
    const accents = tiles().filter((tile) => tile.dataset.ransomAccent);
    expect(accents).toHaveLength(2);
    const words = tiles().filter(
      (tile) => tile.dataset.ransomWord !== undefined,
    );
    expect(words.map((tile) => tile.textContent)).toEqual([
      'Keep',
      'singing',
      'don’t',
      'stop',
      'well-known',
      'songs',
    ]);
    expect(words.every((tile) => !tile.dataset.ransomAccent)).toBe(true);
    const punctuation = tiles().filter(
      (tile) => tile.dataset.ransomPunctuation,
    );
    expect(
      punctuation.map((tile) => [
        tile.textContent,
        tile.dataset.ransomPunctuation,
      ]),
    ).toEqual([
      ['、', 'wide-low'],
      ['。', 'wide-low'],
      [',', 'low'],
      ['!', 'standard'],
    ]);
    expect(
      punctuation.every((tile) => tile.dataset.ransomPaper !== 'color'),
    ).toBe(true);
    expect(
      accents.every((tile) => /[\p{L}\p{N}]/u.test(tile.textContent)),
    ).toBe(true);
    expect(new Set(accents.map((tile) => tile.dataset.ransomAccent))).toEqual(
      new Set(['inverse', 'color']),
    );
  });

  it('keeps each ransom line reproducible and varies all paper treatments between lines', () => {
    const stage = createTestStage();
    const appearance = { cutoutMode: 'ransom', cutoutRansomFont: 'kaitou' };
    const currentText = '同一句歌詞重唱 Keep singing under the city lights';
    const render = (lineIndex) => {
      renderCutoutDialogue(
        stage,
        {
          visible: true,
          currentText,
          lineIndex,
          cutoutDialogue: { trackId: 'track' },
        },
        { appearance, reducedMotion: true },
      );
      return stage.children[0].children.flatMap((word) =>
        word.children.map((tile) => ({
          ...tile.dataset,
          tilt: tile.style['--cutout-ransom-tilt'],
        })),
      );
    };
    const first = render(3);
    const second = render(4);
    for (const property of [
      'ransomPaper',
      'ransomTexture',
      'ransomEdge',
      'ransomMirrored',
      'tilt',
    ]) {
      expect(second.map((tile) => tile[property])).not.toEqual(
        first.map((tile) => tile[property]),
      );
    }
    clearCutoutDialogue(stage);
    expect(render(3)).toEqual(first);
    const redCounts = Array.from(
      { length: 12 },
      (_, lineIndex) =>
        render(lineIndex).filter((tile) => tile.ransomPaper === 'color').length,
    );
    expect(Math.max(...redCounts)).toBe(1);
  });

  it('switches modes on the same live stage and removes stale lyric nodes', () => {
    const stage = createTestStage();
    const frame = {
      visible: true,
      currentText: 'Moonlight',
      lineIndex: 1,
      cutoutDialogue: { artist: 'Demo Artist', previousText: 'Nightfall' },
    };
    const render = (cutoutMode, cutoutChatShape) =>
      renderCutoutDialogue(stage, frame, {
        appearance: { cutoutMode, cutoutChatShape },
        reducedMotion: true,
      });
    render('radial');
    expect(stage.dataset.corner).toBe('top-left');
    expect(stage.children[0].children[0].className).toBe(
      'cutout-dialogue__lane',
    );
    render('ransom');
    expect(stage.dataset.corner).toBe('bottom-right');
    expect(stage.children[0].className).toContain('cutout-dialogue__ransom');
    render('chat', 'stacked');
    expect(stage.dataset.corner).toBe('top-right');
    expect(stage.children[0].children).toHaveLength(2);
    expect(stage.children[0].children[0].children[0].textContent).toBe(
      'Nightfall',
    );
    render('chat', 'thought');
    expect(stage.children[0].children).toHaveLength(1);
    render('side-card');
    expect(stage.dataset.corner).toBe('bottom-left');
    expect(stage.children[0].children[0].children[0].className).toBe(
      'cutout-dialogue__name',
    );
    renderCutoutDialogue(stage, { visible: false });
    expect(stage.hidden).toBe(true);
    expect(stage.children).toHaveLength(0);
  });

  it('keeps phone history inside the screen and renders only the selected card style', () => {
    const stage = createTestStage();
    const frame = {
      visible: true,
      currentText: 'Moonlight',
      cutoutDialogue: { artist: 'Demo Artist', previousText: 'Nightfall' },
    };
    const render = (appearance) =>
      renderCutoutDialogue(stage, frame, { appearance });
    render({
      cutoutMode: 'chat',
      cutoutChatShape: 'phone',
      cutoutCorner: 'bottom-right',
    });
    expect(stage.dataset.corner).toBe('bottom-right');
    const screen = stage.children[0].children[0];
    expect(screen.className).toBe('cutout-dialogue__phone-screen');
    expect(
      screen.children.map(
        (node) => node.children[0]?.textContent ?? node.textContent,
      ),
    ).toEqual(['Demo Artist', 'Nightfall', 'Moonlight']);
    render({ cutoutMode: 'side-card', cutoutCardStyle: 'portrait' });
    const [card, portrait] = stage.children[0].children;
    expect(card.className).toContain('cutout-dialogue__active');
    expect(portrait.className).toBe('cutout-dialogue__portrait');
    expect(portrait.attributes['aria-hidden']).toBe('true');
    const [portraitFrame] = portrait.children;
    expect(portraitFrame.dataset.frame).toBe('portrait');
    expect(
      portraitFrame.children[0].children.map(
        ({ attributes }) => attributes.class,
      ),
    ).toEqual([
      'cutout-dialogue__frame-back',
      'cutout-dialogue__frame-mat',
      'cutout-dialogue__frame-fill',
    ]);
    render({ cutoutMode: 'side-card', cutoutCardStyle: 'text-only' });
    expect(stage.children[0].children).toHaveLength(1);
  });

  it('uses the portrait overrides and falls back to the recorded artist photo', () => {
    const stage = createTestStage();
    const document = stage.ownerDocument;
    const createElement = document.createElement;
    const pixels = new Uint8ClampedArray(32 * 32 * 4).fill(255);
    document.createElement = (tag) => ({
      ...createElement(),
      ...(tag === 'canvas' && {
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: pixels }),
        }),
      }),
    });
    const id = '00000000-0000-4000-8000-000000000001';
    const frame = {
      visible: true,
      currentText: 'Moonlight',
      cutoutDialogue: { artist: 'Aster', trackId: 'track one' },
    };
    const appearance = { cutoutMode: 'side-card', cutoutCardStyle: 'portrait' };
    renderCutoutDialogue(stage, frame, {
      portraitPhotos: true,
      appearance: {
        ...appearance,
        cutoutArtistName: 'Guest',
        cutoutPortraitColor: '#4466aa',
        cutoutPortraitPhoto: id,
      },
    });
    const [card, portrait] = stage.children[0].children;
    expect(card.children[0].attributes['aria-label']).toBe('Guest');
    expect(portrait.style['--cutout-portrait-fill']).toBe('#4466aa');
    const region = portrait.children[1];
    const image = region.children[0];
    expect(image.src).toBe(`/media/cutout-portrait/custom/${id}`);
    for (let x = 0; x < 12; x++) pixels[x * 4 + 3] = 0;
    image.onload();
    expect(region.dataset.silhouette).toBe('');
    expect(region.style['--cutout-portrait-silhouette-clip']).toContain(
      '0 var(--cutout-portrait-silhouette-top)',
    );
    image.onerror();
    expect(image.src).toBe('/media/cutout-portrait/artist/track%20one');
    expect(image.dataset.source).toBe('artist');
    image.onload();
    expect(region.dataset.silhouette).toBeUndefined();

    renderCutoutDialogue(stage, frame, { portraitPhotos: true });
    const [resetCard, resetPortrait] = stage.children[0].children;
    expect(stage.dataset.mode).toBe('side-card');
    expect(resetCard.children[0].attributes['aria-label']).toBe('Aster');
    expect(resetPortrait.children[1].children[0].src).toBe(image.src);
    expect(resetPortrait.style['--cutout-portrait-fill']).toBe(
      'var(--cutout-portrait-tone-amber)',
    );
  });

  it('mixes nameplate fonts by grapheme and keeps the same name stable between lines', () => {
    const stage = createTestStage();
    const artist = '9A\u0301ster・ほし 👩‍🎤';
    const options = {
      appearance: { cutoutMode: 'side-card', cutoutCardStyle: 'portrait' },
    };
    const renderName = (currentText) => {
      renderCutoutDialogue(
        stage,
        { visible: true, currentText, cutoutDialogue: { artist } },
        options,
      );
      const plate = stage.children[0].children[0].children[0];
      return plate.children[0].children.map((glyph) =>
        typeof glyph === 'string'
          ? { text: glyph }
          : { text: glyph.textContent, accent: glyph.className },
      );
    };
    const first = renderName('Moonlight');
    expect(first.map(({ text }) => text).join('')).toBe(artist);
    expect(first).toEqual([
      { text: '9' },
      { text: 'A\u0301', accent: 'cutout-dialogue__name-accent' },
      { text: 'ster・' },
      { text: 'ほ', accent: 'cutout-dialogue__name-accent' },
      { text: 'し 👩‍🎤' },
    ]);
    expect(renderName('Sunrise')).toEqual(first);
  });

  it.each([
    ['まだ間に合う — Sing with me', undefined, 'ja', undefined],
    ['直到天亮，Stay with me', 'zh-TW', 'zh-TW', undefined],
    ['听见这首歌', 'zh-Hans', 'zh-Hans', undefined],
    ['星空', undefined, 'und', undefined],
    ['밤새 함께 노래해', undefined, 'ko', undefined],
    ['Café, déjà vu', 'fr', 'fr', 'latin'],
    ['Sing with me', 'ja', 'ja', 'latin'],
    ['لنغنِّ معًا', 'ar', 'ar', undefined],
  ])(
    'sets the text language and script for %s',
    (currentText, language, lang, script) => {
      const stage = createTestStage();
      renderCutoutDialogue(
        stage,
        { visible: true, currentText, language },
        { appearance: { cutoutMode: 'side-card' } },
      );
      const copy = stage.children[0].children[0].children[0];
      expect(copy.lang).toBe(lang);
      expect(copy.dataset.script).toBe(script);
      expect(copy.textContent).toBe(currentText);
    },
  );

  it.each([
    ['9Lana', 'L'],
    ['張小星', '小'],
    ['林小语', '小'],
    ['モルガナ', 'ル'],
    ['별빛', '빛'],
  ])('uses the base font and one Kaitou accent for %s', (artist, accent) => {
    const stage = createTestStage();
    renderCutoutDialogue(
      stage,
      {
        visible: true,
        currentText: 'Sing with me',
        cutoutDialogue: { artist },
      },
      { appearance: { cutoutMode: 'side-card' } },
    );
    const label = stage.children[0].children[0].children[0].children[0];
    const glyphs = label.children.filter((node) => typeof node !== 'string');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]).toMatchObject({
      className: 'cutout-dialogue__name-accent',
      textContent: accent,
    });
    expect(
      label.children.map((node) => node.textContent ?? node).join(''),
    ).toBe(artist);
  });

  it.each(['آستر', 'آستر Aster'])(
    'keeps the artist name %s together independently of the lyric language',
    (artist) => {
      const stage = createTestStage();
      renderCutoutDialogue(
        stage,
        {
          visible: true,
          currentText: 'Sing with me',
          language: 'en',
          cutoutDialogue: { artist },
        },
        { appearance: { cutoutMode: 'side-card' } },
      );
      const plate = stage.children[0].children[0].children[0];
      expect(plate.dir).toBe('auto');
      expect(plate.children[0].textContent).toBe(artist);
      expect(plate.children[0].children).toHaveLength(0);
    },
  );

  it('passes a complete paragraph to both side-card styles at the selected font size', () => {
    const stage = createTestStage();
    const currentText =
      '星空慢慢安靜下來，\nKeep singing with me until the morning comes.';
    for (const cutoutCardStyle of ['text-only', 'portrait']) {
      renderCutoutDialogue(
        stage,
        { visible: true, currentText },
        { appearance: { cutoutMode: 'side-card', cutoutCardStyle } },
      );
      const copy = stage.children[0].children[0].children[0];
      expect(copy.textContent).toBe(currentText.replace('\n', ' '));
      expect(copy.style['--cutout-copy-scale']).toBeUndefined();
    }
  });

  it('fills the available width before wrapping at complete phrases', () => {
    const stage = createTestStage();
    const document = stage.ownerDocument;
    const createElement = document.createElement;
    let resized;
    document.defaultView = {
      ResizeObserver: class {
        constructor(callback) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    };
    let capacity = 21;
    document.createElement = () => ({
      ...createElement(),
      getBoundingClientRect() {
        const card = stage.children[0].children[0];
        return {
          width: card.style['--cutout-card-width'] ? capacity : 4,
        };
      },
    });
    document.createRange = () => ({
      selectNodeContents(copy) {
        this.copy = copy;
      },
      getBoundingClientRect() {
        return { width: this.copy.textContent.length };
      },
    });
    const currentText =
      '最深的黑夜  是否難以入眠\n輾轉來到　某個起點 又想起了明天';
    renderCutoutDialogue(
      stage,
      { visible: true, currentText },
      {
        appearance: { cutoutMode: 'side-card' },
      },
    );
    const card = stage.children[0].children[0];
    const copy = card.children[0];
    expect(card.style['--cutout-card-width']).toBe(
      'var(--cutout-side-card-max-width)',
    );
    expect(copy.dataset.plannedRows).toBe('');
    expect(copy.textContent).toBe(
      '最深的黑夜 是否難以入眠 輾轉來到\n某個起點 又想起了明天',
    );
    capacity = 40;
    resized();
    expect(card.style['--cutout-card-width']).toBeUndefined();
    expect(copy.dataset.plannedRows).toBe('');
    expect(copy.textContent).toBe(currentText.replace(/\s+/gu, ' '));

    capacity = 16;
    const shortText = 'それじゃまた';
    renderCutoutDialogue(
      stage,
      { visible: true, currentText: shortText, language: 'ja' },
      { appearance: { cutoutMode: 'side-card' } },
    );
    const shortCard = stage.children[0].children[0];
    expect(shortCard.style['--cutout-card-width']).toBeUndefined();
    expect(shortCard.children[0].dataset.plannedRows).toBe('');
    expect(shortCard.children[0].textContent).toBe(shortText);
  });

  it('keeps the nameplate body centered on its text box as the width changes', () => {
    for (const width of [100, 250]) {
      const [[topLeft, topRight, bottomRight, bottomEdge, tip, tail]] =
        cutoutFramePoints('nameplate', width, 30, 10);
      expect(topLeft[0] + bottomRight[0]).toBeCloseTo(width);
      expect(topRight[1]).toBeCloseTo(topLeft[1]);
      expect(bottomEdge[1]).toBeCloseTo(bottomRight[1]);
      expect(topLeft[1] + bottomRight[1]).toBeCloseTo(30);
      expect(tip[1]).toBeGreaterThan(bottomRight[1]);
      expect(tail[0]).toBeLessThan(topLeft[0]);
    }
  });

  it('aligns the nameplate and dialogue tails regardless of their widths', () => {
    const stage = createTestStage();
    renderCutoutDialogue(
      stage,
      {
        visible: true,
        currentText: 'Moonlight',
        cutoutDialogue: { artist: 'Aster' },
      },
      { appearance: { cutoutMode: 'side-card' } },
    );
    const plate = stage.children[0].children[0].children[0];
    const unit = 10;
    const height = 30;
    const [name] = cutoutFramePoints('nameplate', 100, height, unit);
    const [dialogue] = cutoutFramePoints('side-card', 260, 80, unit);
    const originX = parseFloat(plate.style['--cutout-name-tail-x']) * unit;
    const tailBottom = parseFloat(plate.style['--cutout-name-tail-bottom']);
    expect(name[5]).toEqual([originX, height - tailBottom * unit]);
    expect(Math.min(...dialogue.map(([x]) => x))).toBe(originX);
  });

  it('extends the body of the side frame while keeping both end details fixed', () => {
    const [shortFace, shortTab] = cutoutFramePoints('side-card', 160, 52, 8);
    const [longFace, longTab] = cutoutFramePoints('side-card', 460, 86, 8);
    expect(longFace[0]).toEqual(shortFace[0]);
    expect(longFace[3]).toEqual([
      shortFace[3][0],
      expect.closeTo(shortFace[3][1] + 34),
    ]);
    expect(longTab.map(([x, y]) => [x - 300, y])).toEqual(
      shortTab.map(([x, y]) => [expect.closeTo(x), expect.closeTo(y + 34)]),
    );
  });

  it('redraws each radial frame to its own text box on stage resize', () => {
    const stage = createTestStage();
    stage.clientWidth = 800;
    const document = stage.ownerDocument;
    let resize;
    document.defaultView = {
      ResizeObserver: class {
        constructor(callback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    };
    const createElement = document.createElement;
    document.createElement = () => ({
      ...createElement(),
      clientWidth: 100,
      clientHeight: 36,
    });
    renderCutoutDialogue(
      stage,
      { visible: true, currentText: 'Hello! See you!' },
      { appearance: { cutoutMode: 'radial' } },
    );
    const strips = stage.children[0].children.map((lane) => lane.children[0]);
    const svgs = strips.map((strip) => strip.children[1].children[0]);
    expect(svgs).toHaveLength(2);
    expect(svgs[0].attributes.viewBox).toBe('0 0 100 36');
    strips[1].clientWidth = 145;
    resize();
    expect(svgs.map((svg) => svg.attributes.viewBox)).toEqual([
      '0 0 100 36',
      '0 0 145 36',
    ]);
  });

  it.each([
    ['bottom-left', -1],
    ['bottom-right', 1],
  ])(
    'animates the portrait and dialogue together at %s',
    (corner, direction) => {
      const stage = createTestStage();
      const motion = {
        fromTo: vi.fn(),
        to: vi.fn(),
        timeScale: vi.fn().mockReturnThis(),
        pause: vi.fn(),
        duration: () => 0.21,
        kill: vi.fn(),
      };
      const options = {
        appearance: {
          cutoutMode: 'side-card',
          cutoutCardStyle: 'portrait',
          cutoutCorner: corner,
        },
        gsap: { timeline: () => motion },
      };
      renderCutoutDialogue(
        stage,
        {
          visible: true,
          currentText: 'Moonlight',
          cutoutDialogue: {
            artist: 'Aster',
            ageMs: 80,
            lineDurationMs: 2000,
            rate: 1,
            playing: false,
          },
        },
        options,
      );
      const [frame, body, marker, pulse] = motion.fromTo.mock.calls;
      const group = stage.children[0];
      const [card, portrait] = group.children;
      card.offsetWidth = 300;
      card.offsetHeight = 100;
      expect(portrait.className).toBe('cutout-dialogue__portrait');
      expect(frame[0]).toBe(group);
      expect(frame[1]).toMatchObject({ scale: 0.6, rotation: 2 * direction });
      expect(frame[1].x()).toBe(9 * direction);
      expect(frame[1].y()).toBe(5);
      expect(frame[2]).toMatchObject({ scale: 1, duration: 0.1 });
      expect(motion.to).toHaveBeenCalledExactlyOnceWith(
        group,
        { ...frame[1], opacity: 0, duration: 4 / 30, ease: 'power2.in' },
        2 - 4 / 30,
      );
      expect(marker.slice(1)).toEqual([
        { '--cutout-marker-scale': 0 },
        { '--cutout-marker-scale': 1, duration: 2 / 30 },
        8 / 30,
      ]);
      expect(pulse[0]).toBe(marker[0]);
      expect(pulse.slice(1)).toEqual([
        { '--cutout-marker-scale': 1 },
        {
          '--cutout-marker-scale': 0.84,
          duration: 0.42,
          yoyo: true,
          repeat: expect.any(Number),
          ease: 'sine.inOut',
          immediateRender: false,
        },
        10 / 30,
      ]);
      expect(body[0].className).toBe('cutout-dialogue__copy');
      expect(body[3]).toBeGreaterThan(frame[3]);
      expect(motion.pause).toHaveBeenCalledWith(0.08);
      renderCutoutDialogue(stage, { visible: false }, options);
      expect(motion.kill).toHaveBeenCalledOnce();
      expect(stage.hidden).toBe(true);
      expect(stage.children).toHaveLength(0);
    },
  );

  it('bounds radial strips while keeping Latin words and all lyric text', () => {
    const line =
      '月光借我一句話，Turn it up，跨過長夜，看見遠方，再走一步，再唱一遍，不必等待';
    const phrases = cutoutPhrases(line);
    expect(phrases).toHaveLength(6);
    expect(phrases).toContain('Turn it');
    expect(phrases.join('').replace(/\s/gu, '')).toBe(line.replace(/\s/gu, ''));
  });

  it('projects the current lyric, previous lyric and the source clock from the seek position', () => {
    const snapshot = createOutputPreviewSnapshot();
    const line = snapshot.lyrics.lines[1];
    line.endMs = line.startMs + 1800;
    snapshot.playback.positionMs = line.startMs + 220;
    snapshot.playback.status = 'paused';
    const options = {
      templateId: 'cutout-dialogue',
      nowMs: Date.parse(snapshot.generatedAt),
    };
    expect(selectLyricsOverlayFrame(snapshot, options)).toMatchObject({
      currentText: line.text,
      cutoutDialogue: {
        previousText: snapshot.lyrics.lines[0].text,
        artist: snapshot.playback.track.artist,
        ageMs: 220,
        lineDurationMs: 1800,
        playing: false,
      },
    });
  });
});
