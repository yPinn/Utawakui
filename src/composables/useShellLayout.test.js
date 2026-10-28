import { effectScope, ref } from 'vue';
import { afterAll, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => vi.stubGlobal('window', {}));
import { createShellLayoutState } from './useShellLayout.js';

afterAll(() => vi.unstubAllGlobals());

function setup(width = 1440, open = true) {
  const sidebar = { width: ref(256) };
  sidebar.toggleSidebarCollapse = vi.fn(async () => {
    sidebar.width.value = sidebar.width.value === 256 ? 64 : 256;
  });
  const dock = {
    preferredWidth: ref(384),
    isResizing: ref(false),
    setMaximum: vi.fn(),
  };
  const dockExpanded = ref(open);
  const scope = effectScope();
  const shell = scope.run(() =>
    createShellLayoutState({ sidebar, dock, width, dockExpanded }),
  );
  return {
    sidebar,
    dock,
    dockExpanded,
    shell,
    dispose: () => {
      shell.dispose();
      scope.stop();
    },
  };
}

describe('Shell layout state', () => {
  it('preserves preferences through an in-flow shrink and recovery', () => {
    const { shell, sidebar, dock, dispose } = setup();
    shell.updateGeometry({ width: 1200 });
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 64,
      dockWidth: 384,
      dockBayWidth: 384,
    });
    shell.updateGeometry({ width: 1040 });
    expect(shell.layout.value.dockWidth).toBe(296);
    shell.updateGeometry({ width: 960 });
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 64,
      dockWidth: 272,
      dockBayWidth: 272,
    });
    shell.updateGeometry({ width: 1440 });
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 256,
      dockWidth: 384,
    });
    expect(sidebar.width.value).toBe(256);
    expect(dock.preferredWidth.value).toBe(384);
    expect(sidebar.toggleSidebarCollapse).not.toHaveBeenCalled();
    dispose();
    expect(dock.setMaximum).toHaveBeenLastCalledWith(384);
  });

  it('returns the collapsed Dock bay to the workspace and restores the original width on reopen', () => {
    const { shell, dockExpanded, dock, dispose } = setup(1280);
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 64,
      dockBayWidth: 384,
    });
    dockExpanded.value = false;
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 256,
      dockBayWidth: 40,
    });
    expect(dock.preferredWidth.value).toBe(384);
    dockExpanded.value = true;
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 64,
      dockBayWidth: 384,
    });
    dispose();
  });

  it('lets explicit navigation expansion push the workspace until a further shrink', async () => {
    const { shell, sidebar, dispose } = setup(1200);
    await shell.toggleSidebar();
    expect(shell.sidebarExpanded.value).toBe(true);
    expect(shell.layout.value.sidebarWidth).toBe(256);
    expect(sidebar.width.value).toBe(256);
    shell.updateGeometry({ width: 1199 });
    expect(shell.sidebarExpanded.value).toBe(false);
    shell.updateGeometry({ width: 1440 });
    expect(shell.sidebarExpanded.value).toBe(true);
    dispose();
  });

  it('keeps a manual collapse through resize and opens a narrow sidebar in flow', async () => {
    const { shell, sidebar, dispose } = setup();
    await shell.toggleSidebar();
    expect(sidebar.width.value).toBe(64);
    shell.updateGeometry({ width: 1920 });
    expect(shell.sidebarExpanded.value).toBe(false);
    shell.updateGeometry({ width: 960 });
    await shell.toggleSidebar();
    expect(sidebar.width.value).toBe(256);
    expect(shell.layout.value).toMatchObject({
      sidebarWidth: 256,
      dockBayWidth: 272,
    });
    await shell.toggleSidebar();
    expect(sidebar.width.value).toBe(64);
    dispose();
  });

  it('defers navigation recovery until a Dock drag is released', () => {
    const { shell, dock, dispose } = setup(1280);
    expect(shell.layout.value.sidebarWidth).toBe(64);
    dock.isResizing.value = true;
    dock.preferredWidth.value = 272;
    expect(shell.layout.value.sidebarWidth).toBe(64);
    dock.isResizing.value = false;
    expect(shell.layout.value.sidebarWidth).toBe(256);
    dispose();
  });

  it('does not pin a roomy manual expansion against a later Dock opening', async () => {
    const { shell, sidebar, dockExpanded, dispose } = setup(1280, false);
    sidebar.width.value = 64;
    await shell.toggleSidebar();
    expect(shell.layout.value.sidebarWidth).toBe(256);
    dockExpanded.value = true;
    expect(shell.layout.value.sidebarWidth).toBe(64);
    dispose();
  });
});
