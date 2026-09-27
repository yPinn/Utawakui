'use strict';

// Main-owned OBS WebSocket adapter — see ADR 0013 (external integration
// planes) and docs/contracts/integration-adapter-contract.md's OBS adapter
// profile. v1 is read-only: version handshake, streaming/recording state,
// and on-demand fresh snapshots for timestamping (no scene/source writes).
//
// Lifecycle mirrors spoutOutputRuntime.js's desired/observed status shape
// and mutual-exclusion pattern, adapted for a socket instead of a child
// process. Client identity prevents a retired transport from mutating state;
// operationEpoch also prevents an older configure()/disconnect() sequence from
// winning after a newer operation has started.

const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_RATIO = 0.2;
const {
  connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
  defaultHost: DEFAULT_OBS_HOST,
  defaultPort: DEFAULT_OBS_PORT,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
} = require('../../shared/obsConnectionValues.json');
// obs-websocket protocol WebSocketCloseCode.AuthenticationFailed — the one
// close code worth distinguishing from a generic connect failure, since it
// means "check the password" rather than "check the host/port/OBS is open".
const OBS_WEBSOCKET_AUTH_FAILED_CODE = 4009;

const PUBLIC_ERROR_MESSAGES = Object.freeze({
  OBS_CONNECT_FAILED: '無法連線。請檢查 OBS 設定。',
  OBS_CONNECTION_REFUSED: 'OBS 未啟動，或 WebSocket 連接埠不正確。',
  OBS_HOST_NOT_FOUND: '找不到 OBS 主機。請檢查主機名稱或 IP。',
  OBS_CONNECT_TIMEOUT: '連線逾時。請檢查 OBS、防火牆或網路。',
  OBS_AUTH_FAILED: 'OBS 密碼錯誤或未設定。',
  OBS_INCOMPATIBLE_SERVER: '這不是相容的 OBS WebSocket 5 服務。',
  OBS_REQUEST_FAILED: '無法讀取 OBS 狀態。',
  OBS_REQUEST_TIMEOUT: '讀取 OBS 狀態逾時。',
  OBS_ADAPTER_INTERNAL: 'OBS 連線發生未預期錯誤。',
});

