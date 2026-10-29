'use strict';
const {
  createKeyboardShortcutRegistration,
} = require('./keyboardShortcutRegistration');
const { createWindowsShortcutBackend } = require('./windowsShortcutBackend');
const { detectPackagedRuntime } = require('./runtimeEnvironment');

// Production gate stays closed: Electron's public callback cannot currently
// prove release/repeat boundaries. Only the registration manager's isolated
// tests inject eligible commands; renderer intent cannot change this policy.
function createKeyboardShortcutRuntime({
  app,
  powerMonitor,
  store,
  globalShortcut,
  onError,
  platform = process.platform,
  arch = process.arch,
  backendFactory = createWindowsShortcutBackend,
}) {
  const appPath = app.getAppPath?.() ?? process.cwd();
  const nativeBackend =
    platform === 'win32' && arch === 'x64'
      ? backendFactory({
          appPath,
          resourcesPath: process.resourcesPath,
          isPackagedRuntime: detectPackagedRuntime({
            appPath,
            resourcesPath: process.resourcesPath,
          }),
          platform,
          arch,
          onFailure: (error) => {
            try {
              onError?.(error, 'backend');
            } catch {
              /* Preserve cleanup even when diagnostics fails. */
            }
            stopping = registration.invalidate();
            void stopping.catch(report);
          },
        })
      : null;
  const registration = createKeyboardShortcutRegistration({
    store,
    globalShortcut: nativeBackend ?? globalShortcut,
    onError,
    eligibleCommands: [],
    capabilityReason:
      platform === 'win32' ? 'repeat-unverified' : 'unsupported-platform',
  });
  let disposed = false;
  let lifecycle = 0,
    stopping = Promise.resolve();
  function report(error) {
    try {
      onError?.(error, 'lifecycle');
    } catch {
      /* Diagnostics cannot reject an event listener. */
    }
  }
  const suspend = () => {
    lifecycle++;
    stopping = registration.suspend();
    void stopping.catch(report);
  };
  const resume = () => {
    const epoch = lifecycle;
    void stopping
      .then(() => {
        if (!disposed && epoch === lifecycle) return registration.refresh();
      })
      .catch(report);
  };
  const beforeQuit = (event) => {
    if (!nativeBackend?.hasProcess()) return;
    event.preventDefault();
    void dispose()
      .catch(report)
      .finally(() => app.quit());
  };
  function dispose() {
    if (disposed) return stopping;
    disposed = true;
    lifecycle++;
    powerMonitor.removeListener('suspend', suspend);
    powerMonitor.removeListener('resume', resume);
    app.removeListener('will-quit', dispose);
    app.removeListener('before-quit', beforeQuit);
    stopping = registration.dispose().finally(() => nativeBackend?.shutdown());
    void stopping.catch(report);
    return stopping;
  }
  powerMonitor.on('suspend', suspend);
  powerMonitor.on('resume', resume);
  app.once('will-quit', dispose);
  app.on('before-quit', beforeQuit);
  const ready = registration.refresh();
  void ready.catch(report);
  return {
    async get() {
      if (!disposed) {
        await stopping;
        await nativeBackend?.reset();
      }
      return registration.get();
    },
    set: registration.set,
    snapshot: registration.snapshot,
    ready,
    dispose,
  };
}
module.exports = { createKeyboardShortcutRuntime };
