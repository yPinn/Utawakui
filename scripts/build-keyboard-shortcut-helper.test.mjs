import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildKeyboardShortcutHelper } from './build-keyboard-shortcut-helper.mjs';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
it('compiles only at build time with explicit x64 options and emits fixed artifact hashes', async () => {
  fs.mkdirSync('.tmp', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/build-hotkey-'));
  roots.push(root);
  const source = path.join(root, 'native/keyboard-shortcuts');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'HotkeyHost.cs'), '// fixture');
  fs.writeFileSync(
    path.join(source, 'HotkeyHost.exe.config'),
    '<configuration/>',
  );
  const compiler = path.join(
    root,
    'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  );
  fs.mkdirSync(path.dirname(compiler), { recursive: true });
  fs.writeFileSync(compiler, 'fixture compiler');
  const calls = [];
  const result = await buildKeyboardShortcutHelper({
    rootDirectory: root,
    platform: 'win32',
    systemRoot: root,
    compile: async (executable, args) => {
      calls.push({ executable, args });
      const binary = Buffer.alloc(256);
      binary.write('MZ');
      binary.writeUInt32LE(64, 60);
      binary.write('PE\0\0', 64);
      binary.writeUInt16LE(0x8664, 68);
      binary.writeUInt16LE(0x20b, 88);
      fs.writeFileSync(
        args.find((a) => a.startsWith('/out:')).slice(5),
        binary,
      );
    },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toContain('/platform:x64');
  expect(calls[0].args).toContain('/optimize+');
  expect(result.files['HotkeyHost.exe'].sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(
    JSON.parse(
      fs.readFileSync(path.join(root, 'runtime/keyboard-helper.json'), 'utf8'),
    ),
  ).toEqual(result);
  expect(result.build.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
});
it('rejects non-Windows compilation rather than quietly packaging no helper', async () => {
  await expect(
    buildKeyboardShortcutHelper({ platform: 'linux' }),
  ).rejects.toThrow('Windows');
});
