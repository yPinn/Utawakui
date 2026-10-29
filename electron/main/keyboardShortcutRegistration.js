'use strict';
const { randomUUID } = require('node:crypto');
const {
  parseKeyboardShortcutSettingsIntent,
} = require('../lib/keyboardShortcutSettings');
const {
  normalizeShortcutChord,
  SHORTCUT_COMMANDS,
} = require('../../shared/keyboardShortcutContract.mjs');

function shortcutAccelerator(value) {
  const chord = normalizeShortcutChord(value, 'global');
  const keys = {
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    home: 'Home',
    end: 'End',
    space: 'Space',
  };
  return [
    chord.ctrl && 'Control',
    chord.alt && 'Alt',
    chord.shift && 'Shift',
    keys[chord.key] ?? chord.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join('+');
}

// Owns only registrations it created. It never owns a BrowserWindow, playback,
// source session, retry timer or OS keyboard monitor.
function createKeyboardShortcutRegistration({
  store,
  globalShortcut,
  eligibleCommands = [],
  onCommand,
  onError = () => {},
  capabilityReason = 'unverified-platform',
}) {
  const eligible = [...new Set(eligibleCommands)].filter((id) =>
    SHORTCUT_COMMANDS.some((c) => c.id === id),
  );
  if (eligible.length && typeof onCommand !== 'function')
    throw TypeError('Global command receiver required');
  const bootId = randomUUID(),
    owned = new Map();
  let active = new Map(),
    generation = 0,
    sequence = 0,
    state = 'disabled',
    issues = [],
    transitioning = false,
    disposed = false,
    lifecycle = 0,
    stopTarget = null,
    stopTask = null,
    settled = Promise.resolve(),
    sessionDisabled = false;
  const pending = new Map();
  let savedSnapshot = { status: 'unavailable' };
  const snapshot = () => ({
    bootId,
    generation,
    state,
    busy: transitioning || stopTask !== null,
    eligibleCommands: [...eligible],
    capabilityReason: eligible.length ? null : capabilityReason,
    sessionDisabled,
    active: [...active.values()].map(({ command, chord }) => ({
      command,
      chord,
    })),
    held: [...owned.values()].map(({ command, chord }) => ({ command, chord })),
    pending: [...pending.values()].map(({ command, chord }) => ({
      command,
      chord,
    })),
    issues: issues.map((item) => ({ ...item })),
  });
  const reply = (result) => ({ ...result, runtime: snapshot() });
  function report(error, operation) {
    try {
      onError(error, operation);
    } catch {
      /* Diagnostics must not alter ownership cleanup. */
    }
  }
  const fenced = () => typeof globalShortcut.activate === 'function';
  const registrationArguments = (key, slot) =>
    fenced() ? [key, slot.token] : [key];
  async function release(keys) {
    const failed = [];
    for (const key of keys) {
      const slot = owned.get(key);
      if (!slot) continue;
      slot.revoked = true;
      try {
        await globalShortcut.unregister(...registrationArguments(key, slot));
        if (
          await globalShortcut.isRegistered(...registrationArguments(key, slot))
        )
          failed.push({ code: 'release-failed', command: slot.command });
        else owned.delete(key);
      } catch (error) {
        report(error, 'release');
        failed.push({ code: 'release-failed', command: slot.command });
      }
    }
    return failed;
  }
  function failClosed(failures, fallback) {
    issues = failures;
    active.clear();
    state = failures.some((item) => item.code === 'release-failed')
      ? 'degraded'
      : fallback;
    generation++;
  }
  function wanted(configuration) {
    const result = new Map();
    if (configuration.globalEnabled) {
      for (const binding of configuration.bindings) {
        if (binding.global)
          result.set(shortcutAccelerator(binding.global), {
            command: binding.command,
            chord: binding.global,
          });
      }
    }
    return result;
  }
  const unsupported = (configuration) =>
    (configuration.globalEnabled && !eligible.length) ||
    configuration.bindings.some(
      (binding) => binding.global && !eligible.includes(binding.command),
    );
  const cancelled = (epoch) =>
    disposed || stopTarget !== null || epoch !== lifecycle;
  function begin() {
    transitioning = true;
    generation++;
    let finish;
    settled = new Promise((resolve) => {
      finish = resolve;
    });
    return { epoch: lifecycle, finish };
  }
  function end(transaction) {
    if (transaction.finished) return;
    transaction.finished = true;
    transitioning = false;
    transaction.finish();
  }
  async function acquire(key, mapping, epoch) {
    // isRegistered is Electron's application-local record, never a system-wide
    // availability test. A pre-existing internal registration is not ours.
    if (await globalShortcut.isRegistered(key))
      return { code: 'occupied', command: mapping.command };
    if (cancelled(epoch))
      return { code: 'unavailable', command: mapping.command };
    const slot = { ...mapping, revoked: false, token: randomUUID() };
    let registered,
      registrationFailed = false;
    try {
      pending.set(key, slot);
      registered = await globalShortcut.register(
        key,
        (event) => {
          if (
            disposed ||
            transitioning ||
            state !== 'active' ||
            slot.revoked ||
            owned.get(key) !== slot ||
            (fenced() &&
              (event?.generation !== generation ||
                event?.registrationToken !== slot.token))
          )
            return;
          const current = active.get(key);
          if (!current) return;
          try {
            onCommand({
              bootId,
              generation,
              sequence: ++sequence,
              command: current.command,
            });
          } catch (error) {
            report(error, 'dispatch');
          }
        },
        ...(fenced() ? [slot.token] : []),
      );
    } catch (error) {
      if (error?.code === 'KEYBOARD_SHORTCUT_KEYS_HELD')
        return { code: 'keys-held', command: mapping.command };
      report(error, 'register');
      registrationFailed = true;
      registered = false;
      // A rejected remote ACK does not prove the remote registration failed.
      // Retain uncertain ownership until explicit cleanup is confirmed.
      owned.set(key, slot);
    } finally {
      pending.delete(key);
    }
    if (registered === false && !registrationFailed)
      return { code: 'occupied', command: mapping.command };
    if (registered === true) owned.set(key, slot);
    const observed = await globalShortcut.isRegistered(
      ...registrationArguments(key, slot),
    );
    // The backend owns its namespace; a successful or uncertain acquisition
    // remains cleanup-owned until its release is confirmed.
    if (observed) owned.set(key, slot);
    return registered === true && observed
      ? null
      : {
          code:
            registered === false && !registrationFailed
              ? 'occupied'
              : 'unavailable',
          command: mapping.command,
        };
  }
  async function stage(next, epoch) {
    const added = [];
    for (const [key, mapping] of next) {
      if (cancelled(epoch))
        return {
          added,
          failure: { code: 'unavailable', command: mapping.command },
        };
      if (owned.has(key)) {
        try {
          if (
            await globalShortcut.isRegistered(
              ...registrationArguments(key, owned.get(key)),
            )
          ) {
            if (cancelled(epoch))
              return {
                added,
                failure: { code: 'unavailable', command: mapping.command },
              };
            continue;
          }
          owned.get(key).revoked = true;
          owned.delete(key);
          return {
            added,
            failure: { code: 'registration-lost', command: mapping.command },
            invalidatesActive: true,
          };
        } catch (error) {
          report(error, 'confirm');
          return {
            added,
            failure: { code: 'unavailable', command: mapping.command },
            invalidatesActive: true,
          };
        }
      }
      let failure;
      try {
        failure = await acquire(key, mapping, epoch);
      } catch (error) {
        report(error, 'register');
        failure = { code: 'unavailable', command: mapping.command };
      }
      if (owned.has(key)) added.push(key);
      if (cancelled(epoch))
        return {
          added,
          failure: { code: 'unavailable', command: mapping.command },
        };
      if (failure) return { added, failure };
    }
    return { added };
  }
  async function commit(next, epoch) {
    if (cancelled(epoch)) return;
    generation++;
    active.clear();
    for (const [key, mapping] of next)
      Object.assign(owned.get(key), mapping, { revoked: false });
    if (typeof globalShortcut.activate === 'function') {
      try {
        const acknowledged = await globalShortcut.activate({
          generation,
          registrations: [...next.keys()].map((key) => ({
            key,
            registrationToken: owned.get(key).token,
          })),
        });
        if (cancelled(epoch)) return;
        if (acknowledged !== true)
          throw Error('Shortcut activation was not acknowledged');
      } catch (error) {
        report(error, 'activate');
        if (!cancelled(epoch))
          failClosed([{ code: 'activation-failed' }], 'degraded');
        return;
      }
    }
    if (cancelled(epoch)) return;
    const failures = await release(
      [...owned.keys()].filter((key) => !next.has(key)),
    );
    if (cancelled(epoch)) return;
    if (failures.length) failClosed(failures, 'degraded');
    else {
      active = next;
      issues = [];
      state = next.size ? 'active' : 'disabled';
    }
  }
  async function rollback(added, failure, previous, epoch) {
    const cleanup = await release(added);
    if (cancelled(epoch)) return;
    if (cleanup.length)
      failClosed([failure, ...cleanup].filter(Boolean), 'degraded');
    else {
      await commit(previous, epoch);
      if (!cancelled(epoch) && state !== 'degraded')
        issues = failure ? [failure] : [];
    }
  }
  async function set(input, trial = false, explicitEnable = false) {
    if (disposed) return reply({ status: 'unavailable' });
    if (transitioning || stopTask) return reply({ status: 'busy' });
    if (stopTarget) return reply({ status: 'unavailable' });
    const intent = parseKeyboardShortcutSettingsIntent(input);
    if (!intent) return reply({ status: 'invalid-intent' });
    const requested = wanted(intent.configuration);
    if (unsupported(intent.configuration)) {
      const blocked = store.prepare(input);
      return reply(
        blocked.status === 'prepared' ? { status: 'unsupported' } : blocked,
      );
    }
    if ((trial || explicitEnable) && !requested.size)
      return reply({ status: 'invalid-intent' });
    const preserveStop =
      sessionDisabled &&
      !trial &&
      !explicitEnable &&
      intent.configuration.globalEnabled;
    const next = preserveStop ? new Map() : requested;
    const disabling = !trial && !intent.configuration.globalEnabled;
    if (state === 'degraded' && !disabling)
      return reply({ status: 'degraded' });
    // An explicit stop survives failed persistence, reads and power resume.
    // Only a subsequently confirmed enable may clear this session intent.
    if (disabling) sessionDisabled = true;
    const previous = disabling ? new Map() : new Map(active);
    let transaction = disabling ? begin() : null;
    const terminal = (result) => {
      if (transaction) end(transaction);
      return reply(result);
    };
    let added = [],
      savedResult;
    try {
      if (disabling) await commit(new Map(), transaction.epoch);
      if (transaction && cancelled(transaction.epoch))
        return terminal({ status: 'unavailable' });
      const prepared = store.prepare(input);
      if (prepared.status !== 'prepared') return terminal(prepared);
      transaction ??= begin();
      const staged = await stage(next, transaction.epoch);
      added = staged.added;
      if (cancelled(transaction.epoch)) {
        await release(added);
        return terminal({ status: 'unavailable' });
      }
      if (staged.failure) {
        if (staged.invalidatesActive) {
          const failures = await release(added);
          if (!cancelled(transaction.epoch))
            failClosed([staged.failure, ...failures], 'blocked');
        } else
          await rollback(added, staged.failure, previous, transaction.epoch);
        if (cancelled(transaction.epoch))
          return terminal({ status: 'unavailable' });
        return terminal({
          status:
            state === 'degraded'
              ? 'degraded'
              : staged.invalidatesActive
                ? 'unavailable'
                : staged.failure.code,
        });
      }
      // No await may separate the lifecycle check from the store's synchronous
      // CAS + atomic rename. After ready, runtime failures cannot undo the save.
      if (cancelled(transaction.epoch))
        return terminal({ status: 'unavailable' });
      if (trial) {
        const confirmed = store.prepare(input);
        await rollback(added, null, previous, transaction.epoch);
        return terminal({
          status: cancelled(transaction.epoch)
            ? 'unavailable'
            : state === 'degraded'
              ? 'degraded'
              : confirmed.status === 'prepared'
                ? 'tested'
                : confirmed.status,
        });
      }
      const saved = store.set(input);
      savedResult = saved;
      if (saved.status !== 'ready') {
        await rollback(added, null, previous, transaction.epoch);
        return terminal(saved);
      }
      sessionDisabled = preserveStop;
      await commit(next, transaction.epoch);
      return terminal(saved);
    } catch (error) {
      if (savedResult?.status === 'ready') {
        report(error, 'commit');
        if (!cancelled(transaction.epoch))
          failClosed([{ code: 'activation-failed' }], 'degraded');
        return terminal(savedResult);
      }
      if (transaction) await rollback(added, null, previous, transaction.epoch);
      throw error;
    } finally {
      if (transaction) end(transaction);
    }
  }
  async function refresh() {
    if (disposed || transitioning) return snapshot();
    if (stopTask) return snapshot();
    stopTarget = null;
    const transaction = begin();
    const terminal = () => {
      end(transaction);
      return snapshot();
    };
    try {
      const saved = store.get();
      savedSnapshot = saved;
      if (state === 'degraded' || state === 'suspended') {
        const failures = await release([...owned.keys()]);
        if (cancelled(transaction.epoch)) return terminal();
        if (failures.length) {
          failClosed(failures, 'degraded');
          return terminal();
        }
      }
      if (saved.status !== 'ready') {
        const failures = await release([...owned.keys()]);
        if (!cancelled(transaction.epoch)) failClosed(failures, 'blocked');
        return terminal();
      }
      const next = sessionDisabled ? new Map() : wanted(saved.configuration);
      if (unsupported(saved.configuration)) {
        const failures = await release([...owned.keys()]);
        if (!cancelled(transaction.epoch)) failClosed(failures, 'blocked');
        return terminal();
      }
      const staged = await stage(next, transaction.epoch);
      if (cancelled(transaction.epoch)) return terminal();
      if (staged.failure) {
        const failures = await release([...owned.keys()]);
        if (cancelled(transaction.epoch)) return terminal();
        failClosed([staged.failure, ...failures], 'blocked');
      } else await commit(next, transaction.epoch);
    } catch (error) {
      report(error, 'refresh');
      savedSnapshot = { status: 'unavailable' };
      const failures = await release([...owned.keys()]);
      if (!cancelled(transaction.epoch)) failClosed(failures, 'blocked');
    } finally {
      end(transaction);
    }
    return snapshot();
  }
  function stop(target) {
    if (disposed) return stopTask ?? Promise.resolve();
    lifecycle++;
    stopTarget = target;
    if (target === 'disposed') disposed = true;
    active.clear();
    generation++;
    state = target;
    if (stopTask) return stopTask;
    const inFlight = settled;
    transitioning = true;
    stopTask = (async () => {
      await inFlight;
      transitioning = true;
      const failures = await release([...owned.keys()]);
      failClosed(failures, stopTarget);
    })().finally(() => {
      transitioning = false;
      stopTask = null;
    });
    return stopTask;
  }
  return {
    async rearm(expectedGeneration) {
      if (
        disposed ||
        transitioning ||
        stopTask ||
        stopTarget ||
        generation !== expectedGeneration
      )
        return null;
      if (state === 'disabled') return snapshot();
      if (state !== 'active') return null;
      const next = new Map(active),
        transaction = begin();
      try {
        await commit(next, transaction.epoch);
      } finally {
        end(transaction);
      }
      return snapshot();
    },
    async get() {
      if (disposed) return reply({ status: 'unavailable' });
      if (transitioning || stopTask) return reply({ status: 'busy' });
      await refresh();
      return reply(savedSnapshot);
    },
    set,
    test: (input) => set(input, true),
    enable: (input) => set(input, false, true),
    snapshot,
    refresh,
    suspend: () => stop('suspended'),
    invalidate: () => stop('degraded'),
    dispose() {
      return stop('disposed');
    },
  };
}
module.exports = { createKeyboardShortcutRegistration, shortcutAccelerator };
