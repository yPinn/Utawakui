'use strict';

const { isPrivateIpv4 } = require('./networkScope');
const { createReaderHub } = require('./readerHub');
const { createCommandAdmission } = require('./commandGate');
const { createPairingApprovals } = require('./pairingApproval');

const DEFAULT_PORT = 8710;
// Tried in order when the saved port is taken; the one that opens is kept so
// paired phones keep the same address.
const FALLBACK_PORTS = Object.freeze([8710, 8711, 8712, 8713, 8714]);
const PORT_MIN = 1024;
const PORT_MAX = 49151;
// A failed start (network not up yet, profile still public, ports busy) is
// retried in the background so it recovers without a click.
const RETRY_MS = 10_000;
// On by default: turning the feature on is the only step before pairing.
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  interfaceAddress: null,
  port: DEFAULT_PORT,
});

function runtimeError(code) {
  return Object.assign(new Error(`Companion runtime: ${code}`), {
    companionStatus: code,
  });
}

function normalizeCompanionSettings(value) {
  const port = Number(value?.port);
  return {
    enabled: value?.enabled !== false,
    interfaceAddress: isPrivateIpv4(value?.interfaceAddress)
      ? value.interfaceAddress
      : null,
    port:
      Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX
        ? port
        : DEFAULT_PORT,
  };
}

// The saved private interface wins; otherwise the only private one is picked.
function resolveInterface(savedAddress, scope) {
  const privates = scope.filter((entry) => entry.privateNetwork);
  const saved = privates.find((entry) => entry.address === savedAddress);
  if (saved) return { entry: saved };
  if (privates.length === 1) return { entry: privates[0] };
  if (privates.length > 1) return { failure: 'choose-interface' };
  return { failure: scope.length ? 'public-network' : 'no-interface' };
}

