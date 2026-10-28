import fs from 'node:fs';
import path from 'node:path';
import { createPackageWithOptions } from '@electron/asar';
import { afterEach, describe, expect, it } from 'vitest';
import {
  verifyReleaseRuntimePackage,
  PHYSICAL_RUNTIME_PACKAGES,
} from './verify-runtime-package.mjs';
import runtime from '../electron/lib/runtimeEntries.js';
import { RELEASE_SYMBOL_TARGETS } from './runtime-symbol-policy.mjs';

const temporary = [];
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
async function fixture({
  sourceLeak = false,
  unpack = '**/{reading,separation,probe,waveform}.cjs',
  mainExtra = '',
  omitPublic = false,
} = {}) {
  fs.mkdirSync(path.resolve('tasks'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('tasks/package-verification-'));
  temporary.push(root);
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'runtime'), { recursive: true });
  fs.writeFileSync(
    path.join(source, 'package.json'),
    '{"main":"runtime/main.cjs"}',
  );
  for (const entry of Object.values(runtime.RUNTIME_ENTRIES))
    fs.writeFileSync(
      path.join(source, 'runtime', entry.file),
      entry.file === 'main.cjs'
        ? RELEASE_SYMBOL_TARGETS.flatMap((target) => target.exports)
            .filter((name) => !omitPublic || name !== 'scoreImportRecording')
            .map((name) => `function ${name}(){}`)
            .join('\n') + mainExtra
        : 'module.exports={};',
    );
  if (sourceLeak) {
    fs.mkdirSync(path.join(source, 'electron'));
    fs.writeFileSync(path.join(source, 'electron/main.js'), 'source');
  }
  const archive = path.join(root, 'resources/app.asar');
  fs.mkdirSync(path.dirname(archive));
  await createPackageWithOptions(source, archive, { unpack });
  for (const name of [...PHYSICAL_RUNTIME_PACKAGES, 'async']) {
    const pkg = path.join(`${archive}.unpacked`, 'node_modules', name);
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name, main: 'index.js' }),
    );
    fs.writeFileSync(path.join(pkg, 'index.js'), 'module.exports={};');
  }
  return root;
}

describe('release artifact runtime boundary', () => {
  it('checks the actual ASAR layout and physical worker dependency roots', async () => {
    expect(verifyReleaseRuntimePackage(await fixture()).entries).toBe(7);
  });
  it('rejects an old unprotected Main bundle', async () => {
    const root = await fixture({ mainExtra: 'function confidenceFields(){}' });
    expect(() => verifyReleaseRuntimePackage(root)).toThrow(/symbol/u);
  });
  it('rejects a missing public rule function in Main', async () => {
    const root = await fixture({ omitPublic: true });
    expect(() => verifyReleaseRuntimePackage(root)).toThrow(/symbol/u);
  });
  it('rejects accidental delivery of original Electron modules', async () => {
    const root = await fixture({ sourceLeak: true });
    expect(() => verifyReleaseRuntimePackage(root)).toThrow();
  });
  it('rejects moving Main and preload outside ASAR', async () => {
    const root = await fixture({ unpack: '**/*.cjs' });
    expect(() => verifyReleaseRuntimePackage(root)).toThrow();
  });
  it('rejects a dependency that would silently resolve from the developer checkout', async () => {
    const root = await fixture();
    fs.rmSync(
      path.join(
        root,
        'resources/app.asar.unpacked/node_modules/onnxruntime-common',
      ),
      { recursive: true },
    );
    expect(() => verifyReleaseRuntimePackage(root)).toThrow();
  });
});
