'use strict';
const {
  createKeyboardShortcutRegistration,
} = require('./keyboardShortcutRegistration');
const { createWindowsShortcutBackend } = require('./windowsShortcutBackend');
const { detectPackagedRuntime } = require('./runtimeEnvironment');
const {
  createKeyboardShortcutReceiver,
} = require('./keyboardShortcutReceiver');

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
  getMainWindow = () => null,
  getFocusedWindow = () => null,
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
            receiver.refresh();
            void stopping.catch(report);
          },
        })
      : null;
  const registration = createKeyboardShortcutRegistration({
    store,
    globalShortcut: nativeBackend ?? globalShortcut,
    onError,
    eligibleCommands: [],
    onCommand: (packet) => receiver.dispatch(packet),
    capabilityReason:
      platform === 'win32' ? 'repeat-unverified' : 'unsupported-platform',
  });
  const receiver = createKeyboardShortcutReceiver({
    getMainWindow,
    getFocusedWindow,
    getRuntime: registration.snapshot,
    rearm: registration.rearm,
    onError,
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
    receiver.refresh();
    void stopping.catch(report);
  };
  const resume = () => {
    const epoch = lifecycle;
    void stopping
      .then(() => {
        if (!disposed && epoch === lifecycle)
          return registration.refresh().then(() => receiver.refresh());
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
  const focusChanged = () => receiver.refresh(true);
  function dispose() {
    if (disposed) return stopping;
    disposed = true;
    lifecycle++;
    powerMonitor.removeListener('suspend', suspend);
    powerMonitor.removeListener('resume', resume);
    app.removeListener('will-quit', dispose);
    app.removeListener('before-quit', beforeQuit);
    app.removeListener('browser-window-focus', focusChanged);
    app.removeListener('browser-window-blur', focusChanged);
    receiver.dispose();
    stopping = registration.dispose().finally(() => nativeBackend?.shutdown());
    void stopping.catch(report);
    return stopping;
  }
  powerMonitor.on('suspend', suspend);
  powerMonitor.on('resume', resume);
  app.once('will-quit', dispose);
  app.on('before-quit', beforeQuit);
  app.on('browser-window-focus', focusChanged);
  app.on('browser-window-blur', focusChanged);
  const ready = registration.refresh();
  void ready.catch(report);
  return {
    async get() {
      if (!disposed) {
        await stopping;
        await nativeBackend?.reset();
      }
      try {
        return await registration.get();
      } finally {
        receiver.refresh();
      }
    },
    async set(input) {
      try {
        return await registration.set(input);
      } finally {
        receiver.refresh();
      }
    },
    async test(input) {
      try {
        return await registration.test(input);
      } finally {
        receiver.refresh();
      }
    },
    async enable(input) {
      try {
        return await registration.enable(input);
      } finally {
        receiver.refresh();
      }
    },
    snapshot: registration.snapshot,
    ready,
    dispose,
    receiver,
  };
}
module.exports = { createKeyboardShortcutRuntime };
