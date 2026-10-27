import { describe, expect, it, vi } from 'vitest';

import { createBgmHandoffCoordinator } from './handoffCoordinator.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness(overrides = {}) {
  let time = 0;
  const deck = {
    hasSource: vi.fn(() => true),
    startSilent: vi.fn(async () => true),
    fadeIn: vi.fn(async () => true),
    fadeOutAndPause: vi.fn(async () => true),
    cut: vi.fn(() => true),
    ...overrides.deck,
  };
  const settings = {
    fadeInSeconds: 1.5,
    fadeOutSeconds: 1,
    preRollSeconds: 2,
    postRollSeconds: 2,
    ...overrides.settings,
  };
  const wait =
    overrides.wait ??
    vi.fn(async (milliseconds) => {
      time += milliseconds;
    });
  const coordinator = createBgmHandoffCoordinator({
    deck,
    getSettings: () => settings,
    now: () => time,
    wait,
  });
  return {
    coordinator,
    deck,
    settings,
    wait,
    getTime: () => time,
    setTime: (value) => {
      time = value;
    },
  };
}

describe('BGM handoff coordinator', () => {
  it('holds the same performance lane during practice pause and blocked return without post-roll', async () => {
    const { coordinator, deck, wait } = createHarness();
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    const lease = coordinator.acquirePractice({ onPreempt: vi.fn() });
    expect(lease).toBeTruthy();
    const waits = wait.mock.calls.length,
      starts = deck.startSilent.mock.calls.length;
    coordinator.notifyPerformanceInterrupted('pause');
    await coordinator.notifyPerformanceEnded();
    expect(deck.startSilent).toHaveBeenCalledTimes(starts);
    expect(wait).toHaveBeenCalledTimes(waits);
    expect(await coordinator.beforePerformanceStart()).toBe(true);
    expect(wait).toHaveBeenCalledTimes(waits);
    expect(lease.release()).toBe(true);
    expect(lease.release()).toBe(false);
  });
  it.each(['bgm', 'preview'])(
    'preempts practice only on an explicit %s request and invalidates old leases',
    async (kind) => {
      const { coordinator } = createHarness();
      coordinator.notifyPerformancePlaying();
      const onPreempt = vi.fn();
      const lease = coordinator.acquirePractice({ onPreempt });
      const result =
        kind === 'bgm'
          ? await coordinator.requestBgmPlay()
          : await coordinator.acquirePreview();
      expect(result).toBeTruthy();
      expect(onPreempt).toHaveBeenCalledOnce();
      expect(lease.release()).toBe(false);
      expect(coordinator.state.audibleLane).toBe(kind);
    },
  );
  it('does not allow a rejected live preview or duplicate holder to disturb practice', async () => {
    const { coordinator } = createHarness();
    const onPreempt = vi.fn();
    const lease = coordinator.acquirePractice({ onPreempt });
    expect(coordinator.acquirePractice()).toBeNull();
    await coordinator.updateSessionMode('live');
    expect(await coordinator.acquirePreview()).toBeNull();
    expect(onPreempt).not.toHaveBeenCalled();
    coordinator.dispose();
    expect(onPreempt).toHaveBeenCalledOnce();
    expect(lease.release()).toBe(false);
  });
  it('uses the short default handoff rhythm when persisted settings are unavailable', async () => {
    let time = 0;
    const deck = {
      hasSource: vi.fn(() => true),
      startSilent: vi.fn(async () => true),
      fadeIn: vi.fn(async () => true),
      fadeOutAndPause: vi.fn(async () => true),
      cut: vi.fn(),
    };
    const coordinator = createBgmHandoffCoordinator({
      deck,
      getSettings: () => ({}),
      now: () => time,
      wait: vi.fn(async (milliseconds) => {
        time += milliseconds;
      }),
    });

    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();

    expect(deck.fadeIn).toHaveBeenCalledWith(1);
    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(0.6);
    expect(time).toBe(750);
  });

  it('keeps both lanes paused when a session enters live', async () => {
    const { coordinator, deck } = createHarness();

    await coordinator.updateSessionMode('live');

    expect(coordinator.state.sessionMode).toBe('live');
    expect(coordinator.state.phase).toBe('idle');
    expect(deck.startSilent).not.toHaveBeenCalled();
  });

  it('starts BGM only from explicit user intent in any session mode', async () => {
    const { coordinator, deck } = createHarness();

    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);

    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(deck.fadeIn).toHaveBeenCalledWith(1.5);
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(coordinator.state.audibleLane).toBe('bgm');
  });

  it('keeps a deferred restore separate from the current BGM play state', async () => {
    const { coordinator, deck } = createHarness();
    coordinator.notifyPerformancePlaying();
    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);

    expect(coordinator.state.phase).toBe('track-active');
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(true);
    expect(deck.startSilent).not.toHaveBeenCalled();
  });

  it('does not add fade or pre-roll when no BGM handoff is needed', async () => {
    const { coordinator, deck, wait } = createHarness();

    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);

    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('idle');
  });

  it('does not arm or delay performance when no BGM source exists', async () => {
    const { coordinator, deck, wait } = createHarness({
      deck: { hasSource: vi.fn(() => false) },
    });

    await expect(coordinator.requestBgmPlay()).resolves.toBe(false);
    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);

    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.phase).toBe('error');
    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it('does not add pre-roll when BGM is only armed behind an active performance', async () => {
    const { coordinator, deck, wait } = createHarness();
    coordinator.notifyPerformancePlaying();
    await coordinator.requestBgmPlay();

    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);

    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('track-active');
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(true);
  });

  it('resets the BGM transport state as soon as the performance handoff starts', async () => {
    const stopped = createDeferred();
    const { coordinator } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => stopped.promise) },
    });
    await coordinator.requestBgmPlay();

    const startPromise = coordinator.beforePerformanceStart();

    expect(coordinator.state.phase).toBe('stopping-bgm');
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(true);
    expect(coordinator.state.audibleLane).toBe('bgm');

    stopped.resolve(true);
    await expect(startPromise).resolves.toBe(true);
    expect(coordinator.state.audibleLane).toBeNull();
  });

  it('reaches exact BGM silence before starting the full pre-roll', async () => {
    const { coordinator, deck, wait, getTime } = createHarness();
    await coordinator.updateSessionMode('live');
    await coordinator.requestBgmPlay();
    wait.mockClear();

    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);

    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(1);
    expect(wait).toHaveBeenCalledWith(2000);
    expect(getTime()).toBe(2000);
    expect(coordinator.state.phase).toBe('track-preroll');
    expect(coordinator.state.audibleLane).toBeNull();
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(true);
  });

  it('uses a monotonic deadline when a timer wakes early', async () => {
    let time = 0;
    const wait = vi.fn(async (milliseconds) => {
      time += Math.min(milliseconds, 700);
    });
    // Build with the externally controlled clock so each early wake is checked.
    const deck = {
      hasSource: () => true,
      fadeOutAndPause: vi.fn(async () => true),
      startSilent: vi.fn(async () => true),
      fadeIn: vi.fn(async () => true),
      cut: vi.fn(),
    };
    const deadlineCoordinator = createBgmHandoffCoordinator({
      deck,
      getSettings: () => ({
        fadeInSeconds: 1.5,
        fadeOutSeconds: 1,
        preRollSeconds: 2,
        postRollSeconds: 2,
      }),
      now: () => time,
      wait,
    });
    await deadlineCoordinator.requestBgmPlay();

    await deadlineCoordinator.beforePerformanceStart();

    expect(time).toBeGreaterThanOrEqual(2000);
    expect(wait.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not let a BGM hold cancel an in-flight performance pre-roll', async () => {
    const deferred = createDeferred();
    let advanceClock = () => {};
    const { coordinator, deck, setTime } = createHarness({
      wait: vi.fn(async (milliseconds) => {
        await deferred.promise;
        advanceClock(milliseconds);
      }),
    });
    advanceClock = setTime;
    await coordinator.updateSessionMode('live');
    await coordinator.requestBgmPlay();

    const startPromise = coordinator.beforePerformanceStart();
    await vi.waitFor(() =>
      expect(coordinator.state.phase).toBe('track-preroll'),
    );
    await coordinator.requestBgmPause({ immediate: true });
    deferred.resolve();

    await expect(startPromise).resolves.toBe(true);
    expect(deck.cut).toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('track-preroll');
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(false);
  });

  it('lets Emergency Cut finish the BGM stop without cancelling performance start', async () => {
    const fade = createDeferred();
    const { coordinator, deck } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => fade.promise) },
    });
    await coordinator.requestBgmPlay();

    const startPromise = coordinator.beforePerformanceStart();
    expect(coordinator.state.phase).toBe('stopping-bgm');

    await coordinator.requestBgmPause({ immediate: true });

    await vi.waitFor(() =>
      expect(coordinator.state.phase).toBe('track-preroll'),
    );
    await expect(startPromise).resolves.toBe(true);
    expect(deck.cut).toHaveBeenCalledOnce();
  });

  it('defers source replacement until the performance stop is confirmed', async () => {
    const fade = createDeferred();
    const replaceSource = vi.fn(async () => {});
    const { coordinator } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => fade.promise) },
    });
    await coordinator.requestBgmPlay();

    const startPromise = coordinator.beforePerformanceStart();
    const replacePromise = coordinator.replaceBgmSource(replaceSource);

    expect(replaceSource).not.toHaveBeenCalled();
    fade.resolve(true);

    await expect(startPromise).resolves.toBe(true);
    await expect(replacePromise).resolves.toBe(true);
    expect(replaceSource).toHaveBeenCalledOnce();
    expect(coordinator.state.phase).toBe('track-preroll');
  });

  it('settles a pending handoff and deferred source replacement on dispose', async () => {
    const fade = createDeferred();
    const replaceSource = vi.fn(async () => {});
    const { coordinator } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => fade.promise) },
    });
    await coordinator.requestBgmPlay();

    const startPromise = coordinator.beforePerformanceStart();
    const replacePromise = coordinator.replaceBgmSource(replaceSource);
    coordinator.dispose();

    await expect(startPromise).resolves.toBe(false);
    await expect(replacePromise).resolves.toBe(false);
    expect(replaceSource).not.toHaveBeenCalled();
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(false);
    expect(coordinator.state.audibleLane).toBeNull();
  });

  it('projects stopping while an offline pause fade is still in progress', async () => {
    const deferred = createDeferred();
    const { coordinator } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => deferred.promise) },
    });
    await coordinator.requestBgmPlay();

    const pausePromise = coordinator.requestBgmPause();
    expect(coordinator.state.phase).toBe('stopping-bgm');
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.audibleLane).toBe('bgm');

    deferred.resolve(true);
    await expect(pausePromise).resolves.toBe(true);
    expect(coordinator.state.phase).toBe('manual-hold');
    expect(coordinator.state.audibleLane).toBeNull();
  });

  it('waits through post-roll before restoring requested BGM', async () => {
    const { coordinator, deck, wait } = createHarness();
    await coordinator.updateSessionMode('live');
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    deck.startSilent.mockClear();
    wait.mockClear();

    await coordinator.notifyPerformanceEnded();

    expect(wait).toHaveBeenCalledWith(2000);
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(deck.fadeIn).toHaveBeenCalledWith(1.5);
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(coordinator.state.bgmRequested).toBe(true);
    expect(coordinator.state.restorePending).toBe(false);
  });

  it('does not let a repeated BGM play request bypass post-roll silence', async () => {
    const postRoll = createDeferred();
    let advanceClock = () => {};
    const { coordinator, deck, setTime } = createHarness({
      settings: { preRollSeconds: 0 },
      wait: vi.fn(async (milliseconds) => {
        await postRoll.promise;
        advanceClock(milliseconds);
      }),
    });
    advanceClock = setTime;
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    deck.startSilent.mockClear();

    const restorePromise = coordinator.notifyPerformanceEnded();
    expect(coordinator.state.phase).toBe('postroll-silence');

    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);
    expect(coordinator.state.phase).toBe('postroll-silence');
    expect(coordinator.state.bgmRequested).toBe(false);
    expect(coordinator.state.restorePending).toBe(true);
    expect(deck.startSilent).not.toHaveBeenCalled();

    postRoll.resolve();
    await expect(restorePromise).resolves.toBe(true);
    expect(deck.startSilent).toHaveBeenCalledOnce();
  });

  it('uses the same stop, silence, and restore handoff while offline', async () => {
    const { coordinator, deck, wait } = createHarness();
    await coordinator.requestBgmPlay();
    wait.mockClear();

    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    deck.startSilent.mockClear();
    wait.mockClear();
    await coordinator.notifyPerformanceEnded();

    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(1);
    expect(wait).toHaveBeenCalledWith(2000);
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(deck.fadeIn).toHaveBeenCalledWith(1.5);
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(coordinator.state.audibleLane).toBe('bgm');
  });

  it('restores requested BGM without post-roll when performance never reached playing', async () => {
    const { coordinator, deck, wait } = createHarness();
    await coordinator.updateSessionMode('live');
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    deck.startSilent.mockClear();
    wait.mockClear();

    await coordinator.notifyPerformanceEnded();

    expect(wait).not.toHaveBeenCalled();
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(coordinator.state.phase).toBe('bgm-playing');
  });

  it('does not auto-start BGM on explicit performance pause but restores manual control', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.updateSessionMode('live');
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    deck.startSilent.mockClear();

    expect(coordinator.notifyPerformanceInterrupted('pause')).toBe(true);
    expect(deck.startSilent).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('track-paused');
    expect(coordinator.state.audibleLane).toBeNull();
    expect(coordinator.state.restorePending).toBe(true);

    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(deck.fadeIn).toHaveBeenLastCalledWith(1.5);
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(coordinator.state.audibleLane).toBe('bgm');
  });

  it('releases a pending performance start when it is paused before confirmed playing', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    deck.startSilent.mockClear();

    expect(coordinator.notifyPerformanceInterrupted('pause')).toBe(true);
    expect(coordinator.state.phase).toBe('track-paused');
    expect(coordinator.state.audibleLane).toBeNull();

    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(coordinator.state.phase).toBe('bgm-playing');
  });

  it.each(['buffering', 'seeking', 'stalled'])(
    'keeps the performance lane locked during %s',
    async (reason) => {
      const { coordinator, deck } = createHarness();
      coordinator.notifyPerformancePlaying();

      expect(coordinator.notifyPerformanceInterrupted(reason)).toBe(true);
      await expect(coordinator.requestBgmPlay()).resolves.toBe(true);

      expect(deck.startSilent).not.toHaveBeenCalled();
      expect(coordinator.state.phase).toBe('track-active');
      expect(coordinator.state.audibleLane).toBe('performance');
      expect(coordinator.state.restorePending).toBe(true);
    },
  );

  it('resumes a quiet paused performance without fade or pre-roll delay', async () => {
    const { coordinator, deck, wait } = createHarness();
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    coordinator.notifyPerformanceInterrupted('pause');
    deck.fadeOutAndPause.mockClear();
    wait.mockClear();

    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);

    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('track-paused');
  });

  it('stops manually started BGM before a paused performance resumes', async () => {
    const { coordinator, deck, wait } = createHarness();
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    coordinator.notifyPerformanceInterrupted('pause');
    await coordinator.requestBgmPlay();
    deck.fadeOutAndPause.mockClear();
    wait.mockClear();

    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);

    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(1);
    expect(wait).toHaveBeenCalledWith(2000);
    expect(coordinator.state.phase).toBe('track-preroll');
    expect(coordinator.state.audibleLane).toBeNull();
    expect(coordinator.state.restorePending).toBe(true);
  });

  it('keeps manually started BGM playing when the paused performance is cleared', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    coordinator.notifyPerformanceInterrupted('pause');
    await coordinator.requestBgmPlay();
    deck.fadeOutAndPause.mockClear();

    await expect(coordinator.notifyPerformanceEnded()).resolves.toBe(true);

    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(coordinator.state.audibleLane).toBe('bgm');
    expect(coordinator.state.bgmRequested).toBe(true);
  });

  it('lets manual hold cancel the deferred restore after performance starts', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    deck.startSilent.mockClear();

    await coordinator.requestBgmPause();
    expect(coordinator.state.phase).toBe('track-active');
    expect(coordinator.state.audibleLane).toBe('performance');
    await coordinator.notifyPerformanceEnded();
    expect(deck.startSilent).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('manual-hold');
  });

  it('preserves transport while reconnecting and fades out on confirmed exit', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.updateSessionMode('record');
    await coordinator.requestBgmPlay();
    deck.fadeOutAndPause.mockClear();

    await coordinator.updateSessionMode('reconnecting');
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();

    await coordinator.updateSessionMode('inactive');
    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(1);
    expect(coordinator.state.phase).toBe('idle');
    expect(coordinator.state.bgmRequested).toBe(false);
  });

  it('does not treat an inactive projection refresh as a session exit', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.requestBgmPlay();
    deck.fadeOutAndPause.mockClear();

    await coordinator.updateSessionMode('inactive');

    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(coordinator.state.phase).toBe('bgm-playing');
    expect(coordinator.state.bgmRequested).toBe(true);
  });

  it('changes the single BGM source by fade-out and fade-in without crossfade', async () => {
    const { coordinator, deck } = createHarness();
    const replaceSource = vi.fn(async () => {});
    await coordinator.requestBgmPlay();
    deck.fadeOutAndPause.mockClear();
    deck.startSilent.mockClear();
    deck.fadeIn.mockClear();

    await expect(coordinator.replaceBgmSource(replaceSource)).resolves.toBe(
      true,
    );

    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(1);
    expect(replaceSource).toHaveBeenCalledOnce();
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(deck.fadeIn).toHaveBeenCalledWith(1.5);
    expect(coordinator.state.phase).toBe('bgm-playing');
  });

  it('clears stale audible intent when the BGM deck ends or fails', async () => {
    const { coordinator } = createHarness();
    await coordinator.updateSessionMode('live');
    await coordinator.requestBgmPlay();

    coordinator.notifyBgmTerminated('error');
    expect(coordinator.state).toEqual(
      expect.objectContaining({
        phase: 'error',
        audibleLane: null,
        bgmRequested: false,
        restorePending: false,
        error: 'BGM 音訊無法播放。',
      }),
    );

    await coordinator.requestBgmPlay();
    coordinator.notifyBgmTerminated('ended');
    expect(coordinator.state).toEqual(
      expect.objectContaining({
        phase: 'manual-hold',
        audibleLane: null,
        bgmRequested: false,
        restorePending: false,
        error: null,
      }),
    );
  });
});

