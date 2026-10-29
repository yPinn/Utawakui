'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  normalizeShortcutChord,
} = require('../../shared/keyboardShortcutContract.mjs');

const HELPER_FILES = ['HotkeyHost.exe', 'HotkeyHost.exe.config'];
function nativeShortcutKey(accelerator) {
  if (typeof accelerator !== 'string' || accelerator.length > 40)
    throw TypeError('Invalid native shortcut');
  const pieces = accelerator.split('+'),
    key = pieces.pop();
  if (
    new Set(pieces).size !== pieces.length ||
    pieces.some((p) => !['Control', 'Alt', 'Shift'].includes(p))
  )
    throw TypeError('Invalid native shortcut');
  const aliases = {
    Up: 'arrowup',
    Down: 'arrowdown',
    Left: 'arrowleft',
    Right: 'arrowright',
    PageUp: 'pageup',
    PageDown: 'pagedown',
    Home: 'home',
    End: 'end',
    Space: 'space',
  };
  const chord = normalizeShortcutChord(
    {
      key: aliases[key] ?? key.toLowerCase(),
      ctrl: pieces.includes('Control'),
      alt: pieces.includes('Alt'),
      shift: pieces.includes('Shift'),
    },
    'global',
  );
  if (chord.key === 'f12') throw TypeError('Reserved native shortcut');
  const codes = {
    arrowleft: 37,
    arrowup: 38,
    arrowright: 39,
    arrowdown: 40,
    pageup: 33,
    pagedown: 34,
    home: 36,
    end: 35,
    space: 32,
    f10: 121,
    f11: 122,
  };
  return {
    modifiers:
      (chord.ctrl ? 2 : 0) | (chord.alt ? 1 : 0) | (chord.shift ? 4 : 0),
    key: codes[chord.key] ?? chord.key.toUpperCase().charCodeAt(0),
  };
}
function verifyHelperFiles(directory, manifest) {
  if (
    !manifest ||
    manifest.protocol !== 1 ||
    manifest.arch !== 'x64' ||
    manifest.framework !== '4.8' ||
    !manifest.files ||
    Object.keys(manifest).some(
      (k) => !['protocol', 'arch', 'framework', 'files', 'build'].includes(k),
    ) ||
    Object.keys(manifest.files).sort().join(',') !==
      [...HELPER_FILES].sort().join(',')
  )
    throw Error('Invalid keyboard helper manifest');
  if (fs.lstatSync(directory).isSymbolicLink())
    throw Error('Redirected keyboard helper directory');
  for (const name of HELPER_FILES) {
    const file = path.join(directory, name),
      stat = fs.lstatSync(file),
      entry = manifest.files[name];
    const limit = name.endsWith('.config') ? 4096 : 524288;
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      !entry ||
      Object.keys(entry).sort().join(',') !== 'bytes,sha256' ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > limit ||
      stat.size !== entry.bytes ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256)
    )
      throw Error('Invalid keyboard helper artifact');
    const bytes = fs.readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
      throw Error('Keyboard helper integrity mismatch');
    if (name.endsWith('.exe')) {
      const pe = bytes.length >= 96 ? bytes.readUInt32LE(60) : -1;
      if (
        bytes.toString('ascii', 0, 2) !== 'MZ' ||
        pe < 64 ||
        pe + 26 > bytes.length ||
        bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' ||
        bytes.readUInt16LE(pe + 4) !== 0x8664 ||
        bytes.readUInt16LE(pe + 24) !== 0x20b
      )
        throw Error('Invalid x64 keyboard helper');
    }
  }
  return path.join(directory, HELPER_FILES[0]);
}
function verifyKeyboardShortcutHelper({
  appPath,
  resourcesPath,
  isPackagedRuntime = false,
  platform = process.platform,
  arch = process.arch,
}) {
  if (platform !== 'win32' || arch !== 'x64')
    throw Error('Unsupported keyboard helper platform');
  const directory = isPackagedRuntime
    ? path.join(resourcesPath, 'keyboard-shortcuts')
    : path.join(appPath, 'native/keyboard-shortcuts/.build');
  const file = isPackagedRuntime
    ? path.join(appPath, 'runtime/keyboard-helper.json')
    : path.join(directory, 'manifest.json');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 4096)
    throw Error('Invalid keyboard helper manifest');
  return verifyHelperFiles(
    directory,
    JSON.parse(fs.readFileSync(file, 'utf8')),
  );
}
module.exports = {
  HELPER_FILES,
  nativeShortcutKey,
  verifyHelperFiles,
  verifyKeyboardShortcutHelper,
};
