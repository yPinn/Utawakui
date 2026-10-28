import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', {
    Utawakui: {
      initialSidebarWidth: 280,
      setSidebarWidth: vi.fn().mockResolvedValue(undefined),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('fixed Sidebar preference', () => {
  it('normalizes the saved expanded width and commits only two states', async () => {
    const { useSidebarWidth } = await import('./useSidebarWidth.js');
    const sidebar = useSidebarWidth();
    expect(sidebar.width.value).toBe(256);
    await sidebar.toggleSidebarCollapse();
    expect(sidebar.width.value).toBe(64);
    expect(window.Utawakui.setSidebarWidth).toHaveBeenLastCalledWith(64);
    await sidebar.toggleSidebarCollapse();
    expect(sidebar.width.value).toBe(256);
    expect(window.Utawakui.setSidebarWidth).toHaveBeenLastCalledWith(256);
  });

  it('starts compact without a preference and ignores invalid changes', async () => {
    delete window.Utawakui.initialSidebarWidth;
    const { useSidebarWidth } = await import('./useSidebarWidth.js');
    const sidebar = useSidebarWidth();
    expect(sidebar.width.value).toBe(64);
    sidebar.setWidth(NaN);
    expect(sidebar.width.value).toBe(64);
    sidebar.setWidth(280);
    expect(sidebar.width.value).toBe(256);
    sidebar.setWidth(200);
    expect(sidebar.width.value).toBe(64);
    expect(window.Utawakui.setSidebarWidth).not.toHaveBeenCalled();
  });
});
