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

  it('maps F9 to Settings even with no internal workbenches injected', async () => {
    const activeView = await setupShortcuts();

    const f9PreventDefault = dispatchKey('F9');
    expect(activeView.value).toBe('settings');
    expect(f9PreventDefault).toHaveBeenCalled();
  });

  it('maps F5-F8 to the hidden Music Analysis, Diagnostics, Lyrics Provider Review, and Visual System workbenches', async () => {
    const activeView = await setupShortcuts({
      internalViewShortcuts: {
        f5: 'music-analysis',
        f6: 'diagnostics-workbench',
        f7: 'lyrics-provider-review',
        f8: 'visual-system',
      },
    });

    const f5PreventDefault = dispatchKey('F5');
    expect(activeView.value).toBe('music-analysis');
    expect(f5PreventDefault).toHaveBeenCalled();

    const f6PreventDefault = dispatchKey('F6');
    expect(activeView.value).toBe('diagnostics-workbench');
    expect(f6PreventDefault).toHaveBeenCalled();

    const f7PreventDefault = dispatchKey('F7');
    expect(activeView.value).toBe('lyrics-provider-review');
    expect(f7PreventDefault).toHaveBeenCalled();

    const f8PreventDefault = dispatchKey('F8');
    expect(activeView.value).toBe('visual-system');
    expect(f8PreventDefault).toHaveBeenCalled();
  });

  it('leaves F5-F8 unused when internal workbenches are disabled', async () => {
    const activeView = await setupShortcuts({
      internalViewShortcuts: {},
    });

    const f5PreventDefault = dispatchKey('F5');
    expect(activeView.value).toBe('setlist');
    expect(f5PreventDefault).not.toHaveBeenCalled();

    const f6PreventDefault = dispatchKey('F6');
    expect(activeView.value).toBe('setlist');
    expect(f6PreventDefault).not.toHaveBeenCalled();

    const f7PreventDefault = dispatchKey('F7');
    expect(activeView.value).toBe('setlist');
    expect(f7PreventDefault).not.toHaveBeenCalled();

    const f8PreventDefault = dispatchKey('F8');
    expect(activeView.value).toBe('setlist');
    expect(f8PreventDefault).not.toHaveBeenCalled();
  });
});
