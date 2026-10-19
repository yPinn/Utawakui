import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import assets from './assets.cjs';
const { verifyAssets, treeFingerprint } = assets;
const directories = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((d) => fs.rmSync(d, { recursive: true, force: true })),
);
describe('research-only local artifact binding', () => {
  it('binds exact asset bytes and refuses missing or modified files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acoustic-assets-'));
    directories.push(root);
    for (const name of ['model', 'vendor', 'environment', 'python'])
      fs.mkdirSync(path.join(root, name));
    const bytes = Buffer.from('synthetic');
    for (const name of [
      'model/m.onnx',
      'vendor/d.py',
      'environment/one.py',
      'python/python.exe',
      'python/python314.zip',
      'python/python314._pth',
      'ffmpeg.exe',
    ])
      fs.writeFileSync(path.join(root, name), bytes);
    const entry = {
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
    const manifest = {
      model: { 'm.onnx': entry },
      vendor: { 'd.py': { ...entry, normalizeLf: true } },
      runtime: {
        'python.exe': entry,
        'python314.zip': entry,
        'python314._pth': entry,
      },
      ffmpeg: entry,
      environment: { pythonVersion: 'synthetic' },
    };
    const config = {
      modelDir: path.join(root, 'model'),
      vendorDir: path.join(root, 'vendor'),
      environmentPath: path.join(root, 'environment'),
      pythonPath: path.join(root, 'python/python.exe'),
      ffmpegPath: path.join(root, 'ffmpeg.exe'),
    };
    const binding = await verifyAssets(config, manifest);
    expect(binding.method.kind).toBe('model');
    for (const basename of ['missing.exe', 'python314.zip']) {
      await expect(
        verifyAssets(
          { ...config, pythonPath: path.join(root, 'python', basename) },
          manifest,
        ),
      ).rejects.toThrow(/Python executable/);
    }
    const runtimeWithoutExecutable = { ...manifest.runtime };
    delete runtimeWithoutExecutable['python.exe'];
    await expect(
      verifyAssets(config, { ...manifest, runtime: runtimeWithoutExecutable }),
    ).rejects.toThrow(/Python executable/);
    expect(binding.method.modelManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    const before = await treeFingerprint(config.environmentPath);
    fs.mkdirSync(path.join(config.environmentPath, '__pycache__'));
    fs.writeFileSync(
      path.join(config.environmentPath, '__pycache__/one.pyc'),
      'cache',
    );
    expect(await treeFingerprint(config.environmentPath)).toBe(before);
    fs.appendFileSync(path.join(config.environmentPath, 'one.py'), ' changed');
    await expect(binding.assertCurrent()).rejects.toThrow(/assets changed/);
    fs.writeFileSync(path.join(config.environmentPath, 'one.py'), bytes);
    await expect(
      verifyAssets(config, {
        ...manifest,
        nodeDependencies: { kuromoji: 'wrong' },
      }),
    ).rejects.toThrow(/dependency mismatch/);
    fs.writeFileSync(
      path.join(config.environmentPath, '_distributor_init_local.pyc'),
      'sourceless executable',
    );
    await expect(treeFingerprint(config.environmentPath)).rejects.toThrow(
      /bytecode/,
    );
    fs.unlinkSync(
      path.join(config.environmentPath, '_distributor_init_local.pyc'),
    );
    fs.appendFileSync(
      path.join(root, 'python/python314._pth'),
      '\nimport site',
    );
    await expect(verifyAssets(config, manifest)).rejects.toThrow(/integrity/);
    fs.writeFileSync(path.join(root, 'python/python314._pth'), bytes);
    fs.mkdirSync(path.join(root, 'vendor/tools'));
    fs.writeFileSync(
      path.join(root, 'vendor/tools/__init__.py'),
      'raise RuntimeError("unbound")',
    );
    await expect(verifyAssets(config, manifest)).rejects.toThrow(/vendor/);
    fs.unlinkSync(path.join(root, 'vendor/tools/__init__.py'));
    fs.writeFileSync(
      path.join(root, 'vendor/danger.py'),
      'raise RuntimeError("unbound")',
    );
    await expect(verifyAssets(config, manifest)).rejects.toThrow(/vendor/);
    fs.unlinkSync(path.join(root, 'vendor/danger.py'));
    fs.appendFileSync(path.join(root, 'model/m.onnx'), 'changed');
    await expect(verifyAssets(config, manifest)).rejects.toThrow(/integrity/);
    fs.unlinkSync(path.join(root, 'model/m.onnx'));
    await expect(verifyAssets(config, manifest)).rejects.toThrow();
  });
  it('requires absolute local configuration paths', async () => {
    await expect(verifyAssets({ modelDir: 'relative' })).rejects.toThrow();
  });
});
