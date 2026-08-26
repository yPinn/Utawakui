import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';

vi.mock('./usePlayer.js', () => ({
  usePlayer: () => ({
    state: {
      volume: 0.5,
      transposeSemitones: 0,
      tempoRate: 1,
    },
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    toggleCaptureGuideVocal: vi.fn(),
    setTransposeSemitones: vi.fn(),
    setTempoRate: vi.fn(),
  }),
}));

let keydownListener;

beforeEach(() => {
  keydownListener = null;
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type, listener) => {
      if (type === 'keydown') keydownListener = listener;
    }),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function setupShortcuts(options) {
  const activeView = shallowRef('setlist');
  const { useKeyboardShortcuts } = await import('./useKeyboardShortcuts.js');

  await renderToString(
    createSSRApp({
      setup() {
        useKeyboardShortcuts(activeView, options);
        return () => h('div');
      },
    }),
  );

  return activeView;
}

function dispatchKey(key) {
  const preventDefault = vi.fn();
  keydownListener({
    key,
    preventDefault,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: null,
  });
  return preventDefault;
}

describe('useKeyboardShortcuts', () => {
  it('maps F3/F4 to the visible Output/Import tab order', async () => {
    const activeView = await setupShortcuts();

    const f3PreventDefault = dispatchKey('F3');
    expect(activeView.value).toBe('output');
    expect(f3PreventDefault).toHaveBeenCalled();

    const f4PreventDefault = dispatchKey('F4');
    expect(activeView.value).toBe('import');
    expect(f4PreventDefault).toHaveBeenCalled();
  });

  it('maps F9/F10 to the hidden UI and Music Analysis workbenches', async () => {
    const activeView = await setupShortcuts({
      internalWorkbenchesEnabled: true,
    });

    const f9PreventDefault = dispatchKey('F9');
    expect(activeView.value).toBe('demo');
    expect(f9PreventDefault).toHaveBeenCalled();

    const f10PreventDefault = dispatchKey('F10');
    expect(activeView.value).toBe('music-analysis');
    expect(f10PreventDefault).toHaveBeenCalled();
  });

  it('leaves F9/F10 unused when internal workbenches are disabled', async () => {
    const activeView = await setupShortcuts({
      internalWorkbenchesEnabled: false,
    });

    const f9PreventDefault = dispatchKey('F9');
    expect(activeView.value).toBe('setlist');
    expect(f9PreventDefault).not.toHaveBeenCalled();

    const f10PreventDefault = dispatchKey('F10');
    expect(activeView.value).toBe('setlist');
    expect(f10PreventDefault).not.toHaveBeenCalled();
  });
});
