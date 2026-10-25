import { describe, expect, it, vi } from 'vitest';
import { createLyricsFitController } from './lyricsFit.mjs';
import { selectLyricsOverlayFrame } from '../../shared/presentation/state.mjs';

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

  it('keeps the full mixed English phrase through source → KTV state → fit, and bounds the next preview', () => {
    const s = surface('karaoke-stack');
    const text = '想看見天上璀璨星光sing it with me';
    s.snapshot.playback.track = { id: 'phrase-track' };
    s.snapshot.lyrics = {
      trackId: 'phrase-track',
      synced: true,
      offsetMs: 0,
      source: { language: 'zh-Hant' },
      lines: [
        { lineId: 'mixed', text, startMs: 1000, endMs: 10000 },
        {
          lineId: 'long',
          text: '其實我沒有一句歌詞誰能夠做到能完全領會'.repeat(3),
          startMs: 10000,
          endMs: 40000,
        },
      ],
    };
    const before = structuredClone(s.snapshot.lyrics);
    const observed = new Set();
    for (const positionMs of [1000, 5000, 8000, 10000]) {
      s.snapshot.playback.positionMs = positionMs;
      const raw = selectLyricsOverlayFrame(s.snapshot, s.settings);
      const result = s.controller.prepare(s.snapshot, raw, s.settings).frame
        .ktv;
      observed.add(result.currentText.trim());
      expect(['it', 'with', 'me']).not.toContain(result.currentText.trim());
      if (positionMs === 8000)
        expect(result.nextText.length).toBeLessThan(
          s.snapshot.lyrics.lines[1].text.length,
        );
    }
    expect([...observed]).toContain('sing it with me');
    expect(s.snapshot.lyrics).toEqual(before);
    s.controller.stop();
  });
  it.each(['T1', 'T2', 'T1+'])(
    'retains the KTV source range for %s without requiring fine timing',
    (tier) => {
      const s = surface('karaoke-stack');
      const text = '想看見星光sing it with me';
      const segments = [
        { text: '想看見星光', startMs: 1000, endMs: 5000 },
        { text: 'sing it with me', startMs: 5000, endMs: 9000 },
      ];
      const line = {
        lineId: 'mixed',
        text,
        startMs: 1000,
        endMs: 9000,
        ...(tier === 'T2'
          ? { segments }
          : tier === 'T1+'
            ? {
                estimatedStarts: {
                  version: 1,
                  segments: segments.map(({ text, startMs }) => ({
                    text,
                    startMs,
                  })),
                },
              }
            : {}),
      };
      s.snapshot.playback = {
        status: 'paused',
        positionMs: 8000,
        track: { id: 't' },
      };
      s.snapshot.lyrics = {
        trackId: 't',
        synced: true,
        source: { language: 'zh-Hant' },
        lines: [line],
      };
      const before = structuredClone(line);
      const raw = selectLyricsOverlayFrame(s.snapshot, s.settings);
      expect(raw.ktv.currentFineTiming).toBeUndefined();
      expect(raw.ktv.currentSourceRange).toMatchObject({
        from: 5,
        to: text.length,
      });
      const projected = s.controller.prepare(s.snapshot, raw, s.settings).frame
        .ktv;
      expect(projected.currentText).toBe('sing it with me');
      expect(projected.currentRole).toBe('solo');
      expect(projected.displayFit.sourceTiming).toBe(
        tier === 'T1' ? 'line-estimate' : tier === 'T2' ? 't2' : 'model-starts',
      );
      expect(line).toEqual(before);
      s.controller.stop();
    },
  );

  it.each([2, 3])(
    'prepares preview before display and continues lanes after %i capacity batches, including cold seek',
    (count) => {
      const s = surface('karaoke-stack', {
        measure: () => ({
          fits: (text) => text.length <= 8,
          rows: (text) => [{ text }],
        }),
      });
      const lines = [
        {
          lineId: 'a',
          text: '甲'.repeat(count * 8),
          startMs: 1000,
          endMs: 13000,
        },
        { lineId: 'b', text: '乙'.repeat(20), startMs: 13000, endMs: 25000 },
        {
          lineId: 'c',
          text: 'Oh, you ask 秋招?',
          startMs: 25000,
          endMs: 32000,
        },
      ];
      s.snapshot.playback.track = { id: 't' };
      s.snapshot.lyrics = {
        trackId: 't',
        synced: true,
        source: { language: 'zh-Hant' },
        lines,
      };
      const before = structuredClone(s.snapshot.lyrics);
      const at = (positionMs) => {
        s.snapshot.playback.positionMs = positionMs;
        return s.controller.prepare(
          s.snapshot,
          selectLyricsOverlayFrame(s.snapshot, s.settings),
          s.settings,
        ).frame.ktv;
      };
      const preview = at(12999);
      const onset = at(13000);
      expect(preview.nextHeld).toBe(false);
      expect(preview.nextText).toBe(onset.currentText);
      expect(preview.nextDisplayBatchId).toBe(onset.displayBatchId);
      expect(onset.currentLaneIndex).toBe(preview.currentLaneIndex + 1);
      expect(preview.nextLaneIndex).toBe(onset.currentLaneIndex);
      expect(onset.currentLaneIndex).toBe(count);
      s.controller.invalidate();
      const seek = at(13000);
      expect(seek.currentText).toBe(onset.currentText);
      expect(seek.displayBatchId).toBe(onset.displayBatchId);
      expect(seek.currentLaneIndex).toBe(onset.currentLaneIndex);
      expect(s.snapshot.lyrics).toEqual(before);
      s.controller.stop();
    },
  );

  it.each(['T2', 'T1+'])(
    'preplans %s preview with retained roles, reading and canonical paint intervals',
    (tier) => {
      const renderForMeasurement = vi.fn();
      const s = surface('karaoke-stack', {
        renderForMeasurement,
        measure: () => ({ fits: (value) => value.length <= 8 }),
      });
      const text = '甲'.repeat(16);
      const segments = [
        {
          segmentId: 'first',
          text: text.slice(0, 8),
          startMs: 1000,
          endMs: 7000,
        },
        { segmentId: 'last', text: text.slice(8), startMs: 7000, endMs: 13000 },
      ];
      const line = {
        lineId: 'a',
        text,
        startMs: 1000,
        endMs: 13000,
        vocalParts: [{ from: 0, to: 16, label: '合', role: 'group' }],
        ...(tier === 'T2'
          ? { segments }
          : {
              estimatedStarts: {
                version: 1,
                segments: segments.map(({ segmentId, text, startMs }) => ({
                  segmentId,
                  text,
                  startMs,
                })),
              },
              estimatedFineTiming: {
                version: 1,
                units: segments.map((segment, i) => ({
                  unitId: segment.segmentId,
                  from: i * 8,
                  to: (i + 1) * 8,
                  startMs: segment.startMs,
                  endMs: segment.endMs,
                })),
              },
            }),
      };
      s.snapshot.playback = {
        status: 'paused',
        positionMs: 1000,
        track: { id: 't' },
      };
      s.snapshot.lyrics = {
        trackId: 't',
        synced: true,
        lines: [line],
        reading: {
          lines: [
            {
              text,
              segments: segments.map(({ text }) => ({ text, reading: 'あ' })),
            },
          ],
        },
      };
      const original = structuredClone(s.snapshot.lyrics);
      const at = (positionMs) => {
        s.snapshot.playback.positionMs = positionMs;
        return s.controller.prepare(
          s.snapshot,
          selectLyricsOverlayFrame(s.snapshot, s.settings),
          s.settings,
        ).frame.ktv;
      };
      const preview = at(1000),
        current = at(7000);
      expect(preview.nextDisplayBatchId).toBe(current.displayBatchId);
      expect(preview.nextText).toBe(current.currentText);
      expect(preview.nextRole).toBe(current.currentRole);
      expect(current.currentRole).toBe('group');
      expect(preview.nextReading).toEqual(current.currentReading);
      expect(current.currentReading.text).toBe(current.currentText);
      expect(current.currentSourceRange).toEqual({
        from: 8,
        to: 16,
        startMs: 7000,
        endMs: 13000,
      });
      expect(current.currentSegments[0].segmentId).toBe(
        tier === 'T2' ? 'last' : 'last:p0',
      );
      if (tier === 'T1+') {
        expect(current.currentFineTiming.units[0]).toMatchObject({
          from: 0,
          to: 8,
          startMs: 7000,
        });
        expect(current.currentFineTiming.units.at(-1).endMs).toBe(13000);
      }
      expect(renderForMeasurement).not.toHaveBeenCalled();
      expect(s.snapshot.lyrics).toEqual(original);
      s.controller.stop();
    },
  );

  it('keeps real section count-in resets and prepares it before canonical playback begins', () => {
    const s = surface('karaoke-stack', {
      measure: () => ({ fits: (text) => text.length <= 8 }),
    });
    s.snapshot.playback = {
      status: 'paused',
      positionMs: 28000,
      track: { id: 't' },
    };
    s.snapshot.lyrics = {
      trackId: 't',
      synced: true,
      lines: [
        { lineId: 'a', text: '甲'.repeat(16), startMs: 1000, endMs: 13000 },
        { lineId: 'b', text: '乙'.repeat(24), startMs: 30000, endMs: 45000 },
      ],
    };
    const raw = selectLyricsOverlayFrame(s.snapshot, s.settings);
    const entrance = s.controller.prepare(s.snapshot, raw, s.settings).frame
      .ktv;
    expect(entrance.visible).toBe(true);
    expect(entrance.currentText).toBe('乙'.repeat(8));
    expect(entrance.currentLaneIndex).toBe(0);
    expect(entrance.countIn.laneIndex).toBe(0);
    s.snapshot.playback.positionMs = 30000;
    const onset = s.controller.prepare(
      s.snapshot,
      selectLyricsOverlayFrame(s.snapshot, s.settings),
      s.settings,
    ).frame.ktv;
    expect(onset.currentText).toBe(entrance.currentText);
    expect(onset.displayBatchId).toBe(entrance.displayBatchId);
    expect(onset.currentLaneIndex).toBe(0);
    expect(onset.countIn).toBeNull();
    s.controller.stop();
  });

  it('reuses preview geometry across active-line updates and warm ticks without touching live text', () => {
    const measure = vi.fn(() => ({ fits: (text) => text.length <= 8 }));
    const renderForMeasurement = vi.fn();
    const s = surface('karaoke-stack', { measure, renderForMeasurement });
    s.snapshot.playback.track = { id: 't' };
    s.snapshot.lyrics = {
      trackId: 't',
      synced: true,
      activeLineIndex: 0,
      lines: [
        { lineId: 'a', text: '甲'.repeat(16), startMs: 1000, endMs: 13000 },
        { lineId: 'b', text: '乙'.repeat(24), startMs: 13000, endMs: 30000 },
      ],
    };
    const prepare = () =>
      s.controller.prepare(
        s.snapshot,
        selectLyricsOverlayFrame(s.snapshot, s.settings),
        s.settings,
      );
    prepare();
    expect(measure).toHaveBeenCalledTimes(2);
    s.snapshot.lyrics.activeLineIndex = 1;
    s.snapshot.playback.positionMs = 13000;
    prepare();
    s.snapshot.playback.positionMs++;
    prepare();
    expect(measure).toHaveBeenCalledTimes(2);
    expect(renderForMeasurement).not.toHaveBeenCalled();
    s.controller.invalidate();
    prepare();
    expect(measure).toHaveBeenCalledTimes(4);
    s.controller.stop();
  });

  it.each(['T1', 'T2', 'T1+'])(
    'holds completed %s batches through a short inter-line gap without changing timestamps',
    (tier) => {
      const s = surface('karaoke-stack', {
        measure: () => ({ fits: (text) => text.length <= 8 }),
      });
      const lines = [
        { lineId: 'a', text: '甲'.repeat(16), startMs: 1000, endMs: 13000 },
        { lineId: 'b', text: '乙'.repeat(24), startMs: 14000, endMs: 30000 },
      ].map((line) => {
        const segment = {
          segmentId: line.lineId + '-s',
          text: line.text,
          startMs: line.startMs,
          endMs: line.endMs,
        };
        return {
          ...line,
          ...(tier === 'T2'
            ? { segments: [segment] }
            : tier === 'T1+'
              ? {
                  estimatedStarts: {
                    version: 1,
                    segments: [
                      {
                        segmentId: segment.segmentId,
                        text: segment.text,
                        startMs: segment.startMs,
                      },
                    ],
                  },
                }
              : {}),
        };
      });
      s.snapshot.playback = {
        status: 'paused',
        positionMs: 13600,
        track: { id: 't' },
      };
      s.snapshot.lyrics = { trackId: 't', synced: true, lines };
      const original = structuredClone(lines);
      const at = (positionMs) => {
        s.snapshot.playback.positionMs = positionMs;
        return s.controller.prepare(
          s.snapshot,
          selectLyricsOverlayFrame(s.snapshot, s.settings),
          s.settings,
        ).frame.ktv;
      };
      for (const position of [13600, 13999]) {
        const held = at(position);
        expect(held.visible).toBe(true);
        expect(held.currentText).toBe('甲'.repeat(8));
        expect(held.lineProgress).toBe(1);
        expect(held.nextText).toBe('乙'.repeat(8));
        expect(held.currentSourceRange.endMs).toBe(13000);
      }
      expect(at(14000)).toMatchObject({
        currentText: '乙'.repeat(8),
        currentLaneIndex: 2,
      });
      expect(lines).toEqual(original);
      s.controller.stop();
    },
  );

  it.each([26, 80, 150])(
    'projects a %i-glyph Focus source as sequential single-row batches and caches the proof',
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
      const probes = onTrace.mock.calls.find(
        ([event]) => event === 'fit-measure',
      )[1].probeCount;
      expect(probes).toBeGreaterThan(0);
      expect(Number(s.elements.root.dataset.fitPages)).toBe(
        length > 36 ? Math.ceil(length / 36) : 1,
      );
      expect(s.elements.root.dataset.fitActive).toBe(String(length > 36));
      expect(result.frame.currentText).toBe(text.slice(0, 36));
      expect(result.frame.nextText).toBe(length > 36 ? '' : 'next line');
      if (length > 36) expect(result.frame.nextSegments).toBeUndefined();
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
    [40, 0, true],
    [41, 1, true],
    [48.01, 0, false],
    [40, 1.01, false],
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
        expect(s.elements.root.dataset.fitActive).toBe('false');
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
