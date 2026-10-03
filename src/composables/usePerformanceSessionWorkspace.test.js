import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('usePerformanceSessionWorkspace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('opens the preparation workspace in Setlist and returns to the prior view', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('output');

    workspace.open();

    expect(workspace.isOpen.value).toBe(true);
    expect(appView.activeView.value).toBe('setlist');

    workspace.close();

    expect(workspace.isOpen.value).toBe(false);
    expect(appView.activeView.value).toBe('output');
  });

  it('closes back to the Setlist collection when opened from Setlist', async () => {
    const { useAppView } = await import('./useAppView.js');
    const { usePerformanceSessionWorkspace } =
      await import('./usePerformanceSessionWorkspace.js');
    const appView = useAppView();
    const workspace = usePerformanceSessionWorkspace();
    appView.setActiveView('setlist');

    workspace.open();
    workspace.close();

    expect(workspace.isOpen.value).toBe(false);
    expect(appView.activeView.value).toBe('setlist');
  });
});
