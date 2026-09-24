'use strict';

// spec.md §7.2 item 3 left "what triggers prevent-sleep" undecided; this
// answers it with OBS's own streaming/recording.active read instead of a
// manual toggle or a guess. Pure-ish wrapper around Electron's
// powerSaveBlocker (injected) so the on/off decision is unit testable
// without a real Electron process. Symmetric start/stop, never a stacked
// counter — each obsAdapter status update carries the complete current
// truth, not a delta.
function createObsPowerSaveBlocker({
  powerSaveBlocker,
  blockerType = 'prevent-display-sleep',
}) {
  let blockerId = null;

  function sync(status) {
    const shouldBlockSleep = Boolean(
      status?.observed?.streaming?.active ||
      status?.observed?.recording?.active,
    );
    if (shouldBlockSleep && blockerId === null) {
      blockerId = powerSaveBlocker.start(blockerType);
    } else if (!shouldBlockSleep && blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
  }

  function isActive() {
    return blockerId !== null;
  }

  return { sync, isActive };
}

module.exports = { createObsPowerSaveBlocker };
