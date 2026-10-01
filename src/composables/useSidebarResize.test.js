import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useSidebarResize', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {
      Utawakui: {
        initialSidebarWidth: 256,
        setSidebarWidth: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('toggles between compact and the last expanded width and persists both', async () => {
    const { useSidebarWidth } = await import('./useSidebarWidth.js');
    const { useSidebarResize } = await import('./useSidebarResize.js');
    const sidebarWidth = useSidebarWidth();
    const { toggleSidebarCollapse } = useSidebarResize();

    sidebarWidth.setWidth(280);
    await toggleSidebarCollapse();

    expect(sidebarWidth.width.value).toBe(64);
    expect(window.Utawakui.setSidebarWidth).toHaveBeenCalledWith(64);

    await toggleSidebarCollapse();

    expect(sidebarWidth.width.value).toBe(280);
    expect(window.Utawakui.setSidebarWidth).toHaveBeenLastCalledWith(280);
  });

  it('restores the standard expanded width when the app starts compact', async () => {
    window.Utawakui.initialSidebarWidth = 64;
    const { useSidebarWidth } = await import('./useSidebarWidth.js');
    const { useSidebarResize } = await import('./useSidebarResize.js');

    await useSidebarResize().toggleSidebarCollapse();

    expect(useSidebarWidth().width.value).toBe(256);
  });

  it('supports bounded keyboard resizing without leaving an oversized compact rail', async () => {
    const { SIDEBAR_WIDTH_MAX, useSidebarWidth } =
      await import('./useSidebarWidth.js');
    const { useSidebarResize } = await import('./useSidebarResize.js');
    const sidebarWidth = useSidebarWidth();
    const { resizeBy, resizeTo } = useSidebarResize();

    sidebarWidth.setWidth(280);
    await resizeBy(-8);
    expect(sidebarWidth.width.value).toBe(272);

    await resizeTo(256);
    await resizeBy(-8);
    expect(sidebarWidth.width.value).toBe(64);

    await resizeTo(SIDEBAR_WIDTH_MAX + 80);
    expect(sidebarWidth.width.value).toBe(SIDEBAR_WIDTH_MAX);
    expect(window.Utawakui.setSidebarWidth).toHaveBeenLastCalledWith(
      SIDEBAR_WIDTH_MAX,
    );
  });
});