// Owns the paired-phone listener: it runs only while the gate and setting are
// on and the chosen interface is on a network Windows reports as private.
function createCompanionRuntime({
  getSettings,
  saveSettings,
  isGateEnabled,
  devices,
  pairing,
  describeNetworkScope,
  createServer,
  snapshots = { get: () => null, subscribe: () => () => {} },
  loadPage = () => new Map(),
  onReaderCount = () => {},
  createReaders = createReaderHub,
  dispatchCommand = null,
  approvals = createPairingApprovals(),
  onChange = () => {},
  retryMs = RETRY_MS,
}) {
  let server = null;
  let error = null;
  let reconciling = Promise.resolve();
  let retryTimer = null;
  let reported = '';

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
    if (server || !error || error === 'secure-storage-unavailable') return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void refresh({ quiet: true });
    }, retryMs);
    retryTimer.unref?.();
  }

  async function stopServer() {
    pairing.cancel();
    approvals.cancel();
    const current = server;
    server = null;
    await current?.stop();
  }

  async function reconcile() {
    const settings = normalizeCompanionSettings(getSettings());
    if (!isGateEnabled() || !settings.enabled) {
      error = null;
      return stopServer();
    }
    const scope = await describeNetworkScope();
    const { entry: chosen, failure: missing } = resolveInterface(
      settings.interfaceAddress,
      scope,
    );
    const failure =
      missing ?? (devices.available() ? null : 'secure-storage-unavailable');
    if (failure) {
      error = failure;
      return stopServer();
    }
    const address = chosen.address;
    if (
      server?.address === address &&
      server?.port === settings.port &&
      server.instance.isRunning()
    ) {
      error = null;
      return;
    }
    await stopServer();
    const ports = [
      settings.port,
      ...FALLBACK_PORTS.filter((port) => port !== settings.port),
    ];
    for (const port of ports) {
      const instance = createServer({
        address,
        port,
        pairing,
        devices,
        isGateEnabled,
        loadPage,
        readers: createReaders({ devices, snapshots, onReaderCount }),
        approvals,
        onPairingRequest: () => onChange(),
        commands: dispatchCommand
          ? { admission: createCommandAdmission(), dispatch: dispatchCommand }
          : null,
      });
      try {
        await instance.start();
      } catch (startError) {
        error = startError.companionStatus ?? 'listen-failed';
        if (error === 'port-in-use') continue;
        return;
      }
      server = { instance, address, port, stop: () => instance.stop() };
      error = null;
      if (address !== settings.interfaceAddress || port !== settings.port)
        saveSettings({ ...settings, interfaceAddress: address, port });
      return;
    }
  }

  // Serialized so rapid setting changes never start two listeners. A quiet
  // background retry notifies only when the outcome changed.
  function refresh({ quiet = false } = {}) {
    reconciling = reconciling
      .then(reconcile, reconcile)
      .catch(() => {
        error = 'listen-failed';
      })
      .finally(() => {
        scheduleRetry();
        const outcome = `${server?.port ?? ''}|${error ?? ''}`;
        if (!quiet || outcome !== reported) onChange();
        reported = outcome;
      });
    return reconciling;
  }

  async function status() {
    await reconciling;
    const settings = normalizeCompanionSettings(getSettings());
    let interfaces = [];
    if (isGateEnabled()) {
      try {
        interfaces = await describeNetworkScope();
      } catch {
        interfaces = [];
      }
    }
    let deviceList;
    try {
      deviceList = devices.list();
    } catch {
      deviceList = [];
    }
    return {
      ...settings,
      running: Boolean(server),
      error,
      interfaces,
      devices: deviceList,
      pairing: { ...pairing.status(), request: approvals.status() },
    };
  }

  async function configure(input) {
    if (!input || typeof input !== 'object') throw runtimeError('invalid');
    const current = normalizeCompanionSettings(getSettings());
    const next = { ...current };
    if ('enabled' in input) {
      if (typeof input.enabled !== 'boolean') throw runtimeError('invalid');
      next.enabled = input.enabled;
    }
    if ('interfaceAddress' in input) {
      if (!isPrivateIpv4(input.interfaceAddress)) throw runtimeError('invalid');
      next.interfaceAddress = input.interfaceAddress;
    }
    if ('port' in input) throw runtimeError('invalid');
    saveSettings(next);
    await refresh();
    return status();
  }

  async function beginPairing() {
    await reconciling;
    if (!server) throw runtimeError('not-running');
    const { code, expiresAt } = pairing.begin();
    onChange();
    // The code travels only in the fragment, which browsers never send.
    return {
      url: `http://${server.address}:${server.port}/m/#pair=${code}`,
      expiresAt,
    };
  }

  function cancelPairing() {
    pairing.cancel();
    approvals.cancel();
    onChange();
  }

  // Issues the device credential only on an explicit approval. A failed
  // issue (such as a full device list) denies the request instead.
  function approvePairing(id) {
    if (typeof id !== 'string') throw runtimeError('invalid');
    let approved;
    try {
      approved = approvals.approve(
        id,
        (label) => devices.add(label).credential,
      );
    } catch (error) {
      approvals.deny(id);
      onChange();
      throw runtimeError(error.companionStatus ?? 'failed');
    }
    onChange();
    return approved;
  }

  function denyPairing(id) {
    if (typeof id !== 'string') throw runtimeError('invalid');
    const denied = approvals.deny(id);
    onChange();
    return denied;
  }

  function revoke(id) {
    if (typeof id !== 'string') throw runtimeError('invalid');
    const removed = devices.revoke(id);
    server?.instance.closeDevice?.(id);
    onChange();
    return removed;
  }

  function revokeAll() {
    const ids = devices.list().map((device) => device.id);
    const removed = devices.revokeAll();
    for (const id of ids) server?.instance.closeDevice?.(id);
    onChange();
    return removed;
  }

  return {
    status,
    configure,
    refresh,
    beginPairing,
    cancelPairing,
    approvePairing,
    denyPairing,
    revoke,
    revokeAll,
    stop: async () => {
      clearTimeout(retryTimer);
      retryTimer = null;
      await reconciling;
      clearTimeout(retryTimer);
      await stopServer();
    },
  };
}

module.exports = {
  DEFAULT_COMPANION_SETTINGS: DEFAULT_SETTINGS,
  createCompanionRuntime,
  normalizeCompanionSettings,
};
