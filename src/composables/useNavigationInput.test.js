import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

const lifecycle = vi.hoisted(() => ({ unmounted: [] }));
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onUnmounted(callback) {
      lifecycle.unmounted.push(callback);
    },
  };
});

const history = vi.hoisted(() => ({
  back: vi.fn(() => true),
  forward: vi.fn(() => true),
}));
vi.mock('./useNavigationHistory.js', () => ({
  useNavigationHistory: () => history,
}));

const overlay = vi.hoisted(() => ({ open: false }));
vi.mock('../utils/transientOverlay.js', () => ({
  hasOpenTransientOverlay: () => overlay.open,
}));

import {
  HISTORY_INPUT_DEDUP_MS,
  requestHistoryTraversal,
  useNavigationInput,
} from './useNavigationInput.js';

let listeners;
let commandListener;
let unsubscribeCommand;
let scope;
// The dedupe window is module state; give every test a clock past the last one.
let clock = 0;

beforeEach(() => {
  vi.useFakeTimers();
  clock += 10_000;
  vi.setSystemTime(clock);
  lifecycle.unmounted = [];
  overlay.open = false;
  history.back.mockClear();
  history.forward.mockClear();
  listeners = new Map();
  commandListener = null;
  unsubscribeCommand = vi.fn();
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
    Utawakui: {
      onHistoryCommand: vi.fn((callback) => {
        commandListener = callback;
        return unsubscribeCommand;
      }),
    },
  });
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mouse(type, button) {
  const event = { type, button, preventDefault: vi.fn() };
  listeners.get(type)?.(event);
  return event;
}

function advance(ms = HISTORY_INPUT_DEDUP_MS + 1) {
  vi.advanceTimersByTime(ms);
}

describe('requestHistoryTraversal', () => {
  it('traverses back and forward', () => {
    expect(requestHistoryTraversal('back')).toBe(true);
    advance();
    expect(requestHistoryTraversal('forward')).toBe(true);

    expect(history.back).toHaveBeenCalledOnce();
    expect(history.forward).toHaveBeenCalledOnce();
  });

  it('reports whether history actually moved', () => {
    history.back.mockReturnValueOnce(false);

    expect(requestHistoryTraversal('back')).toBe(false);
  });

  it('does nothing while a transient overlay is open', () => {
    overlay.open = true;

    expect(requestHistoryTraversal('back')).toBe(false);
    expect(history.back).not.toHaveBeenCalled();

    overlay.open = false;
    expect(requestHistoryTraversal('back')).toBe(true);
  });

  it('collapses duplicate events of one physical action', () => {
    requestHistoryTraversal('back');
    advance(HISTORY_INPUT_DEDUP_MS - 1);
    requestHistoryTraversal('back');

    expect(history.back).toHaveBeenCalledOnce();
  });

  it('allows the same direction again after the dedupe window', () => {
    requestHistoryTraversal('back');
    advance();
    requestHistoryTraversal('back');

    expect(history.back).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe across directions', () => {
    requestHistoryTraversal('back');
    requestHistoryTraversal('forward');

    expect(history.back).toHaveBeenCalledOnce();
    expect(history.forward).toHaveBeenCalledOnce();
  });

  it('does not start the dedupe window for a blocked request', () => {
    overlay.open = true;
    requestHistoryTraversal('back');
    overlay.open = false;
    requestHistoryTraversal('back');

    expect(history.back).toHaveBeenCalledOnce();
  });
});

describe('useNavigationInput', () => {
  it('traverses on mouse button release and prevents the default', () => {
    scope.run(() => useNavigationInput());

    const up = mouse('mouseup', 3);
    advance();
    mouse('mouseup', 4);

    expect(up.preventDefault).toHaveBeenCalled();
    expect(history.back).toHaveBeenCalledOnce();
    expect(history.forward).toHaveBeenCalledOnce();
  });

  it('suppresses the browser default for the side buttons without traversing', () => {
    scope.run(() => useNavigationInput());

    expect(mouse('mousedown', 3).preventDefault).toHaveBeenCalled();
    expect(mouse('auxclick', 4).preventDefault).toHaveBeenCalled();

    expect(history.back).not.toHaveBeenCalled();
    expect(history.forward).not.toHaveBeenCalled();
  });

  it('leaves the primary, middle and context buttons alone', () => {
    scope.run(() => useNavigationInput());

    for (const button of [0, 1, 2]) {
      expect(mouse('mousedown', button).preventDefault).not.toHaveBeenCalled();
      expect(mouse('mouseup', button).preventDefault).not.toHaveBeenCalled();
      expect(mouse('auxclick', button).preventDefault).not.toHaveBeenCalled();
    }
    expect(history.back).not.toHaveBeenCalled();
    expect(history.forward).not.toHaveBeenCalled();
  });

  it('still suppresses the default while an overlay blocks traversal', () => {
    overlay.open = true;
    scope.run(() => useNavigationInput());

    expect(mouse('mouseup', 3).preventDefault).toHaveBeenCalled();
    expect(history.back).not.toHaveBeenCalled();
  });

  it('follows history commands forwarded from the main process', () => {
    scope.run(() => useNavigationInput());

    commandListener('back');
    advance();
    commandListener('forward');

    expect(history.back).toHaveBeenCalledOnce();
    expect(history.forward).toHaveBeenCalledOnce();
  });

  it('collapses a mouse release and an app command from the same click', () => {
    scope.run(() => useNavigationInput());

    mouse('mouseup', 3);
    commandListener('back');

    expect(history.back).toHaveBeenCalledOnce();
  });

  it('works without the main-process bridge', () => {
    window.Utawakui = {};

    expect(() => scope.run(() => useNavigationInput())).not.toThrow();
    mouse('mouseup', 3);
    expect(history.back).toHaveBeenCalledOnce();
  });

  it('releases every listener on unmount', () => {
    scope.run(() => useNavigationInput());
    expect([...listeners.keys()].sort()).toEqual([
      'auxclick',
      'mousedown',
      'mouseup',
    ]);

    lifecycle.unmounted.forEach((callback) => callback());

    expect(listeners.size).toBe(0);
    expect(unsubscribeCommand).toHaveBeenCalledOnce();
  });
});