function createInitialStatus() {
  return {
    desired: { enabled: false, host: DEFAULT_OBS_HOST, port: DEFAULT_OBS_PORT },
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

function collectErrorSignals(error) {
  const codes = [];
  const signals = [];
  const visited = new Set();
  let current = error;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === 'object';
    depth += 1
  ) {
    if (visited.has(current)) break;
    visited.add(current);
    for (const value of [current.code, current.errno]) {
      if (typeof value === 'string' || typeof value === 'number') {
        const normalized = String(value).toUpperCase();
        codes.push(normalized);
        signals.push(normalized);
      }
    }
    for (const value of [current.name, current.message]) {
      if (typeof value === 'string' || typeof value === 'number') {
        signals.push(String(value).toUpperCase());
      }
    }
    current = current.cause;
  }
  return { codes, signals };
}

function classifyConnectionError(error) {
  const { codes, signals } = collectErrorSignals(error);
  const hasCode = (...needles) =>
    needles.some((needle) => codes.includes(needle));
  const hasSignal = (...needles) =>
    needles.some((needle) =>
      signals.some((signal) => signal === needle || signal.includes(needle)),
    );

  if (hasCode(String(OBS_WEBSOCKET_AUTH_FAILED_CODE))) {
    return 'OBS_AUTH_FAILED';
  }
  if (hasSignal('OBS_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ESOCKETTIMEDOUT')) {
    return 'OBS_CONNECT_TIMEOUT';
  }
  if (hasSignal('ECONNREFUSED')) return 'OBS_CONNECTION_REFUSED';
  if (hasSignal('ENOTFOUND', 'EAI_AGAIN')) return 'OBS_HOST_NOT_FOUND';
  if (
    hasCode('4010') ||
    hasSignal(
      'UNSUPPORTED RPC VERSION',
      'UNSUPPORTED PROTOCOL',
      'NO SUBPROTOCOL',
      'INVALID SUBPROTOCOL',
      'UNEXPECTED SERVER RESPONSE',
    )
  ) {
    return 'OBS_INCOMPATIBLE_SERVER';
  }
  return 'OBS_CONNECT_FAILED';
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
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  const status = createInitialStatus();
  let client = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let connectPromise = null;
  let cancelPendingConnect = null;
  const pendingRequestCancels = new Set();
  let operationEpoch = 0;

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

  function cancelConnectAttempt() {
    const cancel = cancelPendingConnect;
    cancelPendingConnect = null;
    cancel?.();
  }

  function cancelRequestAttempts() {
    const cancels = [...pendingRequestCancels];
    pendingRequestCancels.clear();
    for (const cancel of cancels) cancel();
  }

  async function connectWithDeadline(nextClient, url, password) {
    let settled = false;
    let deadlineTimer = null;
    let rejectCancellation;
    const cancellation = new Promise((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cancel = () => {
      if (settled) return;
      const error = new Error('OBS connect cancelled');
      error.code = 'OBS_CONNECT_CANCELLED';
      rejectCancellation(error);
    };
    cancelPendingConnect = cancel;

    const deadline = new Promise((_resolve, reject) => {
      deadlineTimer = scheduleTimeout(() => {
        if (settled) return;
        const error = new Error('OBS connect timeout');
        error.code = 'OBS_CONNECT_TIMEOUT';
        reject(error);
      }, connectTimeoutMs);
      deadlineTimer?.unref?.();
    });

    try {
      return await Promise.race([
        nextClient.connect(url, password),
        deadline,
        cancellation,
      ]);
    } finally {
      settled = true;
      if (cancelPendingConnect === cancel) cancelPendingConnect = null;
      if (deadlineTimer) clearTimeoutFn(deadlineTimer);
    }
  }

  async function callWithDeadline(activeClient, requestType) {
    let settled = false;
    let deadlineTimer = null;
    let rejectCancellation;
    const cancellation = new Promise((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cancel = () => {
      if (settled) return;
      const error = new Error('OBS request cancelled');
      error.code = 'OBS_REQUEST_CANCELLED';
      rejectCancellation(error);
    };
    pendingRequestCancels.add(cancel);

    const deadline = new Promise((_resolve, reject) => {
      deadlineTimer = scheduleTimeout(() => {
        if (settled) return;
        const error = new Error('OBS request timeout');
        error.code = 'OBS_REQUEST_TIMEOUT';
        reject(error);
      }, requestTimeoutMs);
      deadlineTimer?.unref?.();
    });

    try {
      return await Promise.race([
        activeClient.call(requestType),
        deadline,
        cancellation,
      ]);
    } finally {
      settled = true;
      pendingRequestCancels.delete(cancel);
      if (deadlineTimer) clearTimeoutFn(deadlineTimer);
    }
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
    cancelConnectAttempt();
    cancelRequestAttempts();
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

  async function refreshOutputSnapshots(activeClient, activeEpoch) {
    const [streamResult, recordResult] = await Promise.allSettled([
      callWithDeadline(activeClient, 'GetStreamStatus'),
      callWithDeadline(activeClient, 'GetRecordStatus'),
    ]);
    if (client !== activeClient || operationEpoch !== activeEpoch) {
      return { ok: false, stale: true };
    }
    if (
      (streamResult.status === 'rejected' &&
        streamResult.reason?.code === 'OBS_REQUEST_TIMEOUT') ||
      (recordResult.status === 'rejected' &&
        recordResult.reason?.code === 'OBS_REQUEST_TIMEOUT')
    ) {
      return { ok: false, timedOut: true };
    }
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

    const activeEpoch = operationEpoch;
    const desired = { ...status.desired };
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
        handleDisconnected(classifyConnectionError(error));
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
      if (client !== nextClient || operationEpoch !== activeEpoch) {
        return getStatus();
      }

      try {
        const formattedHost = desired.host.includes(':')
          ? `[${desired.host}]`
          : desired.host;
        const hello = await connectWithDeadline(
          nextClient,
          `ws://${formattedHost}:${desired.port}`,
          password || undefined,
        );
        if (client !== nextClient || operationEpoch !== activeEpoch) {
          nextClient.disconnect().catch(() => {});
          return getStatus();
        }
        status.observed.obsWebSocketVersion = hello.obsWebSocketVersion ?? null;
        status.observed.negotiatedRpcVersion =
          hello.negotiatedRpcVersion ?? null;
        reconnectAttempt = 0;

        const snapshot = await refreshOutputSnapshots(nextClient, activeEpoch);
        if (
          snapshot.stale ||
          client !== nextClient ||
          operationEpoch !== activeEpoch
        ) {
          return getStatus();
        }
        if (snapshot.timedOut) {
          const error = new Error('OBS request timeout');
          error.code = 'OBS_REQUEST_TIMEOUT';
          throw error;
        }
        status.observed.lifecycle = snapshot.ok ? 'ready' : 'degraded';
        status.error = snapshot.ok ? null : toPublicError('OBS_REQUEST_FAILED');
        publishStatus();
        return getStatus();
      } catch (error) {
        if (client !== nextClient || operationEpoch !== activeEpoch) {
          return getStatus();
        }
        logger.error?.('[obs-adapter] Connect failed', error);
        handleDisconnected(
          error?.code === 'OBS_REQUEST_TIMEOUT'
            ? 'OBS_REQUEST_TIMEOUT'
            : classifyConnectionError(error),
        );
        if (
          error?.code === 'OBS_CONNECT_TIMEOUT' ||
          error?.code === 'OBS_REQUEST_TIMEOUT'
        ) {
          nextClient.disconnect().catch(() => {});
        }
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

  async function disconnectClient() {
    clearReconnectTimer();
    reconnectAttempt = 0;
    // Unblocks connect()'s `if (connectPromise) return connectPromise;`
    // guard immediately, so a configure() that supersedes a still-pending
    // attempt can start a fresh one without waiting for the stale attempt
    // to unwind (see the finally block in connect()).
    connectPromise = null;
    const activeClient = client;
    detachClient();
    cancelConnectAttempt();
    cancelRequestAttempts();
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

  async function disconnect() {
    operationEpoch += 1;
    return disconnectClient();
  }

  async function configure(desiredConfig) {
    requireFeatureGate(featureId);
    const configureEpoch = ++operationEpoch;
    await disconnectClient();
    if (operationEpoch !== configureEpoch) return getStatus();
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
    const activeClient = client;
    const activeEpoch = operationEpoch;
    let value;
    try {
      value = await callWithDeadline(activeClient, 'GetStreamStatus');
    } catch (error) {
      if (client !== activeClient || operationEpoch !== activeEpoch) {
        throw new Error('OBS connection changed', { cause: error });
      }
      if (error?.code === 'OBS_REQUEST_TIMEOUT') {
        logger.error?.('[obs-adapter] Stream status request timed out', error);
        handleDisconnected('OBS_REQUEST_TIMEOUT');
        activeClient.disconnect().catch(() => {});
        throw new Error('OBS request timed out', { cause: error });
      }
      throw error;
    }
    if (client !== activeClient || operationEpoch !== activeEpoch) {
      throw new Error('OBS connection changed');
    }
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
    const activeClient = client;
    const activeEpoch = operationEpoch;
    let value;
    try {
      value = await callWithDeadline(activeClient, 'GetRecordStatus');
    } catch (error) {
      if (client !== activeClient || operationEpoch !== activeEpoch) {
        throw new Error('OBS connection changed', { cause: error });
      }
      if (error?.code === 'OBS_REQUEST_TIMEOUT') {
        logger.error?.('[obs-adapter] Record status request timed out', error);
        handleDisconnected('OBS_REQUEST_TIMEOUT');
        activeClient.disconnect().catch(() => {});
        throw new Error('OBS request timed out', { cause: error });
      }
      throw error;
    }
    if (client !== activeClient || operationEpoch !== activeEpoch) {
      throw new Error('OBS connection changed');
    }
    status.observed.recording = {
      active: value.outputActive,
      timecode: value.outputTimecode,
      durationMs: value.outputDuration,
    };
    publishStatus();
    return { ...status.observed.recording };
  }

  function destroy() {
    operationEpoch += 1;
    clearReconnectTimer();
    connectPromise = null;
    const activeClient = client;
    detachClient();
    cancelConnectAttempt();
    cancelRequestAttempts();
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
