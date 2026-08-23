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

function createStartupTraceProbe({ BrowserWindow }) {
  let probeWindow = null;

  function start(runtimeUrl) {
    if (probeWindow && !probeWindow.isDestroyed()) return false;

    const runtimeOrigin = parseLoopbackRuntimeUrl(runtimeUrl);
    probeWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    probeWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    Promise.resolve(
      probeWindow.loadURL(`${runtimeOrigin}/overlay/lyrics?startupTrace=1`),
    ).catch(() => {});
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
