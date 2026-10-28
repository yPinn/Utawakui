const { hardenWebContentsNavigation } = require('./webContentsSecurity');
const {
  WEB_CONTENTS_ROLES,
  tagWebContentsRole,
} = require('./webContentsRoles');

function parseLoopbackRuntimeUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(
      'Startup trace probe requires a valid loopback runtime URL',
    );
  }

  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError(
      'Startup trace probe accepts only an HTTP 127.0.0.1 origin',
    );
  }

  return parsed.origin;
}

function createStartupTraceProbe({ BrowserWindow, memorySession = false }) {
  let probeWindow = null;

  function start(runtimeUrl) {
    if (probeWindow && !probeWindow.isDestroyed()) return false;

    const runtimeOrigin = parseLoopbackRuntimeUrl(runtimeUrl);
    probeWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        // Explicit diagnostic control matching Spout's in-memory session lifecycle.
        // Default tracing retains the main profile's first-use and cache costs.
        ...(memorySession ? { partition: 'startup-trace-overlay' } : {}),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        navigateOnDragDrop: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        devTools: false,
      },
    });

    const probeUrl = `${runtimeOrigin}/overlay/lyrics?startupTrace=1`;
    hardenWebContentsNavigation(probeWindow.webContents, {
      isAllowedNavigation: (url) => url === probeUrl,
    });
    tagWebContentsRole(
      probeWindow.webContents,
      WEB_CONTENTS_ROLES.STARTUP_PROBE,
    );
    Promise.resolve(probeWindow.loadURL(probeUrl)).catch(() => {});
    return true;
  }

  function stop() {
    if (!probeWindow || probeWindow.isDestroyed()) return;
    probeWindow.destroy();
    probeWindow = null;
  }

  return { start, stop };
}

module.exports = {
  createStartupTraceProbe,
  parseLoopbackRuntimeUrl,
};
