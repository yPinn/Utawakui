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
// Public networks the user chose to use anyway, by Windows profile name.
const MAX_ALLOWED_NETWORKS = 16;
const MAX_NETWORK_NAME_LENGTH = 256;
// There is no on／off setting: the listener runs whenever the feature is on.
const DEFAULT_SETTINGS = Object.freeze({
  interfaceAddress: null,
  port: DEFAULT_PORT,
  allowedNetworks: Object.freeze([]),
});

function isNetworkName(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_NETWORK_NAME_LENGTH
  );
}

function runtimeError(code) {
  return Object.assign(new Error(`Companion runtime: ${code}`), {
    companionStatus: code,
  });
}

function normalizeCompanionSettings(value) {
  const port = Number(value?.port);
  return {
    interfaceAddress: isPrivateIpv4(value?.interfaceAddress)
      ? value.interfaceAddress
      : null,
    port:
      Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX
        ? port
        : DEFAULT_PORT,
    allowedNetworks: Array.isArray(value?.allowedNetworks)
      ? [...new Set(value.allowedNetworks.filter(isNetworkName))].slice(
          -MAX_ALLOWED_NETWORKS,
        )
      : [],
  };
}

// Usable networks are private ones plus public ones the user allowed. The
// saved one wins; otherwise the only usable one is picked.
function resolveInterface(savedAddress, scope, allowedNetworks = []) {
  const usable = scope.filter(
    (entry) =>
      entry.privateNetwork ||
      (entry.network && allowedNetworks.includes(entry.network)),
  );
  const saved = usable.find((entry) => entry.address === savedAddress);
  if (saved) return { entry: saved };
  if (usable.length === 1) return { entry: usable[0] };
  if (usable.length > 1) return { failure: 'choose-interface' };
  return { failure: scope.length ? 'public-network' : 'no-interface' };
}

// Owns the listener while the gate is on and the selected network is allowed.
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
  let lastScope = null;
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
    if (!isGateEnabled()) {
      error = null;
      lastScope = null;
      return stopServer();
    }
    const scope = await describeNetworkScope();
    lastScope = scope;
    const { entry: chosen, failure: missing } = resolveInterface(
      settings.interfaceAddress,
      scope,
      settings.allowedNetworks,
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
    // Reads reuse the networks the last start check saw instead of querying
    // Windows again; the background retry keeps them current while it fails.
    let interfaces = [];
    if (isGateEnabled()) {
      try {
        lastScope ??= await describeNetworkScope();
        interfaces = lastScope;
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
    // The approval shows the name the phone will be saved under.
    const request = approvals.status();
    let label = request?.label;
    try {
      label = (request && devices.uniqueLabel?.(request.label)) || label;
    } catch {
      /* Keep the phone's own label when the store cannot be read. */
    }
    return {
      ...settings,
      running: Boolean(server),
      error,
      interfaces,
      devices: deviceList,
      pairing: {
        ...pairing.status(),
        request: request ? { ...request, label } : request,
      },
    };
  }

  async function configure(input) {
    if (!input || typeof input !== 'object') throw runtimeError('invalid');
    const current = normalizeCompanionSettings(getSettings());
    const next = { ...current };
    if ('interfaceAddress' in input) {
      if (!isPrivateIpv4(input.interfaceAddress)) throw runtimeError('invalid');
      next.interfaceAddress = input.interfaceAddress;
    }
    // Neither the port nor an on／off switch is a setting any more.
    if ('port' in input || 'enabled' in input) throw runtimeError('invalid');
    // Using a public network is an explicit, per-network choice, and only for
    // a public network this computer is on right now.
    if ('allowNetwork' in input) {
      const name = input.allowNetwork;
      const scope = isNetworkName(name) ? await describeNetworkScope() : [];
      const entry = scope.find(
        (item) => item.network === name && !item.privateNetwork,
      );
      if (!entry) throw runtimeError('invalid');
      next.allowedNetworks = [
        ...current.allowedNetworks.filter((item) => item !== name),
        name,
      ].slice(-MAX_ALLOWED_NETWORKS);
      next.interfaceAddress = entry.address;
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

  function rename(id, label) {
    if (typeof id !== 'string' || typeof label !== 'string')
      throw runtimeError('invalid');
    const device = devices.rename(id, label);
    if (!device) throw runtimeError('invalid');
    onChange();
    return device;
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
    rename,
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
