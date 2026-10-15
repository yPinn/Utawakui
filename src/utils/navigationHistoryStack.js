// Pure, immutable history stack for ADR 0025. Entries are opaque apart from a
// `key` that identifies the location; every function returns a new stack.

export const NAVIGATION_HISTORY_CAPACITY = 50;

export function createNavigationStack(
  entry,
  capacity = NAVIGATION_HISTORY_CAPACITY,
) {
  return { entries: [entry], index: 0, capacity };
}

// Adjacent entries with the same key are one place; keep the cursor on it.
function collapseAdjacent(entries, index) {
  const collapsed = [];
  let cursor = 0;
  entries.forEach((item, position) => {
    const previous = collapsed.at(-1);
    if (previous && previous.key === item.key) {
      if (position === index) {
        collapsed[collapsed.length - 1] = item;
        cursor = collapsed.length - 1;
      }
      return;
    }
    collapsed.push(item);
    if (position === index) cursor = collapsed.length - 1;
  });
  return { entries: collapsed, index: cursor };
}

export function recordLocation(stack, entry, { replace = false } = {}) {
  const current = stack.entries[stack.index];

  if (replace || current.key === entry.key) {
    const entries = stack.entries.slice();
    entries[stack.index] = entry;
    return { ...stack, ...collapseAdjacent(entries, stack.index) };
  }

  let entries = [...stack.entries.slice(0, stack.index + 1), entry];
  if (entries.length > stack.capacity) {
    entries = entries.slice(entries.length - stack.capacity);
  }
  return { ...stack, entries, index: entries.length - 1 };
}

function targetIndex(stack, direction, isValid) {
  for (
    let index = stack.index + direction;
    index >= 0 && index < stack.entries.length;
    index += direction
  ) {
    if (isValid(stack.entries[index])) return index;
  }
  return -1;
}

export function canTraverse(stack, direction, isValid) {
  return targetIndex(stack, direction, isValid) !== -1;
}

// Skipped (invalid) entries stay in place; only the cursor moves past them.
export function traverse(stack, direction, isValid) {
  const index = targetIndex(stack, direction, isValid);
  if (index === -1) return null;
  return { stack: { ...stack, index }, entry: stack.entries[index] };
}
