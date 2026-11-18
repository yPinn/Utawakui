import { describe, expect, it } from 'vitest';
import gsap from 'gsap';
import {
  clearPhantomThieves,
  insetPolygon,
  PHANTOM_SIDE_CARD_POSES,
  phantomFramePoints,
  phantomPhrases,
  planRansomRows,
  renderPhantomThieves,
} from './phantomThieves.mjs';
import { createOutputPreviewSnapshot } from '../../shared/presentation/outputPreviewScene.mjs';
import { selectLyricsOverlayFrame } from '../../shared/presentation/state.mjs';

describe('Phantom Thieves', () => {
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

  // GSAP tweens the fake nodes as plain objects, so seed animated fields.
  function createMotionStage() {
    const stage = createTestStage();
    const { createElement } = stage.ownerDocument;
    stage.ownerDocument.createElement = stage.ownerDocument.createElementNS =
      () =>
        Object.assign(createElement(), {
          scale: 1,
          rotation: 0,
          opacity: 1,
          '--phantom-side-card-fill-ramp': 1,
          '--phantom-marker-scale': 1,
        });
    return stage;
  }

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
      templateId: 'phantom-thieves',
      nowMs: Date.parse(snapshot.generatedAt),
    });
    const appearance = { phantomMode: 'choice-stack' };
    const rows = () => stage.children[0].children;
    renderPhantomThieves(stage, frame, { appearance });
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
    expect(rows().map((row) => row.children[1].dataset.frame)).toEqual([
      'choice',
      'choice',
      'choice',
    ]);
    renderPhantomThieves(stage, { ...frame, nextText: '' }, { appearance });
    expect(rows()).toHaveLength(2);
    renderPhantomThieves(stage, frame, {
      appearance: { ...appearance, phantomCorner: 'top-left' },
    });
    expect(stage.dataset.corner).toBe('top-left');
  });

  it('uses folded paper strips while keeping the ends fixed as each lyric widens', () => {
    const height = 36;
    const [previous, tab] = phantomFramePoints('choice', 160, height, 10, {
      choice: 'previous',
    });
    const [wide, wideTab] = phantomFramePoints('choice', 260, height, 10, {
      choice: 'previous',
    });
    const [current, currentTab] = phantomFramePoints(
      'choice',
      160,
      height,
      10,
      { choice: 'current' },
    );
    const [next] = phantomFramePoints('choice', 160, height, 10, {
      choice: 'next',
    });

    expect(previous[0][1]).toBeGreaterThan(previous[1][1]);
    expect(previous[2][0]).toBeLessThan(previous[1][0]);
    expect(previous[2][1]).toBe(previous[3][1]);
    expect(previous[1][0]).toBeGreaterThan(160);
    expect(previous[1][1]).toBeLessThan(0);
    expect(previous[2][1]).toBeGreaterThan(height);
    expect(Math.min(...previous.map(([, y]) => y))).toBeLessThan(
      previous[1][1],
    );
    expect(Math.max(...next.map(([, y]) => y))).toBeGreaterThan(height);
    expect(wide.slice(3)).toEqual(previous.slice(3));
    expect(wide[1][0] - previous[1][0]).toBeCloseTo(100);
    expect(wideTab[2][0] - tab[2][0]).toBeCloseTo(100);
    expect(tab[2][0]).toBeGreaterThan(160);
    expect(current).toEqual(previous);
    expect(currentTab).toEqual([]);
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
      appearance: { phantomMode: 'ransom' },
      reducedMotion: true,
    };
    const tiles = () =>
      stage.children[0].children.flatMap((word) => word.children);
    renderPhantomThieves(stage, frame, options);
    expect(tiles().every((tile) => !tile.dataset.ransomAccent)).toBe(true);
    renderPhantomThieves(stage, frame, {
      ...options,
      appearance: { phantomMode: 'ransom', phantomRansomFont: 'kaibunsyo' },
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
    const appearance = { phantomMode: 'ransom', phantomRansomFont: 'kaitou' };
    const currentText = '同一句歌詞重唱 Keep singing under the city lights';
    const render = (lineIndex) => {
      renderPhantomThieves(
        stage,
        {
          visible: true,
          currentText,
          lineIndex,
          phantomThieves: { trackId: 'track' },
        },
        { appearance, reducedMotion: true },
      );
      return stage.children[0].children.flatMap((word) =>
        word.children.map((tile) => ({
          ...tile.dataset,
          tilt: tile.style['--phantom-ransom-tilt'],
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
    clearPhantomThieves(stage);
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
      phantomThieves: { artist: 'Demo Artist', previousText: 'Nightfall' },
    };
    const render = (phantomMode, phantomChatShape) =>
      renderPhantomThieves(stage, frame, {
        appearance: { phantomMode, phantomChatShape },
        reducedMotion: true,
      });
    render('radial');
    expect(stage.dataset.corner).toBe('top-left');
    expect(stage.children[0].children[0].className).toBe(
      'phantom-thieves__lane',
    );
    render('ransom');
    expect(stage.dataset.corner).toBe('bottom-right');
    expect(stage.children[0].className).toContain('phantom-thieves__ransom');
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
      'phantom-thieves__name',
    );
    renderPhantomThieves(stage, { visible: false });
    expect(stage.hidden).toBe(true);
    expect(stage.children).toHaveLength(0);
  });

  it('keeps phone history inside the screen and renders only the selected card style', () => {
    const stage = createTestStage();
    const frame = {
      visible: true,
      currentText: 'Moonlight',
      phantomThieves: { artist: 'Demo Artist', previousText: 'Nightfall' },
    };
    const render = (appearance) =>
      renderPhantomThieves(stage, frame, { appearance });
    render({
      phantomMode: 'chat',
      phantomChatShape: 'phone',
      phantomCorner: 'bottom-right',
    });
    expect(stage.dataset.corner).toBe('bottom-right');
    const screen = stage.children[0].children[0];
    expect(screen.className).toBe('phantom-thieves__phone-screen');
    expect(
      screen.children.map(
        (node) => node.children[0]?.textContent ?? node.textContent,
      ),
    ).toEqual(['Demo Artist', 'Nightfall', 'Moonlight']);
    render({ phantomMode: 'side-card', phantomCardStyle: 'portrait' });
    const [card, portrait] = stage.children[0].children;
    expect(card.className).toContain('phantom-thieves__active');
    expect(portrait.className).toBe('phantom-thieves__portrait');
    expect(portrait.attributes['aria-hidden']).toBe('true');
    const [portraitFrame] = portrait.children;
    expect(portraitFrame.dataset.frame).toBe('portrait');
    expect(
      portraitFrame.children[0].children.map(
        ({ attributes }) => attributes.class,
      ),
    ).toEqual([
      'phantom-thieves__frame-back',
      'phantom-thieves__frame-mat',
      'phantom-thieves__frame-fill',
    ]);
    render({ phantomMode: 'side-card', phantomCardStyle: 'text-only' });
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
      phantomThieves: { artist: 'Aster', trackId: 'track one' },
    };
    const appearance = {
      phantomMode: 'side-card',
      phantomCardStyle: 'portrait',
    };
    renderPhantomThieves(stage, frame, {
      portraitPhotos: true,
      appearance: {
        ...appearance,
        phantomArtistName: 'Guest',
        phantomPortraitColor: '#4466aa',
        phantomPortraitPhoto: id,
      },
    });
    const [card, portrait] = stage.children[0].children;
    expect(card.children[0].attributes['aria-label']).toBe('Guest');
    expect(portrait.style['--phantom-portrait-fill']).toBe('#4466aa');
    const region = portrait.children[1];
    const image = region.children[0];
    expect(image.src).toBe(`/media/phantom-portrait/custom/${id}`);
    for (let x = 0; x < 12; x++) pixels[x * 4 + 3] = 0;
    image.onload();
    expect(region.dataset.silhouette).toBe('');
    expect(region.style['--phantom-portrait-silhouette-clip']).toContain(
      '0 var(--phantom-portrait-silhouette-top)',
    );
    image.onerror();
    expect(image.src).toBe('/media/phantom-portrait/artist/track%20one');
    expect(image.dataset.source).toBe('artist');
    image.onload();
    expect(region.dataset.silhouette).toBeUndefined();

    renderPhantomThieves(stage, frame, { portraitPhotos: true });
    const [resetCard, resetPortrait] = stage.children[0].children;
    expect(stage.dataset.mode).toBe('side-card');
    expect(resetCard.children[0].attributes['aria-label']).toBe('Aster');
    expect(resetPortrait.children[1].children[0].src).toBe(image.src);
    expect(resetPortrait.style['--phantom-portrait-fill']).toBe(
      'var(--phantom-portrait-tone-amber)',
    );
  });

  it('keeps the current lyric and portrait mounted and uses the latest selection for the next line', () => {
    const stage = createTestStage();
    const render = (name, color, photo, lineIndex, playing) =>
      renderPhantomThieves(
        stage,
        {
          visible: true,
          // Repeated lyrics still belong to distinct lines.
          currentText: 'Moonlight',
          lineIndex,
          phantomThieves: { trackId: 'track', documentId: 'lyrics', playing },
        },
        {
          portraitPhotos: true,
          appearance: {
            phantomArtistName: name,
            phantomPortraitColor: color,
            phantomPortraitPhoto: photo,
          },
        },
      );

    render('Aster', '#112233', 'photo-a', 0, true);
    const current = stage.children[0];
    const [card, portrait] = current.children;
    render('Guest', '#445566', 'photo-b', 0, true);
    render('Singer', '#778899', 'photo-c', 0, false);
    expect(stage.children[0]).toBe(current);
    expect(card.children[0].attributes['aria-label']).toBe('Aster');
    expect(portrait.style['--phantom-portrait-fill']).toBe('#112233');
    expect(portrait.children[1].children[0].src).toBe(
      '/media/phantom-portrait/custom/photo-a',
    );

    render('Singer', '#778899', 'photo-c', 1, true);
    const [nextCard, nextPortrait] = stage.children[0].children;
    expect(stage.children[0]).not.toBe(current);
    expect(nextCard.children[0].attributes['aria-label']).toBe('Singer');
    expect(nextPortrait.style['--phantom-portrait-fill']).toBe('#778899');
    expect(nextPortrait.children[1].children[0].src).toBe(
      '/media/phantom-portrait/custom/photo-c',
    );
  });

  it('applies selections immediately before playback and on a new lyrics document', () => {
    const stage = createTestStage();
    const render = (name, documentId, playing) => {
      renderPhantomThieves(
        stage,
        {
          visible: true,
          currentText: 'Moonlight',
          lineIndex: 0,
          phantomThieves: { trackId: 'track', documentId, playing },
        },
        { appearance: { phantomArtistName: name } },
      );
      return stage.children[0].children[0].children[0].attributes['aria-label'];
    };
    expect(render('Aster', 'lyrics-1', false)).toBe('Aster');
    expect(render('Guest', 'lyrics-1', false)).toBe('Guest');
    expect(render('Guest', 'lyrics-1', true)).toBe('Guest');
    expect(render('Singer', 'lyrics-1', true)).toBe('Guest');
    expect(render('Singer', 'lyrics-2', true)).toBe('Singer');
  });

  it('mixes nameplate fonts by grapheme and keeps the same name stable between lines', () => {
    const stage = createTestStage();
    const artist = '9A\u0301ster・ほし 👩‍🎤';
    const options = {
      appearance: { phantomMode: 'side-card', phantomCardStyle: 'portrait' },
    };
    const renderName = (currentText) => {
      renderPhantomThieves(
        stage,
        { visible: true, currentText, phantomThieves: { artist } },
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
      { text: 'A\u0301', accent: 'phantom-thieves__name-accent' },
      { text: 'ster・' },
      { text: 'ほ', accent: 'phantom-thieves__name-accent' },
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
      renderPhantomThieves(
        stage,
        { visible: true, currentText, language },
        { appearance: { phantomMode: 'side-card' } },
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
    renderPhantomThieves(
      stage,
      {
        visible: true,
        currentText: 'Sing with me',
        phantomThieves: { artist },
      },
      { appearance: { phantomMode: 'side-card' } },
    );
    const label = stage.children[0].children[0].children[0].children[0];
    const glyphs = label.children.filter((node) => typeof node !== 'string');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]).toMatchObject({
      className: 'phantom-thieves__name-accent',
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
      renderPhantomThieves(
        stage,
        {
          visible: true,
          currentText: 'Sing with me',
          language: 'en',
          phantomThieves: { artist },
        },
        { appearance: { phantomMode: 'side-card' } },
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
    for (const phantomCardStyle of ['text-only', 'portrait']) {
      renderPhantomThieves(
        stage,
        { visible: true, currentText },
        { appearance: { phantomMode: 'side-card', phantomCardStyle } },
      );
      const copy = stage.children[0].children[0].children[0];
      expect(copy.textContent).toBe(currentText.replace('\n', ' '));
      expect(copy.style['--phantom-copy-scale']).toBeUndefined();
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
          width: card.style['--phantom-card-width'] ? capacity : 4,
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
    renderPhantomThieves(
      stage,
      { visible: true, currentText },
      {
        appearance: { phantomMode: 'side-card' },
      },
    );
    const card = stage.children[0].children[0];
    const copy = card.children[0];
    expect(card.style['--phantom-card-width']).toBe(
      'var(--phantom-side-card-max-width)',
    );
    expect(copy.dataset.plannedRows).toBe('');
    expect(copy.textContent).toBe(
      '最深的黑夜 是否難以入眠 輾轉來到\n某個起點 又想起了明天',
    );
    capacity = 40;
    resized();
    expect(card.style['--phantom-card-width']).toBeUndefined();
    expect(copy.dataset.plannedRows).toBe('');
    expect(copy.textContent).toBe(currentText.replace(/\s+/gu, ' '));

    capacity = 16;
    const shortText = 'それじゃまた';
    renderPhantomThieves(
      stage,
      { visible: true, currentText: shortText, language: 'ja' },
      { appearance: { phantomMode: 'side-card' } },
    );
    const shortCard = stage.children[0].children[0];
    expect(shortCard.style['--phantom-card-width']).toBeUndefined();
    expect(shortCard.children[0].dataset.plannedRows).toBe('');
    expect(shortCard.children[0].textContent).toBe(shortText);
  });

  it('keeps the long nameplate edges nearly parallel as the text box widens', () => {
    for (const width of [100, 250]) {
      const [[topLeft, topRight, bottomRight, bottomEdge, shoulder, tip]] =
        phantomFramePoints('nameplate', width, 30, 10);
      expect(bottomRight[0]).toBeCloseTo(width + 2.3);
      expect(topRight[0]).toBeLessThan(bottomRight[0]);
      expect(topRight[1]).toBe(topLeft[1]);
      expect(bottomEdge[1]).toBeGreaterThan(bottomRight[1]);
      const edgeAngle = Math.atan2(
        bottomEdge[1] - bottomRight[1],
        bottomRight[0] - bottomEdge[0],
      );
      expect((edgeAngle * 180) / Math.PI).toBeLessThan(1);
      expect(shoulder[1]).toBeGreaterThan(bottomEdge[1]);
      expect(shoulder[1]).toBeGreaterThan(tip[1]);
      expect(tip[0]).toBeLessThan(topLeft[0]);
      expect(bottomEdge[0] - topLeft[0]).toBeGreaterThan(35);
      const [shoulderX, shoulderY] = shoulder;
      const toPlate = [bottomEdge[0] - shoulderX, bottomEdge[1] - shoulderY];
      const toTip = [tip[0] - shoulderX, tip[1] - shoulderY];
      const cornerDot = toPlate[0] * toTip[0] + toPlate[1] * toTip[1];
      expect(cornerDot).toBeGreaterThan(0);
    }
  });

  it('traces the side card from the sample and stretches only its middle', () => {
    const unit = 10;
    const short = phantomFramePoints('side-card', 260, 80, unit);
    const long = phantomFramePoints('side-card', 460, 80, unit);
    const [outline] = short;
    // The tail tip leads, reaching past the box's left edge.
    expect(Math.min(...outline.map(([x]) => x))).toBe(outline[7][0]);
    expect(outline[7][0]).toBeLessThan(0);
    expect(outline[1][1]).toBeLessThan(0);
    expect(outline[2][0]).toBeGreaterThan(260);
    expect(outline[2][1]).toBeGreaterThan(80);
    // Left details keep their place; right details follow the right end.
    short.forEach((points, layer) =>
      points.forEach(([x, y], vertex) => {
        const [longX, longY] = long[layer][vertex];
        expect(longY).toBeCloseTo(y);
        expect(longX - x).toBeCloseTo(x > 130 ? 200 : 0);
      }),
    );
  });

  it('keeps both tips in the lower half of the portrait when the dialogue wraps', () => {
    const stage = createTestStage();
    renderPhantomThieves(
      stage,
      {
        visible: true,
        currentText: 'Moonlight',
        phantomThieves: { artist: 'Aster' },
      },
      { appearance: { phantomMode: 'side-card' } },
    );
    const card = stage.children[0].children[0];
    const [plate] = card.children;
    const unit = 10;
    const plateHeight = 30;
    const portraitHeight = 105; // 14cqw at 4:3.
    const originX = parseFloat(plate.style['--phantom-name-tail-x']) * unit;
    const plateInset = parseFloat(plate.style['--phantom-name-inset']) * unit;
    const originY =
      plateHeight +
      parseFloat(plate.style['--phantom-name-tip-extension']) * unit;
    const nameFromBottom =
      parseFloat(plate.style['--phantom-name-tip-from-bottom']) * unit;
    const dialogueFromBottom =
      parseFloat(card.style['--phantom-card-tip-from-bottom']) * unit;
    const [name] = phantomFramePoints('nameplate', 100, plateHeight, unit);
    expect(name[5]).toEqual([originX, originY]);
    const tilt = parseFloat(plate.style['--phantom-name-tilt']);
    for (const [vertex, angle] of [
      [4, -12],
      [6, -27],
    ]) {
      const [x, y] = name[vertex];
      const edgeAngle = (Math.atan2(y - originY, x - originX) * 180) / Math.PI;
      expect(edgeAngle - tilt).toBeCloseTo(angle);
    }
    for (const cardHeight of [64, 92, 155]) {
      const [dialogue] = phantomFramePoints('side-card', 260, cardHeight, unit);
      const nameTipY = cardHeight - nameFromBottom;
      const [dialogueTipX, dialogueTipY] = dialogue[7];
      expect(dialogueTipX).toBeCloseTo(
        parseFloat(card.style['--phantom-card-tail-x']) * unit,
      );
      expect(dialogueTipY).toBeCloseTo(cardHeight - dialogueFromBottom);
      expect(plateInset + originX - dialogueTipX).toBeCloseTo(5.3);
      expect(dialogueTipY - nameTipY).toBeCloseTo(6.8);
      for (const tipY of [nameTipY, dialogueTipY]) {
        const portraitPosition = 1 - (cardHeight - tipY) / portraitHeight;
        expect(portraitPosition).toBeGreaterThan(0.5);
        expect(portraitPosition).toBeLessThan(2 / 3);
      }
    }
  });

  it('layers the nameplate over the dialogue corner and W fold', () => {
    const stage = createTestStage();
    renderPhantomThieves(stage, {
      visible: true,
      currentText: 'Moonlight',
      phantomThieves: { artist: 'Winter' },
    });
    const [plate] = stage.children[0].children[0].children;
    const unit = 10;
    const tilt =
      (parseFloat(plate.style['--phantom-name-tilt']) * Math.PI) / 180;
    const tipFromBottom =
      parseFloat(plate.style['--phantom-name-tip-from-bottom']) * unit;
    const plateInset = parseFloat(plate.style['--phantom-name-inset']) * unit;
    for (const fontScale of [0.85, 1, 1.2]) {
      const plateHeight = (0.6 + 2.1 * 1.25 * fontScale) * unit;
      const [name] = phantomFramePoints('nameplate', 120, plateHeight, unit);
      const [tipX, tipY] = name[5];
      // The text starts at least two stage units in, centered vertically.
      const dx = 2 * unit - tipX;
      const dy = plateHeight / 2 - tipY;
      const labelStartX =
        plateInset + tipX + dx * Math.cos(tilt) + dy * Math.sin(tilt);
      for (const rows of [1, 2]) {
        const cardHeight =
          (4.25 + 2.05 * 1.24 * fontScale * Math.max(1.5, rows)) * unit;
        const [face, , fold] = phantomFramePoints(
          'side-card',
          500,
          cardHeight,
          unit,
          {
            hasNameplate: true,
          },
        );
        const [[leftX, leftY], [rightX, rightY]] = face;
        const topAtLabel =
          leftY + ((rightY - leftY) * (labelStartX - leftX)) / (rightX - leftX);
        const labelStartY =
          cardHeight -
          tipFromBottom -
          dx * Math.sin(tilt) +
          dy * Math.cos(tilt);
        const gap = (topAtLabel - labelStartY) / unit;
        expect(gap).toBeGreaterThan(-0.5);
        expect(gap).toBeLessThan(2.4);

        // A ray from the actual roof corner crosses the plate once if it is covered.
        const contour = name.map(([x, y]) => [
          plateInset +
            tipX +
            (x - tipX) * Math.cos(tilt) +
            (y - tipY) * Math.sin(tilt),
          cardHeight -
            tipFromBottom -
            (x - tipX) * Math.sin(tilt) +
            (y - tipY) * Math.cos(tilt),
        ]);
        const crossings = contour.filter(([x, y], index) => {
          const [nextX, nextY] = contour[(index + 1) % contour.length];
          if (y > leftY === nextY > leftY) return false;
          return x + ((nextX - x) * (leftY - y)) / (nextY - y) > leftX;
        });
        expect(crossings).toHaveLength(1);

        const [foldX, foldY] = fold.at(-1);
        const [baseX, baseY] = contour[5];
        const [shoulderX, shoulderY] = contour[4];
        const baseAtFold =
          baseY + ((shoulderY - baseY) * (foldX - baseX)) / (shoulderX - baseX);
        expect(foldX).toBeGreaterThan(baseX);
        expect(foldX).toBeLessThan(shoulderX);
        expect(foldY).toBeCloseTo(baseAtFold - 0.4 * unit);
      }
    }
  });

  it('extends the body of the side frame while keeping both end details fixed', () => {
    const [shortFace, shortTab, shortW] = phantomFramePoints(
      'side-card',
      160,
      52,
      8,
    );
    const [longFace, longTab, longW] = phantomFramePoints(
      'side-card',
      460,
      86,
      8,
    );
    expect(longFace[0]).toEqual(shortFace[0]);
    expect(longFace.slice(3)).toEqual(
      shortFace.slice(3).map(([x, y]) => [x, expect.closeTo(y + 34)]),
    );
    expect(longW).toEqual(shortW.map(([x, y]) => [x, expect.closeTo(y + 34)]));
    expect(longTab.map(([x, y]) => [x - 300, y])).toEqual(
      shortTab.map(([x, y]) => [expect.closeTo(x), expect.closeTo(y + 34)]),
    );
  });

  it('keeps the open W fold connected as the frame wobbles or resizes', () => {
    const stage = createMotionStage();
    stage.clientWidth = 1000;
    const document = stage.ownerDocument;
    let resize;
    let cardHeight = 80;
    document.defaultView = {
      ResizeObserver: class {
        constructor(callback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    };
    document.createRange = () => ({
      selectNodeContents() {},
      getBoundingClientRect: () => ({ width: 60, top: 28 }),
    });
    const { createElement } = document;
    document.createElement = () => ({
      ...createElement(),
      getBoundingClientRect: () => ({ width: 200, top: 0 }),
      get clientWidth() {
        return this.className === 'phantom-thieves__name' ? 100 : 260;
      },
      get clientHeight() {
        return this.className === 'phantom-thieves__name' ? 30 : cardHeight;
      },
    });
    const renderAt = (ageMs) =>
      renderPhantomThieves(
        stage,
        {
          visible: true,
          currentText: 'Moonlight',
          lineIndex: 0,
          phantomThieves: {
            artist: 'Aster',
            ageMs,
            lineDurationMs: 2000,
            playing: false,
          },
        },
        {
          appearance: {
            phantomMode: 'side-card',
            phantomCardStyle: 'text-only',
          },
          gsap,
        },
      );
    renderAt(0);
    const card = stage.children[0].children[0];
    const [plate] = card.children;
    const plateParts = plate.children.at(-1).children[0].children;
    expect(plateParts.map((part) => part.attributes.class)).toEqual([
      'phantom-thieves__frame-face',
    ]);
    const [plateFace] = plateParts;
    const nameShape = plateFace.attributes.points;
    expect(card.style['--phantom-card-copy-inset']).toBe('4.35cqw');
    expect(card.style['--phantom-card-name-inset']).toBeUndefined();
    const frame = card.children.at(-1);
    const { children } = frame.children[0];
    const band = children.find(
      (node) => node.attributes.class === 'phantom-thieves__frame-band',
    );
    const blackRim = children.find(
      (node) => node.attributes.class === 'phantom-thieves__frame-shadow',
    );
    const face = children.find(
      (node) => node.attributes.class === 'phantom-thieves__frame-face',
    );
    expect(blackRim.attributes.d).toBe(face.attributes.d);
    expect(blackRim.attributes.d).toMatch(/^M.+Z$/);
    const [defs] = children;
    const [mask] = defs.children;
    expect(mask.attributes).toMatchObject({
      maskUnits: 'userSpaceOnUse',
      x: -260,
      y: -80,
      width: 780,
      height: 240,
    });
    const [outline, , foldOutline] = phantomFramePoints(
      'side-card',
      260,
      80,
      10,
      {
        hasNameplate: true,
      },
    );
    const points = band.attributes.d.slice(1, -1).split(' ');
    expect(points.slice(0, 8)).toEqual(
      outline.slice(0, 8).map((point) => point.join(',')),
    );
    expect(points).not.toContain(outline[8].join(','));
    expect(points).not.toContain(outline[9].join(','));

    cardHeight = 110;
    resize();
    expect(plateFace.attributes.points).toBe(nameShape);
    const inset = parseFloat(card.style['--phantom-card-name-inset']);
    expect(inset).toBeGreaterThan(43.5);
    expect(inset).toBeLessThan(100);

    cardHeight = 80;
    resize();
    expect(card.style['--phantom-card-name-inset']).toBeUndefined();

    const fold = children.find(
      (node) => node.attributes.class === 'phantom-thieves__frame-inner',
    );
    const stillBand = band.attributes.d;
    const labelOffsetX = plate.style['--phantom-name-label-x'];
    const labelOffsetY = plate.style['--phantom-name-label-y'];
    for (const ageMs of [0, 260, 420, 580, 920]) {
      renderAt(ageMs);
      expect(plate.style['--phantom-name-label-x']).toBe(labelOffsetX);
      expect(plate.style['--phantom-name-label-y']).toBe(labelOffsetY);
      const [topLeft, topRight, bottomRight, bottomEdge, , , notch] =
        plateFace.attributes.points
          .split(' ')
          .map((point) => point.split(',').map(Number));
      const labelX = plate.clientWidth / 2 + parseFloat(labelOffsetX);
      const labelY = plate.clientHeight / 2 + parseFloat(labelOffsetY);
      const sideAtLabel = ([x, y], [endX, endY]) =>
        x + ((endX - x) * (labelY - y)) / (endY - y);
      const longEdgeAtLabel = ([x, y], [endX, endY]) =>
        y + ((endY - y) * (labelX - x)) / (endX - x);
      const horizontalCenter =
        (sideAtLabel(topLeft, notch) + sideAtLabel(topRight, bottomRight)) / 2;
      const verticalCenter =
        (longEdgeAtLabel(topLeft, topRight) +
          longEdgeAtLabel(bottomEdge, bottomRight)) /
        2;
      expect(Math.abs(labelX - horizontalCenter)).toBeLessThanOrEqual(2);
      expect(Math.abs(labelY - verticalCenter)).toBeLessThanOrEqual(1);

      const [outerTip, innerTip] = band.attributes.d
        .slice(1, -1)
        .split(' ')
        .slice(7, 9)
        .map((point) => point.split(',').map(Number));
      const join = fold.attributes.points.split(' ')[0].split(',').map(Number);
      expect(join).toEqual(
        outerTip.map((value, axis) =>
          expect.closeTo((value + innerTip[axis]) / 2),
        ),
      );
      expect(fold.attributes.points.split(' ').at(-1)).toBe(
        foldOutline.at(-1).join(','),
      );
      const turns = fold.attributes.points.split(' ').slice(1);
      const rim = blackRim.attributes.d.slice(1, -1).split(' ');
      expect(rim.slice(-(turns.length + 1))).toEqual([
        outerTip.join(','),
        ...turns,
      ]);
    }
    expect(plateFace.attributes.points).not.toBe(nameShape);
    expect(band.attributes.d).not.toBe(stillBand);
    clearPhantomThieves(stage);
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
    renderPhantomThieves(
      stage,
      { visible: true, currentText: 'Hello! See you!' },
      { appearance: { phantomMode: 'radial' } },
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
    ['enters', false, PHANTOM_SIDE_CARD_POSES.enter, 4, [3, 8]],
    ['continues', true, PHANTOM_SIDE_CARD_POSES.continue, 1, [2, 4]],
  ])(
    'samples the measured side-card poses per frame when it %s',
    (_, continuesPrevious, poses, labelFrame, [dark, lit]) => {
      const stage = createMotionStage();
      const options = {
        appearance: { phantomMode: 'side-card', phantomCardStyle: 'text-only' },
        gsap,
      };
      const at = (index) =>
        renderPhantomThieves(
          stage,
          {
            visible: true,
            currentText: 'Moonlight',
            lineIndex: 2,
            phantomThieves: {
              artist: 'Aster',
              trackId: 'track',
              ageMs: (index * 1000) / 30,
              lineDurationMs: 3000,
              rate: 1,
              playing: false,
              continuesPrevious,
            },
          },
          options,
        );
      at(0);
      const [card] = stage.children[0].children;
      const [plate, copy, shell] = card.children;
      const [label] = plate.children;
      for (const [index, scale] of poses) {
        at(index);
        expect(shell.scale).toBeCloseTo(scale, 5);
        expect(shell.opacity).toBe(1);
      }
      at(labelFrame - 1);
      expect(label.opacity).toBe(0);
      at(labelFrame);
      expect(label.opacity).toBe(1);
      at(dark);
      expect(copy.opacity).toBe(0);
      at(dark + 1);
      expect(copy.opacity).toBeGreaterThan(0.3);
      at(lit);
      expect(copy.opacity).toBe(1);
      // Seeking back restores the earlier pose.
      at(poses[0][0]);
      expect(shell.scale).toBeCloseTo(poses[0][1], 5);
      clearPhantomThieves(stage);
    },
  );

  it('insets outline corners by each width and grows them outward when negative', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const round = (points) =>
      points.map(([x, y]) => [
        Math.round(x * 100) / 100,
        Math.round(y * 100) / 100,
      ]);
    expect(round(insetPolygon(square, [1, 1, 1, 1]))).toEqual([
      [1, 1],
      [9, 1],
      [9, 9],
      [1, 9],
    ]);
    expect(round(insetPolygon([...square].reverse(), [1, 0, 0, 0]))[0]).toEqual(
      [1, 9],
    );
    expect(round(insetPolygon(square, [-2, 0, 0, 0]))[0]).toEqual([-2, -2]);
  });

  it('keeps the box hidden on the frame where the nameplate leads', () => {
    const stage = createMotionStage();
    renderPhantomThieves(
      stage,
      {
        visible: true,
        currentText: 'Moonlight',
        lineIndex: 0,
        phantomThieves: {
          artist: 'Aster',
          ageMs: 0,
          lineDurationMs: 3000,
          rate: 1,
          playing: false,
        },
      },
      {
        appearance: { phantomMode: 'side-card', phantomCardStyle: 'text-only' },
        gsap,
      },
    );
    const [plate, , shell] = stage.children[0].children[0].children;
    expect(shell.opacity).toBe(0);
    expect(plate.opacity).toBe(1);
    clearPhantomThieves(stage);
  });

  it('reveals and pulses the blade as a single outlined polygon', () => {
    const stage = createMotionStage();
    const options = { appearance: { phantomMode: 'side-card' }, gsap };
    const at = (index) =>
      renderPhantomThieves(
        stage,
        {
          visible: true,
          currentText: 'Moonlight',
          lineIndex: 0,
          phantomThieves: {
            ageMs: (index * 1000) / 30,
            lineDurationMs: 3000,
            playing: false,
          },
        },
        options,
      );
    at(4);
    const card = stage.children[0].children[0];
    const frame = card.children.at(-1);
    const marker = frame.children[0].children.at(-1);
    expect(marker.children.map((child) => child.attributes.class)).toEqual([
      'phantom-thieves__frame-tab',
    ]);
    expect(marker['--phantom-marker-scale']).toBe(0);
    at(10);
    expect(marker['--phantom-marker-scale']).toBe(1);
    at(20);
    expect(marker['--phantom-marker-scale']).toBeLessThan(1);
    clearPhantomThieves(stage);
  });

  it('bounds radial strips while keeping Latin words and all lyric text', () => {
    const line =
      '月光借我一句話，Turn it up，跨過長夜，看見遠方，再走一步，再唱一遍，不必等待';
    const phrases = phantomPhrases(line);
    expect(phrases).toHaveLength(6);
    expect(phrases).toContain('Turn it');
    expect(phrases.join('').replace(/\s/gu, '')).toBe(line.replace(/\s/gu, ''));
  });

  it('projects the current lyric, previous lyric and the source clock from the seek position', () => {
    const snapshot = createOutputPreviewSnapshot();
    snapshot.lyrics.documentId = 'demo-lyrics';
    const line = snapshot.lyrics.lines[1];
    line.endMs = line.startMs + 1800;
    snapshot.playback.positionMs = line.startMs + 220;
    snapshot.playback.status = 'paused';
    const options = {
      templateId: 'phantom-thieves',
      nowMs: Date.parse(snapshot.generatedAt),
    };
    expect(selectLyricsOverlayFrame(snapshot, options)).toMatchObject({
      currentText: line.text,
      phantomThieves: {
        documentId: 'demo-lyrics',
        previousText: snapshot.lyrics.lines[0].text,
        artist: snapshot.playback.track.artist,
        ageMs: 220,
        lineDurationMs: 1800,
        playing: false,
      },
    });
  });

  it('marks back-to-back lines so the dialogue frame continues', () => {
    const snapshot = createOutputPreviewSnapshot();
    const [previous, line] = snapshot.lyrics.lines;
    snapshot.playback.positionMs = line.startMs + 100;
    snapshot.playback.status = 'paused';
    const project = () =>
      selectLyricsOverlayFrame(snapshot, {
        templateId: 'phantom-thieves',
        nowMs: Date.parse(snapshot.generatedAt),
      }).phantomThieves.continuesPrevious;
    previous.endMs = line.startMs;
    expect(project()).toBe(true);
    previous.endMs = line.startMs - 500;
    expect(project()).toBe(false);
  });
});
