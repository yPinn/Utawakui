import { nextTick, reactive, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLyricsClock } from './useLyricsClock.js';

let stop;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

function setup() {
  const player = reactive({
    track: { id: 'a' },
    currentTime: 0,
    playbackPhase: 'playing',
    tempoRate: 1,
    continuityRevision: 0,
  });
  const selected = shallowRef('a');
  const offset = shallowRef(0);
  const document = shallowRef({
    lines: [
      {
        startMs: 100,
        endMs: 1000,
        estimatedStarts: { segments: [{ startMs: 200 }, { startMs: 500 }] },
      },
    ],
  });
  let media = 0;
  let audioRate = 1;
  const positionMs = shallowRef(null);
  const samplePlaybackClock = vi.fn(() => ({
    trackId: player.track.id,
    positionMs: media,
    rate: audioRate,
    phase: player.playbackPhase,
  }));
  const clock = useLyricsClock({
    playerState: player,
    selectedTrackId: selected,
    offsetMs: offset,
    document,
    positionMs,
    samplePlaybackClock,
  });
  stop = clock.stop;
  return {
    player,
    selected,
    offset,
    document,
    positionMs,
    samplePlaybackClock,
    media: (value) => {
      media = value;
    },
    audioRate: (value) => {
      audioRate = value;
    },
  };
}

describe('lyrics boundary clock', () => {
  it('samples a paint completion while holding the canonical line to its original next onset', async () => {
    const c = setup();
    c.document.value = {
      lines: [
        {
          lineId: 'l',
          text: '甲乙丙',
          startMs: 1000,
          endMs: 15000,
          endInferred: true,
          estimatedStarts: {
            version: 1,
            segments: [
              { text: '甲', startMs: 1000 },
              { text: '乙', startMs: 1500 },
              { text: '丙', startMs: 2000 },
            ],
          },
        },
      ],
    };
    c.media(2000);
    await nextTick();
    c.samplePlaybackClock.mockClear();
    c.media(2501);
    vi.advanceTimersByTime(500);
    expect(c.samplePlaybackClock).toHaveBeenCalledTimes(1);
    expect(c.positionMs.value).toBe(2501);
    expect(c.document.value.lines[0].endMs).toBe(15000);
    c.media(15001);
    vi.advanceTimersByTime(12499);
    expect(c.positionMs.value).toBe(15001);
  });
  it('reads media at T1 and applied T1+ boundaries without waiting for timeupdate', () => {
    const c = setup();
    c.media(101);
    vi.advanceTimersByTime(100);
    expect(c.positionMs.value).toBe(101);
    expect(c.player.currentTime).toBe(0);
    c.media(201);
    vi.advanceTimersByTime(99);
    expect(c.positionMs.value).toBe(201);
  });

  it.each(['paused', 'buffering', 'seeking', 'ended'])(
    'cancels deadlines during %s and resamples on resume',
    async (phase) => {
      const c = setup();
      c.player.playbackPhase = phase;
      await nextTick();
      c.samplePlaybackClock.mockClear();
      c.media(300);
      vi.advanceTimersByTime(400);
      expect(c.samplePlaybackClock).not.toHaveBeenCalled();
      c.player.playbackPhase = 'playing';
      await nextTick();
      expect(c.positionMs.value).toBe(300);
      c.media(501);
      vi.advanceTimersByTime(200);
      expect(c.positionMs.value).toBe(501);
    },
  );

  it('reschedules rate, offset, seek continuity and applied/native document changes', async () => {
    const c = setup();
    c.player.tempoRate = 2;
    c.audioRate(2);
    await nextTick();
    c.media(100);
    vi.advanceTimersByTime(50);
    expect(c.positionMs.value).toBe(100);
    c.offset.value = 150;
    await nextTick();
    expect(c.positionMs.value).toBe(250);
    c.media(20);
    c.player.continuityRevision++;
    await nextTick();
    expect(c.positionMs.value).toBe(170);
    c.document.value = {
      lines: [{ startMs: 0, segments: [{ startMs: 180, endMs: 190 }] }],
    };
    await nextTick();
    c.media(31);
    vi.advanceTimersByTime(5);
    expect(c.positionMs.value).toBe(181);
    c.selected.value = 'b';
    await nextTick();
    expect(c.positionMs.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has no deadlines for untimed content or a mismatched media identity', async () => {
    const c = setup();
    c.document.value = { lines: [{ startMs: null, endMs: null }] };
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
    c.samplePlaybackClock.mockReturnValue({
      trackId: 'old',
      positionMs: 999,
      phase: 'playing',
      rate: 1,
    });
    c.player.continuityRevision++;
    await nextTick();
    expect(c.positionMs.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries an early deadline and uses actual late position without accumulating predicted time', () => {
    const c = setup();
    c.media(99);
    vi.advanceTimersByTime(100);
    expect(c.positionMs.value).toBe(99);
    c.media(750);
    vi.advanceTimersByTime(4);
    expect(c.positionMs.value).toBe(750);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