describe('track preview lane', () => {
  it('fades audible BGM out and never restores it after release', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.requestBgmPlay();
    deck.startSilent.mockClear();

    const lease = await coordinator.acquirePreview();

    expect(deck.fadeOutAndPause).toHaveBeenCalledWith(1);
    expect(coordinator.state).toEqual(
      expect.objectContaining({
        audibleLane: 'preview',
        phase: 'manual-hold',
        bgmRequested: false,
        restorePending: false,
      }),
    );

    expect(lease.release()).toBe(true);
    expect(lease.release()).toBe(false);
    expect(coordinator.state.audibleLane).toBeNull();
    expect(deck.startSilent).not.toHaveBeenCalled();
  });

  it('is blocked while a recording or live session is active', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.updateSessionMode('record');

    await expect(coordinator.acquirePreview()).resolves.toBeNull();
    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();
    expect(coordinator.state.audibleLane).toBeNull();
  });

  it('is preempted when a session becomes active', async () => {
    const { coordinator } = createHarness();
    const onPreempt = vi.fn();
    await coordinator.acquirePreview({ onPreempt });

    await coordinator.updateSessionMode('live');

    expect(onPreempt).toHaveBeenCalledOnce();
    expect(coordinator.state.audibleLane).toBeNull();
  });

  it('cancels a pending post-roll restore', async () => {
    const postRoll = createDeferred();
    const { coordinator, deck } = createHarness({
      wait: vi.fn(() => postRoll.promise),
      settings: { preRollSeconds: 0 },
    });
    await coordinator.requestBgmPlay();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();
    deck.startSilent.mockClear();

    const restore = coordinator.notifyPerformanceEnded();
    expect(coordinator.state.phase).toBe('postroll-silence');
    await coordinator.acquirePreview();
    postRoll.resolve();

    await expect(restore).resolves.toBe(false);
    expect(deck.startSilent).not.toHaveBeenCalled();
    expect(coordinator.state.audibleLane).toBe('preview');
  });

  async function acquireDuringPreRoll() {
    const preRoll = createDeferred();
    const harness = createHarness({ wait: vi.fn(() => preRoll.promise) });
    const { coordinator } = harness;
    await coordinator.requestBgmPlay();
    const start = coordinator.beforePerformanceStart();
    await vi.waitFor(() =>
      expect(coordinator.state.phase).toBe('track-preroll'),
    );

    const lease = await coordinator.acquirePreview();
    preRoll.resolve();
    await expect(start).resolves.toBe(false);
    expect(coordinator.state.audibleLane).toBe('preview');
    harness.deck.startSilent.mockClear();
    return { ...harness, lease };
  }

  it('cancels a performance pre-roll without leaving the handoff pending', async () => {
    const { coordinator, deck, lease } = await acquireDuringPreRoll();

    lease.release();
    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);

    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(coordinator.state.audibleLane).toBe('bgm');
  });

  it('ignores a terminal stop from the cancelled start', async () => {
    const { coordinator, deck } = await acquireDuringPreRoll();

    await expect(coordinator.notifyPerformanceEnded()).resolves.toBe(false);

    expect(deck.startSilent).not.toHaveBeenCalled();
    expect(coordinator.state).toEqual(
      expect.objectContaining({
        audibleLane: 'preview',
        bgmRequested: false,
        restorePending: true,
      }),
    );
  });

  it('keeps the lane when the late performance pause event arrives', async () => {
    const { coordinator } = createHarness();
    await coordinator.beforePerformanceStart();
    coordinator.notifyPerformancePlaying();

    await coordinator.acquirePreview();
    coordinator.notifyPerformanceInterrupted('pause');

    expect(coordinator.state.audibleLane).toBe('preview');
    expect(coordinator.state.phase).toBe('track-paused');
  });

  it('is preempted by a performance start before the BGM handoff', async () => {
    const { coordinator, deck } = createHarness();
    const onPreempt = vi.fn();
    await coordinator.acquirePreview({ onPreempt });

    await expect(coordinator.beforePerformanceStart()).resolves.toBe(true);
    expect(onPreempt).toHaveBeenCalledOnce();
    expect(deck.fadeOutAndPause).not.toHaveBeenCalled();

    coordinator.notifyPerformancePlaying();
    expect(coordinator.state.audibleLane).toBe('performance');
  });

  it('is preempted by an explicit BGM play', async () => {
    const { coordinator, deck } = createHarness();
    const onPreempt = vi.fn();
    await coordinator.acquirePreview({ onPreempt });

    await expect(coordinator.requestBgmPlay()).resolves.toBe(true);

    expect(onPreempt).toHaveBeenCalledOnce();
    expect(deck.startSilent).toHaveBeenCalledOnce();
    expect(coordinator.state.audibleLane).toBe('bgm');
  });

  it('keeps the lane through a BGM pause request', async () => {
    const { coordinator, deck } = createHarness();
    await coordinator.acquirePreview();

    await expect(
      coordinator.requestBgmPause({ immediate: true }),
    ).resolves.toBe(true);

    expect(deck.cut).toHaveBeenCalledOnce();
    expect(coordinator.state.audibleLane).toBe('preview');
  });

  it('defers a BGM source change until the acquisition fade completes', async () => {
    const fade = createDeferred();
    const { coordinator } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => fade.promise) },
    });
    await coordinator.requestBgmPlay();
    const replaceSource = vi.fn();

    const acquisition = coordinator.acquirePreview();
    const replacement = coordinator.replaceBgmSource(replaceSource);
    expect(replaceSource).not.toHaveBeenCalled();

    fade.resolve(true);
    await expect(acquisition).resolves.not.toBeNull();
    await expect(replacement).resolves.toBe(true);
    expect(replaceSource).toHaveBeenCalledOnce();
    expect(coordinator.state.audibleLane).toBe('preview');
  });

  it('drops an acquisition that a newer start intent overtakes', async () => {
    const fade = createDeferred();
    const { coordinator } = createHarness({
      deck: { fadeOutAndPause: vi.fn(() => fade.promise) },
    });
    await coordinator.requestBgmPlay();

    const acquisition = coordinator.acquirePreview();
    const start = coordinator.beforePerformanceStart();
    fade.resolve(true);

    await expect(acquisition).resolves.toBeNull();
    await expect(start).resolves.toBe(true);
    expect(coordinator.state.audibleLane).not.toBe('preview');
  });

  it('preempts the preview on dispose', async () => {
    const { coordinator } = createHarness();
    const onPreempt = vi.fn();
    await coordinator.acquirePreview({ onPreempt });

    coordinator.dispose();

    expect(onPreempt).toHaveBeenCalledOnce();
    expect(coordinator.state.audibleLane).toBeNull();
  });
});
