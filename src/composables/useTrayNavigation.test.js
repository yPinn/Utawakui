import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppView } from './useAppView.js';
import { useTrayNavigation } from './useTrayNavigation.js';

afterEach(() => {
  vi.unstubAllGlobals();
  useAppView().setActiveView('setlist');
});

describe('useTrayNavigation', () => {
  it('opens the settings view from the fixed shell navigation event', () => {
    let listener;
    const unsubscribe = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: {
        onAppNavigation: vi.fn((callback) => {
          listener = callback;
          return unsubscribe;
        }),
      },
    });
    useAppView().setActiveView('output');
    const bridge = useTrayNavigation();

    listener('settings');

    expect(useAppView().activeView.value).toBe('settings');
    expect(useAppView().returnView.value).toBe('output');
    bridge.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
