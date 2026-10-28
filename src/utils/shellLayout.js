export const SIDEBAR_COLLAPSED_WIDTH = 64;
export const SIDEBAR_EXPANDED_WIDTH = 256;
export const DOCK_MIN_WIDTH = 272;
export const DOCK_DEFAULT_WIDTH = 280;
export const DOCK_MAX_WIDTH = 384;
export const DOCK_COLLAPSED_WIDTH = 40;

// Calibrated against Library, Performance, Display and Settings in Electron.
// This is the Folder outer box; each page still owns its internal padding.
export function resolveShellLayout({
  width,
  sidebarPreference,
  dockPreference,
  dockExpanded = true,
  minimumWorkspace = 640,
  overhead = 40,
  recovery = 64,
  wasAutoCollapsed = false,
  holdSidebarCollapsed = false,
  forceSidebarExpanded = false,
}) {
  const available = Number.isFinite(width) ? Math.max(0, width) : 0;
  const requestedDock = Number.isFinite(dockPreference)
    ? Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, dockPreference))
    : DOCK_DEFAULT_WIDTH;
  const expandedBudget =
    SIDEBAR_EXPANDED_WIDTH +
    (dockExpanded ? requestedDock : DOCK_COLLAPSED_WIDTH) +
    minimumWorkspace +
    overhead;
  const autoCollapsed =
    sidebarPreference >= SIDEBAR_EXPANDED_WIDTH &&
    !forceSidebarExpanded &&
    (holdSidebarCollapsed ||
      available < expandedBudget + (wasAutoCollapsed ? recovery : 0));
  const sidebarWidth =
    sidebarPreference >= SIDEBAR_EXPANDED_WIDTH && !autoCollapsed
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH;
  const availableDock = Math.max(0, available - sidebarWidth - overhead);
  const dockMaximum = Math.min(
    DOCK_MAX_WIDTH,
    availableDock,
    dockExpanded
      ? Math.max(DOCK_MIN_WIDTH, availableDock - minimumWorkspace)
      : DOCK_MAX_WIDTH,
  );
  const dockWidth = Math.min(requestedDock, dockMaximum);
  return {
    sidebarWidth,
    autoCollapsed,
    dockMaximum,
    dockWidth,
    dockBayWidth: dockExpanded ? dockWidth : DOCK_COLLAPSED_WIDTH,
  };
}
