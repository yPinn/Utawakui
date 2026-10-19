import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { snapshot, assertSnapshot, bindCandidate } from './assets.cjs';
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((p) => fs.rmSync(p, { recursive: true, force: true })),
);
it('binds file content and refuses mutation before or after verification', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-assets-'));
  roots.push(root);
  const modelPath = path.join(root, 'model.bin');
  fs.writeFileSync(modelPath, 'model');
  const rows = await snapshot([root]);
  const binding = await bindCandidate('base', { root, modelPath }, rows);
  expect(binding.method.modelManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  await binding.assertCurrent();
  fs.writeFileSync(modelPath, 'other');
  expect(() => assertSnapshot(rows)).toThrow('changed');
  await expect(
    bindCandidate('base', { root, modelPath }, rows),
  ).rejects.toThrow('hash');
});
it('rejects unrecognized candidate kinds', async () => {
  await expect(bindCandidate('remote', {}, [])).rejects.toThrow('kind');
});
it('rejects new unbound import files during binding and publication', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-closure-'));
  roots.push(root);
  const modelPath = path.join(root, 'model.bin');
  fs.writeFileSync(modelPath, 'model');
  const rows = await snapshot([root]),
    config = { root, modelPath, assetRoots: [root] };
  const binding = await bindCandidate('base', config, rows);
  fs.writeFileSync(path.join(root, 'unbound.py'), 'raise RuntimeError()');
  await expect(binding.assertCurrent()).rejects.toThrow('unbound');
  await expect(bindCandidate('base', config, rows)).rejects.toThrow('unbound');
});
