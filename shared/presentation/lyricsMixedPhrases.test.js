import { describe, expect, it } from 'vitest';
import registry from '../outputTemplateValues.json';
import {
  selectLyricsOverlayFrame,
  nextPresentationBoundaryDelayMs,
} from './state.mjs';

const first = '把所有回憶都留在今晚，',
  second = 'we will find our way back home';
const nowMs = Date.parse('2026-10-20T00:00:00Z');
function snapshot() {
  return {
    revision: 1,
    generatedAt: new Date(nowMs).toISOString(),
    displayDelayMs: 0,
    playback: {
      track: { id: 'song' },
      status: 'playing',
      positionMs: 2000,
      sampledAt: new Date(nowMs).toISOString(),
      rate: 1,
      durationMs: 15000,
    },
    lyrics: {
      trackId: 'song',
      synced: true,
      offsetMs: 0,
      activeLineIndex: 0,
      source: { language: 'zh' },
      lines: [
        {
          text: first + second,
          startMs: 1000,
          endMs: 12000,
          segments: [
            { segmentId: 'a', text: first, startMs: 1200, endMs: 5500 },
            { segmentId: 'b', text: second, startMs: 6000, endMs: 11000 },
          ],
        },
      ],
    },
    queue: { items: [] },
  };
}
const frame = (value) =>
  selectLyricsOverlayFrame(value, { nowMs, templateId: 'kinetic-pop' });
const lyricTemplates = Object.entries(registry.templateKinds)
  .filter(([, kind]) => kind === 'lyrics')
  .map(([id]) => id);

