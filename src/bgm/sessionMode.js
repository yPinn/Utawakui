const ACTIVE_SESSION_MODES = new Set(['live', 'record']);

export function createBgmSessionModeProjector() {
  let hadConfirmedActiveSession = false;

  function update(observed) {
    if (observed?.lifecycle !== 'ready') {
      return hadConfirmedActiveSession ? 'reconnecting' : 'inactive';
    }

    if (observed.streaming?.active) {
      hadConfirmedActiveSession = true;
      return 'live';
    }

    if (observed.recording?.active) {
      hadConfirmedActiveSession = true;
      return 'record';
    }

    hadConfirmedActiveSession = false;
    return 'inactive';
  }

  return {
    update,
    isActive(mode) {
      return ACTIVE_SESSION_MODES.has(mode) || mode === 'reconnecting';
    },
  };
}
