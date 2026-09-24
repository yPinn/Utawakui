'use strict';

// Main-owned OBS WebSocket adapter — see ADR 0013 (external integration
// planes) and docs/contracts/integration-adapter-contract.md's OBS adapter
// profile. v1 is read-only: version handshake, streaming/recording state,
// and on-demand fresh snapshots for timestamping (no scene/source writes).
//
// Lifecycle mirrors spoutOutputRuntime.js's desired/observed status shape
// and mutual-exclusion pattern, adapted for a socket instead of a child
// process. Staleness after configure()/disconnect() is guarded by comparing
// the module-scope `client` against the closed-over `nextClient` a given
// connect() attempt created — disconnect() always nulls `client` in the same
// synchronous call that tears everything else down, so that identity check
// alone is sufficient; a separate epoch counter would be redundant.

const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_RATIO = 0.2;
// obs-websocket protocol WebSocketCloseCode.AuthenticationFailed — the one
// close code worth distinguishing from a generic connect failure, since it
// means "check the password" rather than "check the host/port/OBS is open".
const OBS_WEBSOCKET_AUTH_FAILED_CODE = 4009;

const PUBLIC_ERROR_MESSAGES = Object.freeze({
  OBS_CONNECT_FAILED: '無法連線至 OBS。',
  OBS_AUTH_FAILED: 'OBS WebSocket 密碼錯誤或未設定。',
  OBS_REQUEST_FAILED: '無法讀取 OBS 狀態。',
  OBS_ADAPTER_INTERNAL: 'OBS 連線發生未預期錯誤。',
});

function createInitialStatus() {
  return {
    desired: { enabled: false, host: '127.0.0.1', port: 4455 },
    observed: {
      lifecycle: 'disabled', // disabled|disconnected|connecting|authenticating|ready|degraded|error
      obsWebSocketVersion: null,
      negotiatedRpcVersion: null,
      streaming: { active: false, timecode: null, durationMs: null },
      recording: { active: false, timecode: null, durationMs: null },
    },
    error: null,
  };
}

function cloneStatus(status) {
  return {
    desired: { ...status.desired },
    observed: {
      ...status.observed,
      streaming: { ...status.observed.streaming },
      recording: { ...status.observed.recording },
    },
    error: status.error ? { ...status.error } : null,
  };
}

function toPublicError(code) {
  return {
    code,
    message:
      PUBLIC_ERROR_MESSAGES[code] ?? PUBLIC_ERROR_MESSAGES.OBS_ADAPTER_INTERNAL,
  };
}

function defaultCreateClient() {
  // Required lazily, not at module load — a disabled adapter must not carry
  // the SDK's startup cost (ADR 0013: "no ... loaded SDK" while disabled).
  const { OBSWebSocket } = require('obs-websocket-js');
  return new OBSWebSocket();
}

