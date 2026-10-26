import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as asar from '@electron/asar';
import runtime from '../electron/lib/runtimeEntries.js';
import { verifyReleaseSymbolBundle } from './runtime-symbol-policy.mjs';

export const PHYSICAL_RUNTIME_PACKAGES = Object.freeze([
  'onnxruntime-node',
  'onnxruntime-common',
  'kuromoji',
  'wanakana',
  'koroman',
  'doublearray',
  'zlibjs',
  'lodash',
  'kissfft-js',
]);

export function verifyReleaseRuntimePackage(appOutDir) {
  const root = fs.realpathSync(path.resolve(appOutDir));
  const archive = path.join(root, 'resources/app.asar');
  const entries = asar
    .listPackage(archive)
    .map((name) => name.replaceAll('\\', '/').replace(/^\//u, ''));
  if (
    entries.some(
      (name) => /^electron\//u.test(name) || /^runtime\/.*\.map$/u.test(name),
    )
  ) {
    throw new Error(
      'Original Electron source or runtime source map was packaged',
    );
  }
  const manifest = JSON.parse(
    asar.extractFile(archive, 'package.json').toString(),
  );
  if (manifest.main !== 'runtime/main.cjs')
    throw new Error('Incorrect release entry');
  verifyReleaseSymbolBundle(
    asar.extractFile(archive, 'runtime/main.cjs').toString('utf8'),
  );
  for (const entry of Object.values(runtime.RUNTIME_ENTRIES)) {
    const file = path.join('runtime', entry.file);
    if (
      Boolean(asar.statFile(archive, file).unpacked) !== Boolean(entry.physical)
    ) {
      throw new Error(`Incorrect runtime physical boundary: ${entry.file}`);
    }
    if (
      entry.physical &&
      !fs.statSync(path.join(`${archive}.unpacked`, file)).isFile()
    ) {
      throw new Error('Missing physical worker bundle');
    }
  }
  const workerRequire = createRequire(
    path.join(`${archive}.unpacked`, 'runtime', 'reading.cjs'),
  );
  function containedModule(resolver, name) {
    const resolved = fs.realpathSync(resolver.resolve(name));
    const relative = path.relative(root, resolved);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !fs.statSync(resolved).isFile()
    ) {
      throw new Error(
        `Worker dependency resolves outside the artifact: ${name}`,
      );
    }
    return resolved;
  }
  for (const name of PHYSICAL_RUNTIME_PACKAGES)
    containedModule(workerRequire, name);
  const kuromojiRequire = createRequire(
    containedModule(workerRequire, 'kuromoji'),
  );
  const asyncPath = containedModule(kuromojiRequire, 'async');
  // kuromoji's async 2 uses lodash; do not accidentally validate root async 3.
  const asyncRequire = createRequire(asyncPath);
  const metadata = JSON.parse(
    fs.readFileSync(
      containedModule(kuromojiRequire, 'async/package.json'),
      'utf8',
    ),
  );
  if (metadata.dependencies?.lodash) containedModule(asyncRequire, 'lodash');
  return { entries: Object.keys(runtime.RUNTIME_ENTRIES).length };
}
