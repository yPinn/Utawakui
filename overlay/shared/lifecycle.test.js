import { describe, expect, it, vi } from 'vitest';
import { createOverlayHost } from './lifecycle.mjs';
import { createOverlayFontObserver } from './appearance.mjs';
import { createOutputScenario } from '../../scripts/outputAppearanceBaseline.mjs';

function events() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type, value = {}) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(value);
    },
    count() {
      return [...listeners.values()].reduce((n, set) => n + set.size, 0);
    },
  };
}

function setup(options = {}) {
  const media = { ...events(), matches: false };
  const document = { ...events(), hidden: false };
  const window = { ...events(), matchMedia: () => media };
  const frames = [];
  const activity = vi.fn();
  const motion = vi.fn();
  const dispose = vi.fn();
  let callbacks;
  const connection = { start: vi.fn(), stop: vi.fn() };
  const host = createOverlayHost({
    document,
    window,
    kind: 'lyrics',
    createConnection(value) {
      callbacks = value;
      return connection;
    },
    onSnapshot: (...args) => frames.push(args),
    onActivity: activity,
    onReducedMotion: motion,
    onDispose: dispose,
    ...options,
  });
  return {
    host,
    callbacks,
    document,
    window,
    media,
    frames,
    activity,
    motion,
    dispose,
    connection,
  };
}

describe('F2 shared Overlay host', () => {
  it('defers font remeasurement while inactive and drops config/font callbacks after dispose', async () => {
    const fonts = { ...events(), ready: Promise.resolve() };
    const onFontsChanged = vi.fn();
    const onConfig = vi.fn();
    const state = setup({
      document: { ...events(), hidden: false, fonts },
      onFontsChanged,
      onConfig,
    });
    state.host.start();
    await Promise.resolve();
    expect(onFontsChanged).not.toHaveBeenCalled();
    state.callbacks.onConfig({ templateId: 'live-stage' });
    expect(onConfig).toHaveBeenCalledOnce();
    state.callbacks.onStatus('connected');
    state.callbacks.onSnapshot(createOutputScenario('playing-t1').snapshot);
    expect(onFontsChanged).toHaveBeenCalledOnce();
    fonts.emit('loadingdone');
    expect(onFontsChanged).toHaveBeenCalledTimes(2);
    state.host.dispose();
    fonts.emit('loadingerror');
    state.callbacks.onConfig({});
    state.callbacks.onStatus('connected');
    expect(onFontsChanged).toHaveBeenCalledTimes(2);
    expect(onConfig).toHaveBeenCalledOnce();
    expect(fonts.count()).toBe(0);
  });
  it('starts once, owns subscriptions and disposes once on pagehide', () => {
    const state = setup();
    state.host.start();
    state.host.start();
    expect(state.connection.start).toHaveBeenCalledTimes(1);
    state.window.emit('pagehide');
    state.host.dispose();
    state.host.start();
    expect(state.connection.stop).toHaveBeenCalledTimes(1);
    expect(state.dispose).toHaveBeenCalledTimes(1);
    expect(
      state.document.count() + state.window.count() + state.media.count(),
    ).toBe(0);
    state.callbacks.onSnapshot(createOutputScenario('playing-t1').snapshot);
    state.media.emit('change', { matches: true });
    expect(state.frames).toHaveLength(0);
    expect(state.motion).toHaveBeenCalledTimes(1);
  });

  it('repeated mounts leave no listeners or connection', () => {
    for (let i = 0; i < 5; i++) {
      const state = setup();
      state.host.start();
      state.host.dispose();
      expect(
        state.document.count() + state.window.count() + state.media.count(),
      ).toBe(0);
      expect(state.connection.stop).toHaveBeenCalledOnce();
    }
  });

  it('uses native initial and changing motion preference without GSAP', () => {
    const state = setup();
    state.media.matches = true;
    state.host.start();
    expect(state.motion).toHaveBeenLastCalledWith(true);
    state.media.emit('change', { matches: false });
    expect(state.motion).toHaveBeenLastCalledWith(false);
    expect(state.host.reducedMotion).toBe(false);
    state.host.dispose();
  });

  it('supports legacy MediaQueryList listeners and missing browser APIs', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const state = setup({
      window: {
        ...events(),
        matchMedia: () => ({ matches: false, addListener, removeListener }),
      },
    });
    state.host.start();
    state.host.dispose();
    expect(addListener).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith(addListener.mock.calls[0][0]);
    const absent = setup({ window: events() });
    absent.host.start();
    absent.host.dispose();
  });

  it('waits for fresh content after reconnect and settles only the latest hidden snapshot', () => {
    const state = setup();
    state.host.start();
    const initial = createOutputScenario('playing-t1').snapshot;
    state.callbacks.onStatus('connected');
    expect(state.host.active).toBe(false);
    state.callbacks.onSnapshot(initial);
    expect(state.frames.at(-1)).toEqual([initial, { recovering: false }]);
    expect(state.host.active).toBe(true);
    state.callbacks.onSnapshot(initial);
    expect(state.frames.at(-1)[1].recovering).toBe(false);
    state.document.hidden = true;
    state.document.emit('visibilitychange');
    const count = state.frames.length;
    state.callbacks.onSnapshot(createOutputScenario('track-change').snapshot);
    const latest = createOutputScenario('rapid-track-changes').snapshot;
    state.callbacks.onSnapshot(latest);
    expect(state.frames).toHaveLength(count);
    state.document.hidden = false;
    state.document.emit('visibilitychange');
    expect(state.frames.at(-1)).toEqual([latest, { recovering: true }]);
    state.callbacks.onStatus('reconnecting');
    state.callbacks.onStatus('connected');
    expect(state.host.active).toBe(false);
    expect(state.frames).toHaveLength(count + 1);
    state.callbacks.onSnapshot(initial);
    expect(state.frames.at(-1)[1].recovering).toBe(true);
    state.host.dispose();
  });

  it('permits preview visibility activity while transport is offline', () => {
    const state = setup({ previewMode: true });
    state.host.start();
    expect(state.host.active).toBe(true);
    state.callbacks.onStatus('reconnecting');
    expect(state.host.active).toBe(true);
    state.host.dispose();
  });

  it('does not keep resources when route cleanup throws', () => {
    const state = setup({
      onDispose() {
        throw new Error('route cleanup');
      },
    });
    state.host.start();
    expect(() => state.host.dispose()).toThrow('route cleanup');
    expect(state.connection.stop).toHaveBeenCalledOnce();
    expect(
      state.document.count() + state.window.count() + state.media.count(),
    ).toBe(0);
  });
});

