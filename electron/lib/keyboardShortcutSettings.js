'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { atomicWriteBuffer } = require('./atomicWrite');
const {
  LEGACY_KEYBOARD_BINDINGS,
} = require('../../shared/keyboardBindingDefinitions.mjs');
const {
  defaultShortcutConfiguration,
  SHORTCUT_COMMANDS,
  validateShortcutConfiguration,
} = require('../../shared/keyboardShortcutContract.mjs');

const MAX_BYTES = 16 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = (value, fields) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Reflect.ownKeys(value).length === fields.length &&
  fields.every((key) => Object.hasOwn(value, key));

function parseKeyboardShortcutSettingsIntent(input) {
  if (
    !record(input, ['expectedRevision', 'configuration']) ||
    !(
      input.expectedRevision === null ||
      (typeof input.expectedRevision === 'string' &&
        /^[a-f0-9]{64}$/u.test(input.expectedRevision))
    )
  )
    return null;
  try {
    return {
      expectedRevision: input.expectedRevision,
      configuration: validateShortcutConfiguration(
        input.configuration,
        LEGACY_KEYBOARD_BINDINGS,
      ),
    };
  } catch {
    return null;
  }
}

// Machine userData is supplied by Main, never by renderer intent or library.
// There is no OS registration here. Unknown/corrupt bytes are read-only.
function createKeyboardShortcutSettingsStore({
  userDataDirectory,
  globalCommands = [],
}) {
  const file = path.join(userDataDirectory, 'keyboard-shortcuts.json');
  const eligible = new Set(
    globalCommands.filter((id) =>
      SHORTCUT_COMMANDS.some((command) => command.id === id),
    ),
  );
  const supported = (configuration) =>
    (!configuration.globalEnabled || eligible.size > 0) &&
    configuration.bindings.every(
      (binding) => binding.global === null || eligible.has(binding.command),
    );
  function readBytes() {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_BYTES)
      return false;
    const fd = fs.openSync(file, 'r');
    try {
      const opened = fs.fstatSync(fd);
      if (
        !opened.isFile() ||
        opened.ino !== stat.ino ||
        opened.dev !== stat.dev ||
        opened.size > MAX_BYTES
      )
        return false;
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = fs.readSync(
          fd,
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (!count) break;
        length += count;
      }
      return length > MAX_BYTES ? false : buffer.subarray(0, length);
    } finally {
      fs.closeSync(fd);
    }
  }
  function get() {
    const bytes = readBytes();
    if (bytes === null)
      return {
        status: 'ready',
        revision: null,
        configuration: defaultShortcutConfiguration(),
      };
    if (bytes === false) return { status: 'invalid' };
    let saved;
    try {
      saved = JSON.parse(bytes.toString('utf8'));
    } catch {
      return { status: 'invalid' };
    }
    if (saved?.schemaVersion !== undefined && saved.schemaVersion !== 1)
      return { status: 'unsupported' };
    if (
      !record(saved, ['schemaVersion', 'writeId', 'configuration']) ||
      saved.schemaVersion !== 1 ||
      typeof saved.writeId !== 'string' ||
      !/^[a-f0-9-]{36}$/u.test(saved.writeId)
    )
      return { status: 'invalid' };
    if (saved.configuration?.schemaVersion !== 1)
      return { status: 'unsupported' };
    try {
      const configuration = validateShortcutConfiguration(
        saved.configuration,
        LEGACY_KEYBOARD_BINDINGS,
      );
      if (!supported(configuration)) return { status: 'unsupported' };
      return { status: 'ready', revision: digest(bytes), configuration };
    } catch {
      return { status: 'invalid' };
    }
  }
  function prepare(input) {
    const intent = parseKeyboardShortcutSettingsIntent(input);
    if (!intent) return { status: 'invalid-intent' };
    const configuration = intent.configuration;
    if (!supported(configuration)) return { status: 'invalid-intent' };
    const previous = get();
    if (previous.status !== 'ready') return { status: previous.status };
    if (previous.revision !== input.expectedRevision)
      return { status: 'conflict' };
    return { status: 'prepared', configuration };
  }
  function set(input) {
    const prepared = prepare(input);
    if (prepared.status !== 'prepared') return prepared;
    const configuration = prepared.configuration;
    // A fresh write id prevents a saved A-B-A from reviving an old CAS token.
    // Reuse the existing atomic JSON primitive on a unique staging path, then
    // install it in one rename. Neither staging path crosses IPC.
    const staging = path.join(
      userDataDirectory,
      `.keyboard-shortcuts-${randomUUID()}.json`,
    );
    try {
      const bytes = Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            writeId: randomUUID(),
            configuration,
          },
          null,
          2,
        ),
      );
      atomicWriteBuffer(staging, bytes);
      fs.renameSync(staging, file);
      return { status: 'ready', revision: digest(bytes), configuration };
    } finally {
      for (const owned of [staging, `${staging}.tmp`]) {
        try {
          fs.rmSync(owned, { force: true });
        } catch {
          /* Preserve the original IO failure. */
        }
      }
    }
  }
  return { get, set, prepare };
}

module.exports = {
  createKeyboardShortcutSettingsStore,
  parseKeyboardShortcutSettingsIntent,
};
