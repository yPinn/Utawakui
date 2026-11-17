// Phone-side transport for the paired companion page. It exposes the same
// bridge surface the desktop prompter uses, so the shared view state, frame
// selection and PerformerSurface run unchanged.

export const CREDENTIAL_STORAGE_KEY = 'utawakui.companion.credential';
export const READING_SCALE_STORAGE_KEY = 'utawakui.companion.reading-scale';
const SUBPROTOCOL = 'utawakui.companion.v1';
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000];
const UNAUTHORIZED = 4401;
const CONTROL_COMMANDS = Object.freeze({
  play: 'player.play-pause',
  pause: 'player.play-pause',
  'reading-off': 'reading.off',
  'reading-furigana': 'reading.furigana',
  'reading-romaji': 'reading.romaji',
});
const OFFSET_COMMANDS = Object.freeze({
  delay: 'lyrics.offset-down',
  advance: 'lyrics.offset-up',
});

// Snapshots carry the computer's timestamps; shift them by the measured clock
// offset so lyric timing follows the phone's own clock.
export function rebaseSnapshotClock(snapshot, offsetMs) {
  const generatedAt = Date.parse(snapshot?.state?.generatedAt ?? '');
  if (!Number.isFinite(generatedAt) || !Number.isFinite(offsetMs))
    return snapshot;
  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      generatedAt: new Date(generatedAt + offsetMs).toISOString(),
    },
  };
}

// Reads `#pair=<code>` once and removes it from the address bar and history.
export function takePairingCode(location, history) {
  const match = /(?:^#|&)pair=([A-Za-z0-9_-]{22})(?:&|$)/u.exec(
    location.hash ?? '',
  );
  if (location.hash) history.replaceState(null, '', location.pathname);
  return match ? match[1] : null;
}

function safeStorage(storage) {
  return {
    get(key) {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value === null) storage?.removeItem(key);
        else storage?.setItem(key, value);
      } catch {
        /* Private browsing: works for this visit only. */
      }
    },
  };
}

export function createCompanionBridge({
  location,
  storage,
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  now = () => Date.now(),
  setTimer = setTimeout,
  onStatus = () => {},
}) {
  const store = safeStorage(storage);
  const snapshotListeners = new Set();
  let latest = null;
  let socket = null;
  let retry = 0;
  let stopped = false;
  // Monotonic across reloads: a millisecond base plus a per-page counter.
  let sequence = now() * 1000;

  function setStatus(value) {
    onStatus(value);
  }

  async function pair(code, label) {
    const response = await fetchImpl('/m/api/v1/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label }),
      credentials: 'omit',
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.credential !== 'string')
      return { ok: false, status: body?.error ?? 'pairing-failed' };
    store.set(CREDENTIAL_STORAGE_KEY, body.credential);
    return { ok: true };
  }

  function hasCredential() {
    return Boolean(store.get(CREDENTIAL_STORAGE_KEY));
  }

  function connect() {
    const credential = store.get(CREDENTIAL_STORAGE_KEY);
    if (!credential || stopped) {
      setStatus(credential ? 'stopped' : 'unpaired');
      return;
    }
    setStatus('connecting');
    socket = new WebSocketImpl(`ws://${location.host}/m/ws`, SUBPROTOCOL);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', credential }));
    });
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message?.type !== 'snapshot') return;
      retry = 0;
      setStatus('live');
      latest = rebaseSnapshotClock(message.snapshot, now() - message.sentAt);
      for (const listener of snapshotListeners) listener(latest);
    });
    socket.addEventListener('close', (event) => {
      socket = null;
      if (event.code === UNAUTHORIZED) {
        store.set(CREDENTIAL_STORAGE_KEY, null);
        setStatus('unpaired');
        return;
      }
      if (stopped) return;
      setStatus('reconnecting');
      const delay =
        RETRY_DELAYS_MS[Math.min(retry, RETRY_DELAYS_MS.length - 1)];
      retry += 1;
      setTimer(connect, delay);
    });
  }

  // Sends one bounded command against the snapshot the phone is showing.
  async function sendCommand(command, { revision, trackId } = {}) {
    const credential = store.get(CREDENTIAL_STORAGE_KEY);
    if (!credential || !trackId || !Number.isSafeInteger(revision))
      return 'unavailable';
    sequence += 1;
    let response;
    try {
      response = await fetchImpl('/m/api/v1/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({ command, sequence, revision, trackId }),
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch {
      return 'unavailable';
    }
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      store.set(CREDENTIAL_STORAGE_KEY, null);
      setStatus('unpaired');
      socket?.close();
      return 'unauthorized';
    }
    return body?.result === 'applied'
      ? 'applied'
      : (body?.reason ?? body?.result ?? 'failed');
  }

  function stop() {
    stopped = true;
    socket?.close();
  }

  const performerBridge = {
    getSnapshot: async () => latest,
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    getWindowState: async () => ({
      open: true,
      fullScreen: false,
      alwaysOnTop: false,
    }),
    onWindowState: () => () => {},
    getReadingScale: async () => store.get(READING_SCALE_STORAGE_KEY) ?? 'near',
    async setReadingScale(value) {
      store.set(READING_SCALE_STORAGE_KEY, value);
      return value;
    },
    async control({ action, revision, trackId } = {}) {
      const command = CONTROL_COMMANDS[action];
      return command
        ? (await sendCommand(command, { revision, trackId })) === 'applied'
        : false;
    },
    async adjustLyricsOffset({ action, revision, trackId } = {}) {
      const command = OFFSET_COMMANDS[action];
      return command
        ? (await sendCommand(command, { revision, trackId })) === 'applied'
        : false;
    },
    close: async () => ({ open: true }),
    minimize: async () => ({ open: true }),
    toggleFullScreen: async () => ({ open: true }),
    toggleAlwaysOnTop: async () => ({ open: true }),
    recordDiagnostic: async () => undefined,
  };

  return { pair, hasCredential, connect, stop, sendCommand, performerBridge };
}
