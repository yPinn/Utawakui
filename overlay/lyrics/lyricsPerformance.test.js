import { describe, expect, it, vi } from 'vitest';
import {
  createLyricsPerformanceTrace,
  createLyricsFrameScheduler,
} from './lyrics.mjs';

describe('opt-in lyric performance trace', () => {
  it('drains bounded diagnostic batches without losing identities, anchors or drop counts', () => {
    let at = 10;
    const trace = createLyricsPerformanceTrace({
      location: { search: '?lyricsTrace=1' },
      now: () => at++,
      wallNow: () => 1000,
      capacity: 2,
    });
    trace.mark('receive', { deliveryId: 7 });
    trace.mark('commit', { cycleId: 8, deliveryId: 7, pass: 0 });
    trace.mark('prepare', { cycleId: 9 });
    const first = trace.read({ clear: true });
    expect(first.dropped).toBe(1);
    expect(first.events).toHaveLength(2);
    expect(trace.read()).toMatchObject({ events: [], dropped: 0 });
    trace.mark('commit', { cycleId: 10, deliveryId: 11, pass: 0 });
    const second = trace.read({ clear: true });
    expect(second.events).toEqual([
      expect.objectContaining({ cycleId: 10, deliveryId: 11 }),
    ]);
    expect(second.wallAnchorMs).toBe(first.wallAnchorMs);
    expect(second.performanceAnchorMs).toBe(first.performanceAnchorMs);
    expect(second.timeOriginMs).toBe(first.timeOriginMs);
    expect(second.events[0].at).toBeGreaterThan(first.events.at(-1).at);
    first.events[0].deliveryId = 999;
    expect(trace.read().events).toEqual([]);
  });
  it('links finite scheduler and delivery identities to timeline commit marks without private strings', () => {
    const markTimeline = vi.fn();
    const trace = createLyricsPerformanceTrace({
      location: { search: '?lyricsTrace=1' },
      markTimeline,
    });
    trace.mark('commit-start', {
      cycleId: 2,
      timerId: 3,
      trigger: 1,
      generation: 4,
      deliveryId: 7,
      pass: 0,
      revision: 5,
      callbackAtMs: 100,
      armedAtMs: 90,
      privateText: 'private',
    });
    trace.mark('commit', { cycleId: 2, pass: 0, activeIndex: 0 });
    trace.mark('fit-measure', {
      cycleId: 2,
      fitRootMs: 3,
      fitRootAtMs: 100,
      fitWrappedMs: 1,
      text: 'private',
    });
    expect(trace.read().events[0]).toMatchObject({
      event: 'commit-start',
      cycleId: 2,
      timerId: 3,
      trigger: 1,
      generation: 4,
      deliveryId: 7,
      callbackAtMs: 100,
      armedAtMs: 90,
    });
    expect(markTimeline).toHaveBeenCalledWith('lyrics-commit-start-2-0');
    expect(markTimeline).toHaveBeenCalledWith('lyrics-commit-2-0');
    expect(trace.read().events[2]).toMatchObject({
      event: 'fit-measure',
      cycleId: 2,
      fitRootMs: 3,
      fitRootAtMs: 100,
      fitWrappedMs: 1,
    });
    expect(JSON.stringify(trace.read())).not.toContain('private');
  });
  it('retains numeric fine cost summaries without accepting private content', () => {
    const trace = createLyricsPerformanceTrace({
      location: { search: '?lyricsTrace=1' },
    });
    trace.mark('render-cost', {
      renderId: 3,
      renderPhase: 0,
      finePrepareMs: 1,
      fineDomMs: 2,
      fineStyleMs: 3,
      fineCancelMs: 4,
      fineAnimateMs: 5,
      fineLookupMs: 6,
      fineNodes: 7,
      fineCells: 8,
      fineHits: 9,
      fineMisses: 10,
      fineCreates: 11,
      fineCancels: 12,
      fineReuses: 13,
      coarseNodes: 14,
      coarseDomMs: 15,
      text: 'private',
    });
    expect(trace.read().events).toEqual([
      expect.objectContaining({
        event: 'render-cost',
        renderId: 3,
        renderPhase: 0,
        finePrepareMs: 1,
        fineDomMs: 2,
        fineStyleMs: 3,
        fineCancelMs: 4,
        fineAnimateMs: 5,
        fineLookupMs: 6,
        fineNodes: 7,
        fineCells: 8,
        fineHits: 9,
        fineMisses: 10,
        fineCreates: 11,
        fineCancels: 12,
        fineReuses: 13,
        coarseNodes: 14,
        coarseDomMs: 15,
      }),
    ]);
    expect(JSON.stringify(trace.read())).not.toContain('private');
  });
  it('is absent by default and accepts only bounded numeric diagnostics', () => {
    expect(
      createLyricsPerformanceTrace({ location: { search: '' } }),
    ).toBeNull();
    let at = 10;
    const trace = createLyricsPerformanceTrace({
      location: { search: '?lyricsTrace=1' },
      now: () => at++,
      wallNow: () => 1000,
      capacity: 2,
    });
    trace.mark('prepare', {
      durationMs: 3,
      lineIndex: 2,
      text: 'private lyrics',
      filename: 'private.lrc',
    });
    trace.mark('private lyrics', { durationMs: 1 });
    trace.mark('commit', { durationMs: 2 });
    trace.mark('schedule', { delayMs: 20 });
    expect(trace.read()).toMatchObject({
      wallAnchorMs: 1000,
      dropped: 1,
      events: [
        { event: 'prepare', durationMs: 3, lineIndex: 2 },
        { event: 'commit', durationMs: 2 },
      ],
    });
    expect(JSON.stringify(trace.read())).not.toContain('private');
    trace.read().events[0].durationMs = 999;
    expect(trace.read().events[0].durationMs).toBe(3);
  });
});

