// UiModal and UiContextMenu render role="dialog"/"menu" only while open and
// own Escape on `window`, which runs after any `document` listener. Callers
// that handle Escape themselves must yield while one of these is open.
const OPEN_TRANSIENT_OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"]';

export function hasOpenTransientOverlay(root = globalThis.document) {
  return Boolean(root?.querySelector?.(OPEN_TRANSIENT_OVERLAY_SELECTOR));
}