function createObsAdapter({
  requireFeatureGate = () => {},
  featureId = 'obs-integration',
  getPassword = async () => null,
  createClient = defaultCreateClient,
  scheduleTimeout = setTimeout,
  clearTimeoutFn = clearTimeout,
  logger = console,
  onStatusChange = () => {},
  reconnectBaseMs = DEFAULT_RECONNECT_BASE_MS,
  reconnectMaxMs = DEFAULT_RECONNECT_MAX_MS,
} = {}) {
  const status = createInitialStatus();
  let client = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let connectPromise = null;

  function getStatus() {
    return cloneStatus(status);
  }

  function publishStatus() {
    try {
      onStatusChange(getStatus());
    } catch (error) {
      logger.error?.('[obs-adapter] Failed to publish status', error);
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function detachClient() {
    if (!client) return;
    client.removeAllListeners?.();
    client = null;
  }

  function scheduleReconnect() {
    if (!status.desired.enabled) return;
    clearReconnectTimer();
    const backoff = Math.min(
      reconnectMaxMs,
      reconnectBaseMs * 2 ** reconnectAttempt,
    );
    const jitter = backoff * RECONNECT_JITTER_RATIO * Math.random();
    reconnectAttempt += 1;
    reconnectTimer = scheduleTimeout(() => {
      reconnectTimer = null;
      connect().catch(() => {});
    }, backoff + jitter);
    reconnectTimer?.unref?.();
  }

  function handleDisconnected(code) {
    detachClient();
    if (!status.desired.enabled) {
      status.observed.lifecycle = 'disabled';
      status.error = null;
      publishStatus();
      return;
    }
    status.observed.lifecycle = 'error';
    status.observed.streaming = {
      active: false,
      timecode: null,
      durationMs: null,
    };
    status.observed.recording = {
      active: false,
      timecode: null,
      durationMs: null,
    };
    status.error = toPublicError(code);
    publishStatus();
    scheduleReconnect();
  }

  async function refreshOutputSnapshots() {
    const [streamResult, recordResult] = await Promise.allSettled([
      client.call('GetStreamStatus'),
      client.call('GetRecordStatus'),
    ]);
    if (streamResult.status === 'fulfilled') {
      status.observed.streaming = {
        active: streamResult.value.outputActive,
        timecode: streamResult.value.outputTimecode,
        durationMs: streamResult.value.outputDuration,
      };
    }
    if (recordResult.status === 'fulfilled') {
      status.observed.recording = {
        active: recordResult.value.outputActive,
        timecode: recordResult.value.outputTimecode,
        durationMs: recordResult.value.outputDuration,
      };
    }
    return {
      ok:
        streamResult.status === 'fulfilled' ||
        recordResult.status === 'fulfilled',
    };
  }

  async function connect() {
    if (!status.desired.enabled) return getStatus();
    if (connectPromise) return connectPromise;
    if (
      status.observed.lifecycle === 'ready' ||
      status.observed.lifecycle === 'degraded'
    ) {
      return getStatus();
    }

    const attempt = (async () => {
      requireFeatureGate(featureId);
      clearReconnectTimer();
      status.observed.lifecycle = 'connecting';
      status.error = null;
      publishStatus();

      const nextClient = createClient();
      client = nextClient;

      nextClient.once('Hello', () => {
        if (client !== nextClient) return;
        status.observed.lifecycle = 'authenticating';
        publishStatus();
      });
      nextClient.on('ConnectionClosed', (error) => {
        if (client !== nextClient) return;
        handleDisconnected(
          error?.code === OBS_WEBSOCKET_AUTH_FAILED_CODE
            ? 'OBS_AUTH_FAILED'
            : 'OBS_CONNECT_FAILED',
        );
      });
      nextClient.on('StreamStateChanged', (event) => {
        if (client !== nextClient) return;
        status.observed.streaming.active = event.outputActive;
        publishStatus();
      });
      nextClient.on('RecordStateChanged', (event) => {
        if (client !== nextClient) return;
        status.observed.recording.active = event.outputActive;
        publishStatus();
      });

      let password = null;
      try {
        password = await getPassword();
      } catch (error) {
        logger.error?.('[obs-adapter] Failed to load stored password', error);
      }
      if (client !== nextClient) return getStatus();

      try {
        const hello = await nextClient.connect(
          `ws://${status.desired.host}:${status.desired.port}`,
          password || undefined,
        );
        if (client !== nextClient) {
          nextClient.disconnect().catch(() => {});
          return getStatus();
        }
        status.observed.obsWebSocketVersion = hello.obsWebSocketVersion ?? null;
        status.observed.negotiatedRpcVersion =
          hello.negotiatedRpcVersion ?? null;
        reconnectAttempt = 0;

        const snapshot = await refreshOutputSnapshots();
        if (client !== nextClient) return getStatus();
        status.observed.lifecycle = snapshot.ok ? 'ready' : 'degraded';
        status.error = snapshot.ok ? null : toPublicError('OBS_REQUEST_FAILED');
        publishStatus();
        return getStatus();
      } catch (error) {
        if (client !== nextClient) return getStatus();
        logger.error?.('[obs-adapter] Connect failed', error);
        handleDisconnected(
          error?.code === OBS_WEBSOCKET_AUTH_FAILED_CODE
            ? 'OBS_AUTH_FAILED'
            : 'OBS_CONNECT_FAILED',
        );
        throw new Error('Failed to connect to OBS', { cause: error });
      }
    })();
    connectPromise = attempt;

    try {
      return await attempt;
    } finally {
      // Only the attempt that still owns connectPromise clears it — a
      // superseded attempt (see disconnect()) must not null out a newer
      // attempt's in-flight promise out from under it.
      if (connectPromise === attempt) connectPromise = null;
    }
  }

  async function disconnect() {
    clearReconnectTimer();
    reconnectAttempt = 0;
    // Unblocks connect()'s `if (connectPromise) return connectPromise;`
    // guard immediately, so a configure() that supersedes a still-pending
    // attempt can start a fresh one without waiting for the stale attempt
    // to unwind (see the finally block in connect()).
    connectPromise = null;
    const activeClient = client;
    detachClient();
    status.observed.lifecycle = status.desired.enabled
      ? 'disconnected'
      : 'disabled';
    status.observed.streaming = {
      active: false,
      timecode: null,
      durationMs: null,
    };
    status.observed.recording = {
      active: false,
      timecode: null,
      durationMs: null,
    };
    status.error = null;
    publishStatus();
    if (activeClient) {
      try {
        await activeClient.disconnect();
      } catch (error) {
        logger.error?.('[obs-adapter] Error while disconnecting', error);
      }
    }
    return getStatus();
  }

  async function configure(desiredConfig) {
    requireFeatureGate(featureId);
    await disconnect();
    status.desired = {
      enabled: Boolean(desiredConfig?.enabled),
      host:
        typeof desiredConfig?.host === 'string' && desiredConfig.host.length > 0
          ? desiredConfig.host
          : status.desired.host,
      port: Number.isSafeInteger(desiredConfig?.port)
        ? desiredConfig.port
        : status.desired.port,
    };
    status.observed.lifecycle = status.desired.enabled
      ? 'disconnected'
      : 'disabled';
    publishStatus();
    if (status.desired.enabled) {
      // Awaited, not fire-and-forget: a Settings "connect" action should see
      // the real outcome of its own attempt. If OBS isn't reachable yet this
      // resolves once that one attempt fails (bounded by the OS connect
      // timeout) — handleDisconnected() has already scheduled the ongoing
      // background retry by the time this settles, so the "open App before
      // OBS/stream" case still recovers on its own after configure()
      // returns.
      try {
        await connect();
      } catch (error) {
        logger.error?.(
          '[obs-adapter] Initial connect after configure failed',
          error,
        );
      }
    }
    return getStatus();
  }

  function requireConnected() {
    if (
      !client ||
      (status.observed.lifecycle !== 'ready' &&
        status.observed.lifecycle !== 'degraded')
    ) {
      throw new Error('OBS is not connected');
    }
  }

  // Called at a semantic boundary (e.g. the moment a track starts playing),
  // not polled — see integration-adapter-contract.md's "clock samples ...
  // reacts to semantic boundaries" principle. Always asks OBS fresh so the
  // result can't drift from a locally-maintained clock.
  async function requestStreamSnapshot() {
    requireFeatureGate(featureId);
    requireConnected();
    const value = await client.call('GetStreamStatus');
    status.observed.streaming = {
      active: value.outputActive,
      timecode: value.outputTimecode,
      durationMs: value.outputDuration,
    };
    publishStatus();
    return { ...status.observed.streaming };
  }

  async function requestRecordSnapshot() {
    requireFeatureGate(featureId);
    requireConnected();
    const value = await client.call('GetRecordStatus');
    status.observed.recording = {
      active: value.outputActive,
      timecode: value.outputTimecode,
      durationMs: value.outputDuration,
    };
    publishStatus();
    return { ...status.observed.recording };
  }

  function destroy() {
    clearReconnectTimer();
    const activeClient = client;
    detachClient();
    activeClient?.disconnect().catch(() => {});
  }

  return {
    getStatus,
    configure,
    connect,
    disconnect,
    requestStreamSnapshot,
    requestRecordSnapshot,
    destroy,
  };
}

module.exports = { createObsAdapter };
