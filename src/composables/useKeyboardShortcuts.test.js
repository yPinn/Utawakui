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

  it('maps F7-F10 to the hidden Studio Library, review, UI, and Music Analysis workbenches', async () => {
    const activeView = await setupShortcuts({
      internalViewShortcuts: {
        f7: 'studio-library',
        f8: 'lyrics-provider-review',
        f9: 'demo',
        f10: 'music-analysis',
      },
    });

    const f7PreventDefault = dispatchKey('F7');
    expect(activeView.value).toBe('studio-library');
    expect(f7PreventDefault).toHaveBeenCalled();

    const f8PreventDefault = dispatchKey('F8');
    expect(activeView.value).toBe('lyrics-provider-review');
    expect(f8PreventDefault).toHaveBeenCalled();

    const f9PreventDefault = dispatchKey('F9');
    expect(activeView.value).toBe('demo');
    expect(f9PreventDefault).toHaveBeenCalled();

    const f10PreventDefault = dispatchKey('F10');
    expect(activeView.value).toBe('music-analysis');
    expect(f10PreventDefault).toHaveBeenCalled();
  });

  it('leaves F7-F10 unused when internal workbenches are disabled', async () => {
    const activeView = await setupShortcuts({
      internalViewShortcuts: {},
    });

    const f7PreventDefault = dispatchKey('F7');
    expect(activeView.value).toBe('setlist');
    expect(f7PreventDefault).not.toHaveBeenCalled();

    const f8PreventDefault = dispatchKey('F8');
    expect(activeView.value).toBe('setlist');
    expect(f8PreventDefault).not.toHaveBeenCalled();

    const f9PreventDefault = dispatchKey('F9');
    expect(activeView.value).toBe('setlist');
    expect(f9PreventDefault).not.toHaveBeenCalled();

    const f10PreventDefault = dispatchKey('F10');
    expect(activeView.value).toBe('setlist');
    expect(f10PreventDefault).not.toHaveBeenCalled();
  });
});
