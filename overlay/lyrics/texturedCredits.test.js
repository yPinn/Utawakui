import { describe, expect, it, vi } from 'vitest';
import gsap from 'gsap';
import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';
import { selectLyricsOverlayFrame } from '../../shared/presentation/state.mjs';
import { createDoodleCloudState } from '../../shared/browser/doodleCloudEffect.mjs';
import {
  clearTexturedCredits,
  createTexturedCreditsTimeline,
  planTexturedCreditsRows,
  TEXTURED_CREDITS_BURN_SECONDS,
  releaseTexturedCredits,
  renderTexturedCredits,
} from './texturedCredits.mjs';

function timelineLayers() {
  return {
    ink: { opacity: 1 },
    inkGlow: { opacity: 0 },
    previousInk: { opacity: 0 },
    fx: createDoodleCloudState(),
  };
}

function mockTimelineEngine(timelines = []) {
  return {
    timeline(vars) {
      const timeline = Object.fromEntries(
        [
          'addLabel',
          'set',
          'to',
          'fromTo',
          'time',
          'timeScale',
          'paused',
          'revert',
        ].map((method) => [method, vi.fn().mockReturnThis()]),
      );
      timeline.vars = vars;
      timelines.push(timeline);
      return timeline;
    },
  };
}

function mockRoot() {
  const node = () => ({
    append: vi.fn(),
    setAttribute: vi.fn(),
    dataset: {},
  });
  const ownerDocument = { createElement: node, createElementNS: node };
  return { ownerDocument, replaceChildren: vi.fn(), dataset: {} };
}

describe('textured credits rows', () => {
  // Every glyph advances 10 px.
  const advance = (text) => [...text].length * 10;

  it('keeps a horizontal lyric that fits on one row', () => {
    expect(planTexturedCreditsRows('Beyond the night', 360, advance)).toEqual([
      ['Beyond the night'],
    ]);
  });

  it('breaks horizontal rows at punctuation and keeps every word whole', () => {
    expect(
      planTexturedCreditsRows(
        '如果今晚的風穿過窗邊，請把那句沒說完的話留到天亮',
        200,
        advance,
      ),
    ).toEqual([['如果今晚的風穿過窗邊，', '請把那句沒說完的話留到天亮']]);
    const english =
      'Tonight the city lights are calling out my name, and I will follow every echo till the morning comes';
    const [rows] = planTexturedCreditsRows(english, 300, advance);
    // The whole line shows at full size, over as many rows as it needs.
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.join(' ').split(/\s+/)).toEqual(english.split(' '));
    for (const row of rows) expect(advance(row)).toBeLessThanOrEqual(300);
  });

  it('balances rows instead of leaving a clause tail alone', () => {
    const english =
      'Tonight the city lights are calling out my name, and I will follow every echo till the morning comes';
    const [rows] = planTexturedCreditsRows(english, 390, advance);
    expect(rows).not.toContain('my name,');
    const widths = rows.map(advance);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(150);
  });

  it('splits a long vertical phrase only between words, evenly', () => {
    const phrase =
      '試験の言葉を並べてみるけれど夜空の向こうへはまだ届かないままで';
    const columns = planTexturedCreditsRows(phrase, 100, advance, true).flat();
    expect(columns.join('')).toBe(phrase);
    expect(columns.some((column) => column.endsWith('向'))).toBe(false);
    expect(columns.length).toBe(Math.ceil(advance(phrase) / 100));
    for (const column of columns)
      expect(advance(column)).toBeLessThanOrEqual(100);
  });

  it('gives each vertical phrase its own column', () => {
    expect(
      planTexturedCreditsRows('試験の言葉を 並べてみる', 300, advance, true),
    ).toEqual([['試験の言葉を', '並べてみる']]);
  });

  it('splits many vertical columns into two side-by-side blocks', () => {
    const lyric =
      '試験の言葉を並べてみる 夜空の向こうへ届くまで 何度でも歌い続けよう 君の名前を呼びながら';
    expect(planTexturedCreditsRows(lyric, 300, advance, true)).toEqual([
      ['試験の言葉を並べてみる', '夜空の向こうへ届くまで'],
      ['何度でも歌い続けよう', '君の名前を呼びながら'],
    ]);
    // A phrase longer than a column still breaks to fit.
    const [first] = planTexturedCreditsRows(
      '星'.repeat(45),
      300,
      advance,
      true,
    );
    expect(first).toHaveLength(2);
    for (const column of first)
      expect(advance(column)).toBeLessThanOrEqual(300);
  });
});

