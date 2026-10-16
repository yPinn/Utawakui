// Module scope coordinates transient floating surfaces across component
// instances, so opening one dismisses the previous owner.
let activeClose = null;

function claim(close) {
  if (activeClose && activeClose !== close) activeClose();
  activeClose = close;
}

// An already-superseded surface must not release the current owner's claim.
function release(close) {
  if (activeClose === close) activeClose = null;
}

export function useFloatingSurfaceGate() {
  return { claim, release };
}
