import { describe, expect, it, vi } from 'vitest';
import {
  createLyricsDiagnostics,
  createLyricsErrorReporter,
  createLyricsFrameScheduler,
  destroyLyricsAnimations,
  renderLyricsFrame,
  renderLyricsFrameSafely,
} from './lyrics.mjs';

function gsapHarness() {
  const timelines = [];
  const gsap = {
    killTweensOf: vi.fn(),
    set: vi.fn(),
    to: vi.fn(),
    timeline: vi.fn((options = {}) => {
      const timeline = {
        additions: [],
        labels: [],
        options,
        tweens: [],
        kill: vi.fn(),
        addLabel(label) {
          this.labels.push(label);
          return this;
        },
        to(target, vars, position) {
          this.tweens.push({ position, target, vars });
          return this;
        },
        add(callback) {
          this.additions.push(callback);
          return this;
        },
      };
      timelines.push(timeline);
      return timeline;
    }),
  };
  return { gsap, timelines };
}

function element(ownerDocument = null, localName = '') {
  let ownText = '';
  let textContentWriteCount = 0;
  const value = {
    ownerDocument,
    children: [],
    hidden: false,
    dataset: {},
    attributes: {},
    localName,
    animate: vi.fn(),
    style: {
      values: {},
      removeProperty(name) {
        delete this.values[name];
      },
      setProperty(name, nextValue) {
        this.values[name] = nextValue;
      },
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      ownText = '';
      this.children = children;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      delete this[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      this[name] = value;
    },
  };
  Object.defineProperty(value, 'textContent', {
    get() {
      return ownText + this.children.map((child) => child.textContent).join('');
    },
    set(nextValue) {
      textContentWriteCount += 1;
      ownText = String(nextValue);
      this.children = [];
    },
  });
  Object.defineProperty(value, 'textContentWriteCount', {
    get() {
      return textContentWriteCount;
    },
  });
  Object.defineProperty(value, 'innerHTML', {
    set() {
      throw new Error('innerHTML must not be used');
    },
  });
  return value;
}

function domElements() {
  const documentApi = {
    createElement: vi.fn((localName) => element(documentApi, localName)),
    createElementNS: vi.fn(() => {
      const svgElement = element(documentApi);
      Object.defineProperty(svgElement, 'className', {
        get: () => ({ baseVal: '' }),
      });
      return svgElement;
    }),
  };
  return {
    root: element(documentApi),
    current: element(documentApi),
    liveStageCard: element(documentApi),
    liveStageChrome: element(documentApi),
    liveStageTitle: element(documentApi),
    liveStageArtist: element(documentApi),
    mangaBubbles: element(documentApi),
    next: element(documentApi),
    ktvCountIn: element(documentApi),
  };
}

function kineticLineTracks(line) {
  return line.children.flatMap((row) => row.children);
}

function kineticLineUnits(line) {
  return kineticLineTracks(line).flatMap((track) => track.children);
}

describe('lyrics overlay renderer', () => {
  it('renders Kinetic Pop as semantic text with three aria-hidden full-line layer tracks', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: 'すてっぷ！',
      nextText: '仰せのまま',
      language: 'ja',
      lineIndex: 1,
      currentVisibleLineIndex: 1,
      kineticPop: {
        text: 'すてっぷ！',
        material: 'candy-rim',
        composition: 'punch',
        rows: [
          {
            text: 'すてっぷ！',
            units: [
              { text: 'す', weight: 1 },
              { text: 'てっ', weight: 2 },
              { text: 'ぷ！', weight: 1 },
            ],
          },
        ],
        units: [
          { text: 'す', weight: 1 },
          { text: 'てっ', weight: 2 },
          { text: 'ぷ！', weight: 1 },
        ],
      },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });

    expect(elements.root.dataset.kineticPop).toBe('true');
    expect(elements.root.dataset.kineticMaterial).toBe('candy-rim');
    expect(elements.root.dataset.kineticComposition).toBe('punch');
    expect(elements.current.attributes['aria-label']).toBe('すてっぷ！');
    expect(elements.current.dataset.currentText).toBe('すてっぷ！');
    expect(elements.next.hidden).toBe(true);
    expect(elements.next.textContent).toBe('');
    expect(elements.current.children).toHaveLength(1);

    const line = elements.current.children[0];
    expect(line.className).toBe('lyrics-overlay__kinetic-line');
    expect(line.dataset.kineticMaterial).toBe('candy-rim');
    expect(line.dataset.kineticComposition).toBe('punch');
    expect(line.dataset.kineticRows).toBe('1');
    expect(line.attributes['aria-hidden']).toBe('true');
    expect(line.children).toHaveLength(1);
    expect(line.children[0].className).toBe('lyrics-overlay__kinetic-row');
    expect(line.children[0].dataset.kineticRow).toBe('0');
    expect(line.children[0].children).toHaveLength(3);
    expect(
      line.children[0].children.map((track) => track.dataset.kineticLayer),
    ).toEqual(['depth', 'rim', 'fill']);
    expect(
      line.children[0].children.every(
        (track) =>
          track.attributes['aria-hidden'] === 'true' &&
          track.children.length === 3 &&
          track.children.every(
            (unit) =>
              unit.className === 'lyrics-overlay__kinetic-unit' &&
              unit.children.length === 1 &&
              unit.children[0].className.includes(
                'lyrics-overlay__kinetic-layer',
              ),
          ),
      ),
    ).toBe(true);
    expect(
      line.children[0].children.map((track) =>
        track.children.map((unit) => unit.dataset.kineticUnit),
      ),
    ).toEqual([
      ['0', '1', '2'],
      ['0', '1', '2'],
      ['0', '1', '2'],
    ]);
  });

  it('keeps a one-row Kinetic Pop caption split into visual entrance units without changing accessible text', () => {
    const elements = domElements();
    const text = '歩き回ってやっとついたここはどうだ楽園か？';
    const rows = [
      {
        text,
        units: [...text].map((unit) => ({
          text: unit,
          weight: 1,
        })),
      },
    ];

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: text,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
        currentVisibleLineIndex: 0,
        kineticPop: {
          text,
          material: 'candy-rim',
          composition: 'caption',
          rows,
          units: rows.flatMap((row) => row.units),
        },
      },
      { templateId: 'kinetic-pop', reducedMotion: true },
    );

    const line = elements.current.children[0];
    expect(elements.current.attributes['aria-label']).toBe(text);
    expect(line.dataset.kineticRows).toBe('1');
    expect(line.children.map((row) => row.dataset.kineticRow)).toEqual(['0']);
    expect(line.children[0].children).toHaveLength(3);
    expect(line.children[0].children.map((track) => track.textContent)).toEqual(
      [text, text, text],
    );
    expect(
      line.children[0].children.map((track) => track.children.length),
    ).toEqual([text.length, text.length, text.length]);
  });

  it('cross-swaps Kinetic Pop lines on one interruptible three-layer GSAP timeline', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const first = {
      revision: 1,
      visible: true,
      currentText: 'すてっぷ！',
      nextText: '',
      language: 'ja',
      lineIndex: 0,
      currentVisibleLineIndex: 0,
      kineticPop: {
        text: 'すてっぷ！',
        material: 'solid-outline',
        composition: 'punch',
        units: [
          { text: 'す', weight: 1 },
          { text: 'てっ', weight: 2 },
          { text: 'ぷ！', weight: 1 },
        ],
      },
    };
    const second = {
      ...first,
      revision: 2,
      currentText: '仰せのまま',
      lineIndex: 1,
      currentVisibleLineIndex: 1,
      kineticPop: {
        text: '仰せのまま',
        material: 'candy-rim',
        composition: 'punch',
        units: [
          { text: '仰', weight: 1 },
          { text: 'せ', weight: 1 },
          { text: 'の', weight: 1 },
          { text: 'ま', weight: 1 },
          { text: 'ま', weight: 1 },
        ],
      },
    };

    renderLyricsFrame(elements, first, {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    gsap.set.mockClear();
    renderLyricsFrame(elements, second, {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toContain('swap');
    expect(timelines[0].tweens).toHaveLength(6);
    expect(
      timelines[0].tweens.slice(0, 3).every(({ vars }) =>
        Object.entries({
          autoAlpha: 0,
          duration: 0.08,
          ease: 'power2.in',
          x: 0,
        }).every(([key, value]) => vars[key] === value),
      ),
    ).toBe(true);
    expect(
      timelines[0].tweens.slice(3).every(({ vars }) =>
        Object.entries({
          autoAlpha: 1,
          duration: 0.115,
          ease: 'back.out(2.2)',
          scale: 1,
        }).every(([key, value]) => vars[key] === value),
      ),
    ).toBe(true);
    const exitDelays = timelines[0].tweens
      .slice(0, 3)
      .map(({ vars }) =>
        first.kineticPop.units.map((_unit, index) => vars.stagger(index)),
      );
    expect(exitDelays[0]).toEqual([0.018, 0, 0.025]);
    expect(exitDelays[1]).toEqual(exitDelays[0]);
    expect(exitDelays[2]).toEqual(exitDelays[0]);
    expect(elements.current.children).toHaveLength(2);
    for (const track of kineticLineTracks(elements.current.children[1])) {
      expect(gsap.set).toHaveBeenCalledWith(
        track.children,
        expect.objectContaining({
          autoAlpha: 0,
          scale: expect.any(Function),
          x: 0,
        }),
      );
    }

    timelines[0].options.onComplete();
    expect(elements.current.children).toHaveLength(1);
    expect(elements.current.children[0].dataset.kineticMaterial).toBe(
      'candy-rim',
    );
  });

  it('normalizes an interrupted Kinetic Pop swap before a third punch arrives', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = (text, revision, material) => ({
      revision,
      visible: true,
      currentText: text,
      nextText: '',
      language: 'ja',
      lineIndex: revision,
      currentVisibleLineIndex: revision,
      kineticPop: {
        text,
        material,
        composition: 'punch',
        units: [...text].map((unit) => ({ text: unit, weight: 1 })),
      },
    });

    renderLyricsFrame(elements, frame('最初', 1, 'solid-outline'), {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    renderLyricsFrame(elements, frame('途中', 2, 'candy-rim'), {
      gsap,
      templateId: 'kinetic-pop',
    });
    renderLyricsFrame(elements, frame('最後', 3, 'chromatic-depth'), {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(2);
    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(elements.current.children).toHaveLength(2);
    expect(
      elements.current.children.map((line) => line.dataset.kineticText),
    ).toEqual(['途中', '最後']);
    expect(timelines[1].tweens[0].target).toEqual(
      kineticLineTracks(elements.current.children[0])[0].children,
    );

    timelines[1].options.onComplete();
    expect(elements.current.children).toHaveLength(1);
    expect(elements.current.children[0].dataset.kineticText).toBe('最後');
  });

  it('animates repeated Kinetic Pop text when the source line and material change', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = (revision, lineIndex, material) => ({
      revision,
      visible: true,
      currentText: '同じ',
      nextText: '',
      language: 'ja',
      lineIndex,
      currentVisibleLineIndex: lineIndex,
      kineticPop: {
        text: '同じ',
        material,
        composition: 'punch',
        units: [
          { text: '同', weight: 1 },
          { text: 'じ', weight: 1 },
        ],
      },
    });

    renderLyricsFrame(elements, frame(1, 0, 'solid-outline'), {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    renderLyricsFrame(elements, frame(2, 1, 'candy-rim'), {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(1);
    expect(elements.current.children).toHaveLength(2);
    expect(
      elements.current.children.map((line) => line.dataset.kineticMaterial),
    ).toEqual(['solid-outline', 'candy-rim']);

    timelines[0].options.onComplete();
    expect(elements.current.children).toHaveLength(1);
    expect(elements.current.children[0].dataset.kineticMaterial).toBe(
      'candy-rim',
    );
  });

  it('bursts the first Kinetic Pop punch in place with synchronized interleaved layer tracks', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '選ばれる',
      nextText: '',
      language: 'ja',
      lineIndex: 0,
      currentVisibleLineIndex: 0,
      kineticPop: {
        text: '選ばれる',
        material: 'solid-outline',
        composition: 'punch',
        units: [...'選ばれる'].map((text) => ({ text, weight: 1 })),
      },
    };

    renderLyricsFrame(elements, frame, {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(1);
    expect(timelines[0].tweens).toHaveLength(3);
    expect(timelines[0].tweens.map(({ target }) => target)).toEqual(
      kineticLineTracks(elements.current.children[0]).map(
        (track) => track.children,
      ),
    );
    expect(
      timelines[0].tweens.every(({ target }) =>
        target.every(
          (unit) =>
            unit.className === 'lyrics-overlay__kinetic-unit' &&
            !unit.className.includes('lyrics-overlay__kinetic-layer--'),
        ),
      ),
    ).toBe(true);
    expect(
      timelines[0].tweens.every(({ vars }) =>
        Object.entries({
          autoAlpha: 1,
          duration: 0.115,
          ease: 'back.out(2.2)',
          scale: 1,
        }).every(([key, value]) => vars[key] === value),
      ),
    ).toBe(true);

    const entranceDelays = timelines[0].tweens.map(({ vars }) =>
      frame.kineticPop.units.map((_unit, index) => vars.stagger(index)),
    );
    expect(entranceDelays[0]).toEqual([0.018, 0, 0.025, 0.006]);
    expect(entranceDelays[1]).toEqual(entranceDelays[0]);
    expect(entranceDelays[2]).toEqual(entranceDelays[0]);
    expect(entranceDelays[0][0]).toBeGreaterThan(entranceDelays[0][1]);

    const entranceSetCalls = gsap.set.mock.calls.filter(
      ([, vars]) => vars.autoAlpha === 0,
    );
    expect(entranceSetCalls).toHaveLength(3);
    for (const [, vars] of entranceSetCalls) {
      expect(vars.x).toBe(0);
      expect(vars.y(0)).toBeGreaterThan(0);
      expect(vars.y(1)).toBeLessThan(0);
      expect(vars.rotation(0)).toBeLessThan(0);
      expect(vars.rotation(1)).toBeGreaterThan(0);
      expect(vars.scale(0)).toBeLessThan(1);
      expect(vars.scale(1)).toBeGreaterThan(1);
    }
  });

  it('animates every visual unit when a caption first appears without T2 timings', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const text = '何千回の夜を過ごしたって';
    const frame = {
      revision: 1,
      visible: true,
      currentText: text,
      nextText: '',
      language: 'ja',
      lineIndex: 0,
      currentVisibleLineIndex: 0,
      kineticPop: {
        text,
        material: 'candy-rim',
        composition: 'caption',
        units: [...text].map((unit) => ({ text: unit, weight: 1 })),
      },
    };

    renderLyricsFrame(elements, frame, {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(1);
    expect(timelines[0].tweens).toHaveLength(3);
    expect(timelines[0].tweens.map(({ target }) => target.length)).toEqual([
      text.length,
      text.length,
      text.length,
    ]);
    const stagger = timelines[0].tweens[0].vars.stagger;
    const delays = Array.from({ length: text.length }, (_unit, index) =>
      stagger(index),
    );
    expect(Math.max(...delays)).toBeLessThanOrEqual(0.028);
    expect(delays.slice(0, 8)).toEqual([
      0.018, 0, 0.025, 0.006, 0.021, 0.003, 0.028, 0.009,
    ]);
    expect(kineticLineUnits(elements.current.children[0])).toHaveLength(
      text.length * 3,
    );
  });

  it('settles every Kinetic Pop material track into the selected subtle glyph arrangement', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.root.dataset.ovlKineticArrangement = 'subtle-offset';
    const text = 'すてっぷ';
    const units = [...text].map((unit) => ({ text: unit, weight: 1 }));

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: text,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
        currentVisibleLineIndex: 0,
        kineticPop: {
          text,
          material: 'candy-rim',
          composition: 'punch',
          rows: [{ text, units }],
          units,
        },
      },
      { gsap, templateId: 'kinetic-pop' },
    );

    const tracks = kineticLineTracks(elements.current.children[0]);
    expect(tracks.map((track) => track.children[0].style.values)).toEqual([
      expect.objectContaining({
        '--kinetic-rest-rotation': '-1.6deg',
        '--kinetic-rest-scale': '1.01',
        '--kinetic-rest-x': '-0.02em',
        '--kinetic-rest-y': '0.025em',
      }),
      expect.objectContaining({
        '--kinetic-rest-rotation': '-1.6deg',
        '--kinetic-rest-scale': '1.01',
        '--kinetic-rest-x': '-0.02em',
        '--kinetic-rest-y': '0.025em',
      }),
      expect.objectContaining({
        '--kinetic-rest-rotation': '-1.6deg',
        '--kinetic-rest-scale': '1.01',
        '--kinetic-rest-x': '-0.02em',
        '--kinetic-rest-y': '0.025em',
      }),
    ]);

    const restTweens = timelines[0].tweens.map(({ vars }) => ({
      rotation: [vars.rotation(0), vars.rotation(1)],
      scale: [vars.scale(0), vars.scale(1)],
      x: [vars.x(0), vars.x(1)],
      y: [vars.y(0), vars.y(1)],
    }));
    expect(restTweens).toEqual([restTweens[0], restTweens[0], restTweens[0]]);
    expect(restTweens[0]).toEqual({
      rotation: [-1.6, 1.3],
      scale: [1.01, 0.99],
      x: ['-0.02em', '0.012em'],
      y: ['0.025em', '-0.02em'],
    });
  });

  it('cross-swaps authored phrases within one timed line and does not replay inside a phrase', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const sourceText = 'いつでも僕らはこんな風に ぼんくらな夜に飽き飽き';
    const frame = (displayText, phraseIndex, lineProgress) => {
      const units = [...displayText].map((text) => ({ text, weight: 1 }));
      return {
        revision: 1,
        visible: true,
        currentText: sourceText,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
        currentVisibleLineIndex: 0,
        lineProgress,
        kineticPop: {
          text: sourceText,
          displayText,
          phraseIndex,
          material: 'candy-rim',
          composition: 'caption',
          rows: [{ text: displayText, units }],
          units,
        },
      };
    };

    renderLyricsFrame(elements, frame('いつでも僕らはこんな風に', 0, 0.3), {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    const firstLine = elements.current.children[0];
    renderLyricsFrame(elements, frame('いつでも僕らはこんな風に', 0, 0.5), {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(0);
    expect(elements.current.children[0]).toBe(firstLine);

    renderLyricsFrame(elements, frame('ぼんくらな夜に飽き飽き', 1, 0.6), {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(1);
    expect(timelines[0].tweens).toHaveLength(6);
    expect(elements.current.attributes['aria-label']).toBe(
      'ぼんくらな夜に飽き飽き',
    );
    expect(elements.current.dataset.currentText).toBe('ぼんくらな夜に飽き飽き');
    expect(
      elements.current.children.map((line) => line.dataset.kineticText),
    ).toEqual(['いつでも僕らはこんな風に', 'ぼんくらな夜に飽き飽き']);
    expect(elements.current.children[1].dataset.kineticPhrase).toBe('1');
  });

  it('commits Kinetic Pop immediately for timeline discontinuities and reduced motion', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = (text, revision, timelineDiscontinuity = false) => ({
      revision,
      visible: true,
      currentText: text,
      nextText: '',
      language: 'ja',
      lineIndex: revision,
      currentVisibleLineIndex: revision,
      timelineDiscontinuity,
      kineticPop: {
        text,
        material: 'chromatic-depth',
        composition: 'punch',
        units: [{ text, weight: 1 }],
      },
    });

    renderLyricsFrame(elements, frame('前', 1), {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    renderLyricsFrame(elements, frame('後', 2, true), {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(0);
    expect(elements.current.children).toHaveLength(1);
    expect(elements.current.dataset.currentText).toBe('後');
    expect(gsap.killTweensOf).toHaveBeenCalled();
  });

  it('stops an active Kinetic Pop swap when reduced motion is enabled for the same phrase', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = (text, lineIndex) => ({
      revision: lineIndex + 1,
      visible: true,
      currentText: text,
      nextText: '',
      language: 'ja',
      lineIndex,
      currentVisibleLineIndex: lineIndex,
      kineticPop: {
        text,
        material: 'candy-rim',
        composition: 'caption',
        units: [...text].map((unit) => ({ text: unit, weight: 1 })),
      },
    });

    renderLyricsFrame(elements, frame('前半', 0), {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    const incomingFrame = frame('後半', 1);
    renderLyricsFrame(elements, incomingFrame, {
      gsap,
      templateId: 'kinetic-pop',
    });

    expect(timelines).toHaveLength(1);
    expect(elements.current.children).toHaveLength(2);

    renderLyricsFrame(elements, incomingFrame, {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });

    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(elements.current.children).toHaveLength(1);
    const committedLine = elements.current.children[0];
    const committedUnits = kineticLineUnits(committedLine);
    expect(committedLine.dataset.kineticText).toBe('後半');
    expect(gsap.set).toHaveBeenCalledWith(committedUnits, {
      clearProps: 'opacity,visibility,transform,transformOrigin',
    });

    renderLyricsFrame(elements, incomingFrame, {
      gsap,
      templateId: 'kinetic-pop',
      reducedMotion: true,
    });
    expect(elements.current.children[0]).toBe(committedLine);
  });

  it('emits bounded sweep diagnostics only when lyricsDebug is explicitly enabled', () => {
    const consoleApi = { log: vi.fn() };
    const disabled = createLyricsDiagnostics({
      consoleApi,
      location: { search: '?workbench=1' },
    });
    const publicOverlay = createLyricsDiagnostics({
      consoleApi,
      location: { search: '?lyricsDebug=1' },
    });
    const enabled = createLyricsDiagnostics({
      consoleApi,
      location: { search: '?workbench=1&lyricsDebug=1' },
    });

    expect(disabled).toBeNull();
    expect(publicOverlay).toBeNull();
    expect(enabled).toEqual(expect.any(Function));
    enabled('sweep-start', {
      lineIndex: 3,
      mode: 't1',
      progress: 25,
      templateId: 'karaoke-stack',
    });
    expect(consoleApi.log).toHaveBeenCalledWith(
      '[Utawakui lyrics]',
      'sweep-start',
      {
        lineIndex: 3,
        mode: 't1',
        progress: 25,
        templateId: 'karaoke-stack',
      },
    );
  });

  it('reports bounded render errors only when lyricsDebug is explicitly enabled', () => {
    const consoleApi = { error: vi.fn() };
    const disabled = createLyricsErrorReporter({
      consoleApi,
      location: { search: '?workbench=1' },
    });
    const publicOverlay = createLyricsErrorReporter({
      consoleApi,
      location: { search: '?lyricsDebug=1' },
    });
    const enabled = createLyricsErrorReporter({
      consoleApi,
      location: { search: '?workbench=1&lyricsDebug=1' },
    });

    expect(disabled).toBeNull();
    expect(publicOverlay).toBeNull();
    expect(enabled).toEqual(expect.any(Function));
    enabled(new TypeError('render failed'), {
      phase: 'render',
      revision: 17,
      templateId: 'karaoke-stack',
    });
    expect(consoleApi.error).toHaveBeenCalledWith(
      '[Utawakui lyrics]',
      'render-error',
      expect.objectContaining({
        errorName: 'TypeError',
        message: 'render failed',
        phase: 'render',
        revision: 17,
        templateId: 'karaoke-stack',
      }),
    );
  });

  it('keeps the live renderer running after reporting a malformed frame', () => {
    const reportError = vi.fn();

    expect(
      renderLyricsFrameSafely(
        { root: null, current: null, next: null },
        {
          revision: 18,
          ktv: {
            currentVisibleLineIndex: 4,
            currentSegments: [{ segmentId: 'word:0', text: 'bad' }],
            nextSegments: [{ segmentId: 'word:1', text: 'next' }],
          },
        },
        { templateId: 'karaoke-stack', reportError },
      ),
    ).toBe(false);
    expect(reportError).toHaveBeenCalledWith(expect.any(TypeError), {
      currentSegmentCount: 1,
      lineIndex: 4,
      nextSegmentCount: 1,
      phase: 'render',
      revision: 18,
      templateId: 'karaoke-stack',
    });
  });

  it('shows a four-beat Classic KTV cue without exposing it to other templates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: false,
      currentText: '',
      nextText: '',
      language: 'zh-Hant',
      ktv: {
        visible: true,
        currentText: '[女]第一句',
        nextText: '第二句',
        currentVisibleLineIndex: 0,
        nextVisibleLineIndex: 1,
        lineProgress: 0,
        countIn: {
          remainingBeats: 4,
          totalBeats: 4,
          timingSource: 'fixed-window',
        },
      },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'karaoke-stack',
      reducedMotion: true,
    });

    expect(elements.root.hidden).toBe(false);
    expect(elements.current.textContent).toBe('第一句');
    expect(elements.next.textContent).toBe('第二句');
    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.dataset.ktvRole).toBe('female');
    expect(elements.ktvCountIn.hidden).toBe(false);
    expect(elements.ktvCountIn.dataset.remainingBeats).toBe('4');
    expect(elements.ktvCountIn.dataset.ktvRole).toBe('female');
    expect(elements.ktvCountIn.dataset.ktvLane).toBe('a');

    renderLyricsFrame(elements, frame, { templateId: 'quiet-caption' });

    expect(elements.root.hidden).toBe(true);
    expect(elements.ktvCountIn.hidden).toBe(true);
  });

  it('does not create a Manga bubble for a KTV count-in before the first lyric', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: false,
      currentText: '',
      nextText: '',
      language: 'ja',
      ktv: {
        visible: true,
        currentText: '最初の歌詞',
        nextText: '次の歌詞',
        currentVisibleLineIndex: 0,
        nextVisibleLineIndex: 1,
        lineProgress: 0,
        countIn: {
          remainingBeats: 4,
          totalBeats: 4,
          timingSource: 'fixed-window',
        },
      },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'manga-frame',
      reducedMotion: true,
    });

    expect(elements.root.hidden).toBe(true);
    expect(elements.mangaBubbles.hidden).toBe(true);
    expect(elements.mangaBubbles.children).toHaveLength(0);
    expect(elements.mangaBubbles.dataset.mangaCount).toBeUndefined();
    expect(elements.ktvCountIn.hidden).toBe(true);
  });

  it('restarts a vocal section and its countdown on the first KTV lane', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'zh-Hant',
        ktv: {
          visible: true,
          currentText: '第二段第一句',
          nextText: '第二段第二句',
          currentVisibleLineIndex: 3,
          nextVisibleLineIndex: 4,
          currentLaneIndex: 0,
          nextLaneIndex: 1,
          lineProgress: 0,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'fallback',
            visibleLineIndex: 3,
            laneIndex: 0,
          },
        },
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.ktvCountIn.dataset.ktvLane).toBe('a');
  });

  it('places an overlapping slow-BPM count-in on the upcoming KTV lane', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '副歌尾句',
        nextText: '慢歌下段',
        ktv: {
          visible: true,
          currentText: '副歌尾句',
          nextText: '慢歌下段',
          currentVisibleLineIndex: 0,
          nextVisibleLineIndex: 1,
          currentRole: 'male',
          nextRole: 'female',
          lineProgress: 0.8,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'tempo',
            visibleLineIndex: 1,
            role: 'female',
          },
        },
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.textContent).toBe('副歌尾句');
    expect(elements.next.textContent).toBe('慢歌下段');
    expect(elements.ktvCountIn.hidden).toBe(false);
    expect(elements.ktvCountIn.dataset.ktvLane).toBe('b');
    expect(elements.ktvCountIn.dataset.ktvRole).toBe('female');
  });

  it('renders external lyrics as text and clears hidden state', () => {
    const elements = domElements();
    const malicious = '<img src=x onerror=alert(1)>';

    renderLyricsFrame(elements, {
      revision: 2,
      visible: true,
      currentText: malicious,
      nextText: '下一句',
      language: 'zh-Hant',
    });

    expect(elements.current.textContent).toBe(malicious);
    expect(elements.next.textContent).toBe('下一句');
    expect(elements.root.hidden).toBe(false);
    expect(elements.root.lang).toBe('zh-Hant');
  });

  it('keeps a Classic KTV T1 line mounted and does not restart its sweep on clock-only updates', () => {
    const elements = domElements();
    const animation = { cancel: vi.fn() };
    elements.current.animate.mockReturnValue(animation);
    const baseFrame = {
      revision: 1,
      visible: true,
      currentText: '同一句保持穩定',
      currentVisibleLineIndex: 0,
      nextText: '下一句',
      nextVisibleLineIndex: 1,
      lineIndex: 0,
      lineProgress: 0.2,
      lineRemainingMs: 4000,
    };

    renderLyricsFrame(elements, baseFrame, { templateId: 'karaoke-stack' });
    const currentWrites = elements.current.textContentWriteCount;
    const nextWrites = elements.next.textContentWriteCount;

    renderLyricsFrame(
      elements,
      {
        ...baseFrame,
        revision: 2,
        lineProgress: 0.35,
        lineRemainingMs: 3000,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.textContentWriteCount).toBe(currentWrites);
    expect(elements.next.textContentWriteCount).toBe(nextWrites);
    expect(elements.current.animate).toHaveBeenCalledOnce();
    expect(animation.cancel).not.toHaveBeenCalled();
  });

  it('traces one Classic KTV sweep start followed by reuse without logging lyric text', () => {
    const elements = domElements();
    const trace = vi.fn();
    elements.current.animate.mockReturnValue({ cancel: vi.fn() });
    const frame = {
      revision: 1,
      visible: true,
      currentText: '不可寫入診斷的歌詞',
      currentVisibleLineIndex: 2,
      nextText: '',
      lineIndex: 2,
      lineProgress: 0.2,
      lineRemainingMs: 4000,
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'karaoke-stack',
      trace,
    });
    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, lineProgress: 0.4, lineRemainingMs: 3000 },
      { templateId: 'karaoke-stack', trace },
    );

    expect(trace).toHaveBeenCalledWith(
      'sweep-start',
      expect.objectContaining({ lineIndex: 2, mode: 't1', revision: 1 }),
    );
    expect(trace).toHaveBeenCalledWith(
      'sweep-reuse',
      expect.objectContaining({ lineIndex: 2, mode: 't1', revision: 2 }),
    );
    expect(JSON.stringify(trace.mock.calls)).not.toContain(
      '不可寫入診斷的歌詞',
    );
  });

  it('preserves render failures when diagnostics are disabled', () => {
    expect(() =>
      renderLyricsFrameSafely(
        { root: null, current: null, next: null },
        { revision: 19 },
        { templateId: 'karaoke-stack' },
      ),
    ).toThrow(TypeError);
  });

  it('resynchronizes a mounted Classic KTV line only when playback pauses, resumes, or seeks', () => {
    const elements = domElements();
    const firstAnimation = { cancel: vi.fn() };
    const resumedAnimation = { cancel: vi.fn() };
    const seekAnimation = { cancel: vi.fn() };
    elements.current.animate
      .mockReturnValueOnce(firstAnimation)
      .mockReturnValueOnce(resumedAnimation)
      .mockReturnValueOnce(seekAnimation);
    const frame = {
      revision: 1,
      visible: true,
      currentText: '暫停與 seek 不換字',
      currentVisibleLineIndex: 0,
      nextText: '',
      lineIndex: 0,
      lineProgress: 0.2,
      lineRemainingMs: 4000,
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });
    const textWrites = elements.current.textContentWriteCount;
    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, lineProgress: 0.4, lineRemainingMs: null },
      { templateId: 'karaoke-stack' },
    );

    expect(firstAnimation.cancel).toHaveBeenCalledOnce();
    expect(elements.current.style.values['--ovl-segment-progress']).toBe('40%');
    expect(elements.current.textContentWriteCount).toBe(textWrites);

    renderLyricsFrame(
      elements,
      { ...frame, revision: 3, lineProgress: 0.4, lineRemainingMs: 3000 },
      { templateId: 'karaoke-stack' },
    );
    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 4,
        lineProgress: 0.7,
        lineRemainingMs: 1500,
        timelineDiscontinuity: true,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(resumedAnimation.cancel).toHaveBeenCalledOnce();
    expect(elements.current.animate).toHaveBeenCalledTimes(3);
    expect(elements.current.textContentWriteCount).toBe(textWrites);
  });

  it('keeps generic caption text mounted on clock-only updates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '普通字幕也不重建',
      nextText: '下一句',
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'quiet-caption',
      reducedMotion: true,
    });
    const currentWrites = elements.current.textContentWriteCount;
    const nextWrites = elements.next.textContentWriteCount;

    renderLyricsFrame(
      elements,
      { ...frame, revision: 2 },
      { templateId: 'quiet-caption', reducedMotion: true },
    );

    expect(elements.current.textContentWriteCount).toBe(currentWrites);
    expect(elements.next.textContentWriteCount).toBe(nextWrites);
  });

  it('reuses T2 segment nodes and active sweep animations on clock-only updates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '逐字保持穩定',
      nextText: '',
      lineIndex: 0,
      currentVisibleLineIndex: 0,
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: '逐字',
          state: 'active',
          progress: 0.2,
          remainingMs: 800,
        },
        {
          segmentId: 'segment-2',
          text: '保持穩定',
          state: 'upcoming',
          progress: 0,
        },
      ],
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });
    const segmentNodes = [...elements.current.children];

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentSegments: [
          { ...frame.currentSegments[0], progress: 0.4, remainingMs: 600 },
          frame.currentSegments[1],
        ],
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.children).toEqual(segmentNodes);
    expect(segmentNodes[0].animate).toHaveBeenCalledOnce();
  });

  it('keeps KTV timing nodes and authored spacing mounted across vocal start', () => {
    const elements = domElements();
    const segments = [
      {
        segmentId: 'estimate-0',
        text: "Time's ",
        state: 'upcoming',
        progress: 0,
      },
      {
        segmentId: 'estimate-1',
        text: 'up,',
        state: 'upcoming',
        progress: 0,
      },
    ];
    const frame = {
      revision: 1,
      visible: true,
      currentText: "Time's up,",
      nextText: '설명할 시간 없어',
      language: 'en',
      lineIndex: 0,
      currentVisibleLineIndex: 0,
      nextVisibleLineIndex: 1,
      currentSegments: segments,
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'karaoke-stack',
      reducedMotion: true,
    });
    const timingNodes = [...elements.current.children];

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentSegments: [
          {
            ...segments[0],
            state: 'active',
            progress: 0.2,
            remainingMs: 800,
          },
          segments[1],
        ],
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.children).toEqual(timingNodes);
    expect(timingNodes.map((node) => node.textContent)).toEqual([
      "Time's ",
      'up,',
    ]);
    expect(elements.current.textContent).toBe(frame.currentText);
  });

  it('keeps upcoming T2 glyph nodes mounted across a continuous KTV lane handoff', () => {
    const elements = domElements();
    const upcomingSegments = [
      {
        segmentId: 'b-1',
        text: 'B ',
        state: 'upcoming',
        progress: 0,
      },
      {
        segmentId: 'b-2',
        text: 'line',
        state: 'upcoming',
        progress: 0,
      },
    ];

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'A line',
        nextText: 'B line',
        language: 'en',
        lineIndex: 0,
        currentVisibleLineIndex: 0,
        nextVisibleLineIndex: 1,
        currentLaneIndex: 0,
        nextLaneIndex: 1,
        currentSegments: [
          {
            segmentId: 'a-1',
            text: 'A line',
            state: 'active',
            progress: 0.5,
            remainingMs: 1000,
          },
        ],
        nextSegments: upcomingSegments,
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );
    const laneBGlyphs = [...elements.next.children];

    expect(laneBGlyphs).toHaveLength(2);

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'A line',
        nextText: 'B line',
        language: 'en',
        lineIndex: 0,
        lineProgress: 1,
        currentVisibleLineIndex: 0,
        nextVisibleLineIndex: 1,
        currentLaneIndex: 0,
        nextLaneIndex: 1,
        currentSegments: [
          {
            segmentId: 'a-1',
            text: 'A line',
            state: 'past',
            progress: 1,
          },
        ],
        nextSegments: upcomingSegments,
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.next.children).toEqual(laneBGlyphs);

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'B line',
        nextText: 'A again',
        language: 'en',
        lineIndex: 1,
        currentVisibleLineIndex: 1,
        nextVisibleLineIndex: 2,
        currentLaneIndex: 1,
        nextLaneIndex: 2,
        laneReplacementDelayMs: 0,
        currentSegments: [
          {
            ...upcomingSegments[0],
            state: 'active',
            progress: 0.2,
            remainingMs: 800,
          },
          upcomingSegments[1],
        ],
        nextSegments: [
          {
            segmentId: 'a-3',
            text: 'A again',
            state: 'upcoming',
            progress: 0,
          },
        ],
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.next.children).toEqual(laneBGlyphs);
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.next.dataset.ktvActive).toBe('true');
    expect(laneBGlyphs[0].animate).toHaveBeenCalledOnce();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'B line',
        nextText: 'A again',
        language: 'en',
        lineIndex: 1,
        currentVisibleLineIndex: 1,
        nextVisibleLineIndex: 2,
        currentLaneIndex: 1,
        nextLaneIndex: 2,
        currentSegments: [
          {
            ...upcomingSegments[0],
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
          upcomingSegments[1],
        ],
        nextSegments: [
          {
            segmentId: 'a-3',
            text: 'A again',
            state: 'upcoming',
            progress: 0,
          },
        ],
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.next.children).toEqual(laneBGlyphs);
    expect(laneBGlyphs[0].animate).toHaveBeenCalledOnce();
  });

  it('renders both T2 lanes from the explicit-role KTV frame used by Output', () => {
    const elements = domElements();
    const trace = vi.fn();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: false,
        currentText: '',
        nextText: '',
        ktv: {
          visible: true,
          currentText: '誰說每天都晴朗',
          nextText: '就算洩氣我也不必假裝',
          language: 'zh-Hant',
          lineIndex: 15,
          currentVisibleLineIndex: 19,
          nextVisibleLineIndex: 20,
          currentLaneIndex: 18,
          nextLaneIndex: 19,
          currentRole: 'solo',
          nextRole: 'solo',
          currentSegments: [
            {
              segmentId: 'line:15:word:0',
              text: '誰說每天都晴朗',
              state: 'active',
              progress: 0.2,
              remainingMs: 800,
            },
          ],
          nextSegments: [
            {
              segmentId: 'line:16:word:0',
              text: '就算洩氣我也不必假裝',
              state: 'upcoming',
              progress: 0,
            },
          ],
          countIn: null,
        },
      },
      { templateId: 'karaoke-stack', reducedMotion: true, trace },
    );

    expect(elements.current.textContent).toBe('誰說每天都晴朗');
    expect(elements.current.children).toHaveLength(1);
    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.next.textContent).toBe('就算洩氣我也不必假裝');
    expect(elements.next.children).toHaveLength(1);
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(trace).toHaveBeenCalledWith(
      'ktv-layout',
      expect.objectContaining({
        currentLaneIndex: 18,
        currentSegmentCount: 1,
        currentVisibleLineIndex: 19,
        nextLaneIndex: 19,
        nextSegmentCount: 1,
        nextVisibleLineIndex: 20,
        revision: 1,
        hosts: {
          current: expect.objectContaining({
            active: true,
            childCount: 1,
            lane: 'a',
            segmented: true,
          }),
          next: expect.objectContaining({
            active: false,
            childCount: 1,
            lane: 'b',
            segmented: true,
          }),
        },
      }),
    );
  });

  it('keeps Live Stage caption line nodes mounted on clock-only updates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '第一行\n第二行',
      nextText: '',
      language: 'zh-Hant',
      lineIndex: 0,
      liveStage: {
        active: true,
        cardVisible: false,
        trackId: 'track-1',
        title: 'Song',
        artist: 'Singer',
      },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'live-stage',
      reducedMotion: true,
    });
    const captionLines = [...elements.current.children];

    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, lineProgress: 0.25 },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.current.children).toEqual(captionLines);
  });

  it('keeps one static Manga Frame bubble mounted across timing-only updates', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '漫画保持穩定',
      nextText: '',
      language: 'zh-Hant',
      lineIndex: 0,
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: '漫画保持穩定',
          state: 'active',
          progress: 0.2,
          remainingMs: 800,
        },
      ],
    };

    renderLyricsFrame(elements, frame, { gsap, templateId: 'manga-frame' });
    timelines[0].options.onComplete();
    const bubble = elements.mangaBubbles.children[0];
    const text = bubble.children[1];

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentSegments: [
          { ...frame.currentSegments[0], progress: 0.4, remainingMs: 600 },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.mangaBubbles.children[0]).toBe(bubble);
    expect(bubble.children[1]).toBe(text);
    expect(text.children).toHaveLength(0);
    expect(text.textContent).toBe('漫画保持穩定');
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('rebuilds Manga frame metrics when the same pure-kanji line changes language', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '長'.repeat(8),
      nextText: '',
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'manga-frame',
      reducedMotion: true,
    });
    const chineseBubble = elements.mangaBubbles.children[0];
    expect(chineseBubble.dataset.mangaColumns).toBe('1');

    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, language: 'ja' },
      { templateId: 'manga-frame', reducedMotion: true },
    );
    const japaneseBubble = elements.mangaBubbles.children[0];
    expect(japaneseBubble).not.toBe(chineseBubble);
    expect(japaneseBubble.dataset.mangaColumns).toBe('2');
    expect(
      japaneseBubble.style.values['--ovl-manga-frame-required-block-size'],
    ).toBe('8.06em');
  });

  it('keeps the Manga fallback static when its bubble container is unavailable', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();
    elements.mangaBubbles = null;

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'fallback stays still',
        nextText: '',
        language: 'en',
        lineIndex: 0,
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: 'fallback stays still',
            state: 'active',
            progress: 0.2,
            remainingMs: 800,
          },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.current.children).toHaveLength(0);
    expect(elements.current.textContent).toBe('fallback stays still');
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('keeps Classic KTV A and B as fixed lanes while the active lyric alternates in place', () => {
    const elements = domElements();
    const scheduled = [];
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback, delayMs) => {
        const token = { callback, delayMs };
        scheduled.push(token);
        return token;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'A 正在唱',
        currentVisibleLineIndex: 0,
        nextText: 'B 等待中',
        nextVisibleLineIndex: 1,
        language: 'zh-Hant',
        lineIndex: 0,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.root.dataset.ktvActiveLane).toBe('a');

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'B 等待中',
        currentVisibleLineIndex: 1,
        nextText: 'A 換成下一句',
        nextVisibleLineIndex: 2,
        language: 'zh-Hant',
        lineIndex: 1,
        lineProgress: 0.65,
      },
      options,
    );

    expect(elements.next.textContent).toBe('B 等待中');
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.current.textContent).toBe('A 正在唱');
    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.dataset.ktvHeld).toBe('true');
    expect(elements.root.dataset.ktvActiveLane).toBe('b');
    expect(scheduled[0]?.delayMs).toBe(600);

    scheduled[0].callback();

    expect(elements.current.textContent).toBe('A 換成下一句');
    expect(elements.current.dataset).not.toHaveProperty('ktvHeld');

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'A 換成下一句',
        currentVisibleLineIndex: 2,
        nextText: 'B 再換下一句',
        nextVisibleLineIndex: 3,
        language: 'zh-Hant',
        lineIndex: 3,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.next.textContent).toBe('B 等待中');
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.root.dataset.ktvActiveLane).toBe('a');
  });

  it('keeps a lyric on its logical lane when the other lane disappears', () => {
    const elements = domElements();
    let release;
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback) => {
        release = callback;
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '讀完了依賴',
        currentVisibleLineIndex: 1,
        nextText: '我很快就離開',
        nextVisibleLineIndex: 2,
        language: 'zh-Hant',
        lineIndex: 1,
      },
      options,
    );

    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.textContent).toBe('我很快就離開');

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '我很快就離開',
        currentVisibleLineIndex: 2,
        nextText: '',
        nextVisibleLineIndex: null,
        language: 'zh-Hant',
        lineIndex: 2,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.textContent).toBe('我很快就離開');
    expect(elements.next.textContent).toBe('讀完了依賴');

    release();

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.textContent).toBe('我很快就離開');
    expect(elements.next.textContent).toBe('');
  });

  it('reconstructs a completed final-pair companion without a renderer timer', () => {
    const elements = domElements();
    const schedule = vi.fn();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: false,
        currentText: '',
        nextText: '',
        ktv: {
          visible: true,
          currentText: "If it's gonna be a BAD DAY",
          currentVisibleLineIndex: 1,
          nextText: 'You will shine',
          nextVisibleLineIndex: 0,
          nextHeld: true,
          language: 'en',
          lineIndex: 1,
          lineProgress: 1,
          currentRole: 'solo',
          nextRole: 'solo',
          countIn: null,
        },
      },
      {
        templateId: 'karaoke-stack',
        reducedMotion: true,
        schedule,
      },
    );

    expect(elements.next.textContent).toBe("If it's gonna be a BAD DAY");
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.current.textContent).toBe('You will shine');
    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.dataset.ktvHeld).toBe('true');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('uses explicit vocal roles, strips speaker cues, and keeps the completed role during the hold', () => {
    const elements = domElements();
    let release;
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback) => {
        release = callback;
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '[男] 他的歌詞',
        currentVisibleLineIndex: 0,
        nextText: '[女]她的歌詞',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );

    expect(elements.current.textContent).toBe('他的歌詞');
    expect(elements.current.dataset.ktvRole).toBe('male');
    expect(elements.next.textContent).toBe('她的歌詞');
    expect(elements.next.dataset.ktvRole).toBe('female');

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '[女]她的歌詞',
        currentVisibleLineIndex: 1,
        nextText: '[合] 一起唱',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
        lineProgress: 0,
      },
      options,
    );

    expect(elements.next.textContent).toBe('她的歌詞');
    expect(elements.next.dataset.ktvRole).toBe('female');
    expect(elements.current.textContent).toBe('他的歌詞');
    expect(elements.current.dataset.ktvRole).toBe('male');
    expect(elements.current.dataset.ktvHeld).toBe('true');

    release();

    expect(elements.current.textContent).toBe('一起唱');
    expect(elements.current.dataset.ktvRole).toBe('group');
    expect(elements.current.dataset).not.toHaveProperty('ktvHeld');
  });

  it('removes an explicit KTV speaker cue from the first T2 segment without changing its projection', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '[女] 歌詞',
        currentVisibleLineIndex: 0,
        currentSegments: [
          {
            segmentId: 'first-word',
            text: '[女] 歌',
            state: 'active',
            progress: 0.25,
            remainingMs: 900,
          },
          {
            segmentId: 'second-word',
            text: '詞',
            state: 'upcoming',
            progress: 0,
          },
        ],
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 0,
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.textContent).toBe('歌詞');
    expect(elements.current.children).toHaveLength(2);
    expect(elements.current.children[0]).toMatchObject({
      textContent: '歌',
      dataset: expect.objectContaining({
        segmentId: 'first-word',
        segmentState: 'active',
      }),
    });
    expect(elements.current.children[1]).toMatchObject({
      textContent: '詞',
      dataset: expect.objectContaining({ segmentId: 'second-word' }),
    });
    expect(elements.current.dataset.ktvRole).toBe('female');
  });

  it('keeps Classic KTV lanes still while preserving generic lyric entrance motion', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '固定不抖動',
      currentVisibleLineIndex: 0,
      nextText: '下一句',
      nextVisibleLineIndex: 1,
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });

    expect(elements.current.animate).not.toHaveBeenCalled();

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentText: '其他模板仍可動態進場',
        lineIndex: 1,
      },
      { templateId: 'quiet-caption' },
    );

    expect(elements.current.animate).toHaveBeenCalledWith(
      [
        { opacity: 0.35, transform: 'translateY(0.3em)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  });

  it('estimates Classic KTV sung progress from synced line timing without T2 segments', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '沒有逐字也會掃色',
        currentVisibleLineIndex: 0,
        nextText: '下一句',
        nextVisibleLineIndex: 1,
        language: 'zh-Hant',
        lineIndex: 0,
        lineProgress: 0.25,
        lineRemainingMs: 3000,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.dataset.lineProgress).toBe('true');
    expect(elements.current.dataset.text).toBe('沒有逐字也會掃色');
    expect(elements.current.style.values['--ovl-segment-progress']).toBe('25%');
    expect(elements.current.animate).toHaveBeenCalledWith(
      [
        { '--ovl-segment-progress': '25%' },
        { '--ovl-segment-progress': '100%' },
      ],
      { duration: 3000, easing: 'linear', fill: 'forwards' },
    );
    expect(elements.current.animate).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transform: expect.any(String) }),
      ]),
      expect.anything(),
    );
  });

  it('freezes estimated Classic KTV progress when playback is not advancing', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '暫停在這裡',
        currentVisibleLineIndex: 0,
        nextText: '下一句',
        nextVisibleLineIndex: 1,
        language: 'zh-Hant',
        lineIndex: 0,
        lineProgress: 0.4,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.dataset.lineProgress).toBe('true');
    expect(elements.current.style.values['--ovl-segment-progress']).toBe('40%');
    expect(elements.current.animate).not.toHaveBeenCalled();
  });

  it('does not retain a stale Classic KTV lane after seeking into the middle of a line', () => {
    const elements = domElements();
    const timer = {};
    const schedule = vi.fn(() => timer);
    const cancelSchedule = vi.fn();
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule,
      cancelSchedule,
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '原本的 A',
        currentVisibleLineIndex: 0,
        nextText: '原本的 B',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'B 從起點接唱',
        currentVisibleLineIndex: 1,
        nextText: '新的 A',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
        lineProgress: 0,
      },
      options,
    );

    expect(elements.current.textContent).toBe('原本的 A');
    expect(schedule).toHaveBeenCalledOnce();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'B 從起點接唱',
        currentVisibleLineIndex: 1,
        nextText: '新的 A',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
        lineProgress: 0.65,
        timelineDiscontinuity: true,
      },
      options,
    );

    expect(elements.current.textContent).toBe('新的 A');
    expect(elements.current.dataset).not.toHaveProperty('ktvHeld');
    expect(cancelSchedule).toHaveBeenCalledWith(timer);
  });

  it('does not start a lane hold when seeking into a Classic KTV count-in', () => {
    const elements = domElements();
    const schedule = vi.fn();
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule,
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'Seek 前的 A',
        currentVisibleLineIndex: 0,
        nextText: 'Seek 前的 B',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: false,
        currentText: '',
        nextText: '',
        timelineDiscontinuity: true,
        ktv: {
          visible: true,
          currentText: 'Seek 後的 B',
          currentVisibleLineIndex: 1,
          nextText: 'Seek 後的 A',
          nextVisibleLineIndex: 2,
          lineProgress: 0,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'fixed-window',
          },
        },
      },
      options,
    );

    expect(elements.next.textContent).toBe('Seek 後的 B');
    expect(elements.current.textContent).toBe('Seek 後的 A');
    expect(elements.current.dataset).not.toHaveProperty('ktvHeld');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('briefly keeps the completed Classic KTV lane beside the final line', () => {
    const elements = domElements();
    let release;
    let releaseDelayMs;
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback, delayMs) => {
        release = callback;
        releaseDelayMs = delayMs;
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '倒數第二句',
        currentVisibleLineIndex: 0,
        nextText: '最後一句',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '最後一句',
        currentVisibleLineIndex: 1,
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 1,
        lineProgress: 0,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.textContent).toBe('倒數第二句');
    expect(elements.current.dataset.ktvHeld).toBe('true');
    expect(releaseDelayMs).toBe(600);

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '最後一句',
        currentVisibleLineIndex: 1,
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 1,
        lineProgress: 0.2,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.textContent).toBe('倒數第二句');
    expect(elements.current.dataset.ktvHeld).toBe('true');

    release();

    expect(elements.current.textContent).toBe('');
    expect(elements.current.dataset).not.toHaveProperty('ktvHeld');
  });

  it('uses only the remaining lane hold when a count-in begins', () => {
    const elements = domElements();
    const scheduled = [];
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '副歌尾句',
        currentVisibleLineIndex: 0,
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 0,
        lineProgress: 1,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: false,
        currentText: '',
        nextText: '',
        ktv: {
          visible: true,
          currentText: '下段開頭',
          currentVisibleLineIndex: 1,
          nextText: '下一句',
          nextVisibleLineIndex: 2,
          lineProgress: 0,
          laneReplacementDelayMs: 4500,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'fixed-window',
          },
        },
      },
      options,
    );

    expect(elements.current.textContent).toBe('副歌尾句');
    expect(elements.current.dataset.ktvHeld).toBe('true');
    expect(scheduled[0]?.delayMs).toBe(4500);
  });

  it('cancels a pending Classic KTV lane replacement when the template changes', () => {
    const elements = domElements();
    const timer = {};
    let staleCallback;
    const cancelSchedule = vi.fn();
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback) => {
        staleCallback = callback;
        return timer;
      }),
      cancelSchedule,
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'KTV A',
        currentVisibleLineIndex: 0,
        nextText: 'KTV B',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'KTV B',
        currentVisibleLineIndex: 1,
        nextText: 'KTV A2',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '一般字幕',
        nextText: '一般下一句',
        lineIndex: 1,
      },
      { templateId: 'quiet-caption', reducedMotion: true },
    );

    expect(cancelSchedule).toHaveBeenCalledWith(timer);
    expect(elements.next.textContent).toBe('一般下一句');

    staleCallback();

    expect(elements.next.textContent).toBe('一般下一句');
  });

  it('clears Classic KTV lane metadata when another template takes over', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '固定槽位',
      currentVisibleLineIndex: 0,
      nextText: '下一句',
      nextVisibleLineIndex: 1,
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });
    renderLyricsFrame(elements, frame, { templateId: 'quiet-caption' });

    expect(elements.current.dataset).not.toHaveProperty('ktvLane');
    expect(elements.next.dataset).not.toHaveProperty('ktvLane');
    expect(elements.current.dataset).not.toHaveProperty('ktvRole');
    expect(elements.next.dataset).not.toHaveProperty('ktvRole');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');
    expect(elements.root.dataset).not.toHaveProperty('ktvActiveLane');
  });

  it('keeps an upcoming lyric in its deterministic lane while the active source row is blank', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '',
        currentVisibleLineIndex: null,
        nextText: '空白後的第三個可見句',
        nextVisibleLineIndex: 2,
        language: 'zh-Hant',
        lineIndex: 4,
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.dataset).not.toHaveProperty('ktvLane');
    expect(elements.next.dataset.ktvLane).toBe('a');
    expect(elements.root.dataset).not.toHaveProperty('ktvActiveLane');
  });

  it('renders Live Stage lyrics and its independently visible track card together', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: "[아사]\nBut if you're killing my mood\nGood riddance",
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: "But if you're killing my mood",
            state: 'active',
            progress: 0.5,
            remainingMs: 400,
          },
        ],
        nextText: 'must not render',
        language: 'ko',
        liveStage: {
          active: true,
          cardVisible: true,
          trackId: 'track-1',
          title: 'MOON',
          artist: 'BABYMONSTER',
        },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.root.hidden).toBe(false);
    expect(elements.liveStageChrome.hidden).toBe(false);
    expect(elements.liveStageCard.hidden).toBe(false);
    expect(elements.liveStageTitle.textContent).toBe('MOON');
    expect(elements.liveStageArtist.textContent).toBe('BABYMONSTER');
    expect(elements.current.children).toHaveLength(2);
    expect(elements.current.children.map((line) => line.textContent)).toEqual([
      "But if you're killing my mood",
      'Good riddance',
    ]);
    expect(elements.current.textContent).not.toContain('[아사]');
    expect(elements.current.dataset.segmented).toBeUndefined();
    expect(elements.next.hidden).toBe(true);
    expect(elements.next.textContent).toBe('');
  });

  it('keeps one typography contract for a long asymmetric Live Stage pair', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '[리즈] 네가 보낸 DM을 읽고 나서 답이 없는 게',
        nextText: '',
        language: 'ko',
        lineProgress: 0.5,
        liveStage: { active: true, cardVisible: false },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.current.children.map((line) => line.textContent)).toEqual([
      '네가 보낸 DM을',
      '읽고 나서 답이 없는 게',
    ]);
    expect(elements.root.dataset.liveStageCaptionLength).toBeUndefined();
  });

  it('keeps Live Stage chrome visible without lyrics and hides an absent artist safely', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: false,
        currentText: '',
        nextText: '',
        language: '',
        liveStage: {
          active: true,
          cardVisible: false,
          trackId: 'track-1',
          title: 'Instrumental',
          artist: '',
        },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.root.hidden).toBe(false);
    expect(elements.liveStageChrome.hidden).toBe(false);
    expect(elements.liveStageCard.hidden).toBe(true);
    expect(elements.liveStageArtist.hidden).toBe(true);
    expect(elements.current.hidden).toBe(true);
  });

  it('does not send empty Manga target lists through GSAP during Live Stage cleanup', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '一二三四五六 七八九十甲乙',
        nextText: '',
        language: 'zh-Hant',
        liveStage: {
          active: true,
          cardVisible: false,
          trackId: 'track-1',
          title: 'Song',
          artist: 'Singer',
        },
      },
      { gsap, templateId: 'live-stage', reducedMotion: true },
    );

    const emptyTargetCalls = [
      ...gsap.killTweensOf.mock.calls,
      ...gsap.set.mock.calls,
    ].filter(([target]) => Array.isArray(target) && target.length === 0);
    expect(emptyTargetCalls).toEqual([]);
  });

  it('uses one interruptible GSAP timeline to dismiss the Live Stage card', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const baseFrame = {
      revision: 4,
      visible: true,
      currentText: '歌詞仍然顯示',
      nextText: '',
      language: 'zh-Hant',
      liveStage: {
        active: true,
        cardVisible: true,
        trackId: 'track-1',
        title: '如果可以',
        artist: '韋禮安',
      },
    };

    renderLyricsFrame(elements, baseFrame, {
      gsap,
      templateId: 'live-stage',
      reducedMotion: true,
    });
    renderLyricsFrame(
      elements,
      {
        ...baseFrame,
        revision: 5,
        liveStage: { ...baseFrame.liveStage, cardVisible: false },
      },
      { gsap, templateId: 'live-stage' },
    );

    expect(timelines).toHaveLength(1);
    expect(timelines[0].tweens).toHaveLength(1);
    expect(timelines[0].tweens[0]).toMatchObject({
      target: elements.liveStageCard,
      vars: {
        autoAlpha: 0,
        x: 24,
        duration: 0.18,
        ease: 'power2.in',
        overwrite: 'auto',
      },
    });
    expect(elements.current.textContent).toBe('歌詞仍然顯示');

    timelines[0].options.onComplete();
    expect(elements.liveStageCard.hidden).toBe(true);
  });

  it('interrupts the Live Stage card entrance when its playback window closes', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const liveStage = {
      active: true,
      cardVisible: true,
      trackId: 'track-1',
      title: '海螺記',
      artist: '163braces',
    };

    renderLyricsFrame(
      elements,
      {
        revision: 6,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'zh-Hant',
        liveStage,
      },
      { gsap, templateId: 'live-stage' },
    );
    renderLyricsFrame(
      elements,
      {
        revision: 7,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'zh-Hant',
        liveStage: { ...liveStage, cardVisible: false },
      },
      { gsap, templateId: 'live-stage' },
    );

    expect(timelines).toHaveLength(2);
    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(timelines[1].tweens[0]).toMatchObject({
      target: elements.liveStageCard,
      vars: { autoAlpha: 0, duration: 0.18 },
    });
  });

  it('clears Live Stage accessibility metadata when another template takes over', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 8,
        visible: true,
        currentText: '[리즈]\nLive Stage line',
        nextText: '',
        language: 'ko',
        liveStage: {
          active: true,
          cardVisible: false,
          trackId: 'track-1',
          title: 'Song',
          artist: 'Singer',
        },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );
    expect(elements.root.attributes['aria-label']).toBe(
      '[리즈]\nLive Stage line',
    );

    renderLyricsFrame(
      elements,
      {
        revision: 9,
        visible: true,
        currentText: 'Quiet caption line',
        nextText: '',
        language: 'en',
      },
      { templateId: 'quiet-caption', reducedMotion: true },
    );

    expect(elements.root.attributes['aria-label']).toBeUndefined();
  });

  it('fades one Manga utterance as one whole bubble', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'previous line',
        nextText: '',
        language: 'en',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    const outgoingBubble = elements.mangaBubbles.children[0];

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'current line',
        nextText: 'must not render',
        language: 'en',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.current.textContent).toBe('previous line');
    expect(elements.next.textContent).toBe('');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toEqual(['exit']);
    expect(timelines[0].tweens[0]).toMatchObject({
      target: [outgoingBubble],
      vars: {
        autoAlpha: 0,
        duration: 0.14,
        ease: 'power2.in',
        overwrite: 'auto',
        stagger: { each: 0.06, from: 'start' },
      },
    });
    expect(elements.current.animate).not.toHaveBeenCalled();

    timelines[0].additions[0]();

    expect(elements.current.textContent).toBe('current line');
    expect(elements.next.textContent).toBe('');
    const bubble = elements.mangaBubbles.children[0];
    expect(gsap.set).toHaveBeenCalledWith([bubble], { autoAlpha: 0 });
    expect(timelines[0].labels).toEqual(['exit', 'enter']);
    expect(timelines[0].tweens[1]).toMatchObject({
      position: 'enter',
      target: bubble,
      vars: {
        autoAlpha: 1,
        duration: 0.16,
        ease: 'power2.out',
        overwrite: 'auto',
      },
    });
    expect(elements.root.dataset).toMatchObject({
      mangaFrame: 'spoken',
      mangaLength: 'short',
      mangaSide: 'right',
    });
    expect(bubble.dataset.mangaSide).toBe('right');
    expect(bubble.dataset.mangaOrder).toBe('1');
    expect(bubble.style.values['--ovl-manga-anchor-y']).toMatch(/%$/);
    expect(bubble.style.values['--ovl-manga-inline-jitter']).toMatch(/rem$/);
  });

  it('renders every Manga T1 phrase and parenthetical as an independent bubble', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'マニュアル 私だけにフォーカス （フォーカス）',
        nextText: '',
        language: 'und',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.root.attributes['aria-label']).toBe(
      'マニュアル 私だけにフォーカス （フォーカス）',
    );
    expect(elements.mangaBubbles.dataset.mangaCount).toBe('3');
    expect(elements.mangaBubbles.children).toHaveLength(3);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.dataset.lyricKind),
    ).toEqual(['main', 'main', 'aside']);
    expect(
      elements.mangaBubbles.children.map((bubble) =>
        bubble.textContent.replace(/\n/gu, ''),
      ),
    ).toEqual(['マニュアル', '私だけにフォーカス', 'フォーカス']);
    expect(
      elements.mangaBubbles.children.map(
        (bubble) => bubble.dataset.mangaColumns,
      ),
    ).toEqual(['1', '2', '1']);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.dataset.mangaSide),
    ).toEqual(['right', 'left', 'right']);
    expect(
      elements.mangaBubbles.children.map((bubble) =>
        Number.parseFloat(bubble.style.values['--ovl-manga-anchor-y']),
      ),
    ).toEqual(
      elements.mangaBubbles.children
        .map((bubble) =>
          Number.parseFloat(bubble.style.values['--ovl-manga-anchor-y']),
        )
        .sort((a, b) => a - b),
    );
    expect(
      elements.mangaBubbles.children.every(
        (bubble) =>
          bubble.children[0].attributes.class ===
            'lyrics-overlay__manga-frame' &&
          bubble.children[1].className === 'lyrics-overlay__manga-text',
      ),
    ).toBe(true);
    expect(elements.mangaBubbles.children[2].children[0].dataset.frameId).toBe(
      'whisper',
    );
  });

  it('renders adjacent Japanese quoted clauses as two independent Manga bubbles', () => {
    const elements = domElements();
    const first = '「アンタちょっと問題がある」';
    const second = '「アンタちょっと問題よ」';

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: `${first}${second}`,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.mangaBubbles.dataset.mangaCount).toBe('2');
    expect(elements.mangaBubbles.children).toHaveLength(2);
    expect(
      elements.mangaBubbles.children.map((bubble) =>
        bubble.textContent.replace(/\n/gu, ''),
      ),
    ).toEqual([first, second]);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.dataset.mangaSide),
    ).toEqual(['right', 'left']);
  });

  it('keeps sentence punctuation attached while rendering quoted Manga bubbles', () => {
    const elements = domElements();
    const first = '「本当だ」。';
    const second = '「次だ」';

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: `${first}${second}`,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.mangaBubbles.dataset.mangaCount).toBe('2');
    expect(
      elements.mangaBubbles.children.map((bubble) =>
        bubble.textContent.replace(/\n/gu, ''),
      ),
    ).toEqual([first, second]);
  });

  it('renders existing Japanese readings as literal semantic ruby and honors the off setting', () => {
    const frame = {
      revision: 3,
      visible: true,
      currentText: '地下鉄に飲み込まれる',
      currentReading: {
        text: '地下鉄に飲み込まれる',
        segments: [
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: 'に' },
          { text: '飲み込まれる', reading: 'のみこまれる' },
        ],
      },
      nextText: '',
      language: 'ja',
      lineIndex: 0,
    };
    const elements = domElements();
    elements.root.ownerDocument.documentElement = {
      dataset: { ovlFurigana: 'auto' },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'manga-frame',
      reducedMotion: true,
    });

    const text = elements.mangaBubbles.children[0].children[1];
    const rubyElements = text.children.filter(
      (child) => child.localName === 'ruby',
    );
    expect(rubyElements).toHaveLength(2);
    expect(rubyElements[0].textContent).toBe('地下鉄ちかてつ');
    expect(rubyElements[0].children[0]).toMatchObject({
      localName: 'rt',
      textContent: 'ちかてつ',
    });
    expect(elements.root.attributes['aria-label']).toBe(frame.currentText);

    const plain = domElements();
    plain.root.ownerDocument.documentElement = {
      dataset: { ovlFurigana: 'off' },
    };
    renderLyricsFrame(plain, frame, {
      templateId: 'manga-frame',
      reducedMotion: true,
    });
    expect(
      plain.root.ownerDocument.createElement.mock.calls.some(
        ([name]) => name === 'ruby' || name === 'rt',
      ),
    ).toBe(false);
  });

  it('keeps und pure-kanji Manga columns unchanged when furigana is off', () => {
    const frame = {
      revision: 3,
      visible: true,
      currentText: '地下鉄最高品質',
      currentReading: {
        text: '地下鉄最高品質',
        segments: [
          { text: '地下鉄', reading: 'ちかてつ' },
          { text: '最高', reading: 'さいこう' },
          { text: '品質', reading: 'ひんしつ' },
        ],
      },
      nextText: '',
      language: 'und',
      lineIndex: 0,
    };
    const auto = domElements();
    auto.root.ownerDocument.documentElement = {
      dataset: { ovlFurigana: 'auto' },
    };
    const off = domElements();
    off.root.ownerDocument.documentElement = {
      dataset: { ovlFurigana: 'off' },
    };

    renderLyricsFrame(auto, frame, {
      templateId: 'manga-frame',
      reducedMotion: true,
    });
    renderLyricsFrame(off, frame, {
      templateId: 'manga-frame',
      reducedMotion: true,
    });

    expect(off.mangaBubbles.children[0].dataset.mangaColumns).toBe(
      auto.mangaBubbles.children[0].dataset.mangaColumns,
    );
    const plainText = off.mangaBubbles.children[0].children[1].textContent;
    const rubyText = auto.mangaBubbles.children[0].children[1].textContent;
    expect(plainText.replace(/\s/gu, '')).toBe(
      rubyText.replace(/ちかてつ|さいこう|ひんしつ|\s/gu, ''),
    );
  });

  it('keeps an aside frame distinct when whisper is the selected main frame', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '主詞 （低語）',
        nextText: '',
        language: 'zh-Hant',
        lineIndex: 0,
      },
      {
        templateId: 'manga-frame',
        mangaFrameId: 'whisper',
        reducedMotion: true,
      },
    );

    expect(elements.mangaBubbles.children[0].children[0].dataset.frameId).toBe(
      'whisper',
    );
    expect(elements.mangaBubbles.children[1].children[0].dataset.frameId).toBe(
      'thought',
    );
  });

  it('keeps a parenthetical-only T2 aside delimiter-free', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '（echo）',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '（echo）',
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
        ],
        nextText: '',
        language: 'en',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    const bubble = elements.mangaBubbles.children[0];
    const text = bubble.children[1];
    expect(bubble.dataset.lyricKind).toBe('aside');
    expect(text.children).toHaveLength(0);
    expect(text.textContent).toBe('echo');
    expect(elements.root.attributes['aria-label']).toBe('（echo）');
  });

  it('reveals each bubble one second after the prior fade completes', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '旧一 旧二 （旧三）',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    const outgoing = [...elements.mangaBubbles.children];

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '新一 新二 （新三）',
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(timelines[0].tweens[0]).toMatchObject({
      target: outgoing,
      vars: {
        autoAlpha: 0,
        duration: 0.14,
        stagger: { each: 0.06, from: 'start' },
      },
    });

    timelines[0].additions[0]();

    const incoming = [...elements.mangaBubbles.children];
    expect(incoming.map((bubble) => bubble.textContent)).toEqual([
      '新一',
      '新二',
      '新三',
    ]);
    expect(gsap.set).toHaveBeenCalledWith(incoming, { autoAlpha: 0 });
    expect(timelines[0].tweens.slice(1)).toMatchObject([
      {
        position: 'enter',
        target: incoming[0],
        vars: { autoAlpha: 1, duration: 0.16 },
      },
      {
        position: '+=1',
        target: incoming[1],
        vars: { autoAlpha: 1, duration: 0.16 },
      },
      {
        position: '+=1',
        target: incoming[2],
        vars: { autoAlpha: 1, duration: 0.16 },
      },
    ]);
  });

  it('grows a Manga frame for long copy without assigning a text resize', () => {
    const elements = domElements();
    const longPhrase = '長'.repeat(25);

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: `短句 ${longPhrase} （echo）`,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    const shortBubble = elements.mangaBubbles.children[0];
    const longBubble = elements.mangaBubbles.children[1];
    expect(
      Number.parseFloat(
        longBubble.style.values['--ovl-manga-frame-required-block-size'],
      ),
    ).toBeGreaterThan(
      Number.parseFloat(
        shortBubble.style.values['--ovl-manga-frame-required-block-size'],
      ),
    );
    expect(longBubble.style.values).not.toHaveProperty(
      '--ovl-manga-text-fit-size',
    );
  });

  it('classifies pure Latin Manga copy without deriving a length-based font size', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'STAND-ALONE',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    const bubble = elements.mangaBubbles.children[0];
    expect(bubble.dataset.mangaScript).toBe('latin');
    expect(bubble.style.values).not.toHaveProperty('--ovl-manga-text-fit-size');
  });

  it('renders deterministic balanced columns instead of an uneven browser wrap', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '長'.repeat(10),
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    const bubble = elements.mangaBubbles.children[0];
    expect(bubble.dataset.mangaColumns).toBe('2');
    expect(bubble.children[1].textContent).toBe(
      `${'長'.repeat(5)}\n${'長'.repeat(5)}`,
    );
    expect(bubble.style.values['--ovl-manga-frame-required-block-size']).toBe(
      '8.06em',
    );
  });

  it('renders authored Manga phrase bubbles as static literal copy', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '前半 後半',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '前半 後半',
            state: 'active',
            progress: 0.5,
            remainingMs: 200,
          },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.mangaBubbles.dataset.mangaCount).toBe('2');
    const textBubbles = elements.mangaBubbles.children.map(
      (bubble) => bubble.children[1],
    );
    expect(textBubbles.map((text) => text.textContent)).toEqual([
      '前半',
      '後半',
    ]);
    expect(textBubbles.every((text) => text.children.length === 0)).toBe(true);
  });

  it('reveals Manga bubbles on same-line T2 boundaries without rebuilding their DOM', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();
    const frame = {
      revision: 3,
      visible: true,
      currentText: '「前半」「後半」',
      currentTimingSource: 't2',
      mangaBubbleTiming: [
        { startMs: 9000, state: 'revealed' },
        { startMs: 13000, state: 'upcoming' },
      ],
      nextText: '',
      language: 'ja',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, {
      gsap,
      templateId: 'manga-frame',
      reducedMotion: true,
    });
    const bubbles = [...elements.mangaBubbles.children];
    const textNodes = bubbles.map((bubble) => bubble.children[1]);

    expect(bubbles.map((bubble) => bubble.dataset.mangaTimingState)).toEqual([
      'revealed',
      'upcoming',
    ]);
    expect(bubbles[0].style.values).toMatchObject({
      opacity: '1',
      visibility: 'visible',
    });
    expect(bubbles[1].style.values).toMatchObject({
      opacity: '0',
      visibility: 'hidden',
    });

    renderLyricsFrame(
      elements,
      {
        ...frame,
        mangaBubbleTiming: [
          { startMs: 9000, state: 'revealed' },
          { startMs: 13000, state: 'revealed' },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.mangaBubbles.children).toEqual(bubbles);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.children[1]),
    ).toEqual(textNodes);
    expect(gsap.to).toHaveBeenCalledWith(
      bubbles[1],
      expect.objectContaining({
        autoAlpha: 1,
        duration: 0.16,
        overwrite: 'auto',
      }),
    );

    renderLyricsFrame(
      elements,
      {
        ...frame,
        timelineDiscontinuity: true,
        mangaBubbleTiming: [
          { startMs: 9000, state: 'revealed' },
          { startMs: 13000, state: 'revealed' },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(gsap.killTweensOf).toHaveBeenCalledWith(bubbles[1]);
    expect(bubbles[1].style.values).toMatchObject({
      opacity: '1',
      visibility: 'visible',
    });
  });

  it('does not apply the fixed one-second entrance gap to T2 Manga bubbles', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '「前半」「後半」',
        currentTimingSource: 't2',
        mangaBubbleTiming: [
          { startMs: 9000, state: 'revealed' },
          { startMs: 13000, state: 'upcoming' },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame' },
    );

    const bubbles = [...elements.mangaBubbles.children];
    expect(timelines[0].tweens).toEqual([
      expect.objectContaining({
        position: 'enter',
        target: bubbles[0],
        vars: expect.objectContaining({ autoAlpha: 1 }),
      }),
    ]);
    expect(bubbles[1].dataset.mangaTimingState).toBe('upcoming');
    expect(bubbles[1].style.values.visibility).toBe('hidden');
  });

  it('hides future Manga bubbles again when a T2 seek moves backward', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();
    const frame = {
      revision: 3,
      visible: true,
      currentText: '「前半」「後半」',
      currentTimingSource: 't2',
      mangaBubbleTiming: [
        { startMs: 9000, state: 'revealed' },
        { startMs: 13000, state: 'revealed' },
      ],
      nextText: '',
      language: 'ja',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, {
      gsap,
      templateId: 'manga-frame',
      reducedMotion: true,
    });
    const bubbles = [...elements.mangaBubbles.children];
    renderLyricsFrame(
      elements,
      {
        ...frame,
        timelineDiscontinuity: true,
        mangaBubbleTiming: [
          { startMs: 9000, state: 'revealed' },
          { startMs: 13000, state: 'upcoming' },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.mangaBubbles.children).toEqual(bubbles);
    expect(bubbles[1].dataset.mangaTimingState).toBe('upcoming');
    expect(bubbles[1].style.values).toMatchObject({
      opacity: '0',
      visibility: 'hidden',
    });
    expect(gsap.killTweensOf).toHaveBeenCalledWith(bubbles[1]);
  });

  it('commits a cross-line T2 seek immediately without a Manga transition', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '舊句',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame' },
    );
    const oldTimeline = timelines[0];

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '「新一」「新二」',
        currentTimingSource: 't2',
        mangaBubbleTiming: [
          { startMs: 14000, state: 'revealed' },
          { startMs: 16000, state: 'upcoming' },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 1,
        timelineDiscontinuity: true,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(oldTimeline.kill).toHaveBeenCalledOnce();
    expect(timelines).toHaveLength(1);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.textContent),
    ).toEqual(['「新一」', '「新二」']);
    expect(
      elements.mangaBubbles.children.map(
        (bubble) => bubble.dataset.mangaTimingState,
      ),
    ).toEqual(['revealed', 'upcoming']);
  });

  it('does not schedule a Manga scan tween across bubble boundaries', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '前半 後半',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '前半 後半',
            state: 'active',
            progress: 0.25,
            remainingMs: 750,
          },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(gsap.to).not.toHaveBeenCalled();
    expect(
      elements.mangaBubbles.children.map(
        (bubble) => bubble.children[1].textContent,
      ),
    ).toEqual(['前半', '後半']);
  });

  it('replaces a multi-bubble M0 line without retaining prior phrase content', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '前半 後半 （echo）',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );
    expect(elements.mangaBubbles.children).toHaveLength(3);

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '新しい行',
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.mangaBubbles.dataset.mangaCount).toBe('1');
    expect(elements.mangaBubbles.children).toHaveLength(1);
    expect(elements.mangaBubbles.textContent).toBe('新しい行');
  });

  it('switches Manga Frame immediately when reduced motion is requested', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'previous line';
    elements.current.dataset.currentText = 'previous line';

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'pending line',
        nextText: '',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame' },
    );

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: 'current line',
        nextText: 'must not render',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.current.textContent).toBe('current line');
    expect(elements.next.textContent).toBe('');
    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(gsap.set).toHaveBeenCalledWith(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
    expect(elements.current.animate).not.toHaveBeenCalled();
  });

  it('fades repeated lyric text when it belongs to a different indexed line', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'repeat',
        nextText: '',
        language: 'en',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    expect(elements.root.dataset.mangaSide).toBe('right');

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: 'repeat',
        nextText: '',
        language: 'en',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toEqual(['exit']);
    expect(elements.root.dataset.mangaSide).toBe('right');

    timelines[0].additions[0]();

    expect(timelines[0].labels).toEqual(['exit', 'enter']);
    expect(elements.root.dataset.mangaSide).toBe('right');
  });

  it('queues same-line snapshots without replacing bubbles during sequential entrance', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '前句',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '新一 新二',
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );
    timelines[0].additions[0]();
    const enteringBubbles = [...elements.mangaBubbles.children];

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '新一 新二',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '新一 新二',
            state: 'active',
            progress: 0.5,
            remainingMs: 500,
          },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.mangaBubbles.children).toEqual(enteringBubbles);
    expect(elements.root.dataset.revision).toBe('3');

    timelines[0].options.onComplete();

    expect(elements.root.dataset.revision).toBe('4');
    expect(elements.mangaBubbles.children).toEqual(enteringBubbles);
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('keeps the final Manga Frame utterance visible until its bubble fades out', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'final line';
    elements.current.dataset.currentText = 'final line';

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.root.hidden).toBe(false);
    expect(elements.current.textContent).toBe('final line');

    timelines[0].additions[0]();

    expect(elements.root.hidden).toBe(true);
    expect(elements.current.textContent).toBe('');
    expect(elements.next.textContent).toBe('');
    expect(elements.root.dataset.mangaSide).toBe('right');
  });

  it('kills an interrupted Manga Frame timeline and animation targets on cleanup', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'previous line';
    elements.current.dataset.currentText = 'previous line';

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: 'first pending line',
        nextText: '',
        language: 'ja',
      },
      { gsap, templateId: 'manga-frame' },
    );
    renderLyricsFrame(
      elements,
      {
        revision: 6,
        visible: true,
        currentText: 'latest line',
        nextText: '',
        language: 'ja',
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(timelines[0].kill).toHaveBeenCalledOnce();
    destroyLyricsAnimations(elements, { gsap });
    expect(timelines[1].kill).toHaveBeenCalledOnce();
    expect(gsap.killTweensOf).toHaveBeenCalledWith(elements.root);
    expect(gsap.set).toHaveBeenCalledWith(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
  });

  it('clears text when no lyric line is active', () => {
    const elements = domElements();
    elements.current.textContent = 'stale';

    renderLyricsFrame(elements, {
      revision: 3,
      visible: false,
      currentText: '',
      nextText: '',
      language: '',
    });

    expect(elements.root.hidden).toBe(true);
    expect(elements.current.textContent).toBe('');
    expect(elements.next.textContent).toBe('');
  });

  it('renders timed segments as literal text nodes with bounded progress fill', () => {
    const elements = domElements();
    const malicious = '<img src=x onerror=alert(1)>';

    renderLyricsFrame(elements, {
      revision: 4,
      visible: true,
      currentText: `${malicious}安全`,
      nextText: '下一句',
      language: 'zh-Hant',
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: malicious,
          state: 'past',
          progress: 1,
          remainingMs: null,
        },
        {
          segmentId: 'segment-2',
          text: '安全',
          state: 'active',
          progress: 0.25,
          remainingMs: 1500,
        },
      ],
    });

    expect(elements.current.children).toHaveLength(2);
    expect(elements.current.children[0].dataset.segmentState).toBe('past');
    expect(elements.current.children[0].dataset.text).toBe(malicious);
    expect(elements.current.children[0].textContent).toBe(malicious);
    const active = elements.current.children[1];
    expect(active.dataset.segmentState).toBe('active');
    expect(active.dataset.text).toBe('安全');
    expect(active.textContent).toBe('安全');
    expect(active.style.values['--ovl-segment-progress']).toBe('25%');
    expect(active.animate).toHaveBeenCalledWith(
      [
        { '--ovl-segment-progress': '25%' },
        { '--ovl-segment-progress': '100%' },
      ],
      expect.objectContaining({ duration: 1500, easing: 'linear' }),
    );
  });

  it('falls back from timed segments to an M0 text line without stale nodes', () => {
    const elements = domElements();
    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: 'segmented line',
        nextText: 'next',
        language: 'en',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: 'segmented line',
            state: 'active',
            progress: 0.5,
            remainingMs: 500,
          },
        ],
      },
      { templateId: 'manga-frame' },
    );

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: 'plain M0 line',
        nextText: '',
        language: 'en',
      },
      { templateId: 'manga-frame' },
    );

    expect(elements.current.children).toHaveLength(0);
    expect(elements.current.dataset).not.toHaveProperty('segmented');
    expect(elements.current.textContent).toBe('plain M0 line');
    expect(elements.next.textContent).toBe('');
  });

  it('ignores Manga Frame T2 paint progress while keeping literal text visible', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: '縦書き',
        nextText: '',
        language: 'ja',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '縦書き',
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
        ],
      },
      { gsap, reducedMotion: true, templateId: 'manga-frame' },
    );

    const reducedMotionText = elements.mangaBubbles.children[0].children[1];
    expect(reducedMotionText.textContent).toBe('縦書き');
    expect(reducedMotionText.children).toHaveLength(0);
    expect(gsap.to).not.toHaveBeenCalled();

    renderLyricsFrame(
      elements,
      {
        revision: 6,
        visible: true,
        currentText: '縦書き',
        nextText: '',
        language: 'ja',
        currentSegments: [
          {
            segmentId: 'segment-2',
            text: '縦書き',
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    const animatedText = elements.mangaBubbles.children[0].children[1];
    expect(animatedText.textContent).toBe('縦書き');
    expect(animatedText.children).toHaveLength(0);
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('keeps paused or reduced-motion segment progress static', () => {
    const elements = domElements();
    const activeFill = vi.fn();
    elements.current.ownerDocument.createElement.mockImplementation(() => {
      const node = element(elements.current.ownerDocument);
      node.animate = activeFill;
      return node;
    });

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: 'paused',
        nextText: '',
        language: 'en',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: 'paused',
            state: 'active',
            progress: 0.5,
            remainingMs: 1000,
          },
        ],
      },
      { reducedMotion: true },
    );

    expect(activeFill).not.toHaveBeenCalled();
    expect(
      elements.current.children[0].style.values['--ovl-segment-progress'],
    ).toBe('50%');
  });

  it('fully highlights an active segment when fractional progress is unavailable', () => {
    const elements = domElements();

    renderLyricsFrame(elements, {
      revision: 6,
      visible: true,
      currentText: 'open',
      nextText: '',
      language: 'en',
      currentSegments: [
        {
          segmentId: 'segment-open',
          text: 'open',
          state: 'active',
          progress: null,
          remainingMs: null,
        },
      ],
    });

    expect(
      elements.current.children[0].style.values['--ovl-segment-progress'],
    ).toBe('100%');
    expect(elements.current.children[0].animate).not.toHaveBeenCalled();
  });

  it('renders again at the next timed lyric boundary without a new snapshot', () => {
    let nowMs = Date.parse('2026-08-22T00:00:00.000Z');
    const scheduled = [];
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => nowMs,
      onFrame: (frame) => frames.push(frame),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });
    const value = {
      version: 2,
      revision: 2,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'ja' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [
          { text: 'first', startMs: 0, endMs: 2000 },
          { text: 'second', startMs: 2000, endMs: 4000 },
        ],
      },
    };

    scheduler.update(value);
    expect(frames.at(-1).currentText).toBe('first');
    expect(scheduled.at(-1).delay).toBe(1000);

    nowMs += 1000;
    scheduled.at(-1).callback();
    expect(frames.at(-1).currentText).toBe('second');
    scheduler.stop();
  });

  it('renders again at the next segment boundary without a new snapshot', () => {
    let nowMs = Date.parse('2026-08-22T00:00:00.000Z');
    const scheduled = [];
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => nowMs,
      onFrame: (frame) => frames.push(frame),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });
    const value = {
      version: 2,
      revision: 6,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [
          {
            text: 'first second',
            startMs: 0,
            endMs: 4000,
            segments: [
              {
                segmentId: 'segment-1',
                text: 'first ',
                startMs: 0,
                endMs: 2000,
              },
              {
                segmentId: 'segment-2',
                text: 'second',
                startMs: 2000,
                endMs: 4000,
              },
            ],
          },
        ],
      },
    };

    scheduler.update(value);
    expect(frames.at(-1).currentSegments[0].state).toBe('active');
    expect(scheduled.at(-1).delay).toBe(1000);

    nowMs += 1000;
    scheduled.at(-1).callback();
    expect(frames.at(-1).currentSegments[1].state).toBe('active');
    scheduler.stop();
  });

  it('applies confident music cues without flashing or moving the active lyric text', () => {
    const frame = {
      revision: 7,
      visible: true,
      currentText: 'chorus line',
      nextText: 'next line',
      language: 'en',
      musicStructure: {
        documentId: 'music-1',
        level: 'M2',
        activeSection: {
          sectionId: 'section-1',
          role: 'chorus',
          confidence: 0.8,
        },
        currentBeat: {
          beatIndex: 4,
          timeMs: 12000,
          elapsedMs: 0,
          positionInBar: 1,
          downbeat: true,
          confidence: 0.75,
        },
      },
    };

    const karaokeElements = domElements();
    renderLyricsFrame(karaokeElements, frame, {
      templateId: 'karaoke-stack',
    });

    expect(karaokeElements.root.dataset).toMatchObject({
      musicLevel: 'M2',
      musicSection: 'chorus',
      musicDownbeat: 'true',
    });
    expect(karaokeElements.current.animate).not.toHaveBeenCalled();

    const mangaElements = domElements();
    const { gsap, timelines } = gsapHarness();
    renderLyricsFrame(mangaElements, frame, {
      gsap,
      reducedMotion: true,
      templateId: 'manga-frame',
    });
    expect(mangaElements.root.dataset).toMatchObject({
      musicLevel: 'M2',
      musicSection: 'chorus',
      musicDownbeat: 'true',
    });
    expect(timelines).toHaveLength(0);
    expect(gsap.to).not.toHaveBeenCalled();

    renderLyricsFrame(
      mangaElements,
      {
        ...frame,
        revision: 8,
        musicStructure: {
          ...frame.musicStructure,
          currentBeat: {
            ...frame.musicStructure.currentBeat,
            beatIndex: 8,
            timeMs: 13000,
          },
        },
      },
      { gsap, templateId: 'manga-frame' },
    );
    expect(timelines).toHaveLength(0);
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('keeps low-confidence, unknown, reduced-motion, and other templates static', () => {
    const frame = {
      revision: 8,
      visible: true,
      currentText: 'line',
      nextText: '',
      language: 'en',
      musicStructure: {
        documentId: 'music-1',
        level: 'M2',
        activeSection: {
          sectionId: 'section-unknown',
          role: 'unknown',
          confidence: 0.9,
        },
        currentBeat: {
          beatIndex: 0,
          timeMs: 1000,
          elapsedMs: 0,
          positionInBar: 1,
          downbeat: true,
          confidence: 0.49,
        },
      },
    };
    for (const options of [
      { templateId: 'manga-frame' },
      { templateId: 'karaoke-stack', reducedMotion: true },
      { templateId: 'manga-frame', reducedMotion: true },
      { templateId: 'focus-line' },
    ]) {
      const elements = domElements();
      renderLyricsFrame(elements, frame, options);
      expect(elements.root.dataset).not.toHaveProperty('musicSection');
      expect(elements.root.dataset).not.toHaveProperty('musicDownbeat');
      expect(elements.current.animate).not.toHaveBeenCalledWith(
        expect.arrayContaining([{ filter: 'brightness(1)' }]),
        expect.anything(),
      );
      expect(elements.root.animate).not.toHaveBeenCalledWith(
        expect.arrayContaining([{ filter: 'brightness(1)' }]),
        expect.anything(),
      );
    }
  });

  it('does not pulse a stale downbeat from an initial mid-beat snapshot', () => {
    const elements = domElements();
    renderLyricsFrame(
      elements,
      {
        revision: 10,
        visible: true,
        currentText: 'line',
        nextText: '',
        language: 'en',
        musicStructure: {
          documentId: 'music-1',
          level: 'M1',
          activeSection: null,
          currentBeat: {
            beatIndex: 0,
            timeMs: 1000,
            elapsedMs: 400,
            positionInBar: 1,
            downbeat: true,
            confidence: 0.9,
          },
        },
      },
      { templateId: 'manga-frame' },
    );

    expect(elements.root.dataset.musicDownbeat).toBe('true');
    expect(elements.current.animate).not.toHaveBeenCalledWith(
      expect.arrayContaining([{ filter: 'brightness(1)' }]),
      expect.anything(),
    );
  });

  it('removes music attributes when presentation returns to M0', () => {
    const elements = domElements();
    elements.root.dataset.musicLevel = 'M2';
    elements.root.dataset.musicSection = 'chorus';
    elements.root.dataset.musicDownbeat = 'true';

    renderLyricsFrame(
      elements,
      {
        revision: 9,
        visible: true,
        currentText: 'unchanged line',
        nextText: '',
        language: 'en',
      },
      { templateId: 'manga-frame' },
    );

    expect(elements.root.dataset).not.toHaveProperty('musicLevel');
    expect(elements.root.dataset).not.toHaveProperty('musicSection');
    expect(elements.root.dataset).not.toHaveProperty('musicDownbeat');
    expect(elements.current.textContent).toBe('unchanged line');
  });

  it('cancels local boundary timers while the runtime is disconnected', () => {
    const scheduled = [];
    const cancelSchedule = vi.fn();
    const scheduler = createLyricsFrameScheduler({
      now: () => Date.parse('2026-08-22T00:00:00.000Z'),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule,
    });
    scheduler.update({
      version: 2,
      revision: 1,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [{ text: 'first', startMs: 0, endMs: 2000 }],
      },
    });

    scheduler.suspend();
    expect(cancelSchedule).toHaveBeenCalledWith(1);
    scheduled[0].callback();
    expect(scheduled).toHaveLength(1);
  });

  it('can refresh the current frame after a template change', () => {
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => Date.parse('2026-08-22T00:00:00.000Z'),
      onFrame: (frame) => frames.push(frame),
      schedule: vi.fn(),
      cancelSchedule: vi.fn(),
    });
    scheduler.update({
      version: 2,
      revision: 1,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'paused',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [{ text: 'first', startMs: 0, endMs: 2000 }],
      },
    });

    scheduler.refresh();
    expect(frames).toHaveLength(2);
    scheduler.stop();
  });

  it('switches the scheduler to the selected template projection only', () => {
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => Date.parse('2026-08-22T00:00:00.000Z'),
      onFrame: (frame) => frames.push(frame),
      schedule: vi.fn(),
      cancelSchedule: vi.fn(),
    });
    scheduler.update({
      version: 2,
      revision: 1,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'paused',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        documentId: 'lyrics-1',
        documentRevision: 4,
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [{ text: 'first line', startMs: 0, endMs: 2000 }],
      },
    });

    expect(frames.at(-1)).not.toHaveProperty('ktv');
    expect(frames.at(-1)).not.toHaveProperty('liveStage');

    scheduler.setTemplateId('karaoke-stack');
    expect(frames.at(-1).ktv).toMatchObject({ visible: true });
    expect(frames.at(-1)).not.toHaveProperty('liveStage');

    const framesBeforeAtomicChange = frames.length;
    scheduler.setPresentationSettings({
      templateId: 'kinetic-pop',
      kineticMaterial: 'candy-rim',
    });
    expect(frames).toHaveLength(framesBeforeAtomicChange + 1);
    expect(frames.at(-1).kineticPop.material).toBe('candy-rim');
    scheduler.setKineticMaterial('chromatic-depth');
    expect(frames.at(-1).kineticPop.material).toBe('chromatic-depth');

    scheduler.setTemplateId('live-stage');
    expect(frames.at(-1).liveStage).toMatchObject({ active: true });
    expect(frames.at(-1)).not.toHaveProperty('ktv');
    scheduler.stop();
  });
});
