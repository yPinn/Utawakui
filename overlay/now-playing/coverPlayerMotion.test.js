import { describe, expect, it, vi } from 'vitest';
import { createCoverPlayerMotionController } from './coverPlayerMotion.mjs';

function frame(trackId, extra = {}) {
  return { visible: true, trackId, title: trackId, volume: 0.35, ...extra };
}

function setup() {
  const timelines = [];
  const gsap = {
    set: vi.fn(),
    killTweensOf: vi.fn(),
    timeline: vi.fn((options) => {
      const timeline = {
        options,
        to: vi.fn().mockReturnThis(),
        call: vi.fn().mockReturnThis(),
        kill: vi.fn(),
      };
      timelines.push(timeline);
      return timeline;
    }),
  };
  const commit = vi.fn();
  const playback = vi.fn();
  const prepare = vi.fn();
  const clearPrepared = vi.fn();
  const root = { dataset: {} };
  const current = [{}, {}];
  const controller = createCoverPlayerMotionController({
    gsap,
    root,
    current,
    commitFrame: commit,
    commitPlayback: playback,
    prepareFrame: prepare,
    clearPreparedFrame: clearPrepared,
  });
  const update = (value, options = {}) =>
    controller.update(value, { active: true, ...options });
  return {
    gsap,
    timelines,
    commit,
    playback,
    prepare,
    clearPrepared,
    root,
    current,
    controller,
    update,
  };
}

describe('cover player track handoff', () => {
  it('commits the first frame immediately, then replaces cover and copy only at the invisible handoff', () => {
    const h = setup();
    h.update(frame('A'));
    expect(h.commit).toHaveBeenLastCalledWith(frame('A'));
    expect(h.timelines).toHaveLength(0);
    h.update(frame('B'));
    expect(h.prepare).toHaveBeenLastCalledWith(frame('B'));
    expect(h.commit).toHaveBeenCalledTimes(1);
    const transition = h.timelines[0];
    expect(transition.to.mock.calls[0]).toEqual([
      h.current,
      expect.objectContaining({ autoAlpha: 0, duration: 0.16 }),
      0,
    ]);
    transition.call.mock.calls[0][0]();
    expect(h.commit).toHaveBeenLastCalledWith(frame('B'));
    expect(transition.to.mock.calls[1]).toEqual([
      h.current,
      expect.objectContaining({ autoAlpha: 1, duration: 0.24 }),
      0.16,
    ]);
    transition.options.onComplete();
    expect(h.root.dataset.coverMotion).toBe('idle');
    expect(h.gsap.set).toHaveBeenLastCalledWith(h.current, {
      clearProps: 'opacity,visibility,willChange',
    });
  });

  it('keeps paused volume, mute and progress live without restarting or prematurely committing a track fade', () => {
    const h = setup();
    h.update(frame('A'));
    h.update(frame('A', { volume: 0.8, progress: 0.5 }));
    expect(h.timelines).toHaveLength(0);
    h.update(frame('B'));
    const latest = frame('B', { volume: 0.72, muted: true, progress: 0.3 });
    h.update(latest);
    expect(h.timelines).toHaveLength(1);
    expect(h.playback).toHaveBeenLastCalledWith(latest);
    expect(h.commit).toHaveBeenCalledTimes(2);
    h.timelines[0].call.mock.calls[0][0]();
    expect(h.commit).toHaveBeenLastCalledWith(latest);
    h.update(frame('B', { volume: 0.9 }));
    expect(h.timelines).toHaveLength(1);
    expect(h.commit).toHaveBeenLastCalledWith(frame('B', { volume: 0.9 }));
  });

  it('ignores stale callbacks on rapid A to B to C and returning to A', () => {
    const h = setup();
    h.update(frame('A'));
    h.update(frame('B'));
    const stale = h.timelines[0];
    h.update(frame('C'));
    expect(stale.kill).toHaveBeenCalledOnce();
    stale.call.mock.calls[0][0]();
    stale.options.onComplete();
    expect(h.commit).toHaveBeenCalledTimes(1);
    h.timelines[1].call.mock.calls[0][0]();
    expect(h.commit).toHaveBeenLastCalledWith(frame('C'));
    h.update(frame('A'));
    h.timelines[2].call.mock.calls[0][0]();
    expect(h.commit).toHaveBeenLastCalledWith(frame('A'));
  });

  it('settles latest state when reduced motion, visibility recovery or template changes interrupt it', () => {
    const h = setup();
    h.update(frame('A'));
    h.update(frame('B'));
    h.controller.setReducedMotion(true);
    expect(h.commit).toHaveBeenLastCalledWith(frame('B'));
    h.update(frame('C'));
    expect(h.timelines).toHaveLength(1);
    h.controller.setReducedMotion(false);
    h.update(frame('D'));
    h.controller.suspend();
    h.update(frame('E'));
    h.controller.resume();
    expect(h.commit).toHaveBeenLastCalledWith(frame('E'));
    h.update(frame('F'), { settle: true });
    expect(h.commit).toHaveBeenLastCalledWith(frame('F'));
    const count = h.commit.mock.calls.length;
    h.controller.update(frame('G'), { active: false });
    expect(h.commit).toHaveBeenCalledTimes(count);
    h.update(frame('G'));
    expect(h.commit).toHaveBeenLastCalledWith(frame('G'));
  });

  it('clears on empty state and cannot commit after disposal', () => {
    const h = setup();
    h.update(frame('A'));
    h.update(frame('', { visible: false }));
    expect(h.commit).toHaveBeenLastCalledWith(frame('', { visible: false }));
    h.update(frame('B'));
    h.update(frame('C'));
    const stale = h.timelines.at(-1);
    const count = h.commit.mock.calls.length;
    h.controller.destroy();
    stale.call.mock.calls[0][0]();
    stale.options.onComplete();
    h.update(frame('D'));
    expect(h.commit).toHaveBeenCalledTimes(count);
  });

  it('remains usable without GSAP', () => {
    const commit = vi.fn();
    const controller = createCoverPlayerMotionController({
      commitFrame: commit,
    });
    controller.update(frame('A'), { active: true });
    controller.update(frame('B'), { active: true });
    expect(commit).toHaveBeenLastCalledWith(frame('B'));
    controller.destroy();
  });
});
