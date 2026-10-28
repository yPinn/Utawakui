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

// Only the custom candidate path uses this policy. Legacy F/player/history
// bindings keep their existing focus behavior until separately accepted.
export function isShortcutInputBlocked(
  event,
  { recording = false, blocked = false } = {},
) {
  if (recording || blocked) return true;
  const path = event.composedPath?.() ?? [];
  if (path.length > 128 || path.some(ownsKeyboardInput)) return true;
  let node = event.target;
  for (let depth = 0; node; depth++) {
    if (depth >= 128 || ownsKeyboardInput(node)) return true;
    node = node.parentElement;
  }
  return false;
}