describe('textured credits', () => {
  it.each([8000, 2200, 760])(
    'opens a %i ms cue with a fixed-length burn, then holds the lyric',
    (durationMs) => {
      const { ink, inkGlow, fx } = timelineLayers();
      const timeline = createTexturedCreditsTimeline(
        gsap,
        { ink, inkGlow, fx },
        durationMs,
      );
      try {
        const duration = durationMs / 1000;
        const burn = Math.min(TEXTURED_CREDITS_BURN_SECONDS, duration * 0.4);
        expect(timeline.labels['burn-end']).toBeCloseTo(burn, 5);
        timeline.time(0, true);
        expect(ink.opacity).toBe(0);
        expect(fx.burn).toMatchObject({ progress: 0 });
        // A steady pace while the lyric glows in fluorescent.
        timeline.time(burn * 0.25);
        expect(fx.burn.progress).toBeCloseTo(0.25, 5);
        expect(fx.drift.value).toBeCloseTo(0.25, 5);
        expect(ink.opacity).toBe(0);
        expect(inkGlow.opacity).toBeGreaterThan(0);
        // The lyric turns white while the textures dissolve.
        timeline.time(burn * 0.75);
        expect(ink.opacity).toBeGreaterThan(0.2);
        expect(ink.opacity).toBeLessThan(0.95);
        expect(inkGlow.opacity).toBeGreaterThan(0.05);
        expect(inkGlow.opacity).toBeLessThan(0.8);
        timeline.time(burn + 0.001);
        expect(fx.burn.progress).toBe(1);
        expect(fx.drift.value).toBe(1);
        expect(ink.opacity).toBe(1);
        expect(inkGlow.opacity).toBe(0);
        expect(fx.flash.opacity).toBe(0);
        const exit = Math.min(0.23, duration * 0.18);
        timeline.time(duration - exit / 2);
        expect(ink.opacity).toBeGreaterThan(0.2);
        expect(ink.opacity).toBeLessThan(1);
        timeline.time(duration);
        expect(ink.opacity).toBe(0);
        timeline.time(burn * 0.25);
        expect(fx.burn.progress).toBeCloseTo(0.25, 5);
        expect(ink.opacity).toBe(0);
      } finally {
        timeline.revert();
      }
    },
  );

  it.each([2200, 760])(
    'keeps a visible layer across the %i ms cue handoff at 60 fps',
    (durationMs) => {
      const outgoing = timelineLayers();
      const incoming = timelineLayers();
      const first = createTexturedCreditsTimeline(
        gsap,
        { ...outgoing, previousInk: null },
        durationMs,
        true,
      );
      const second = createTexturedCreditsTimeline(gsap, incoming, durationMs);
      try {
        first.time(durationMs / 1000 - 1 / 60);
        expect(outgoing.ink.opacity).toBe(1);
        second.time(0, true);
        expect(incoming.previousInk.opacity).toBe(1);
        expect(incoming.ink.opacity).toBe(0);
        let overlapFrames = 0;
        for (
          let time = 1 / 60;
          time < second.labels.ink + 0.25;
          time += 1 / 60
        ) {
          second.time(time);
          const previousVisible = incoming.previousInk.opacity > 0.1;
          const artworkVisible =
            incoming.fx.burn.progress > 0.02 && incoming.fx.burn.progress < 0.9;
          if (previousVisible && artworkVisible) overlapFrames += 1;
          expect(
            previousVisible || artworkVisible || incoming.ink.opacity > 0.1,
          ).toBe(true);
        }
        expect(overlapFrames).toBeGreaterThan(2);
        expect(incoming.previousInk.opacity).toBe(0);
        second.time(0, true);
        expect(incoming.previousInk.opacity).toBe(1);
      } finally {
        first.revert();
        second.revert();
      }
    },
  );

  it('reuses and synchronizes the cue timeline, then reverts it for reduced motion or clear', () => {
    const root = mockRoot();
    const timelines = [];
    const engine = mockTimelineEngine(timelines);
    const frame = {
      visible: true,
      currentText: 'First line',
      currentTranslation: 'Translation',
      texturedCreditsTiming: {
        ageMs: 100,
        durationMs: 2000,
        playing: true,
        rate: 1.25,
      },
    };
    renderTexturedCredits(root, frame, { gsap: engine });
    const [cue, previousInk] = root.replaceChildren.mock.calls[0];
    const [ink] = cue.append.mock.calls[0];
    const [line, glow] = ink.append.mock.calls[0];
    expect(glow.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
    expect(previousInk.setAttribute).toHaveBeenCalledWith(
      'aria-hidden',
      'true',
    );
    expect(previousInk.hidden).toBe(true);
    expect([line.textContent, glow.textContent]).toEqual([
      'First line',
      'First line',
    ]);
    const [timeline] = timelines;
    expect(typeof timeline.vars.onUpdate).toBe('function');
    expect(timeline.timeScale).toHaveBeenLastCalledWith(1.25);
    expect(timeline.time).toHaveBeenLastCalledWith(0.1, true);
    expect(timeline.paused).toHaveBeenLastCalledWith(false);
    frame.texturedCreditsTiming.ageMs = 780;
    frame.texturedCreditsTiming.playing = false;
    renderTexturedCredits(root, frame, { gsap: engine });
    expect(timelines).toHaveLength(1);
    expect(timeline.time).toHaveBeenLastCalledWith(0.78, true);
    expect(timeline.paused).toHaveBeenLastCalledWith(true);
    renderTexturedCredits(root, frame, { gsap: engine, reducedMotion: true });
    expect(timeline.revert).toHaveBeenCalledOnce();
    renderTexturedCredits(root, frame, { gsap: engine });
    clearTexturedCredits(root);
    expect(timelines[1].revert).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
  });

  it('mounts one full-frame GPU canvas behind the text and removes it when released', () => {
    const node = (tag) => ({
      tag,
      append: vi.fn(),
      remove: vi.fn(),
      setAttribute: vi.fn(),
      dataset: {},
    });
    const root = {
      ownerDocument: { createElement: node },
      replaceChildren: vi.fn(),
      insertBefore: vi.fn(),
      dataset: {},
    };
    // PixiJS setup stays pending, so drawing is a no-op until the GPU is ready.
    class Application {
      init() {
        return new Promise(() => {});
      }
    }
    const timelines = [];
    const engine = mockTimelineEngine(timelines);
    const frame = {
      visible: true,
      currentText: 'GPU line',
      texturedCreditsTiming: {
        ageMs: 0,
        durationMs: 2000,
        playing: true,
        rate: 1,
      },
    };
    renderTexturedCredits(root, frame, { gsap: engine, pixi: { Application } });
    const [cue] = root.replaceChildren.mock.calls[0];
    const [canvas, before] = root.insertBefore.mock.calls[0];
    expect(canvas.tag).toBe('canvas');
    expect(canvas.className).toBe('textured-credits__artwork');
    expect(before).toBe(cue);
    expect(() => timelines[0].vars.onUpdate()).not.toThrow();
    renderTexturedCredits(root, frame, { gsap: engine, pixi: { Application } });
    expect(root.insertBefore).toHaveBeenCalledOnce();

    releaseTexturedCredits(root);
    expect(root.hidden).toBe(true);
    expect(canvas.remove).toHaveBeenCalledOnce();
    renderTexturedCredits(root, frame, { gsap: engine, pixi: { Application } });
    expect(root.insertBefore).toHaveBeenCalledTimes(2);
    releaseTexturedCredits(root);
  });
  it('holds text upright and rebuilds the timeline per cue, including repeated lyrics', () => {
    const root = mockRoot();
    const cue = {
      visible: true,
      language: 'ja-JP',
      lineIndex: 2,
      currentText: '夜空の向こうへ',
      currentTranslation: 'Beyond the night sky',
    };
    const timelines = [];
    const engine = mockTimelineEngine(timelines);
    cue.texturedCreditsTiming = {
      ageMs: 0,
      durationMs: 2000,
      playing: true,
      rate: 1,
    };
    renderTexturedCredits(root, cue, { gsap: engine });
    const [group, previousInk] = root.replaceChildren.mock.calls[0];
    const [ink] = group.append.mock.calls[0];
    const [line, glow] = ink.append.mock.calls[0];
    expect(root.dataset.writing).toBe('vertical');
    expect(line.lang).toBe('ja-JP');
    expect(glow.lang).toBe('ja-JP');
    expect(ink.append.mock.calls[0]).toHaveLength(2);
    renderTexturedCredits(
      root,
      {
        ...cue,
        texturedCreditsTiming: { ...cue.texturedCreditsTiming, ageMs: 400 },
      },
      { gsap: engine },
    );
    expect(timelines).toHaveLength(1);

    renderTexturedCredits(
      root,
      {
        ...cue,
        lineIndex: 3,
        texturedCreditsTiming: {
          ...cue.texturedCreditsTiming,
          previous: { text: 'Previous', translation: 'Earlier translation' },
        },
      },
      { gsap: engine },
    );
    expect(previousInk.hidden).toBe(false);
    expect(previousInk.dataset.writing).toBe('horizontal');
    expect(
      previousInk.append.mock.calls[0].map(({ textContent }) => textContent),
    ).toEqual(['Previous', 'Previous']);
    expect(timelines).toHaveLength(2);
    renderTexturedCredits(root, cue, { gsap: engine });
    expect(timelines).toHaveLength(3);
    expect(root.replaceChildren).toHaveBeenCalledOnce();
    renderTexturedCredits(root, {
      ...cue,
      currentText: 'Beyond the night sky',
    });
    expect(root.dataset.writing).toBe('horizontal');
  });

  it('projects age and duration from the cue clock and follows pause', () => {
    const templateId = 'textured-credits';
    const { snapshot, frameTimeMs } = createOutputPreviewScene({ templateId });
    snapshot.playback.status = 'playing';
    const frame = selectLyricsOverlayFrame(snapshot, {
      templateId,
      nowMs: frameTimeMs,
    });
    const line = snapshot.lyrics.lines[frame.lineIndex];
    expect(frame.texturedCreditsTiming).toMatchObject({
      ageMs: snapshot.playback.positionMs - line.startMs,
      durationMs: line.endMs - line.startMs,
      playing: true,
      rate: 1,
    });
    const paused = {
      ...snapshot,
      playback: { ...snapshot.playback, status: 'paused', rate: 1.25 },
    };
    expect(
      selectLyricsOverlayFrame(paused, { templateId, nowMs: frameTimeMs + 500 })
        .texturedCreditsTiming,
    ).toEqual({
      ...frame.texturedCreditsTiming,
      playing: false,
      rate: 1.25,
    });
  });

  it('projects adjacent and overlapping timed lyrics and respects authored gaps', () => {
    const templateId = 'textured-credits';
    const { snapshot, frameTimeMs } = createOutputPreviewScene({ templateId });
    const start = 1000;
    const lines = [
      { text: 'Previous', startMs: 0, endMs: start + 100 },
      { text: 'Incoming', startMs: start, endMs: 2000 },
      { text: 'After the break', startMs: 2400, endMs: 3000 },
    ];
    const at = (positionMs) =>
      selectLyricsOverlayFrame(
        {
          ...snapshot,
          playback: { ...snapshot.playback, positionMs, status: 'paused' },
          lyrics: {
            ...snapshot.lyrics,
            lines,
            translations: { en: ['First translation', 'Second translation'] },
          },
        },
        { templateId, nowMs: frameTimeMs, translationLanguage: 'en' },
      );
    expect(at(1099).texturedCreditsTiming.continuesIntoNext).toBe(true);
    expect(at(1100).texturedCreditsTiming).toMatchObject({
      ageMs: 0,
      durationMs: 900,
      previous: { text: 'Previous' },
    });
    expect(at(1900).texturedCreditsTiming.continuesIntoNext).toBeUndefined();
    expect(at(2200).visible).toBe(false);
    expect(at(2400).texturedCreditsTiming.previous).toBeUndefined();
  });
});
