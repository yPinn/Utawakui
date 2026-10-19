import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioPythonRuntimeHost } from '../audioProcessing/audioPythonRuntimeHost.js';
import { createLyricsAcousticCapability } from './capability.js';
import { fingerprintTree, verifyFileTable } from './integrity.js';
import { createHeavyJobScheduler } from '../audioProcessing/heavyJobScheduler.js';

const roots = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
async function harness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-cap-'));
  roots.push(root);
  const host = createAudioPythonRuntimeHost({ userDataDir: root });
  const bytes = Buffer.from('synthetic'),
    pin = { bytes: bytes.length, sha256: sha(bytes) };
  const env = path.join(root, 'fixture-env');
  fs.mkdirSync(env);
  fs.writeFileSync(path.join(env, 'one.py'), bytes);
  const catalog = {
    schemaVersion: 1,
    capabilityId: 'lyrics-acoustic',
    productUse: 'accepted',
    blockReason: null,
    runtime: {
      familyId: 'cpython-3.14.x',
      artifactHash: 'a'.repeat(64),
      files: { 'python.exe': pin },
    },
    environment: {
      id: 'lyrics-alignment',
      fingerprint: await fingerprintTree(env),
      packages: [],
    },
    model: {
      id: 'hubertfa-zh-ja',
      version: '0.0.7',
      files: { 'model.onnx': pin },
    },
    installedBytesEstimate: 485000000,
  };
  const prepare = vi.fn(async ({ staging, signal }) => {
    signal.throwIfAborted();
    for (const [dir, files] of [
      [staging.runtime, catalog.runtime.files],
      [staging.model, catalog.model.files],
    ]) {
      fs.mkdirSync(dir, { recursive: true });
      for (const name of Object.keys(files))
        fs.writeFileSync(path.join(dir, name), bytes);
    }
    fs.cpSync(env, staging.environment, { recursive: true });
  });
  const probe = vi.fn(async ({ signal }) => {
    signal.throwIfAborted();
    return { ready: true };
  });
  const service = createLyricsAcousticCapability({
    host,
    catalog,
    prepare,
    probe,
  });
  return { root, host, catalog, service, prepare, probe };
}
describe('manual lyrics environment lifecycle', () => {
  it('retries transient Windows locks and rolls back cancellation during publication', async () => {
    const h = await harness();
    const rename = fs.renameSync;
    let attempts = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (++attempts <= 2)
        throw Object.assign(Error('locked'), { code: 'EPERM' });
      return rename(from, to);
    });
    expect((await h.service.prepare()).status).toBe('ready');
    const previous = h.host.getCurrentActivation();
    let cancelling;
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (
        String(from).endsWith(path.sep + 'model') &&
        String(from).includes(path.sep + 'staging' + path.sep)
      ) {
        cancelling ??= h.service.cancel();
        throw Object.assign(Error('locked'), { code: 'EBUSY' });
      }
      return rename(from, to);
    });
    await expect(h.service.repair()).rejects.toMatchObject({
      name: 'AbortError',
    });
    await cancelling;
    expect(h.host.getCurrentActivation()).toEqual(previous);
    expect((await h.service.verify()).status).toBe('ready');
  });
  it('retains a removal journal across failure and restart so cleanup is retryable', async () => {
    const h = await harness();
    await h.service.prepare();
    const remove = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation((dir, options) => {
      if (
        dir ===
        path.dirname(path.dirname(h.service.getInstalledPaths().environment))
      )
        throw Object.assign(Error('locked'), { code: 'EPERM' });
      return remove(dir, options);
    });
    await expect(h.service.remove()).rejects.toThrow('locked');
    const restarted = createLyricsAcousticCapability(h);
    expect(restarted.getStatus()).toMatchObject({
      status: 'remove-pending',
      canRemove: true,
      canPrepare: false,
    });
    vi.mocked(fs.rmSync).mockImplementation(remove);
    expect((await restarted.remove()).status).toBe('missing');
    expect(fs.existsSync(restarted.getInstalledPaths().model)).toBe(false);
  });
  it('does not hide recovery failures when publication is cancelled', async () => {
    const h = await harness();
    await h.service.prepare();
    const rename = fs.renameSync;
    let cancelling;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (
        String(from).endsWith(path.sep + 'model') &&
        String(from).includes(path.sep + 'staging' + path.sep)
      ) {
        cancelling ??= h.service.cancel();
        throw Object.assign(Error('locked'), { code: 'EBUSY' });
      }
      if (String(from).includes('backup-0')) throw Error('restore failed');
      return rename(from, to);
    });
    await expect(h.service.repair()).rejects.toBeInstanceOf(AggregateError);
    await cancelling;
    expect(fs.readdirSync(h.service.paths.stagingRoot)).toHaveLength(1);
  });
  it('fails closed for corrupted global activation and malformed removal references', async () => {
    const h = await harness();
    await h.service.prepare();
    const marker = path.join(
      h.host.paths.root,
      'lifecycle',
      'lyrics-acoustic-removal.json',
    );
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    const ref = h.host.getCurrentActivation().capabilities['lyrics-acoustic'];
    fs.writeFileSync(
      marker,
      JSON.stringify({ ...ref, runtime: { ...ref.runtime, unknown: true } }),
    );
    expect(h.service.getStatus()).toMatchObject({
      status: 'damaged',
      canRemove: false,
      canRepair: false,
    });
    await expect(h.service.remove()).rejects.toThrow('INVALID_REFERENCE');
    fs.unlinkSync(marker);
    fs.writeFileSync(h.host.paths.currentActivationPath, '{bad');
    expect(h.service.getStatus()).toMatchObject({
      status: 'damaged',
      canPrepare: false,
      canRepair: false,
      canRemove: false,
    });
    await expect(h.service.repair()).rejects.toThrow();
    expect(fs.existsSync(h.service.getInstalledPaths().model)).toBe(true);
  });
  it('expires a queued operation without waiting for the preceding job', async () => {
    const h = await harness(),
      scheduler = createHeavyJobScheduler();
    let finish;
    const blocker = scheduler.schedule({
      jobId: 'blocker',
      start: () => ({
        result: new Promise((resolve) => {
          finish = resolve;
        }),
        cancel() {
          finish();
        },
      }),
    });
    const service = createLyricsAcousticCapability({
      ...h,
      scheduler,
      timeoutMs: 10,
    });
    await expect(service.prepare()).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(service.getStatus().busy).toBe(false);
    expect(h.prepare).not.toHaveBeenCalled();
    finish();
    await blocker;
  });
  it('clears busy state when the scheduler refuses a new operation', async () => {
    const h = await harness(),
      scheduler = createHeavyJobScheduler();
    await scheduler.shutdown();
    const service = createLyricsAcousticCapability({
      ...h,
      scheduler,
      prepare: h.prepare,
      probe: h.probe,
    });
    await expect(service.prepare()).rejects.toThrow('shut down');
    expect(service.getStatus().busy).toBe(false);
    expect(await service.cancel()).toEqual({ cancelled: false });
  });
  it('blocks mutation while an older generation still has a lease', async () => {
    const h = await harness();
    await h.service.prepare();
    const lease = h.host.acquireCurrentGeneration();
    h.host.publishActivation({
      ...h.host.getCurrentActivation(),
      generationId: crypto.randomUUID(),
    });
    await expect(h.service.remove()).rejects.toMatchObject({
      code: 'LYRICS_ENV_IN_USE',
    });
    await expect(h.service.repair()).rejects.toMatchObject({
      code: 'LYRICS_ENV_IN_USE',
    });
    lease.release();
    expect((await h.service.remove()).installed).toBe(false);
  });
  it('keeps recovery backups when rollback itself cannot restore them', async () => {
    const h = await harness();
    await h.service.prepare();
    const original = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (
        (String(from).endsWith(path.sep + 'model') &&
          String(from).includes(path.sep + 'staging' + path.sep)) ||
        String(from).includes('backup-0')
      )
        throw Error('injected rename failure');
      return original(from, to);
    });
    await expect(h.service.repair()).rejects.toBeInstanceOf(AggregateError);
    expect(fs.readdirSync(h.service.paths.stagingRoot).length).toBe(1);
    const recovery = path.join(
      h.service.paths.stagingRoot,
      fs.readdirSync(h.service.paths.stagingRoot)[0],
    );
    expect(
      fs.existsSync(
        path.join(recovery, 'backup-0', 'Lib', 'site-packages', 'one.py'),
      ),
    ).toBe(true);
  });
  it('queues on the application scheduler and cancels a waiting operation before it starts', async () => {
    const h = await harness(),
      scheduler = createHeavyJobScheduler();
    let finish;
    const blocker = scheduler.schedule({
      jobId: 'existing-analysis',
      start: () => ({
        result: new Promise((resolve) => {
          finish = resolve;
        }),
        cancel() {
          finish();
        },
      }),
    });
    const service = createLyricsAcousticCapability({
      ...h,
      scheduler,
      prepare: h.prepare,
      probe: h.probe,
    });
    const result = service.prepare();
    const rejected = expect(result).rejects.toThrow();
    expect(service.getStatus().busy).toBe(true);
    await service.cancel();
    await rejected;
    expect(h.prepare).not.toHaveBeenCalled();
    expect(service.getStatus().busy).toBe(false);
    finish();
    await blocker;
  });
  it('does not install or probe on construction; publication follows verified loading', async () => {
    const h = await harness();
    expect(h.service.getStatus()).toMatchObject({
      status: 'missing',
      canPrepare: true,
    });
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.probe).not.toHaveBeenCalled();
    expect((await h.service.prepare()).status).toBe('ready');
    expect(h.probe).toHaveBeenCalledTimes(1);
    expect(
      h.host.getCurrentActivation().capabilities['lyrics-acoustic'],
    ).toBeDefined();
    const restart = createLyricsAcousticCapability({
      host: h.host,
      catalog: h.catalog,
      prepare: h.prepare,
      probe: h.probe,
    });
    expect(restart.getStatus().status).toBe('unverified');
    expect(h.probe).toHaveBeenCalledTimes(1);
    expect((await restart.verify()).status).toBe('ready');
  });
  it('blocks pending model grants before preparation or loading; cleanup is still available', async () => {
    const h = await harness();
    const blocked = createLyricsAcousticCapability({
      ...h,
      catalog: {
        ...h.catalog,
        productUse: 'blocked',
        blockReason: 'weights-evidence-pending',
      },
      prepare: h.prepare,
      probe: h.probe,
    });
    expect(blocked.getStatus()).toMatchObject({
      status: 'blocked',
      canPrepare: false,
    });
    await expect(blocked.prepare()).rejects.toMatchObject({
      code: 'LYRICS_ENV_BLOCKED',
    });
    expect(h.prepare).not.toHaveBeenCalled();
    await h.service.prepare();
    expect((await blocked.remove()).installed).toBe(false);
  });
  it('preserves old activation and files when repair verification fails', async () => {
    const h = await harness();
    await h.service.prepare();
    const previous = h.host.getCurrentActivation();
    h.probe.mockRejectedValueOnce(new Error('private-secret-path'));
    await expect(h.service.repair()).rejects.toThrow('private-secret-path');
    expect(h.host.getCurrentActivation()).toEqual(previous);
    expect((await h.service.verify()).status).toBe('ready');
    expect(fs.readdirSync(h.service.paths.stagingRoot)).toEqual([]);
  });
  it('cancels during prepare and probe without publishing; preserves existing lyrics files', async () => {
    const h = await harness();
    await h.service.prepare();
    const old = h.host.getCurrentActivation();
    const lyrics = path.join(h.root, 'tracks', 'a', 'lyrics');
    fs.mkdirSync(lyrics, { recursive: true });
    fs.writeFileSync(path.join(lyrics, 'main.lrc'), '[00:01]你好');
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    h.probe.mockImplementationOnce(
      ({ signal }) =>
        new Promise((resolve, reject) => {
          entered();
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const repair = h.service.repair();
    await waiting;
    expect(h.service.getStatus().busy).toBe(true);
    await expect(h.service.remove()).rejects.toMatchObject({
      code: 'LYRICS_ENV_BUSY',
    });
    await h.service.cancel();
    await expect(repair).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.host.getCurrentActivation()).toEqual(old);
    expect(fs.readFileSync(path.join(lyrics, 'main.lrc'), 'utf8')).toBe(
      '[00:01]你好',
    );
    expect(fs.readdirSync(h.service.paths.stagingRoot)).toEqual([]);
  });
  it('leaves a failed first installation missing and rejects content mismatches before probe', async () => {
    const h = await harness();
    h.prepare.mockImplementationOnce(async ({ staging }) => {
      fs.mkdirSync(staging.model, { recursive: true });
    });
    await expect(h.service.prepare()).rejects.toThrow();
    expect(h.service.getStatus().status).toBe('missing');
    expect(h.probe).not.toHaveBeenCalled();
    expect(fs.existsSync(h.host.paths.currentActivationPath)).toBe(false);
  });
  it('removes only this capability, keeps shared runtime and all lyric data, and rejects leased removal', async () => {
    const h = await harness();
    await h.service.prepare();
    const current = h.host.getCurrentActivation(),
      ref = current.capabilities['lyrics-acoustic'];
    const sibling = {
      runtime: {
        artifactHash: ref.runtime.artifactHash,
        familyId: ref.runtime.familyId,
      },
      environment: { id: 'analysis-structure', lockHash: 'b'.repeat(64) },
      worker: { protocolVersion: 1 },
      model: {
        kind: 'analysis',
        id: 'beat-this-small0',
        version: '1.1.0',
        manifestHash: 'c'.repeat(64),
      },
    };
    h.host.publishActivation({
      ...current,
      generationId: crypto.randomUUID(),
      capabilities: { ...current.capabilities, 'structure-analysis': sibling },
    });
    const lease = h.host.acquireCurrentGeneration();
    await expect(h.service.remove()).rejects.toMatchObject({
      code: 'LYRICS_ENV_IN_USE',
    });
    lease.release();
    const runtime = h.host.getRuntimeArtifactPaths(
      ref.runtime.familyId,
      ref.runtime.artifactHash,
    ).installDir;
    expect((await h.service.remove()).status).toBe('missing');
    expect(
      h.host.getCurrentActivation().capabilities['structure-analysis'],
    ).toEqual(sibling);
    expect(fs.existsSync(runtime)).toBe(true);
  });
  it('rejects altered installed files until a successful repair and does not trust file existence', async () => {
    const h = await harness();
    await h.service.prepare();
    const installed = h.service.getInstalledPaths();
    fs.appendFileSync(path.join(installed.model, 'model.onnx'), 'changed');
    await expect(h.service.verify()).rejects.toThrow();
    expect(h.service.getStatus().status).toBe('damaged');
    expect((await h.service.repair()).status).toBe('ready');
    await verifyFileTable(
      h.service.getInstalledPaths().model,
      h.catalog.model.files,
    );
  });
});