describe('repeated lyrics in Output', () => {
  function timedLine(parts, boundaries, mode) {
    return {
      text: parts.join(''),
      startMs: boundaries[0],
      endMs: boundaries.at(-1),
      ...(mode ? { repeatMode: mode } : {}),
      segments: parts.map((text, i) => ({
        text,
        segmentId: `repeat-${i}`,
        startMs: boundaries[i],
        endMs: boundaries[i + 1],
      })),
    };
  }

  it.each(['focus-line', 'kinetic-pop', 'centered-vertical'])(
    'preserves two copies by default and lets %s keep a longer intentional repeat',
    (templateId) => {
      const value = snapshot();
      const options = { templateId, nowMs };
      const display = () => {
        const frame = selectLyricsOverlayFrame(value, options);
        return frame.kineticPop?.displayText ?? frame.currentText;
      };
      value.playback.positionMs = 1700;
      value.lyrics.lines = [timedLine(['Go', ' Go'], [1000, 1600, 2400])];
      expect(display()).toBe('Go Go');
      value.lyrics.lines = [
        timedLine(
          ['Go', ' Go', ' Go', ' Go'],
          [1000, 1600, 2200, 2800, 3500],
          'original',
        ),
      ];
      const projected = selectLyricsOverlayFrame(value, options);
      if (templateId === 'kinetic-pop') {
        expect(projected.kineticPop.phrases.map(({ text }) => text)).toEqual([
          'Go Go',
          'Go Go',
        ]);
        value.playback.positionMs = 2300;
        expect(
          selectLyricsOverlayFrame(value, options).kineticPop.phraseIndex,
        ).toBe(1);
      } else {
        expect(display()).toBe('Go Go Go Go');
      }
    },
  );

  it('holds the Bansanka cue once with its inflection and original times', () => {
    const value = snapshot();
    const raw = timedLine(
      ['会い', '会い', '会いたくなんだよね'],
      [1000, 1280, 1575, 3400],
    );
    value.lyrics.lines = [raw];
    const before = structuredClone(value.lyrics);
    for (const at of [1000, 1300, 1600, 2200]) {
      value.playback.positionMs = at;
      const projected = frame(value);
      expect(projected.kineticPop.displayText).toBe('会いたくなんだよね');
      expect(projected.kineticPopClock.startMs).toBe(1000);
    }
    expect(value.lyrics).toEqual(before);
  });

  it('samples one Ashura-chan word at each authored onset and allows that line to hold instead', () => {
    const value = snapshot();
    const parts = ['飛べる', 'すてっぷ', 'すてっぷ', 'すてっぷ', ' 仰せのまま'];
    const starts = [1000, 1450, 1740, 2020, 2310, 3600];
    value.lyrics.lines = [timedLine(parts, starts)];
    for (const at of starts.slice(1, 4)) {
      value.playback.positionMs = at;
      const projected = frame(value);
      expect(projected.kineticPop.rows.map(({ text }) => text)).toEqual([
        'すてっぷ',
      ]);
      expect(projected.kineticPopClock.startMs).toBe(at);
      expect(
        nextPresentationBoundaryDelayMs(value, {
          templateId: 'kinetic-pop',
          nowMs,
        }),
      ).toBe(starts[starts.indexOf(at) + 1] - at);
    }
    value.lyrics.lines = [timedLine(parts, starts, 'hold')];
    expect(frame(value).kineticPop.displayText).toBe('すてっぷ 仰せのまま');
    expect(frame(value).kineticPopClock.startMs).toBe(1450);
  });

  it.each(
    lyricTemplates.filter(
      (id) =>
        !['karaoke-stack', 'kinetic-pop', 'centered-vertical'].includes(id),
    ),
  )(
    'keeps one display string and separates the hold and replay clocks for %s',
    (templateId) => {
      const value = snapshot();
      const parts = ['会い', '会い', '会いたくなんだよね'];
      const starts = [1000, 1500, 2200, 4900];
      const options = { templateId, nowMs };
      value.lyrics.lines = [timedLine(parts, starts)];
      value.playback.positionMs = 1500;
      expect(selectLyricsOverlayFrame(value, options)).toMatchObject({
        currentText: '会いたくなんだよね',
      });
      expect(
        selectLyricsOverlayFrame(value, options).repeatCueStartMs,
      ).toBeUndefined();
      value.lyrics.lines = [timedLine(parts, starts, 'replay')];
      expect(selectLyricsOverlayFrame(value, options)).toMatchObject({
        currentText: '会いたくなんだよね',
        repeatCueStartMs: 1500,
      });
      expect(
        nextPresentationBoundaryDelayMs(value, options),
      ).toBeLessThanOrEqual(700);
      value.playback.positionMs = 2200;
      expect(selectLyricsOverlayFrame(value, options).repeatCueStartMs).toBe(
        2200,
      );
    },
  );

  it('recognizes two complete copies of an unspaced cue and keeps the static template static', () => {
    const value = snapshot();
    value.lyrics.lines = [
      timedLine(['すてっぷ', 'すてっぷ'], [1000, 1600, 2400], 'replay'),
    ];
    value.playback.positionMs = 1700;
    expect(frame(value).kineticPop.displayText).toBe('すてっぷ');
    expect(frame(value).kineticPopClock.startMs).toBe(1600);
    expect(
      selectLyricsOverlayFrame(value, {
        templateId: 'centered-vertical',
        nowMs,
      }),
    ).toMatchObject({ currentText: 'すてっぷ' });
    expect(
      selectLyricsOverlayFrame(value, {
        templateId: 'centered-vertical',
        nowMs,
      }).repeatCueStartMs,
    ).toBeUndefined();
  });

  it('keeps KTV hold in the same lane and uses the second cue for replay', () => {
    const value = snapshot();
    const first = {
      text: 'Same cue',
      startMs: 1000,
      endMs: 2000,
      repeatMode: 'hold',
    };
    const options = { templateId: 'karaoke-stack', nowMs };
    const rest = [
      { text: first.text, startMs: 2000, endMs: 3000 },
      { text: 'Another cue', startMs: 3000, endMs: 5000 },
    ];
    value.lyrics.lines = [first, ...rest];
    value.playback.positionMs = 1700;
    const start = selectLyricsOverlayFrame(value, options).ktv;
    value.playback.positionMs = 2200;
    expect(selectLyricsOverlayFrame(value, options).ktv).toMatchObject({
      currentText: 'Same cue',
      lineIndex: 0,
      currentLaneIndex: start.currentLaneIndex,
      lineProgress: 1,
      nextText: 'Another cue',
      repeatKtvFitThrough: 2,
    });
    const previewLane = selectLyricsOverlayFrame(value, options).ktv
      .nextLaneIndex;
    value.playback.positionMs = 3100;
    expect(selectLyricsOverlayFrame(value, options).ktv.currentLaneIndex).toBe(
      previewLane,
    );
    value.playback.positionMs = 2200;
    value.lyrics.lines = [{ ...first, repeatMode: 'replay' }, ...rest];
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(1);
  });

  it('holds touching equal lines across their boundary, with opt-in motion or distinct gaps', () => {
    const value = snapshot();
    const line = { text: 'Same line', startMs: 1000, endMs: 2000 };
    const next = { ...line, startMs: 2000, endMs: 3000 };
    const options = { templateId: 'manga-frame', nowMs };
    value.lyrics.lines = [line, next];
    value.playback.positionMs = 2100;
    expect(selectLyricsOverlayFrame(value, options)).toMatchObject({
      currentText: line.text,
      lineIndex: 0,
    });
    value.lyrics.lines = [{ ...line, repeatMode: 'replay' }, next];
    expect(selectLyricsOverlayFrame(value, options).lineIndex).toBe(1);
    value.lyrics.lines = [{ ...line, repeatMode: 'original' }, next];
    expect(selectLyricsOverlayFrame(value, options).lineIndex).toBe(1);
    value.lyrics.lines = [{ ...line, repeatMode: 'hold' }, next];
    expect(frame(value).kineticPopClock).toMatchObject({
      startMs: 1000,
      endMs: 3000,
      repeatGroupIndex: 0,
    });
    value.lyrics.lines = [line, { ...next, startMs: 2500 }];
    expect(selectLyricsOverlayFrame(value, options).visible).toBe(false);
  });
});

