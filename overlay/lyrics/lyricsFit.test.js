import { describe, expect, it, vi } from 'vitest';
import { createLyricsFitController } from './lyricsFit.mjs';

describe('lyric fit controller lifecycle', () => {
  it('prepares empty template styles once per invalidation without writing future lyrics', () => {
    const s = surface('focus-line');
    const jobs = [];
    s.window.setTimeout = (callback) => {
      jobs.push(callback);
      return jobs.length;
    };
    s.window.clearTimeout = vi.fn();
    const style = vi.spyOn(s.window, 'getComputedStyle');
    const rect = vi.spyOn(s.elements.current, 'getBoundingClientRect');
    s.controller.prepareStyles();
    s.controller.prepareStyles();
    expect(jobs).toHaveLength(1);
    expect(style).not.toHaveBeenCalled();
    jobs[0]();
    expect(style).toHaveBeenCalledOnce();
    expect(rect).toHaveBeenCalledOnce();
    expect(s.elements.current.textContent).toBeUndefined();
    expect(s.elements.root.dataset).toEqual({});
    s.controller.prepareStyles();
    expect(jobs).toHaveLength(1);
    s.controller.invalidate();
    s.controller.prepareStyles();
    expect(jobs).toHaveLength(2);
    s.controller.suspend();
    s.controller.prepareStyles();
    jobs[1]();
    expect(style).toHaveBeenCalledOnce();
    s.controller.stop();
    jobs[2]();
    expect(style).toHaveBeenCalledOnce();
    expect(s.window.clearTimeout.mock.calls.map(([id]) => id)).toEqual([2, 3]);
  });
  function surface(templateId, options = {}) {
    let reads = 0,
      probes = 0;
    const make = () => {
      const node = {
        textContent: '',
        children: [],
        hidden: false,
        className: '',
        style: {},
        setAttribute() {},
        remove() {
          probes--;
        },
      };
      let contents = '';
      Object.defineProperty(node, 'textContent', {
        get: () => contents,
        set: (value) => {
          contents = value;
          node.children = [];
        },
      });
      node.replaceChildren = (...children) => {
        node.children = children;
        contents = children.map((child) => child.textContent).join('');
      };
      node.cloneNode = () => {
        const clone = make();
        Object.assign(clone.style, node.style);
        return clone;
      };
      node.getBoundingClientRect = () => {
        reads++;
        const vertical = node.style.writingMode === 'vertical-rl';
        const capacity = parseFloat(node.style.inlineSize);
        const length = node.textContent.length * 16;
        const wraps = Number.isFinite(capacity)
          ? Math.max(1, Math.ceil(length / capacity))
          : 1;
        const rect = vertical
          ? {
              width: wraps * 40,
              height: Number.isFinite(capacity) ? capacity : length,
            }
          : {
              width: Number.isFinite(capacity) ? capacity : length,
              height: wraps * 40,
            };
        return node.style.whiteSpace === 'pre-wrap'
          ? (options.wrappedBounds?.(rect, node) ?? rect)
          : rect;
      };
      Object.defineProperty(node, 'scrollWidth', {
        get: () => node.getBoundingClientRect().width,
      });
      Object.defineProperty(node, 'scrollHeight', {
        get: () => node.getBoundingClientRect().height,
      });
      return node;
    };
    const target = {
      getBoundingClientRect: () => ({ width: 750, height: 40 }),
      parentElement: {
        getBoundingClientRect: () => ({ width: 240, height: 300 }),
      },
    };
    const elements = {
      root: {
        dataset: {},
        getBoundingClientRect: () => ({ width: 900, height: 200 }),
      },
      current: { ...target, querySelector: () => null },
      mangaBubbles: { querySelector: () => target },
    };
    const document = {
      createElement: make,
      createTextNode: (text) => ({ textContent: text }),
      body: {
        append: () => {
          probes++;
        },
      },
    };
    const window = {
      innerWidth: 960,
      innerHeight: 540,
      addEventListener() {},
      removeEventListener() {},
      getComputedStyle: () => ({
        fontSize: '32px',
        lineHeight: '40px',
        fontFamily: 'test',
        fontWeight: '400',
        letterSpacing: '0px',
      }),
    };
    const text = 'this is a source-owned sentence. '.repeat(20);
    const snapshot = {
      playback: { status: 'paused', positionMs: 1000 },
      lyrics: { lines: [{ text, startMs: 1000, endMs: 120000 }] },
    };
    const frame = { visible: true, lineIndex: 0, currentText: text };
    return {
      controller: createLyricsFitController({
        elements,
        document,
        window,
        ...options,
      }),
      elements,
      document,
      window,
      snapshot,
      frame,
      settings: { templateId, nowMs: 0, lyricsPresentationPolicyId: 'literal' },
      reads: () => reads,
      probes: () => probes,
    };
  }

  it('records numeric cold measurements and keeps warm preparation free of probes', () => {
    const onTrace = vi.fn();
    const s = surface('focus-line', { onTrace });
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    const measurement = onTrace.mock.calls.find(
      ([event]) => event === 'fit-measure',
    )[1];
    expect(measurement.durationMs).toBeGreaterThanOrEqual(0);
    expect(measurement.probeCount).toBeGreaterThan(0);
    for (const field of [
      'fitStyleMs',
      'fitRootMs',
      'fitTargetMs',
      'fitProbeSetupMs',
      'fitWrappedMs',
      'fitRowsMs',
      'fitPlanMs',
    ])
      expect(measurement[field]).toBeGreaterThanOrEqual(0);
    expect(
      onTrace.mock.calls.some(
        ([event, fields]) => event === 'fit-hit' && fields.cacheHit === 0,
      ),
    ).toBe(true);
    onTrace.mockClear();
    const reads = s.reads();
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(s.reads()).toBe(reads);
    expect(onTrace).toHaveBeenCalledWith('fit-hit', {
      cacheHit: 1,
      lineIndex: 0,
    });
    expect(onTrace.mock.calls.some(([event]) => event === 'fit-measure')).toBe(
      false,
    );
    s.controller.stop();
  });

  it('does not sample phase clocks when tracing is disabled', () => {
    const measureNow = vi.fn(() => 123);
    const s = surface('focus-line', { measureNow });
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(measureNow).not.toHaveBeenCalled();
    s.controller.stop();
  });

  it.each([26, 80, 150])(
    'accepts a %i-glyph Focus page with one wrapped probe and preserves multiline projection',
    (length) => {
      const onTrace = vi.fn();
      const s = surface('focus-line', { onTrace });
      const text = '甲'.repeat(length);
      s.snapshot.lyrics.lines[0].text = text;
      Object.assign(s.frame, {
        currentText: text,
        nextText: 'next line',
        nextSegments: [{ text: 'next line' }],
      });
      const result = s.controller.prepare(s.snapshot, s.frame, s.settings);
      expect(
        onTrace.mock.calls.find(([event]) => event === 'fit-measure')[1]
          .probeCount,
      ).toBe(1);
      expect(s.elements.root.dataset.fitPages).toBe('1');
      expect(s.elements.root.dataset.fitActive).toBe(String(length > 52));
      expect(result.frame.currentText).toBe(text);
      expect(result.frame.nextText).toBe(length > 52 ? '' : 'next line');
      if (length > 52) expect(result.frame.nextSegments).toBeUndefined();
      const reads = s.reads();
      s.controller.prepare(s.snapshot, s.frame, s.settings);
      expect(s.reads()).toBe(reads);
      expect(s.probes()).toBe(0);
      s.controller.stop();
    },
  );

  it('does not accept four wrapped Focus rows as a single page', () => {
    const s = surface('focus-line');
    const text = '甲'.repeat(170);
    s.snapshot.lyrics.lines[0].text = text;
    s.frame.currentText = text;
    const result = s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(result.frame.displayFit.pageCount).toBeGreaterThan(1);
    expect(s.elements.root.dataset.fitActive).toBe('true');
    s.controller.stop();
  });

  it('measures actual fine boxes and distinguishes repeated source occurrences', () => {
    const observations = [];
    const s = surface('focus-line', {
      wrappedBounds: (rect, node) => {
        const boxes = node.children.filter(
          (child) => child.style?.display === 'inline-block',
        ).length;
        observations.push([node.textContent, boxes]);
        return { ...rect, height: node.textContent.length > 4 ? 160 : 40 };
      },
    });
    const text = 'AVAVAVAV';
    s.snapshot.lyrics.lines[0].text = text;
    Object.assign(s.frame, {
      currentText: text,
      currentSegments: [{ text: 'AVAV' }, { text: 'AVAV' }],
      currentFineTiming: {
        units: [
          { unitId: 'first', from: 0, to: 4, startMs: 1000, endMs: 2000 },
        ],
      },
    });
    const result = s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(result.frame.displayFit.pageCount).toBe(2);
    expect(observations).toContainEqual(['AVAV', 4]);
    expect(observations).toContainEqual(['AVAV', 0]);
    s.controller.stop();
  });

  it('rejects four fine rows and keeps partial page/coarse units as plain text', () => {
    const observations = [];
    const s = surface('focus-line', {
      wrappedBounds: (rect, node) => {
        const boxes = node.children.filter(
          (child) => child.style?.display === 'inline-block',
        ).length;
        observations.push([node.textContent.length, boxes]);
        return { ...rect, height: boxes > 36 ? 160 : 40 };
      },
    });
    const text = 'AV'.repeat(24);
    s.snapshot.lyrics.lines[0].text = text;
    Object.assign(s.frame, {
      currentText: text,
      currentSegments: Array.from({ length: 12 }, () => ({ text: 'AVAV' })),
      currentFineTiming: {
        units: Array.from({ length: 12 }, (_, i) => ({
          unitId: String(i),
          from: i * 4,
          to: i * 4 + 4,
          startMs: 1000 + i * 500,
          endMs: 1300 + i * 500,
        })),
      },
    });
    const result = s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(result.frame.displayFit.pageCount).toBeGreaterThan(1);
    expect(observations).toContainEqual([48, 48]);
    expect(
      observations.some(([length, boxes]) => length < 48 && boxes < length),
    ).toBe(true);
    s.controller.stop();
  });

  it('does not build fine boxes for a unit crossing a coarse boundary', () => {
    const boxes = [];
    const s = surface('focus-line', {
      wrappedBounds: (rect, node) => {
        boxes.push(
          node.children.filter(
            (child) => child.style?.display === 'inline-block',
          ).length,
        );
        return rect;
      },
    });
    s.snapshot.lyrics.lines[0].text = '甲乙丙丁';
    Object.assign(s.frame, {
      currentText: '甲乙丙丁',
      currentSegments: [{ text: '甲乙' }, { text: '丙丁' }],
      currentFineTiming: {
        units: [
          { unitId: 'cross', from: 1, to: 3, startMs: 1000, endMs: 2000 },
        ],
      },
    });
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((count) => count === 0)).toBe(true);
    s.controller.stop();
  });

  it('keeps an impossible page inactive with a boolean dataset value', () => {
    const s = surface('focus-line', {
      measure: () => ({ fits: () => false, rows: () => null }),
    });
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(s.elements.root.dataset.fitStatus).toBe('unfit');
    expect(s.elements.root.dataset.fitActive).toBe('false');
    s.controller.stop();
  });

  it.each([
    [120, 0, true],
    [121, 1, true],
    [121.01, 0, false],
    [120, 1.01, false],
  ])(
    'keeps the strict wrapped proof at height %s and width excess %s',
    (height, excess, fast) => {
      const onTrace = vi.fn();
      const s = surface('focus-line', {
        onTrace,
        wrappedBounds: (rect) => ({ width: rect.width + excess, height }),
      });
      s.snapshot.lyrics.lines[0].text = '甲乙丙丁';
      s.frame.currentText = '甲乙丙丁';
      s.controller.prepare(s.snapshot, s.frame, s.settings);
      const count = onTrace.mock.calls.find(
        ([event]) => event === 'fit-measure',
      )[1].probeCount;
      if (fast) {
        expect(count).toBe(1);
        expect(s.elements.root.dataset.fitActive).toBe('true');
      } else expect(count).toBeGreaterThan(1);
      s.controller.stop();
    },
  );

  it('keeps row measurement for other templates and injected measurements without wrapped metadata', () => {
    for (const templateId of ['focus-line', 'kinetic-pop', 'live-stage']) {
      const rows = vi.fn((text) => [
        { text: text.slice(0, 2) },
        { text: text.slice(2) },
      ]);
      const s = surface(templateId, {
        measure: () => ({ fits: () => true, rows }),
      });
      s.snapshot.lyrics.lines[0].text = '甲乙丙丁';
      Object.assign(s.frame, { currentText: '甲乙丙丁', nextText: 'next' });
      const result = s.controller.prepare(s.snapshot, s.frame, s.settings);
      expect(rows).toHaveBeenCalledWith('甲乙丙丁');
      expect(s.elements.root.dataset.fitActive).toBe('true');
      expect(result.frame.nextText).toBe('');
      if (templateId === 'live-stage')
        expect(result.frame.liveStageDisplayLines).toEqual(['甲乙', '丙丁']);
      s.controller.stop();
    }
  });

  it.each(['甲\n乙', '甲\n\n乙\n', '\t甲乙', ' 甲乙 '])(
    'keeps conservative row handling for whitespace-sensitive text %j',
    (text) => {
      const onTrace = vi.fn();
      const s = surface('focus-line', { onTrace });
      s.snapshot.lyrics.lines[0].text = text;
      s.frame.currentText = text;
      s.controller.prepare(s.snapshot, s.frame, s.settings);
      expect(
        onTrace.mock.calls.find(([event]) => event === 'fit-measure')[1]
          .probeCount,
      ).toBeGreaterThan(1);
      s.controller.stop();
    },
  );

  it.each([
    'focus-line',
    'karaoke-stack',
    'kinetic-pop',
    'manga-frame',
    'ornate-vertical',
    'live-stage',
  ])('measures %s locally and disposes every DOM probe', (templateId) => {
    const s = surface(templateId);
    const result = s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(result.frame.displayFit.pageCount).toBeGreaterThan(1);
    expect(s.probes()).toBe(0);
    const reads = s.reads();
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(s.reads()).toBe(reads);
    s.controller.stop();
  });

  it('defers zero-sized surfaces and shows inspection recovery for impossible density', () => {
    const s = surface('focus-line');
    s.elements.root.getBoundingClientRect = () => ({ width: 0, height: 0 });
    expect(s.controller.prepare(s.snapshot, s.frame, s.settings).frame).toBe(
      s.frame,
    );
    const notice = { hidden: true, setAttribute() {}, remove() {} };
    const controller = createLyricsFitController({
      inspection: true,
      document: { createElement: () => notice, body: { append() {} } },
      measure: () => ({
        fits: (text) => text.length < 20,
        rows: (text) => [{ text }],
      }),
    });
    s.snapshot.lyrics.lines[0].endMs = 3000;
    controller.prepare(s.snapshot, s.frame, s.settings);
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('請放大來源範圍');
    controller.stop();
  });

  it('bounds geometry probes for the maximum unique-text input and caches the result', () => {
    const s = surface('focus-line');
    const text = Array.from({ length: 2000 }, (_, i) =>
      String.fromCodePoint(0x4e00 + i),
    ).join('');
    s.snapshot.lyrics.lines[0] = { text, startMs: 1000, endMs: 500000 };
    s.frame.currentText = text;
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(s.reads()).toBeLessThan(5000);
    const reads = s.reads();
    s.controller.prepare(s.snapshot, s.frame, s.settings);
    expect(s.reads()).toBe(reads);
    expect(s.probes()).toBe(0);
    s.controller.stop();
  });
  it('measures once per content/appearance revision, and uses the existing clock for page deadlines', () => {
    let measurements = 0;
    const controller = createLyricsFitController({
      measure: () => {
        measurements++;
        return { fits: (s) => s.length <= 18, rows: (s) => [{ text: s }] };
      },
    });
    const snapshot = {
      playback: { status: 'playing', positionMs: 1000, rate: 1 },
      lyrics: {
        offsetMs: 0,
        lines: [
          {
            text: 'first phrase. second phrase. third phrase.',
            startMs: 1000,
            endMs: 16000,
          },
        ],
      },
    };
    const frame = {
      visible: true,
      lineIndex: 0,
      currentText: snapshot.lyrics.lines[0].text,
      currentTimingSource: 'line-estimate',
    };
    const options = { templateId: 'focus-line', nowMs: 0 };
    const first = controller.prepare(snapshot, frame, options);
    expect(first.frame.displayFit.pageCount).toBe(3);
    expect(first.delayMs).toBeGreaterThan(0);
    controller.prepare(snapshot, frame, options);
    expect(measurements).toBe(1);
    snapshot.playback.positionMs = 14000;
    expect(controller.prepare(snapshot, frame, options).frame.currentText).toBe(
      'third phrase.',
    );
    expect(measurements).toBe(1);
    controller.invalidate();
    controller.prepare(snapshot, frame, options);
    expect(measurements).toBe(2);
    controller.stop();
    expect(controller.prepare(snapshot, frame, options).frame).toBe(frame);
  });

  it('does not schedule paused, unfit or unresolved data, and leaves short lyrics alone', () => {
    const controller = createLyricsFitController({
      measure: () => ({
        fits: (s) => s.length <= 20,
        rows: (s) => [{ text: s }],
      }),
    });
    const snapshot = {
      playback: { status: 'paused', positionMs: 2000 },
      lyrics: { lines: [{ text: 'short', startMs: 1000, endMs: 5000 }] },
    };
    const frame = { visible: true, lineIndex: 0, currentText: 'short' };
    expect(
      controller.prepare(snapshot, frame, {
        templateId: 'focus-line',
        nowMs: 0,
      }),
    ).toEqual({ frame, delayMs: null });
  });
});
