import { isEditableTarget } from './dom.js';

const WIDGET_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'grid',
  'gridcell',
  'listbox',
  'menu',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'radiogroup',
  'scrollbar',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'textbox',
  'tree',
  'treeitem',
]);

function ownsKeyboardInput(node) {
  if (isEditableTarget(node)) return true;
  if (['BUTTON', 'SUMMARY'].includes(node?.tagName)) return true;
  if (
    node?.tagName === 'A' &&
    typeof node.getAttribute === 'function' &&
    node.getAttribute('href') !== null
  )
    return true;
  const roles = node?.getAttribute?.('role')?.toLowerCase().split(/\s+/u) ?? [];
  return roles.some((role) => WIDGET_ROLES.has(role));
}

// Custom commands and the accepted default volume-arrow policy share these
// ownership checks. Other legacy bindings keep their existing focus behavior.
export function isShortcutInputBlocked(
  event,
  { recording = false, blocked = false, includeFocusable = false } = {},
) {
  if (recording || blocked) return true;
  const ownsInput = (node) =>
    ownsKeyboardInput(node) ||
    (includeFocusable &&
      typeof node?.getAttribute === 'function' &&
      node.getAttribute('tabindex') !== null);
  const path = event.composedPath?.() ?? [];
  if (path.length > 128 || path.some(ownsInput)) return true;
  let node = event.target;
  for (let depth = 0; node; depth++) {
    if (depth >= 128 || ownsInput(node)) return true;
    node = node.parentElement;
  }
  return false;
}