describe('timed mixed long phrases in Kinetic Pop', () => {
  it('switches two whole phrases exactly at the mapped onset and supports backward seek', () => {
    const value = snapshot(),
      original = structuredClone(value);
    expect(frame(value).kineticPop).toMatchObject({
      displayText: first,
      phraseTimingSource: 't2',
    });
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(4000);
    value.playback.positionMs = 5999;
    expect(frame(value).kineticPop.displayText).toBe(first);
    value.playback.positionMs = 6000;
    expect(frame(value).kineticPop.displayText).toBe(second);
    value.playback.positionMs = 2000;
    expect(frame(value).kineticPop.displayText).toBe(first);
    expect(value).toEqual(original);
  });
  it('uses weighted punctuation for T1 and keeps a coarse native segment whole', () => {
    const value = snapshot();
    delete value.lyrics.lines[0].segments;
    value.playback.positionMs = 9000;
    expect(frame(value).kineticPop).toMatchObject({
      displayText: second,
      phraseTimingSource: 'line-estimate',
    });
    value.lyrics.lines[0].segments = [
      {
        segmentId: 'coarse',
        text: first + second,
        startMs: 1000,
        endMs: 12000,
      },
    ];
    expect(frame(value).kineticPop.displayText).toBe(first + second);
  });
  it('prefers native T2, then applied T1+ onsets, then the T1 display estimate', () => {
    const value = snapshot(),
      line = value.lyrics.lines[0];
    line.estimatedStarts = {
      version: 1,
      segments: line.segments.map((s) => ({
        segmentId: s.segmentId,
        text: s.text,
        startMs: s.startMs,
      })),
    };
    line.estimatedStarts.segments[1].startMs = 7000;
    value.playback.positionMs = 6500;
    expect(frame(value).kineticPop.displayText).toBe(second);
    delete line.segments;
    expect(frame(value).kineticPop).toMatchObject({
      displayText: first,
      phraseTimingSource: 'model-starts',
    });
    value.playback.positionMs = 7000;
    expect(frame(value).kineticPop.displayText).toBe(second);
    delete line.estimatedStarts;
    expect(frame(value).kineticPop).toMatchObject({
      displayText: second,
      phraseTimingSource: 'line-estimate',
    });
  });
  it('follows offset and playback rate through the existing clock without retiming the source', () => {
    const value = snapshot();
    value.lyrics.offsetMs = 1000;
    value.playback.rate = 2;
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBe(1500);
    value.playback.positionMs = 5000;
    expect(frame(value).kineticPop.displayText).toBe(second);
    value.playback.status = 'paused';
    expect(
      nextPresentationBoundaryDelayMs(value, {
        nowMs,
        templateId: 'kinetic-pop',
      }),
    ).toBeNull();
  });

  it('uses the same three timed batches for scheduler wake, animation age and backward seek', () => {
    const value = snapshot();
    const phrases = ['走れ、', '夜を越えて、', '光をつかめ！'];
    const starts = [1000, 1600, 3100, 4700];
    value.lyrics.lines = [
      {
        text: phrases.join(' '),
        startMs: starts[0],
        endMs: starts.at(-1),
        segments: phrases.map((text, index) => ({
          segmentId: String(index),
          text: index > 0 ? ' ' + text : text,
          startMs: starts[index],
          endMs: starts[index + 1],
        })),
      },
    ];
    for (const index of [0, 1, 2, 1]) {
      value.playback.positionMs = starts[index] + 40;
      const projected = frame(value);
      expect(projected.kineticPop.displayText).toBe(phrases[index]);
      expect(projected.kineticPop.phraseTimingSource).toBe('t2');
      expect(projected.kineticPopClock).toMatchObject({
        startMs: starts[index],
        endMs: starts[index + 1],
        positionMs: starts[index] + 40,
      });
      expect(
        nextPresentationBoundaryDelayMs(value, {
          nowMs,
          templateId: 'kinetic-pop',
        }),
      ).toBe(starts[index + 1] - starts[index] - 40);
    }
  });
});
