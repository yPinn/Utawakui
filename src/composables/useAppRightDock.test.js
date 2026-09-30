import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAppRightDock', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps metadata below queue and reveals it when queue is removed', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);

    dock.hideSurface(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);
  });

  it('keeps the accompaniment list above playback queue and reveals playback when closed', async () => {
    const {
      RIGHT_DOCK_SURFACE_QUEUE,
      RIGHT_DOCK_SURFACE_SEPARATION,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.showSurface(RIGHT_DOCK_SURFACE_SEPARATION);

    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_SEPARATION);
    expect(dock.mountedSurfaces.separation).toBe(true);

    dock.hideSurface(RIGHT_DOCK_SURFACE_SEPARATION);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.isExpanded.value).toBe(true);
  });

  it('lets the playback trigger replace an open accompaniment list', async () => {
    const {
      RIGHT_DOCK_SURFACE_QUEUE,
      RIGHT_DOCK_SURFACE_SEPARATION,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.showSurface(RIGHT_DOCK_SURFACE_SEPARATION);
    dock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE);

    expect(dock.surfaces.separation).toBe(false);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
  });

  it('collapses only after the final surface is removed', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.hideSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);

    dock.hideSurface(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.hasSurfaces.value).toBe(false);
    expect(dock.topSurface.value).toBe(null);
    expect(dock.isExpanded.value).toBe(false);
    expect(dock.lastSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
  });

  it('remembers that a surface has mounted after its visible layer is removed', async () => {
    const { RIGHT_DOCK_SURFACE_QUEUE, useAppRightDock } =
      await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    expect(dock.mountedSurfaces.queue).toBe(false);
    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.mountedSurfaces.queue).toBe(true);

    dock.hideSurface(RIGHT_DOCK_SURFACE_QUEUE);

    expect(dock.surfaces.queue).toBe(false);
    expect(dock.mountedSurfaces.queue).toBe(true);
  });

  it('reopens a collapsed existing surface instead of removing it', async () => {
    const { RIGHT_DOCK_SURFACE_QUEUE, useAppRightDock } =
      await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.setExpanded(false);
    dock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE);

    expect(dock.surfaces.queue).toBe(true);
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
  });

  it('adds an absent surface while expanded and removes the foreground surface on its next trigger', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);

    dock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);
  });

  it('treats artwork as direct metadata navigation by cancelling the Queue foreground', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(false);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);
    expect(dock.isExpanded.value).toBe(true);

    dock.hideSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(false);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);
  });

  it('restores the last removed surface from the collapsed rail', async () => {
    const { RIGHT_DOCK_SURFACE_QUEUE, useAppRightDock } =
      await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.hideSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.setExpanded(true);

    expect(dock.surfaces.queue).toBe(true);
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
  });

  it('forgets development-only metadata when its context is unavailable', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.forgetSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.surfaces.metadata).toBe(false);
    expect(dock.mountedSurfaces.metadata).toBe(false);
    expect(dock.lastSurface.value).toBe(null);
    expect(dock.isExpanded.value).toBe(false);

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.forgetSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.surfaces.queue).toBe(true);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.lastSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);
    expect(dock.isExpanded.value).toBe(true);
  });

  it('treats artwork as direct metadata navigation from the accompaniment list', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      RIGHT_DOCK_SURFACE_SEPARATION,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.showSurface(RIGHT_DOCK_SURFACE_SEPARATION);
    dock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(false);
    expect(dock.surfaces.separation).toBe(false);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);
  });
});
