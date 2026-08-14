// Module-scope, not a <script setup> local — that runs per-instance, which
// would give each UiContextMenu its own private state instead of a shared one.
let activeClose = null;

function claim(close) {
  if (activeClose && activeClose !== close) activeClose();
  activeClose = close;
}

// Only clears if this menu still holds the gate — an already-superseded
// menu closing later shouldn't steal it back.
function release(close) {
  if (activeClose === close) activeClose = null;
}

export function useContextMenuGate() {
  return { claim, release };
}
