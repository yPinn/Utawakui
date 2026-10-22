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
        hidden: false,
        className: '',
        style: {},
        setAttribute() {},
        remove() {
          probes--;
        },
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
        return vertical
          ? {
              width: wraps * 40,
              height: Number.isFinite(capacity) ? capacity : length,
            }
          : {
              width: Number.isFinite(capacity) ? capacity : length,
              height: wraps * 40,
            };
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
