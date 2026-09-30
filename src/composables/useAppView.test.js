import { beforeEach, describe, expect, it } from 'vitest';
import { useAppView } from './useAppView.js';

describe('useAppView', () => {
  beforeEach(() => {
    useAppView().setActiveView('setlist');
  });

  it('remembers the non-Settings source and keeps repeated opens idempotent', () => {
    const appView = useAppView();
    appView.setActiveView('lyrics');

    appView.openSettings();
    expect(appView.activeView.value).toBe('settings');
    expect(appView.returnView.value).toBe('lyrics');
    expect(appView.isSettingsView.value).toBe(true);

    appView.openSettings();
    expect(appView.returnView.value).toBe('lyrics');
  });

  it('returns to the remembered workspace and falls back to Setlist', () => {
    const appView = useAppView();

    appView.openSettings();
    appView.returnFromSettings();

    expect(appView.activeView.value).toBe('setlist');
    expect(appView.returnView.value).toBe('setlist');
    expect(appView.isSettingsView.value).toBe(false);
  });

  it('returns to an internal development view without treating Settings as history', () => {
    const appView = useAppView();
    appView.setActiveView('visual-system');

    appView.setActiveView('settings');
    appView.returnFromSettings();

    expect(appView.activeView.value).toBe('visual-system');
    expect(appView.returnView.value).toBe('visual-system');
  });

  it('updates the return destination whenever a non-Settings view is selected', () => {
    const appView = useAppView();
    appView.openSettings();

    appView.setActiveView('output');

    expect(appView.activeView.value).toBe('output');
    expect(appView.returnView.value).toBe('output');
  });
});
