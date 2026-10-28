import { describe, expect, it } from 'vitest';
import {
  browserAdmission,
  validateMetadata,
} from '../prototypes/lyrics-waveform/policy.mjs';
import { PeakAccumulator } from '../prototypes/lyrics-waveform/peaks.mjs';
import { createWaveformLane } from '../prototypes/lyrics-waveform/lane.mjs';
import { evaluate } from '../prototypes/lyrics-waveform/evaluate.mjs';
import { createStreamingProducer } from '../prototypes/lyrics-waveform/producer.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';

const metadata = {
  durationSec: 1,
  sampleRate: 8000,
  channels: 2,
  inputBytes: 100,
};
describe('waveform backend experiment bounds', () => {
  it('keeps the dated measured denominator and its gates reproducible', () => {
    const report = JSON.parse(
      fs.readFileSync(
        new URL(
          '../docs/research/engineering/lyrics-waveform-backend-2026-10-28.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(report.main).toHaveLength(16);
    expect(report.browser.results).toHaveLength(9);
    expect(evaluate(report).mainCandidate).toBe(true);
    expect(evaluate(report).browser.longRefused).toBe(true);
  });
  it('does not resolve cancellation until producer pipes have closed', async () => {
    const child = new EventEmitter();
    Object.assign(child, {
      pid: 12345,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      send() {},
      connected: true,
    });
    const job = createStreamingProducer({}, { forkImpl: () => child });
    const rejected = job.result.catch((error) => error.message);
    let stopped = false;
    const cancelled = job.cancel().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    child.emit('message', {
      type: 'failed',
      code: 'CANCELLED',
      metrics: { producerClosed: true },
    });
    child.emit('close', 1);
    await cancelled;
    expect(await rejected).toBe('CANCELLED');
  });
  it('bounds consumers and accepts the next key immediately after a completed installation', async () => {
    let runs = 0;
    const lane = createWaveformLane({
      identity: () => 'a',
      start: () => ({
        result: Promise.resolve({ payloadBytes: 32 }),
        cancel: async () => {},
      }),
      install: () => {
        runs++;
      },
    });
    const handles = Array.from({ length: 8 }, () => lane.request('a'));
    expect(() => lane.request('a')).toThrow('CONSUMER_BUDGET');
    await Promise.all(handles.map((handle) => handle.result));
    await lane.request('b').result;
    expect(runs).toBe(2);
  });
  it('waits for drained IPC/stdio close instead of classifying an early process exit as a missing result', async () => {
    const child = new EventEmitter();
    Object.assign(child, {
      pid: 12345,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      send() {},
      connected: true,
    });
    const job = createStreamingProducer({}, { forkImpl: () => child });
    let settled = false;
    job.result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    child.emit('exit', 0);
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit('message', {
      type: 'done',
      summary: { payloadBytes: 65536 },
      metrics: { producerClosed: true },
    });
    child.emit('close', 0);
    expect(await job.result).toMatchObject({
      payloadBytes: 65536,
      metrics: { workerClosed: true },
    });
  });
  it('does not turn missing measurements or logical cancellation into a passing backend', () => {
    const gates = evaluate({
      main: [],
      browser: {
        results: [
          {
            id: 'medium-cancel',
            status: 'logical-cancel',
            decodeStatusAfterCancel: 'fulfilled',
          },
        ],
      },
    });
    expect(gates.mainCandidate).toBe(false);
    expect(gates.main.memory).toBe(false);
    expect(gates.browserCandidate).toBe(false);
  });
  it('refuses compressed long audio based on decoded PCM and copies', () => {
    expect(
      browserAdmission({
        ...metadata,
        durationSec: 1800,
        sampleRate: 48000,
        inputBytes: 1000000,
      }),
    ).toMatchObject({ admitted: false, pcmBytes: 691200000 });
    expect(browserAdmission(metadata).admitted).toBe(true);
    expect(() =>
      validateMetadata({ ...metadata, durationSec: Infinity }),
    ).toThrow('METADATA_BUDGET');
    expect(() => validateMetadata({ ...metadata, channels: 9 })).toThrow();
  });
  it('preserves opposite channels instead of averaging them into silence, in planar and interleaved paths', () => {
    const planar = new PeakAccumulator(metadata),
      interleaved = new PeakAccumulator(metadata);
    const left = Float32Array.from({ length: 8000 }, () => 0.75),
      right = Float32Array.from(left, (x) => -x);
    planar.pushPlanar([left, right], 0, 8000);
    const floats = new Float32Array(16000);
    for (let i = 0; i < 8000; i++) {
      floats[i * 2] = left[i];
      floats[i * 2 + 1] = right[i];
    }
    interleaved.pushInterleaved(new DataView(floats.buffer));
    const a = planar.finish(),
      b = interleaved.finish();
    expect(a.coarse.min).toEqual(b.coarse.min);
    expect(a.coarse.rms).toEqual(b.coarse.rms);
    expect(a.coarse.rms[0]).toBe(0.75);
    expect(Math.min(...a.coarse.min)).toBe(-0.75);
    expect(Math.max(...a.coarse.max)).toBe(0.75);
    expect(
      a.coarse.min.byteLength + a.coarse.max.byteLength,
    ).toBeLessThanOrEqual(32768);
    expect(
      a.detail.min.byteLength + a.detail.max.byteLength,
    ).toBeLessThanOrEqual(65536);
  });
  it('measures sample energy, not the extrema envelope, with bounded RMS payloads and exact partial tails', () => {
    const meta = { ...metadata, durationSec: 10, channels: 2 };
    const acc = new PeakAccumulator(meta, { detailStartSec: 0 });
    const left = new Float32Array(80000),
      right = new Float32Array(80000);
    // First detail bucket spans 20 frames. An impulse has a full peak but low RMS.
    left[0] = 1;
    right[0] = -1;
    left[79999] = right[79999] = 0.5;
    for (let from = 0; from < left.length; from += 8000)
      acc.pushPlanar([left, right], from, Math.min(8000, left.length - from));
    const value = acc.finish();
    expect(value.detail.strideFrames).toBe(20);
    expect(value.detail.max[0]).toBe(1);
    expect(value.detail.rms[0]).toBeCloseTo(Math.sqrt(1 / 20));
    expect(value.detail.rms[1]).toBe(0);
    expect(value.detail.rms[3999]).toBeCloseTo(Math.sqrt(0.25 / 20));
    expect(value.detail.rms[4000]).toBe(0);
    expect(value.payloadBytes).toBe(49152);
    expect(value.workingSummaryBytes).toBe(98304);
    const partial = new PeakAccumulator({
      ...metadata,
      durationSec: 1.001,
      channels: 1,
    });
    partial.pushPlanar([new Float32Array(8008).fill(0.5)], 0, 8008);
    const tail = partial.finish();
    const last = Math.floor((tail.frames - 1) / tail.coarse.strideFrames);
    expect(tail.coarse.rms[last]).toBe(0.5);
    expect(tail.coarse.rms[last + 1]).toBe(0);
  });
  it('averages energy over every channel rather than taking the loudest channel', () => {
    const acc = new PeakAccumulator({ ...metadata, channels: 4 });
    const one = new Float32Array(8000).fill(1),
      zero = new Float32Array(8000);
    acc.pushPlanar([one, zero, zero, zero], 0, 8000);
    const value = acc.finish();
    expect(value.coarse.max[0]).toBe(1);
    expect(value.coarse.rms[0]).toBe(0.5);
  });
  it('rejects non-finite samples, truncated frames, duration and chunk overruns', () => {
    expect(() =>
      new PeakAccumulator(metadata).pushInterleaved(
        new DataView(new ArrayBuffer(3)),
      ),
    ).toThrow('PCM_FRAME');
    expect(() =>
      new PeakAccumulator(metadata).pushPlanar(
        [new Float32Array([NaN]), new Float32Array([1])],
        0,
        1,
      ),
    ).toThrow('PCM_SAMPLE');
    expect(() => new PeakAccumulator(metadata).finish()).toThrow(
      'PCM_DURATION',
    );
    expect(() =>
      new PeakAccumulator(metadata).pushInterleaved(
        new DataView(new ArrayBuffer(300000)),
      ),
    ).toThrow('PCM_CHUNK');
  });
  it('deduplicates one active key, refuses a different queued job and cancels the producer only after the last consumer', async () => {
    const pending = Promise.withResolvers();
    let cancelled = 0,
      started = 0,
      installed = 0;
    const lane = createWaveformLane({
      start: () => {
        started++;
        return {
          result: pending.promise,
          cancel: async () => {
            cancelled++;
          },
        };
      },
      identity: () => 'a',
      install: () => {
        installed++;
      },
    });
    const first = lane.request('key'),
      second = lane.request('key');
    expect(() => lane.request('other')).toThrow('BUSY');
    const rejected = first.result.catch((error) => error.message);
    await first.cancel();
    expect(cancelled).toBe(0);
    expect(await rejected).toBe('CANCELLED');
    pending.resolve({ payloadBytes: 32768 });
    await second.result;
    expect(started).toBe(1);
    expect(installed).toBe(1);
  });
  it('never installs late success after cancel, source invalidation or oversized output', async () => {
    for (const kind of ['cancel', 'source', 'payload']) {
      const pending = Promise.withResolvers();
      let installed = 0,
        cancelled = 0,
        identity = 'a';
      const lane = createWaveformLane({
        start: () => ({
          result: pending.promise,
          cancel: async () => {
            cancelled++;
          },
        }),
        identity: () => identity,
        install: () => {
          installed++;
        },
      });
      const handle = lane.request('key'),
        result = handle.result.catch((error) => error.message);
      if (kind === 'cancel') await handle.cancel();
      if (kind === 'source') identity = 'b';
      pending.resolve({ payloadBytes: kind === 'payload' ? 1000000 : 32768 });
      expect(await result).toMatch(/CANCELLED|STALE|PAYLOAD/);
      expect(installed).toBe(0);
      if (kind === 'cancel') expect(cancelled).toBe(1);
    }
  });
});