function timedScheduler({ prepare, commit, trace } = {}) {
  const base = Date.parse('2026-10-22T00:00:00.000Z');
  let clock = base;
  const scheduled = [],
    cancelled = [],
    frames = [];
  const snapshot = {
    revision: 1,
    generatedAt: new Date(base).toISOString(),
    displayDelayMs: 0,
    playback: {
      status: 'playing',
      positionMs: 0,
      durationMs: 2000,
      rate: 1,
      track: { id: 'a' },
    },
    lyrics: {
      trackId: 'a',
      synced: true,
      offsetMs: 0,
      lines: [
        {
          lineId: 'line',
          text: '甲乙',
          startMs: 100,
          endMs: 1000,
          estimatedStarts: {
            version: 1,
            segments: [
              { segmentId: 'a', text: '甲', startMs: 100 },
              { segmentId: 'b', text: '乙', startMs: 200 },
            ],
          },
        },
      ],
    },
  };
  const advance = (ms) => {
    clock += ms;
  };
  const scheduler = createLyricsFrameScheduler({
    onTrace: trace,
    now: () => clock,
    prepareFrame: (...args) => prepare?.(advance, ...args),
    onFrame: (frame, traceContext) => {
      frames.push(frame);
      commit?.(advance, frame, traceContext);
    },
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay, due: clock - base + delay });
      return scheduled.length;
    },
    cancelSchedule: (handle) => cancelled.push(handle),
  });
  return { scheduler, snapshot, frames, scheduled, cancelled, advance };
}

