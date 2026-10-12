import { beforeEach, describe, expect, it } from 'vitest';
import { useAppView } from './useAppView.js';

describe('useAppView', () => {
  beforeEach(() => {
    useAppView().openLibraryContent();
  });

  it('remembers the non-Settings source and keeps repeated opens idempotent', () => {
    const appView = useAppView();
    appView.openLyricsAuthoring();

    appView.openSettings();
    expect(appView.activeView.value).toBe('settings');
    expect(appView.returnView.value).toBe('library');
    expect(appView.isSettingsView.value).toBe(true);

    appView.openSettings();
    expect(appView.returnView.value).toBe('library');
  });

  it('returns to the remembered contextual workspace and falls back to Library', () => {
    const appView = useAppView();

    appView.openLyricsAuthoring();

    appView.openSettings();
    appView.returnFromSettings();

    expect(appView.activeView.value).toBe('library');
    expect(appView.libraryWorkspace.value).toBe('lyrics-authoring');
    expect(appView.returnView.value).toBe('library');
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

    appView.setActiveView('display');

    expect(appView.activeView.value).toBe('display');
    expect(appView.returnView.value).toBe('display');
  });

  it('maps contextual intents to destination-owned workspaces and tools', () => {
    const appView = useAppView();

    appView.openLyricsAuthoring();
    expect(appView.activeView.value).toBe('library');
    expect(appView.libraryWorkspace.value).toBe('lyrics-authoring');

    appView.openLibraryContent();
    expect(appView.activeView.value).toBe('library');
    expect(appView.libraryWorkspace.value).toBe('browse');

    appView.openLiveLyrics();
    expect(appView.activeView.value).toBe('performance');
    expect(appView.performanceTool.value).toBe('live-lyrics');

    appView.openPerformancePreparation();
    expect(appView.activeView.value).toBe('performance');
    expect(appView.performanceTool.value).toBe('session');
  });

  it('uses direct destination navigation as a predictable root entry', () => {
    const appView = useAppView();
    const initialRootEntryRevision = appView.rootEntryRevision.value;

    appView.openLyricsAuthoring();
    expect(appView.rootEntryRevision.value).toBe(initialRootEntryRevision);
    appView.setActiveView('library');
    expect(appView.libraryWorkspace.value).toBe('browse');
    expect(appView.rootEntryRevision.value).toBe(initialRootEntryRevision + 1);

    appView.openLiveLyrics();
    expect(appView.rootEntryRevision.value).toBe(initialRootEntryRevision + 1);
    appView.setActiveView('performance');
    expect(appView.performanceTool.value).toBe('session');
    expect(appView.rootEntryRevision.value).toBe(initialRootEntryRevision + 2);
  });
});
