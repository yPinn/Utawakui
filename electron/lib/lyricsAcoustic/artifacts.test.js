import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  downloadArtifact,
  extractArtifact,
  prepareLyricsArtifacts,
} from './artifacts.js';
import { fingerprintTree } from './integrity.js';
import AdmZip from 'adm-zip';
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((r) => fs.rmSync(r, { recursive: true, force: true })),
);
const pin = (bytes) => ({
  sizeBytes: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  filename: 'fixture.zip',
  url: 'https://example.test/fixed.zip',
});
function root() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-artifact-'));
  roots.push(r);
  return r;
}
describe('pinned lyrics environment artifacts', () => {
  it('bounds downloads, checks exact hashes, and honors cancellation', async () => {
    const bytes = Buffer.from('pinned'),
      fetchImpl = vi.fn(async () => new Response(bytes));
    expect(await downloadArtifact(pin(bytes), { fetchImpl })).toEqual(bytes);
    await expect(
      downloadArtifact({ ...pin(bytes), sizeBytes: 1 }, { fetchImpl }),
    ).rejects.toThrow();
    await expect(
      downloadArtifact(
        { ...pin(bytes), sha256: 'a'.repeat(64) },
        { fetchImpl },
      ),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadArtifact(pin(bytes), { signal: controller.signal, fetchImpl }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      downloadArtifact(
        { ...pin(bytes), url: 'file:///private' },
        { fetchImpl },
      ),
    ).rejects.toThrow();
  });
  it('validates zip traversal before extraction and extracts approved bytes', async () => {
    const zip = new AdmZip();
    zip.addFile('safe.txt', Buffer.from('safe'));
    const bytes = zip.toBuffer(),
      dir = root();
    await extractArtifact(bytes, dir, pin(bytes));
    expect(fs.readFileSync(path.join(dir, 'safe.txt'), 'utf8')).toBe('safe');
    const bad = Buffer.from(bytes);
    const name = Buffer.from('safe.txt');
    let at = bad.indexOf(name);
    while (at >= 0) {
      bad.write('../x.txt', at);
      at = bad.indexOf(name, at + name.length);
    }
    await expect(extractArtifact(bad, root(), pin(bad))).rejects.toThrow();
  });
  it('materializes only pinned runtime/model files and a separate wheel environment', async () => {
    const r = root(),
      staging = {
        runtime: path.join(r, 'runtime'),
        environment: path.join(r, 'environment'),
        model: path.join(r, 'model'),
      };
    const make = (entries) => {
      const z = new AdmZip();
      for (const [name, bytes] of Object.entries(entries))
        z.addFile(name, Buffer.from(bytes));
      return z.toBuffer();
    };
    const runtime = make({ 'python.exe': 'exe', 'extra.txt': 'discard' }),
      wheel = make({ 'one.py': 'module' }),
      model = make({
        'bundle/model.onnx': 'model',
        'bundle/unknown.txt': 'discard',
      });
    const fpRoot = path.join(r, 'expected');
    fs.mkdirSync(fpRoot);
    fs.writeFileSync(path.join(fpRoot, 'one.py'), 'module');
    const filePin = (text) => ({
      bytes: Buffer.byteLength(text),
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
    });
    const catalog = {
      runtime: {
        files: { 'python.exe': filePin('exe') },
        artifact: pin(runtime),
      },
      environment: {
        packages: [{ artifact: pin(wheel) }],
        fingerprint: await fingerprintTree(fpRoot),
      },
      model: {
        artifact: pin(model),
        archivePrefix: 'bundle',
        files: { 'model.onnx': filePin('model') },
      },
    };
    const downloads = [runtime, wheel, model];
    await prepareLyricsArtifacts({
      staging,
      installed: {},
      catalog,
      signal: new AbortController().signal,
      download: async () => downloads.shift(),
    });
    expect(fs.readdirSync(staging.runtime)).toEqual(['python.exe']);
    expect(fs.readdirSync(staging.model)).toEqual(['model.onnx']);
    expect(await fingerprintTree(staging.environment)).toBe(
      catalog.environment.fingerprint,
    );
    const reused = Object.fromEntries(
      Object.keys(staging).map((name) => [name, path.join(r, 'reused', name)]),
    );
    const download = vi.fn();
    await prepareLyricsArtifacts({
      staging: reused,
      installed: staging,
      catalog,
      signal: new AbortController().signal,
      download,
    });
    expect(download).not.toHaveBeenCalled();
    expect(await fingerprintTree(reused.environment)).toBe(
      catalog.environment.fingerprint,
    );
    await expect(
      prepareLyricsArtifacts({
        staging: reused,
        installed: {},
        catalog: { ...catalog, runtime: { files: catalog.runtime.files } },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('unavailable');
  });
});