describe('F2 font readiness without asset import or first-frame blocking', () => {
  it('notifies ready, error and late load without loading font bytes', async () => {
    let resolve;
    const fonts = {
      ...events(),
      ready: new Promise((done) => {
        resolve = done;
      }),
      load: vi.fn(),
    };
    const notify = vi.fn();
    const stop = createOverlayFontObserver({ fonts }, notify);
    expect(notify).not.toHaveBeenCalled();
    fonts.emit('loadingerror');
    expect(notify).toHaveBeenLastCalledWith('fallback');
    resolve();
    await Promise.resolve();
    expect(notify).toHaveBeenLastCalledWith('ready');
    fonts.emit('loadingdone');
    expect(notify).toHaveBeenLastCalledWith('ready');
    stop();
    stop();
    fonts.emit('loadingdone');
    expect(fonts.count()).toBe(0);
    expect(fonts.load).not.toHaveBeenCalled();
  });

  it('falls back when font readiness rejects or API is missing and ignores late completion after disposal', async () => {
    const notify = vi.fn();
    createOverlayFontObserver(
      { fonts: { ready: Promise.reject(new Error('font denied')) } },
      notify,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(notify).toHaveBeenCalledWith('fallback');
    const missing = vi.fn();
    const stopMissing = createOverlayFontObserver({}, missing);
    expect(missing).toHaveBeenCalledWith('fallback');
    stopMissing();
    const late = vi.fn();
    const stop = createOverlayFontObserver(
      { fonts: { ready: Promise.resolve() } },
      late,
    );
    stop();
    await Promise.resolve();
    expect(late).not.toHaveBeenCalled();
  });
});
