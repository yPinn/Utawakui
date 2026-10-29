import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import helper from '../electron/lib/keyboardShortcutHelper.js';

const run = promisify(execFile),
  projectRoot = fileURLToPath(new URL('..', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function buildKeyboardShortcutHelper({
  rootDirectory = projectRoot,
  platform = process.platform,
  systemRoot = process.env.SystemRoot,
  compile = async (file, args) =>
    run(file, args, { windowsHide: true, timeout: 30000, maxBuffer: 65536 }),
} = {}) {
  if (platform !== 'win32' || !systemRoot)
    throw Error(
      'Keyboard helper build requires Windows x64 Framework compiler',
    );
  const root = path.resolve(rootDirectory),
    source = path.join(root, 'native/keyboard-shortcuts'),
    output = path.join(source, '.build');
  await fs.mkdir(output, { recursive: true });
  if ((await fs.lstat(output)).isSymbolicLink())
    throw Error('Keyboard helper output cannot be a link');
  const runtimeDirectory = path.join(root, 'runtime');
  await fs.mkdir(runtimeDirectory, { recursive: true });
  if ((await fs.lstat(runtimeDirectory)).isSymbolicLink())
    throw Error('Keyboard helper manifest directory cannot be a link');
  for (const target of [...helper.HELPER_FILES, 'manifest.json']
    .map((name) => path.join(output, name))
    .concat(path.join(runtimeDirectory, 'keyboard-helper.json'))) {
    const stat = await fs.lstat(target).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat && (!stat.isFile() || stat.isSymbolicLink()))
      throw Error('Keyboard helper output must be a regular file');
  }
  const compiler = path.join(
    systemRoot,
    'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  );
  const sourceFile = path.join(source, 'HotkeyHost.cs');
  const binary = path.join(output, 'HotkeyHost.exe');
  await compile(compiler, [
    '/nologo',
    '/noconfig',
    '/nostdlib+',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    '/checked+',
    '/warnaserror+',
    ...['mscorlib.dll', 'System.dll', 'System.Core.dll'].map(
      (name) => `/reference:${path.join(path.dirname(compiler), name)}`,
    ),
    `/out:${binary}`,
    sourceFile,
  ]);
  await fs.copyFile(
    path.join(source, 'HotkeyHost.exe.config'),
    path.join(output, 'HotkeyHost.exe.config'),
  );
  const files = {};
  for (const name of helper.HELPER_FILES) {
    const bytes = await fs.readFile(path.join(output, name));
    files[name] = { bytes: bytes.length, sha256: digest(bytes) };
  }
  const sourceBytes = await fs.readFile(sourceFile),
    configBytes = await fs.readFile(path.join(source, 'HotkeyHost.exe.config'));
  const compilerBytes = await fs.readFile(compiler);
  const manifest = {
    protocol: 1,
    arch: 'x64',
    framework: '4.8',
    build: {
      sourceSha256: digest(Buffer.concat([sourceBytes, configBytes])),
      compiler: 'Framework64/v4.0.30319/csc.exe',
      compilerSha256: digest(compilerBytes),
    },
    files,
  };
  helper.verifyHelperFiles(output, manifest);
  const json = JSON.stringify(manifest, null, 2) + '\n';
  await fs.writeFile(path.join(output, 'manifest.json'), json);
  await fs.mkdir(path.join(root, 'runtime'), { recursive: true });
  await fs.writeFile(path.join(root, 'runtime/keyboard-helper.json'), json);
  return manifest;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildKeyboardShortcutHelper();
