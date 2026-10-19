import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import estimates from './lyricsAcousticEstimates.js';
import { deleteLyricsSource } from './lyrics.js';

const {
  acousticEstimatePath,
  prepareAcousticEstimateContext,
  saveTrackAcousticEstimate,
  loadTrackAcousticEstimate,
  createFixtureAcousticEstimate,
} = estimates;
let trackDir;
const source = { filename: 'main.lrc', offsetMs: 0 };
const canonical = {
  documentId: 'document-1',
  lines: [{ lineId: 'line-1', text: '你好世界', startMs: 1000, endMs: 4000 }],
};
async function fixture() {
  const context = await prepareAcousticEstimateContext(trackDir, source);
  return createFixtureAcousticEstimate(context, canonical, [
    [
      { chunkId: 'chunk-0', from: 0, to: 2, startMs: 1000 },
      { chunkId: 'chunk-1', from: 2, to: 4, startMs: 2700 },
    ],
  ]);
}
beforeEach(() => {
  trackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-acoustic-'));
  fs.mkdirSync(path.join(trackDir, 'lyrics'));
  fs.writeFileSync(
    path.join(trackDir, 'lyrics/main.lrc'),
    '[00:01]你好世界\n[00:04]',
  );
  fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'synthetic audio');
});
afterEach(() => fs.rmSync(trackDir, { recursive: true, force: true }));

