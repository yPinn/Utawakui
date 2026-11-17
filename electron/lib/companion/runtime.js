'use strict';

const { isPrivateIpv4 } = require('./networkScope');
const { createReaderHub } = require('./readerHub');
const { createCommandAdmission } = require('./commandGate');
const { createPairingApprovals } = require('./pairingApproval');

const DEFAULT_PORT = 8710;
const PORT_MIN = 1024;
const PORT_MAX = 49151;
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
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
    enabled: value?.enabled === true,
    interfaceAddress: isPrivateIpv4(value?.interfaceAddress)
      ? value.interfaceAddress
      : null,
    port:
      Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX
        ? port
        : DEFAULT_PORT,
  };
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
}) {
  let server = null;
  let error = null;
  let reconciling = Promise.resolve();

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
    const chosen = scope.find(
      (entry) => entry.address === settings.interfaceAddress,
    );
    const failure =
      !settings.interfaceAddress || !chosen
        ? 'no-interface'
        : !chosen.privateNetwork
          ? 'public-network'
          : !devices.available()
            ? 'secure-storage-unavailable'
            : null;
    if (failure) {
      error = failure;
      return stopServer();
    }
    if (
      server?.address === settings.interfaceAddress &&
      server?.port === settings.port &&
      server.instance.isRunning()
    ) {
      error = null;
      return;
    }
    await stopServer();
    const instance = createServer({
      address: settings.interfaceAddress,
      port: settings.port,
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
      server = {
        instance,
        address: settings.interfaceAddress,
        port: settings.port,
        stop: () => instance.stop(),
      };
      error = null;
    } catch (startError) {
      error = startError.companionStatus ?? 'listen-failed';
    }
  }

  // Serialized so rapid setting changes never start two listeners.
  function refresh() {
    reconciling = reconciling
      .then(reconcile, reconcile)
      .catch(() => {
        error = 'listen-failed';
      })
      .finally(() => onChange());
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
    if ('port' in input) {
      const port = input.port;
      if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX)
        throw runtimeError('invalid');
      next.port = port;
    }
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
      await reconciling;
      await stopServer();
    },
  };
}

module.exports = {
  DEFAULT_COMPANION_SETTINGS: DEFAULT_SETTINGS,
  createCompanionRuntime,
  normalizeCompanionSettings,
};
