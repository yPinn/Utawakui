import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAppRightDock', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('cycles preparation through import, separation, collapsed, then import', async () => {
    const { useAppRightDock } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    expect(dock.preparationActionLabel.value).toBe('展開匯入');
    dock.cyclePreparation();
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.topSurface.value).toBe('preparation');
    expect(dock.preparationTab.value).toBe('import');
    expect(dock.preparationActionLabel.value).toBe('切換伴奏處理');

    dock.cyclePreparation();
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.preparationTab.value).toBe('separation');
    expect(dock.preparationActionLabel.value).toBe('折疊曲目準備');

    dock.cyclePreparation();
    expect(dock.isExpanded.value).toBe(false);
    expect(dock.mountedSurfaces.preparation).toBe(true);
    expect(dock.preparationActionLabel.value).toBe('展開匯入');

    dock.cyclePreparation();
    expect(dock.isExpanded.value).toBe(true);
    expect(dock.preparationTab.value).toBe('import');
  });

  it('uses manual tab selection and collapses the entire Dock with retained lower layers', async () => {
    const { useAppRightDock } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();
    dock.showSurface('metadata');
    dock.showSurface('queue');
    dock.cyclePreparation();
    dock.selectPreparationTab('separation');
    expect(dock.preparationActionLabel.value).toBe('折疊曲目準備');
    dock.selectPreparationTab('import');
    expect(dock.preparationActionLabel.value).toBe('切換伴奏處理');
    dock.cyclePreparation();
    dock.cyclePreparation();
    expect(dock.isExpanded.value).toBe(false);
    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(true);
  });

  it('starts at import from another surface or after external collapse', async () => {
    const { useAppRightDock } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();
    dock.cyclePreparation();
    dock.selectPreparationTab('separation');
    dock.toggleSurface('queue');
    expect(dock.preparationActionLabel.value).toBe('展開匯入');
    dock.cyclePreparation();
    expect(dock.topSurface.value).toBe('preparation');
    expect(dock.preparationTab.value).toBe('import');
    dock.selectPreparationTab('separation');
    dock.setExpanded(false);
    dock.cyclePreparation();
    expect(dock.preparationTab.value).toBe('import');
    expect(dock.isExpanded.value).toBe(true);
  });

  it('rejects unknown preparation tabs without changing selection', async () => {
    const { useAppRightDock } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();
    expect(() => dock.selectPreparationTab('unknown')).toThrow(RangeError);
    expect(dock.preparationTab.value).toBe('import');
  });

  it('registers one preparation surface beside playback and metadata', async () => {
    const module = await import('./useAppRightDock.js');
    const dock = module.useAppRightDock();

    expect(module).not.toHaveProperty('RIGHT_DOCK_SURFACE_SEPARATION');
    expect(module.RIGHT_DOCK_SURFACE_PREPARATION).toBe('preparation');
    expect(module).not.toHaveProperty('RIGHT_DOCK_SURFACE_IMPORT');
    expect(Object.keys(dock.surfaces)).toEqual([
      'metadata',
      'queue',
      'preparation',
    ]);
    expect(Object.keys(dock.mountedSurfaces)).toEqual([
      'metadata',
      'queue',
      'preparation',
    ]);
  });

  it('brings the requested surface to the foreground without leaving a higher layer above it', async () => {
    const {
      RIGHT_DOCK_SURFACE_METADATA,
      RIGHT_DOCK_SURFACE_QUEUE,
      RIGHT_DOCK_SURFACE_PREPARATION,
      useAppRightDock,
    } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();

    dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    dock.showSurface(RIGHT_DOCK_SURFACE_QUEUE);
    dock.showSurface(RIGHT_DOCK_SURFACE_PREPARATION);

    dock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE);

    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(true);
    expect(dock.surfaces.preparation).toBe(false);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_QUEUE);

    dock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);

    expect(dock.surfaces.metadata).toBe(true);
    expect(dock.surfaces.queue).toBe(false);
    expect(dock.surfaces.preparation).toBe(false);
    expect(dock.topSurface.value).toBe(RIGHT_DOCK_SURFACE_METADATA);
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

  it('restores the last removed surface from the collapsed restore control', async () => {
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
});