describe('independent acoustic sidecar storage', () => {
  it('accepts a research model only with an explicit internal method context', async () => {
    const method = {
      ...(await prepareAcousticEstimateContext(trackDir, source)).method,
      kind: 'model',
      id: 'hubertfa-research',
      version: '2',
      modelManifestSha256: 'a'.repeat(64),
      environmentLockSha256: 'b'.repeat(64),
    };
    const context = await prepareAcousticEstimateContext(trackDir, source, {
      method,
    });
    const input = estimates.createAcousticEstimate(context, canonical, [
      [
        { chunkId: 'a', from: 0, to: 2, startMs: 1000 },
        { chunkId: 'b', from: 2, to: 4, startMs: 2700 },
      ],
    ]);
    await saveTrackAcousticEstimate(trackDir, source, input, { method });
    expect((await loadTrackAcousticEstimate(trackDir, source)).status).toBe(
      'stale',
    );
    expect(
      (await loadTrackAcousticEstimate(trackDir, source, { method })).preview
        .methodKind,
    ).toBe('model');
    await expect(
      saveTrackAcousticEstimate(trackDir, source, input),
    ).rejects.toThrow();
    expect(
      (
        await loadTrackAcousticEstimate(trackDir, source, {
          method: { ...method, chunkerVersion: 'changed' },
        })
      ).status,
    ).toBe('stale');
  });
  it('declines removed audio and unsafe save contexts without changing the sidecar', async () => {
    const input = await fixture();
    await saveTrackAcousticEstimate(trackDir, source, input);
    fs.unlinkSync(path.join(trackDir, 'audio.mp3'));
    expect(await loadTrackAcousticEstimate(trackDir, source)).toEqual({
      status: 'unavailable',
    });
    await expect(
      prepareAcousticEstimateContext(trackDir, { filename: '../main.lrc' }),
    ).rejects.toThrow();
    expect(
      await loadTrackAcousticEstimate(trackDir, { filename: '../main.lrc' }),
    ).toEqual({ status: 'unavailable' });
    expect(estimates.deleteTrackAcousticEstimate(trackDir, '../main.lrc')).toBe(
      false,
    );
    expect(estimates.deleteTrackAcousticEstimate(trackDir, 'missing.lrc')).toBe(
      false,
    );
  });
  it('rejects unsafe paths and leaves absent estimates missing without requiring audio', async () => {
    expect(acousticEstimatePath(trackDir, '../main.lrc')).toBeNull();
    fs.unlinkSync(path.join(trackDir, 'audio.mp3'));
    expect(await loadTrackAcousticEstimate(trackDir, source)).toEqual({
      status: 'missing',
    });
  });

  it('saves atomically and exposes only bounded preview data', async () => {
    const input = await fixture();
    await saveTrackAcousticEstimate(trackDir, source, input);
    const result = await loadTrackAcousticEstimate(trackDir, source);
    expect(result).toMatchObject({
      status: 'ready',
      preview: { documentId: 'document-1', offsetUsedMs: 0 },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /modelManifest|environmentLock|audio\.mp3|timingSha256|intervalsSha256/,
    );
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics/main.lrc'), 'utf8'),
    ).toBe('[00:01]你好世界\n[00:04]');
    expect(fs.existsSync(path.join(trackDir, 'lyrics/timing'))).toBe(false);
  });

  it('round-trips a valid near-limit estimate without publishing oversized bytes', async () => {
    await saveTrackAcousticEstimate(trackDir, source, await fixture());
    const context = await prepareAcousticEstimateContext(trackDir, source);
    const lines = Array.from({ length: 500 }, (_, index) => ({
      lineId: `line-${index}`,
      text: '字'.repeat(40),
      startMs: index * 4000,
      endMs: (index + 1) * 4000,
    }));
    const chunks = lines.map((line, index) =>
      Array.from({ length: 40 }, (_, chunk) => ({
        chunkId: `chunk-${index}-${chunk}`,
        from: chunk,
        to: chunk + 1,
        startMs: line.startMs + chunk * 100,
      })),
    );
    const input = createFixtureAcousticEstimate(
      context,
      { documentId: 'large-doc', lines },
      chunks,
    );
    const byteLimit = 2097152;
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThanOrEqual(
      byteLimit,
    );
    expect(Buffer.byteLength(JSON.stringify(input, null, 2))).toBeGreaterThan(
      byteLimit,
    );
    await saveTrackAcousticEstimate(trackDir, source, input);
    expect(
      fs.statSync(acousticEstimatePath(trackDir, source.filename)).size,
    ).toBeLessThanOrEqual(byteLimit);
    const loaded = await loadTrackAcousticEstimate(trackDir, source);
    expect(loaded.status).toBe('ready');
    expect(loaded.preview.lines).toEqual(input.lines);
  });

  it.each(['lyrics', 'audio', 'timing', 'offset', 'method'])(
    'marks changed %s stale without applying chunks',
    async (kind) => {
      const input = await fixture();
      await saveTrackAcousticEstimate(trackDir, source, input);
      let selectedSource = source;
      if (kind === 'lyrics')
        fs.appendFileSync(path.join(trackDir, 'lyrics/main.lrc'), 'changed');
      if (kind === 'audio')
        fs.appendFileSync(path.join(trackDir, 'audio.mp3'), 'changed');
      if (kind === 'timing') {
        fs.mkdirSync(path.join(trackDir, 'lyrics/timing'));
        fs.writeFileSync(
          path.join(trackDir, 'lyrics/timing/main.lrc.json'),
          '{}',
        );
      }
      if (kind === 'offset') selectedSource = { ...source, offsetMs: 100 };
      if (kind === 'method') {
        input.method.decoderVersion = 'other';
        fs.writeFileSync(
          acousticEstimatePath(trackDir, source.filename),
          JSON.stringify(input),
        );
      }
      expect(await loadTrackAcousticEstimate(trackDir, selectedSource)).toEqual(
        { status: 'stale' },
      );
    },
  );

  it('preserves corrupt, oversized and future-version files', async () => {
    fs.mkdirSync(
      path.dirname(acousticEstimatePath(trackDir, source.filename)),
      { recursive: true },
    );
    for (const bytes of [
      '{bad',
      ' '.repeat(2097153),
      JSON.stringify({ schemaVersion: 99 }),
    ]) {
      fs.writeFileSync(acousticEstimatePath(trackDir, source.filename), bytes);
      expect(
        (await loadTrackAcousticEstimate(trackDir, source)).status,
      ).toMatch(/corrupt|unsupported/);
      expect(
        fs.readFileSync(
          acousticEstimatePath(trackDir, source.filename),
          'utf8',
        ),
      ).toBe(bytes);
    }
  });

  it('rejects stale saves and cancelled generations without replacing a valid file', async () => {
    const input = await fixture();
    await saveTrackAcousticEstimate(trackDir, source, input);
    const before = fs.readFileSync(
      acousticEstimatePath(trackDir, source.filename),
    );
    await expect(
      saveTrackAcousticEstimate(trackDir, source, input, {
        isCurrent: () => false,
      }),
    ).rejects.toThrow();
    await expect(
      saveTrackAcousticEstimate(trackDir, { ...source, offsetMs: 10 }, input),
    ).rejects.toThrow();
    input.lines[0].chunks[1].from = 1;
    await expect(
      saveTrackAcousticEstimate(trackDir, source, input),
    ).rejects.toThrow();
    expect(
      fs.readFileSync(acousticEstimatePath(trackDir, source.filename)),
    ).toEqual(before);
  });

  it('rechecks audio changes during the publication generation check', async () => {
    const input = await fixture();
    await expect(
      saveTrackAcousticEstimate(trackDir, source, input, {
        isCurrent: () => {
          fs.appendFileSync(path.join(trackDir, 'audio.mp3'), 'replaced');
          return true;
        },
      }),
    ).rejects.toThrow();
    expect(fs.existsSync(acousticEstimatePath(trackDir, source.filename))).toBe(
      false,
    );
  });

  it('removes only the addressed source estimate with its source', async () => {
    const input = await fixture();
    await saveTrackAcousticEstimate(trackDir, source, input);
    const other = acousticEstimatePath(trackDir, 'other.lrc');
    fs.writeFileSync(other, 'other');
    expect(deleteLyricsSource(trackDir, source.filename)).toBe(true);
    expect(fs.existsSync(acousticEstimatePath(trackDir, source.filename))).toBe(
      false,
    );
    expect(fs.readFileSync(other, 'utf8')).toBe('other');
  });
});
