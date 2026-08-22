import { describe, expect, it, vi } from 'vitest';
import { createLyricsFrameScheduler, renderLyricsFrame } from './lyrics.mjs';

function element() {
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

describe('lyrics overlay renderer', () => {
  it('renders external lyrics as text and clears hidden state', () => {
    const elements = {
      root: element(),
      current: element(),
      next: element(),
    };
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

  it('clears text when no lyric line is active', () => {
    const elements = {
      root: element(),
      current: element(),
      next: element(),
    };
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
});
