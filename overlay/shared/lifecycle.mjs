import { createOverlayConnection } from './runtime.mjs';
import { createOverlayFontObserver } from './appearance.mjs';

// Page-level subscriptions only. Identity, revision and retry policy stay in runtime.
export function createOverlayHost(options = {}) {
  const document = options.document ?? globalThis.document;
  const window = options.window ?? globalThis.window;
  const previewMode = options.previewMode === true;
  let started = false;
  let disposed = false;
  let connected = false;
  let active = false;
  let latestSnapshot = null;
  let presented = false;
  let activated = false;
  let reducedMotion = false;
  let fontsDirty = false;
  let stopFonts = () => {};
  let removeMotion = () => {};

  function fontsChanged() {
    if (disposed) return;
    fontsDirty = true;
    if (active) {
      fontsDirty = false;
      options.onFontsChanged?.();
    }
  }

  function syncActivity({ deliver = false } = {}) {
    if (disposed) return;
    const next =
      !document?.hidden &&
      (previewMode || (connected && latestSnapshot !== null));
    if (next && latestSnapshot && (deliver || !active)) {
      options.onSnapshot?.(latestSnapshot, {
        recovering: !active && presented,
      });
      presented = true;
    }
    if (active !== next) {
      active = next;
      options.onActivity?.(active, { recovering: activated });
      if (active) activated = true;
    }
    if (active && fontsDirty) {
      fontsDirty = false;
      options.onFontsChanged?.();
    }
  }

  const connection = (options.createConnection ?? createOverlayConnection)({
    kind: options.kind,
    onConfig(slot) {
      if (!disposed) options.onConfig?.(slot);
    },
    onSnapshot(snapshot) {
      if (disposed) return;
      latestSnapshot = snapshot;
      syncActivity({ deliver: true });
    },
    onStatus(status) {
      if (disposed) return;
      connected = status === 'connected';
      if (!connected) latestSnapshot = null;
      syncActivity();
    },
  });
  const visibilityChanged = () => syncActivity();

  function start() {
    if (started || disposed) return;
    started = true;
    const media = window?.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motionChanged = (event) => {
      if (disposed) return;
      reducedMotion = event.matches === true;
      options.onReducedMotion?.(reducedMotion);
    };
    motionChanged({ matches: media?.matches });
    if (media?.addEventListener) {
      media.addEventListener('change', motionChanged);
      removeMotion = () => media.removeEventListener('change', motionChanged);
    } else if (media?.addListener) {
      media.addListener(motionChanged);
      removeMotion = () => media.removeListener(motionChanged);
    }
    document?.addEventListener?.('visibilitychange', visibilityChanged);
    window?.addEventListener?.('pagehide', dispose, { once: true });
    if (!previewMode || document?.hidden) options.onActivity?.(false);
    stopFonts = createOverlayFontObserver(document, fontsChanged);
    syncActivity();
    connection.start();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    latestSnapshot = null;
    document?.removeEventListener?.('visibilitychange', visibilityChanged);
    window?.removeEventListener?.('pagehide', dispose);
    removeMotion();
    stopFonts();
    try {
      options.onDispose?.();
    } finally {
      connection.stop();
    }
  }

  return {
    start,
    dispose,
    get active() {
      return active;
    },
    get reducedMotion() {
      return reducedMotion;
    },
  };
}
