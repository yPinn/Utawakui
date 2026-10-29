'use strict';
const { spawn } = require('node:child_process');
const {
  nativeShortcutKey,
  verifyKeyboardShortcutHelper,
} = require('../lib/keyboardShortcutHelper');

const TOKEN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/u;
function createWindowsShortcutBackend({
  appPath,
  resourcesPath,
  isPackagedRuntime = false,
  platform = process.platform,
  arch = process.arch,
  spawnProcess = spawn,
  verifyHelper = verifyKeyboardShortcutHelper,
  onFailure = () => {},
}) {
  const slots = new Map(),
    requests = new Map();
  let child = null,
    instance = null,
    buffer = '',
    requestId = 0,
    lastSequence = 0,
    generation = 0,
    active = new Set(),
    failed = false,
    closing = false,
    startPromise = null,
    exitPromise = Promise.resolve(),
    shutdownPromise = null;
  let readyResolve, readyReject, readyTimer, killTimer;
  const unavailable = () => Error('Windows shortcut backend unavailable');
  function revoke() {
    active.clear();
    generation = 0;
  }
  function notify(error) {
    try {
      onFailure(error);
    } catch {
      /* Diagnostics cannot restore dispatch. */
    }
  }
  function rejectRequests(error) {
    for (const item of requests.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    requests.clear();
  }
  function fail(error) {
    if (failed || closing) return;
    failed = true;
    revoke();
    clearTimeout(readyTimer);
    readyReject?.(error);
    rejectRequests(error);
    notify(error);
    if (child) {
      const failedChild = child;
      try {
        failedChild.stdin.end();
      } catch {
        /* The bounded termination still owns this child. */
      }
      killTimer = setTimeout(() => {
        if (child === failedChild) failedChild.kill();
      }, 1500);
      killTimer.unref?.();
    }
  }
  function receive(line) {
    const p = line.split('\t');
    if (
      p[0] === 'ready' &&
      p.length === 3 &&
      p[1] === '1' &&
      /^[a-f0-9]{32}$/u.test(p[2]) &&
      !instance
    ) {
      instance = p[2];
      clearTimeout(readyTimer);
      readyResolve();
      return;
    }
    if (!instance || p[1] !== instance) {
      fail(unavailable());
      return;
    }
    if (
      p[0] === 'ack' &&
      p.length === 4 &&
      /^\d+$/u.test(p[2]) &&
      ['ok', 'no', 'occupied', 'held', 'invalid', 'unavailable'].includes(p[3])
    ) {
      const item = requests.get(Number(p[2]));
      if (!item) {
        fail(unavailable());
        return;
      }
      requests.delete(Number(p[2]));
      clearTimeout(item.timer);
      if (p[3] === 'ok') item.onAcknowledged?.();
      item.resolve(p[3]);
      return;
    }
    if (
      p[0] === 'event' &&
      p.length === 5 &&
      TOKEN.test(p[2]) &&
      /^\d+$/u.test(p[3]) &&
      /^\d+$/u.test(p[4])
    ) {
      const epoch = Number(p[3]),
        sequence = Number(p[4]);
      if (
        !Number.isSafeInteger(epoch) ||
        !Number.isSafeInteger(sequence) ||
        sequence < 1
      ) {
        fail(unavailable());
        return;
      }
      if (sequence <= lastSequence) return;
      lastSequence = sequence;
      if (failed || closing || epoch !== generation || !active.has(p[2]))
        return;
      const slot = [...slots.values()].find((s) => s.token === p[2]);
      if (slot) {
        try {
          slot.callback({ generation: epoch, registrationToken: slot.token });
        } catch (error) {
          notify(error);
        }
      }
      return;
    }
    fail(unavailable());
  }
  function output(bytes) {
    if (failed || closing) return;
    if (
      bytes.length > 65536 ||
      [...bytes].some((b) => b !== 10 && b !== 9 && (b < 32 || b > 126))
    ) {
      fail(unavailable());
      return;
    }
    buffer += bytes.toString('ascii');
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      if (index > 8192) {
        fail(unavailable());
        return;
      }
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      receive(line);
      if (failed) return;
    }
    if (buffer.length > 8192) fail(unavailable());
  }
  function start() {
    if (failed || closing) return Promise.reject(unavailable());
    if (startPromise) return startPromise;
    startPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
      try {
        const executable = verifyHelper({
          appPath,
          resourcesPath,
          isPackagedRuntime,
          platform,
          arch,
        });
        const env = {};
        for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'])
          if (process.env[key]) env[key] = process.env[key];
        child = spawnProcess(executable, [String(process.pid)], {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
        });
        const launched = child;
        let finishExit;
        exitPromise = new Promise((r) => {
          finishExit = r;
        });
        const current =
          (handler) =>
          (...args) => {
            if (child === launched) handler(...args);
          };
        launched.stdout.on('data', current(output));
        launched.stdout.on('error', current(fail));
        launched.stdout.on(
          'end',
          current(() => {
            if (!closing) fail(unavailable());
          }),
        );
        launched.stdout.on(
          'close',
          current(() => {
            if (!closing) fail(unavailable());
          }),
        );
        launched.stderr.on(
          'data',
          current(() => fail(unavailable())),
        );
        launched.stderr.on('error', current(fail));
        launched.on(
          'error',
          current((error) => {
            fail(error);
            if (!launched.pid) {
              child = null;
              slots.clear();
              finishExit();
            }
          }),
        );
        launched.on(
          'exit',
          current(() => {
            const expected = closing;
            child = null;
            clearTimeout(killTimer);
            revoke();
            slots.clear();
            finishExit();
            if (!expected) fail(unavailable());
            else rejectRequests(unavailable());
          }),
        );
        launched.stdin.on?.('error', current(fail));
        readyTimer = setTimeout(
          current(() => fail(unavailable())),
          5000,
        );
        readyTimer.unref?.();
      } catch (error) {
        fail(error);
        reject(error);
      }
    });
    return startPromise;
  }
  async function request(operation, fields = [], onAcknowledged) {
    await start();
    if (failed || closing || !child || requests.size >= 32) throw unavailable();
    const id = ++requestId;
    if (id > 1e9) {
      fail(unavailable());
      throw unavailable();
    }
    return new Promise((resolve, reject) => {
      const item = { resolve, reject, onAcknowledged };
      item.timer = setTimeout(() => {
        if (requests.get(id) === item) fail(unavailable());
      }, 3000);
      item.timer.unref?.();
      requests.set(id, item);
      try {
        child.stdin.write(['1', id, operation, ...fields].join('\t') + '\n');
      } catch (error) {
        fail(error);
      }
    });
  }
  async function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    revoke();
    closing = true;
    clearTimeout(readyTimer);
    readyReject?.(unavailable());
    rejectRequests(unavailable());
    shutdownPromise = (async () => {
      if (!child) return;
      const stoppedChild = child,
        completion = exitPromise;
      try {
        stoppedChild.stdin.end();
      } catch (error) {
        notify(error);
      }
      const timer = setTimeout(() => {
        if (child === stoppedChild) stoppedChild.kill();
      }, 1500);
      let deadline;
      try {
        await Promise.race([
          completion,
          new Promise((_, reject) => {
            deadline = setTimeout(() => reject(unavailable()), 4000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        clearTimeout(deadline);
      }
    })();
    return shutdownPromise;
  }
  return {
    async register(key, callback, token) {
      const native = nativeShortcutKey(key);
      if (
        !TOKEN.test(token) ||
        typeof callback !== 'function' ||
        slots.has(key) ||
        slots.size >= 20
      )
        throw TypeError('Invalid shortcut registration');
      // Reserve the identity before sending: a rejected ACK may still own it.
      slots.set(key, { token, callback });
      try {
        const result = await request('register', [
          token,
          native.modifiers,
          native.key,
        ]);
        if (result === 'occupied' || result === 'held') {
          slots.delete(key);
          if (result === 'held')
            throw Object.assign(Error('Shortcut keys are held'), {
              code: 'KEYBOARD_SHORTCUT_KEYS_HELD',
            });
          return false;
        }
        if (result !== 'ok') throw unavailable();
        return true;
      } catch (error) {
        if (error.code !== 'KEYBOARD_SHORTCUT_KEYS_HELD') fail(error);
        throw error;
      }
    },
    async isRegistered(key, token) {
      const slot = slots.get(key);
      if (!slot || (token && slot.token !== token)) return false;
      if (!child && failed) return false;
      if (!token) return true;
      const result = await request('query', [token]);
      if (!['ok', 'no'].includes(result)) throw unavailable();
      return result === 'ok';
    },
    async unregister(key, token) {
      const slot = slots.get(key);
      if (!slot || slot.token !== token) return;
      if (!child && failed) {
        slots.delete(key);
        return;
      }
      const result = await request('unregister', [token]);
      if (result !== 'ok') throw unavailable();
      active.delete(token);
      slots.delete(key);
    },
    async activate({ generation: epoch, registrations }) {
      if (
        !Number.isSafeInteger(epoch) ||
        epoch < 1 ||
        !Array.isArray(registrations) ||
        registrations.length > 20
      )
        throw TypeError('Invalid shortcut activation');
      const tokens = registrations.map(({ key, registrationToken }) => {
        if (
          !TOKEN.test(registrationToken) ||
          slots.get(key)?.token !== registrationToken
        )
          throw TypeError('Unknown shortcut registration');
        return registrationToken;
      });
      if (new Set(tokens).size !== tokens.length)
        throw TypeError('Duplicate shortcut registration');
      revoke();
      if (!child && !tokens.length && !failed && !closing) {
        generation = epoch;
        return true;
      }
      const result = await request(
        'activate',
        [epoch, tokens.join(',')],
        () => {
          generation = epoch;
          active = new Set(tokens);
        },
      );
      if (result !== 'ok') throw unavailable();
      return true;
    },
    shutdown,
    hasProcess: () => child !== null,
    async reset() {
      if (!failed && !closing) return;
      await shutdown();
      slots.clear();
      requests.clear();
      instance = null;
      buffer = '';
      requestId = 0;
      lastSequence = 0;
      generation = 0;
      active.clear();
      failed = false;
      closing = false;
      startPromise = null;
      shutdownPromise = null;
    },
  };
}
module.exports = { createWindowsShortcutBackend };
