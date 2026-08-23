function traceBridge(options = {}) {
  return options.bridge ?? globalThis.window?.Utawakui;
}

function tracePerformance(options = {}) {
  return options.performance ?? globalThis.performance;
}

export function recordRendererMilestone(name, options = {}) {
  const bridge = traceBridge(options);
  const performance = tracePerformance(options);
  if (
    bridge?.startupTraceEnabled !== true ||
    typeof bridge.recordStartupMilestone !== 'function' ||
    !Number.isFinite(performance?.timeOrigin) ||
    typeof performance?.now !== 'function'
  ) {
    return false;
  }
  bridge.recordStartupMilestone({
    name,
    atUnixMs: performance.timeOrigin + performance.now(),
  });
  return true;
}

export function scheduleFirstPaintMilestone(options = {}) {
  const bridge = traceBridge(options);
  if (bridge?.startupTraceEnabled !== true) return false;
  const performance = tracePerformance(options);
  const requestFrame =
    options.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  if (
    !Number.isFinite(performance?.timeOrigin) ||
    typeof performance?.now !== 'function' ||
    typeof requestFrame !== 'function'
  ) {
    return false;
  }
  requestFrame(() => {
    requestFrame(() => {
      const paintStart =
        performance.getEntriesByName?.('first-paint')?.[0]?.startTime;
      bridge.recordStartupMilestone({
        name: 'first-paint',
        atUnixMs:
          performance.timeOrigin +
          (Number.isFinite(paintStart) ? paintStart : performance.now()),
      });
    });
  });
  return true;
}
