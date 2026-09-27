// Compatibility adapter for the development-only Studio Library content.
// Shell geometry moved to useAppRightDockWidth.js when Queue adopted the same
// right-side Dock; keep these names while existing candidate tests and cover
// sizing migrate independently from the shared container.
export {
  RIGHT_DOCK_WIDTH_MAX as INSPECTOR_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN as INSPECTOR_WIDTH_MIN,
  useAppRightDockWidth as useStudioLibraryInspectorWidth,
} from './useAppRightDockWidth.js';
