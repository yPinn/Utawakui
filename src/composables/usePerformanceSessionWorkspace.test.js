import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('usePerformanceSessionWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('opens preparation in Performance and returns to the prior destination', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('display');

    workspace.open();

    expect(workspace.isOpen.value).toBe(true);
    expect(appView.activeView.value).toBe('performance');
    expect(appView.performanceTool.value).toBe('session');

    workspace.close();

    expect(workspace.isOpen.value).toBe(false);
    expect(appView.activeView.value).toBe('display');
  });

  it('returns direct Performance navigation to the Library root', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('performance');

    workspace.close();

    expect(workspace.isOpen.value).toBe(false);
    expect(appView.activeView.value).toBe('library');
    expect(appView.libraryWorkspace.value).toBe('browse');
  });

  it('clears contextual return state when Performance is explicitly reselected', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('display');
    workspace.open();

    appView.setActiveView('performance');
    await nextTick();

    expect(workspace.isOpen.value).toBe(false);
    workspace.close();
    expect(appView.activeView.value).toBe('library');
  });

  it('normalizes a Settings entry to its underlying destination', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('display');
    appView.openSettings();

    workspace.open();
    workspace.close();

    expect(appView.activeView.value).toBe('display');
  });

  it('preserves contextual return state while Settings temporarily overlays it', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('display');
    workspace.open();

    appView.openSettings();
    appView.returnFromSettings();
    await nextTick();
    workspace.close();

    expect(appView.activeView.value).toBe('display');
  });
});
