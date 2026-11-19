// Phone-side transport for the paired companion page. It exposes the same
// bridge surface the desktop prompter uses for shared view state and timing.

export const CREDENTIAL_STORAGE_KEY = 'utawakui.companion.credential';
export const READING_SCALE_STORAGE_KEY = 'utawakui.companion.reading-scale';
const LAYOUT_STORAGE_KEY = 'utawakui.companion.lyrics-layout';
const LOCK_SCREEN_STORAGE_KEY = 'utawakui.companion.lock-screen';
const SUBPROTOCOL = 'utawakui.companion.v1';
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000];
const UNAUTHORIZED = 4401;
// Another phone took over: keep the credential, stop retrying, offer resume.
const DISPLACED = 4410;
const PAIR_POLL_MS = 1500;
// Heartbeat is 10s; longer silence means a dead link.
const LIVENESS_TIMEOUT_MS = 25_000;
// Main answers within 2s; the rest covers a slow phone network.
const COMMAND_TIMEOUT_MS = 6000;
const CONTROL_COMMANDS = Object.freeze({
  play: 'player.play-pause',
  pause: 'player.play-pause',
  'reading-off': 'reading.off',
  'reading-furigana': 'reading.furigana',
  'reading-romaji': 'reading.romaji',
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
  clearTimer = clearTimeout,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  onStatus = () => {},
}) {
  const store = safeStorage(storage);
  const snapshotListeners = new Set();
  let latest = null;
  let socket = null;
  let retry = 0;
  let retryTimer = null;
  let livenessTimer = null;
  let lastHeardAt = 0;
  let stopped = false;
  // Set when another phone holds the connection; only resume() clears it.
  let displaced = false;
  // Monotonic across reloads: a millisecond base plus a per-page counter.
  let sequence = now() * 1000;

  function setStatus(value) {
    onStatus(value);
  }

  async function postJson(path, body) {
    const response = await fetchImpl(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }

  const wait = (ms) => new Promise((resolve) => setTimer(resolve, ms));

  // Scanning opens a request; the phone shows the match code and waits until
  // the computer allows or refuses it.
  async function pair(code, label, { onMatchCode = () => {} } = {}) {
    const opened = await postJson('/m/api/v1/pair', { code, label });
    if (opened.status !== 202 || typeof opened.body?.claimToken !== 'string')
      return { ok: false, status: opened.body?.error ?? 'pairing-failed' };
    onMatchCode(opened.body.matchCode);
    for (;;) {
      await wait(PAIR_POLL_MS);
      const polled = await postJson('/m/api/v1/pair/status', {
        claimToken: opened.body.claimToken,
      });
      if (polled.body?.state === 'pending') continue;
      if (polled.body?.state === 'approved' && polled.body.credential) {
        store.set(CREDENTIAL_STORAGE_KEY, polled.body.credential);
        return { ok: true };
      }
      return {
        ok: false,
        status:
          polled.body?.state === 'denied' ? 'pairing-denied' : 'pairing-failed',
      };
    }
  }

  function hasCredential() {
    return Boolean(store.get(CREDENTIAL_STORAGE_KEY));
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
  }

  function clearLiveness() {
    if (livenessTimer !== null) clearTimer(livenessTimer);
    livenessTimer = null;
  }

  function heard(ws) {
    lastHeardAt = now();
    clearLiveness();
    livenessTimer = setTimer(() => {
      livenessTimer = null;
      if (ws === socket) abandon(ws);
    }, LIVENESS_TIMEOUT_MS);
  }

  // A dead link may never fire `close`; drop it and dial again right away.
  function abandon(ws) {
    socket = null;
    clearLiveness();
    try {
      ws.close();
    } catch {
      /* Already closed. */
    }
    // Non-zero keeps the "reconnecting" state so the last lyrics stay up.
    retry = Math.max(retry, 1);
    setStatus('reconnecting');
    connect();
  }

  function scheduleRetry() {
    setStatus('reconnecting');
    const delay = RETRY_DELAYS_MS[Math.min(retry, RETRY_DELAYS_MS.length - 1)];
    retry += 1;
    clearRetry();
    retryTimer = setTimer(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    const credential = store.get(CREDENTIAL_STORAGE_KEY);
    if (!credential || stopped) {
      setStatus(credential ? 'stopped' : 'unpaired');
      return;
    }
    clearRetry();
    if (socket || displaced) return;
    if (!retry) setStatus('connecting');
    const ws = new WebSocketImpl(`ws://${location.host}/m/ws`, SUBPROTOCOL);
    socket = ws;
    heard(ws);
    let firstSnapshot = true;
    ws.addEventListener('open', () => {
      if (ws === socket) ws.send(JSON.stringify({ type: 'auth', credential }));
    });
    ws.addEventListener('message', (event) => {
      if (ws !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      heard(ws);
      if (message?.type !== 'snapshot') return;
      const next = rebaseSnapshotClock(
        message.snapshot,
        now() - message.sentAt,
      );
      if (firstSnapshot && next?.state?.revision < latest?.state?.revision) {
        for (const listener of snapshotListeners) listener(null);
      }
      firstSnapshot = false;
      latest = next;
      retry = 0;
      for (const listener of snapshotListeners) listener(latest);
      setStatus('live');
    });
    ws.addEventListener('close', (event) => {
      // Ignore sockets already replaced or abandoned.
      if (ws !== socket) return;
      socket = null;
      clearLiveness();
      if (event.code === UNAUTHORIZED) {
        store.set(CREDENTIAL_STORAGE_KEY, null);
        setStatus('unpaired');
        return;
      }
      // Retrying would take the connection straight back, so wait for the
      // person to choose this phone again.
      if (event.code === DISPLACED || displaced) {
        displaced = true;
        retry = 0;
        setStatus('displaced');
        return;
      }
      if (stopped || !hasCredential()) return;
      scheduleRetry();
    });
  }

  // iOS drops or freezes sockets in the background; check again on return.
  function wake() {
    if (stopped || displaced || documentRef?.hidden || !hasCredential()) return;
    if (socket) {
      if (now() - lastHeardAt > LIVENESS_TIMEOUT_MS) abandon(socket);
      return;
    }
    if (retryTimer !== null) connect();
  }

  documentRef?.addEventListener?.('visibilitychange', wake);
  windowRef?.addEventListener?.('pageshow', wake);
  windowRef?.addEventListener?.('online', wake);

  // Sends one bounded command against the snapshot the phone is showing.
  async function sendCommand(
    command,
    {
      revision,
      trackId,
      positionMs,
      queueIndex,
      libraryTrackId,
      outputChange,
    } = {},
  ) {
    const credential = store.get(CREDENTIAL_STORAGE_KEY);
    if (
      typeof command !== 'string' ||
      command.startsWith('lyrics.') ||
      !credential ||
      (!trackId &&
        !command.startsWith('queue.') &&
        !command.startsWith('library.') &&
        command !== 'output.set-option') ||
      !Number.isSafeInteger(revision)
    )
      return 'unavailable';
    sequence += 1;
    let response;
    let body;
    // Keeps a hung request from locking the controls.
    const request = new AbortController();
    const timeout = setTimer(() => request.abort(), COMMAND_TIMEOUT_MS);
    try {
      response = await fetchImpl('/m/api/v1/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({
          command,
          sequence,
          revision,
          trackId,
          ...(command === 'player.seek' ? { positionMs } : {}),
          ...(queueIndex === undefined ? {} : { queueIndex }),
          ...(libraryTrackId === undefined ? {} : { libraryTrackId }),
          ...(outputChange === undefined ? {} : { outputChange }),
        }),
        credentials: 'omit',
        cache: 'no-store',
        signal: request.signal,
      });
      body = await response.json().catch(() => null);
    } catch {
      return request.signal.aborted ? 'timed_out' : 'unavailable';
    } finally {
      clearTimer(timeout);
    }
    if (request.signal.aborted) return 'timed_out';
    if (response.status === 401) {
      store.set(CREDENTIAL_STORAGE_KEY, null);
      setStatus('unpaired');
      socket?.close();
      return 'unauthorized';
    }
    if (body?.reason === 'displaced') {
      displaced = true;
      clearRetry();
      setStatus('displaced');
      return 'displaced';
    }
    return body?.result === 'applied'
      ? 'applied'
      : (body?.reason ?? body?.result ?? 'failed');
  }

  function stop() {
    stopped = true;
    clearRetry();
    clearLiveness();
    documentRef?.removeEventListener?.('visibilitychange', wake);
    windowRef?.removeEventListener?.('pageshow', wake);
    windowRef?.removeEventListener?.('online', wake);
    socket?.close();
  }

  async function getArtwork(route, id, signal) {
    const credential = store.get(CREDENTIAL_STORAGE_KEY);
    if (!credential) return null;
    const query = new URLSearchParams({ id });
    const response = await fetchImpl(`/m/api/v1/${route}?${query}`, {
      headers: { Authorization: `Bearer ${credential}` },
      credentials: 'omit',
      signal,
    });
    if (response.status === 404) return null;
    if (
      !response.ok ||
      !['image/jpeg', 'image/webp', 'image/png'].includes(
        response.headers.get('content-type'),
      )
    )
      throw new Error('Companion artwork unavailable');
    return response.blob();
  }

  async function getCatalog({ query, category, offset }, signal) {
    const credential = store.get(CREDENTIAL_STORAGE_KEY);
    const params = new URLSearchParams({ q: query, category, offset });
    const response = await fetchImpl(`/m/api/v1/catalog?${params}`, {
      headers: { Authorization: `Bearer ${credential}` },
      credentials: 'omit',
      signal,
    });
    if (!response.ok) throw new Error('Companion catalog unavailable');
    return response.json();
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
    close: async () => ({ open: true }),
    minimize: async () => ({ open: true }),
    toggleFullScreen: async () => ({ open: true }),
    toggleAlwaysOnTop: async () => ({ open: true }),
    recordDiagnostic: async () => undefined,
  };

  // Takes the connection back from whichever phone holds it now.
  function resume() {
    const wasDisplaced = displaced;
    displaced = false;
    retry = 0;
    // A socket still open after a displaced reply is about to be closed.
    if (wasDisplaced && socket) {
      const ws = socket;
      socket = null;
      clearLiveness();
      ws.close();
    }
    connect();
  }

  return {
    pair,
    hasCredential,
    connect,
    resume,
    stop,
    sendCommand,
    getTrackArtwork: (id, signal) => getArtwork('artwork', id, signal),
    getOutputPortrait: (id, signal) =>
      getArtwork('output-portrait', id, signal),
    getCatalog,
    getLyricsLayout: () =>
      store.get(LAYOUT_STORAGE_KEY) === 'focus' ? 'focus' : 'list',
    setLyricsLayout: (value) =>
      store.set(LAYOUT_STORAGE_KEY, value === 'focus' ? 'focus' : 'list'),
    getLockScreen: () => store.get(LOCK_SCREEN_STORAGE_KEY) === 'on',
    setLockScreen: (value) =>
      store.set(LOCK_SCREEN_STORAGE_KEY, value ? 'on' : null),
    performerBridge,
  };
}
