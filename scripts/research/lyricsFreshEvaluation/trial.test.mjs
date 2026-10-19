import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { download, downloadPinned, runStages } from './trial.cjs';
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
it('retains its cancellation listener until cleanup so signal-exit cannot terminate early', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-cli-cancel-'));
  const root = path.join(parent, 'downloads');
  const originalListeners = new Set(process.rawListeners('SIGINT'));
  let cancellationListenerPresent = false;
  // signal-exit checks whether any application handler remains before resending
  // the signal. Simulate that check without signalling the test runner itself.
  const foreignListener = () => {
    cancellationListenerPresent = process
      .rawListeners('SIGINT')
      .some(
        (listener) =>
          !originalListeners.has(listener) && listener !== foreignListener,
      );
  };
  vi.stubGlobal('fetch', async () => {
    process.on('SIGINT', foreignListener);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          const ownedListeners = process
            .rawListeners('SIGINT')
            .filter((listener) => !originalListeners.has(listener));
          for (const listener of ownedListeners)
            listener.call(process, 'SIGINT');
        },
      }),
    );
  });
  try {
    await expect(download(root)).rejects.toThrow();
    expect(cancellationListenerPresent).toBe(true);
    expect(fs.readdirSync(root)).toEqual([]);
    expect(
      process
        .rawListeners('SIGINT')
        .filter(
          (listener) =>
            !originalListeners.has(listener) && listener !== foreignListener,
        ),
    ).toEqual([]);
  } finally {
    process.removeListener('SIGINT', foreignListener);
    vi.unstubAllGlobals();
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
it('streams fixed artifacts to a new destination and rejects corrupt bytes without publication', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-trial-'));
  const bytes = Buffer.from('verified model'),
    artifact = {
      filename: 'model.bin',
      url: 'https://example.invalid/model.bin',
      sizeBytes: bytes.length,
      sha256: hash(bytes),
    };
  const fetchImpl = async () => new Response(bytes);
  try {
    await downloadPinned(artifact, path.join(root, 'ok.bin'), { fetchImpl });
    expect(fs.readFileSync(path.join(root, 'ok.bin'))).toEqual(bytes);
    await expect(
      downloadPinned(
        { ...artifact, sha256: '0'.repeat(64) },
        path.join(root, 'bad.bin'),
        { fetchImpl },
      ),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(root, 'bad.bin'))).toBe(false);
    expect(fs.readdirSync(root)).toEqual(['ok.bin']);
    await expect(
      downloadPinned(artifact, path.join(root, 'ok.bin'), { fetchImpl }),
    ).rejects.toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it('cancelled research preparation leaves no final or partial artifact and does not touch existing files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-trial-cancel-')),
    controller = new AbortController();
  fs.writeFileSync(path.join(root, 'keep.txt'), 'keep');
  controller.abort();
  try {
    await expect(
      downloadPinned(
        {
          filename: 'x',
          url: 'https://example.invalid/x',
          sizeBytes: 1,
          sha256: '0'.repeat(64),
        },
        path.join(root, 'cancel.bin'),
        {
          signal: controller.signal,
          fetchImpl: () => {
            throw Error('must not fetch');
          },
        },
      ),
    ).rejects.toThrow();
    expect(fs.readdirSync(root)).toEqual(['keep.txt']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it('does not start a later model stage or publish a successful trial after cancellation or failure', async () => {
  const controller = new AbortController(),
    calls = [];
  await expect(
    runStages(
      [
        async () => {
          calls.push('hfa');
          controller.abort();
        },
        async () => calls.push('small'),
      ],
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(calls).toEqual(['hfa']);
  await expect(
    runStages([
      async () => {
        throw Error('load failed');
      },
      async () => calls.push('publish'),
    ]),
  ).rejects.toThrow('load failed');
  expect(calls).not.toContain('publish');
});
it('cleans an interrupted active stream without publishing it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-stream-cancel-')),
    controller = new AbortController();
  let timer;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array([1]));
      timer = setTimeout(() => controller.abort(), 10);
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  try {
    await expect(
      downloadPinned(
        {
          filename: 'x',
          url: 'https://example.invalid/x',
          sizeBytes: 10,
          sha256: '0'.repeat(64),
        },
        path.join(root, 'x'),
        {
          signal: controller.signal,
          fetchImpl: async () => new Response(stream),
        },
      ),
    ).rejects.toThrow();
    expect(fs.readdirSync(root)).toEqual([]);
  } finally {
    clearTimeout(timer);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