describe('deadline work accounting', () => {
  it('correlates callback, preparation and commit with one cycle and the actual armed timer', () => {
    const events = [],
      contexts = [],
      prepared = [];
    const c = timedScheduler({
      trace: (event, fields) => events.push({ event, ...fields }),
      prepare: (_advance, _snapshot, _frame, options) =>
        prepared.push(options.traceContext) && undefined,
      commit: (_advance, _frame, context) => contexts.push(context),
    });
    c.scheduler.update(c.snapshot, { deliveryId: 9 });
    const first = events.find((e) => e.event === 'scheduler');
    expect(first).toMatchObject({
      cycleId: 1,
      trigger: 0,
      generation: 1,
      revision: 1,
      deliveryId: 9,
    });
    expect(prepared[0]).toMatchObject({ cycleId: 1, pass: 0, deliveryId: 9 });
    expect(contexts[0]).toEqual(prepared[0]);
    const schedule = events.find((e) => e.event === 'schedule');
    expect(schedule).toMatchObject({ cycleId: 1, timerId: 1, deliveryId: 9 });
    c.advance(105);
    c.scheduled[0].callback();
    const callback = events.find((e) => e.event === 'timer');
    expect(callback).toMatchObject({
      cycleId: 2,
      trigger: 1,
      timerId: 1,
      deadlineMs: schedule.deadlineMs,
      lateMs: 5,
      deliveryId: 9,
    });
    expect(
      events.find((e) => e.event === 'commit-start' && e.cycleId === 2),
    ).toMatchObject({ pass: 0, timerId: 1 });
    expect(
      events.find((e) => e.event === 'commit' && e.cycleId === 2),
    ).toMatchObject({ pass: 0, timerId: 1, activeIndex: 0 });
    c.scheduler.refresh();
    expect(events.filter((e) => e.event === 'scheduler').at(-1)).toMatchObject({
      trigger: 2,
      cycleId: 3,
      deliveryId: 9,
    });
    expect(events.some((e) => e.event === 'timer-cancel')).toBe(true);
    c.scheduler.stop();
  });
  it('preserves the newer timer handle when an already queued stale callback fires', () => {
    const c = timedScheduler();
    c.scheduler.update(c.snapshot);
    c.scheduler.update({ ...c.snapshot, revision: 2 });
    const frames = c.frames.length;
    c.scheduled[0].callback();
    expect(c.frames).toHaveLength(frames);
    c.scheduler.stop();
    expect(c.cancelled).toEqual([1, 2]);
  });

  it('accounts for display page deadlines earlier than canonical segment boundaries', () => {
    const c = timedScheduler({
      prepare: (advance) => {
        advance(10);
        return { delayMs: 30 };
      },
    });
    c.scheduler.update(c.snapshot);
    expect(c.scheduled.at(-1)).toMatchObject({ delay: 20, due: 30 });
    c.scheduler.stop();
  });
  it('bounds catch-up work and yields without committing a stale preparation', () => {
    let count = 0;
    const c = timedScheduler({
      prepare: (advance) => {
        if (count++ < 2) advance(150);
      },
    });
    c.scheduler.update(c.snapshot);
    expect(count).toBe(2);
    expect(c.frames).toHaveLength(0);
    expect(c.scheduled).toHaveLength(1);
    expect(c.scheduled[0].delay).toBe(0);
    c.scheduled[0].callback();
    expect(
      c.frames.at(-1).currentSegments.find((s) => s.state === 'active')?.text,
    ).toBe('乙');
    c.scheduler.stop();
  });

  it('selects the actual current segment when a timer arrives late', () => {
    const c = timedScheduler();
    c.scheduler.update(c.snapshot);
    c.advance(350);
    c.scheduled[0].callback();
    expect(
      c.frames.at(-1).currentSegments.find((s) => s.state === 'active')?.text,
    ).toBe('乙');
    expect(c.scheduled.at(-1).due).toBe(1000);
    c.scheduler.stop();
  });

  it('keeps rate and signed offset in the original snapshot clock', () => {
    const c = timedScheduler({ prepare: (advance) => advance(10) });
    c.snapshot.playback.rate = 2;
    c.snapshot.lyrics.offsetMs = 50;
    c.scheduler.update(c.snapshot);
    expect(c.scheduled.at(-1)).toMatchObject({ delay: 15, due: 25 });
    c.scheduler.stop();
  });
  it('subtracts synchronous preparation and commit time from the absolute deadline', () => {
    const c = timedScheduler({
      prepare: (advance) => advance(40),
      commit: (advance) => advance(10),
    });
    c.scheduler.update(c.snapshot);
    expect(c.scheduled.at(-1)).toMatchObject({ delay: 50, due: 100 });
    c.scheduler.stop();
  });

  it('reprojects after preparation crosses an onset before committing a stale frame', () => {
    let count = 0;
    const c = timedScheduler({
      prepare: (advance) => {
        if (count++ === 0) advance(150);
      },
    });
    c.scheduler.update(c.snapshot);
    expect(c.frames).toHaveLength(1);
    expect(
      c.frames[0].currentSegments.find((s) => s.state === 'active'),
    ).toMatchObject({ text: '甲', progress: null });
    expect(c.scheduled.at(-1)).toMatchObject({ due: 200 });
    c.scheduler.stop();
  });

  it('catches up when commit itself crosses a boundary without delaying the next boundary', () => {
    let count = 0;
    const c = timedScheduler({
      commit: (advance) => {
        if (count++ === 0) advance(150);
      },
    });
    c.scheduler.update(c.snapshot);
    expect(
      c.frames.at(-1).currentSegments.find((s) => s.state === 'active')?.text,
    ).toBe('甲');
    expect(c.scheduled.at(-1).due).toBe(200);
    c.scheduler.stop();
  });

  it('does not schedule after a callback suspends the scheduler', () => {
    let c;
    c = timedScheduler({ commit: () => c.scheduler.suspend() });
    expect(() => c.scheduler.update(c.snapshot)).not.toThrow();
    expect(c.scheduled).toHaveLength(0);
    c.scheduler.stop();
  });
});
