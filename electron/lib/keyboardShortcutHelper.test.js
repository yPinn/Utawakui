import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  nativeShortcutKey,
  verifyKeyboardShortcutHelper,
} from './keyboardShortcutHelper.js';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  fs.mkdirSync('.tmp', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/helper-assets-'));
  roots.push(root);
  const directory = path.join(root, 'native/keyboard-shortcuts/.build');
  fs.mkdirSync(directory, { recursive: true });
  const binary = Buffer.alloc(256);
  binary.write('MZ');
  binary.writeUInt32LE(64, 60);
  binary.write('PE\0\0', 64);
  binary.writeUInt16LE(0x8664, 68);
  binary.writeUInt16LE(0x20b, 88);
  const config = Buffer.from('<configuration/>');
  const files = {};
  for (const [name, bytes] of [
    ['HotkeyHost.exe', binary],
    ['HotkeyHost.exe.config', config],
  ]) {
    fs.writeFileSync(path.join(directory, name), bytes);
    files[name] = {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  const manifest = { protocol: 1, arch: 'x64', framework: '4.8', files };
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest),
  );
  return {
    root,
    directory,
    manifest,
    options: {
      appPath: root,
      platform: 'win32',
      arch: 'x64',
      isPackagedRuntime: false,
    },
  };
}
it('maps only bounded Main accelerators and rejects F12, arbitrary keys and reserved combinations', () => {
  expect(nativeShortcutKey('Control+Shift+F11')).toEqual({
    modifiers: 6,
    key: 122,
  });
  expect(nativeShortcutKey('Alt+PageDown')).toEqual({ modifiers: 1, key: 34 });
  for (const key of [
    'Control+F12',
    'Control+Alt+K',
    'Control+C',
    'Win+K',
    'A',
    'Control+Shift+cmd.exe',
  ])
    expect(() => nativeShortcutKey(key)).toThrow();
});
it('verifies exact fixed files, hashes and x64 PE before returning a launch path', () => {
  const f = fixture();
  expect(verifyKeyboardShortcutHelper(f.options)).toBe(
    path.join(f.directory, 'HotkeyHost.exe'),
  );
  fs.appendFileSync(path.join(f.directory, 'HotkeyHost.exe'), 'changed');
  expect(() => verifyKeyboardShortcutHelper(f.options)).toThrow();
});
it('rejects unsupported platform, architecture and altered manifest', () => {
  const f = fixture();
  for (const options of [{ platform: 'linux' }, { arch: 'arm64' }])
    expect(() =>
      verifyKeyboardShortcutHelper({ ...f.options, ...options }),
    ).toThrow();
  f.manifest.files['../foreign.exe'] = f.manifest.files['HotkeyHost.exe'];
  fs.writeFileSync(
    path.join(f.directory, 'manifest.json'),
    JSON.stringify(f.manifest),
  );
  expect(() => verifyKeyboardShortcutHelper(f.options)).toThrow();
});
it('uses the manifest inside the app and the fixed physical resources directory when packaged', () => {
  const f = fixture(),
    app = path.join(f.root, 'app'),
    resources = path.join(f.root, 'resources');
  fs.mkdirSync(path.join(app, 'runtime'), { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.cpSync(f.directory, path.join(resources, 'keyboard-shortcuts'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(app, 'runtime/keyboard-helper.json'),
    JSON.stringify(f.manifest),
  );
  expect(
    verifyKeyboardShortcutHelper({
      ...f.options,
      appPath: app,
      resourcesPath: resources,
      isPackagedRuntime: true,
    }),
  ).toBe(path.join(resources, 'keyboard-shortcuts/HotkeyHost.exe'));
  fs.writeFileSync(path.join(app, 'runtime/keyboard-helper.json'), '{}');
  expect(() =>
    verifyKeyboardShortcutHelper({
      ...f.options,
      appPath: app,
      resourcesPath: resources,
      isPackagedRuntime: true,
    }),
  ).toThrow();
});
