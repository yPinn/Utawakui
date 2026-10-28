import { expect, it, vi } from 'vitest';
import { createWaveformRuntime } from './runtime.js';
import { createHeavyJobScheduler } from '../audioProcessing/heavyJobScheduler.js';

function fixture() {
  let stamp = 'original',
    epoch = 0,
    enabled = true,
    decoderStamp = 'decoder';
  const pending = Promise.withResolvers();
  const source = {
    file: 'private.wav',
    stamp: 'original',
    binding: { value: 'hash' },
    metadata: { durationSec: 1 },
  };
  const cache = {
    get: vi.fn(async () => null),
    put: vi.fn(async (_g, _k, _v, check) => check()),
    clear: vi.fn(async () => {}),
  };
  const producer = {
    result: pending.promise,
    cancel: vi.fn(async () => {
      pending.reject(Error('CANCELLED'));
    }),
  };
  const start = vi.fn(() => producer);
  const scheduler = createHeavyJobScheduler();
  const runtime = createWaveformRuntime({
    getScope: () => ({ dir: 'private-library', epoch }),
    requireGate: () => {
      if (!enabled) throw Error('GATE_DISABLED');
    },
    getDecoder: () => ({ file: 'private-ffmpeg', stamp: decoderStamp }),
    prepareSource: async (_scope, _id, check) => {
      check();
      return source;
    },
    inspectSource: () => stamp,
    cache,
    scheduler,
    start,
  });
  return {
    runtime,
    cache,
    pending,
    start,
    producer,
    source,
    changeDecoder: () => {
      decoderStamp = 'another-decoder';
    },
    scheduler,
    change: () => {
      stamp = 'changed';
    },
    scope: () => {
      epoch++;
    },
    gate: () => {
      enabled = false;
    },
  };
}
const intent = (id = '1') => ({
  trackId: 'track',
  requestId: id,
  kind: 'overview',
  tileIndex: 0,
});
it('installs one completed summary, releases the lane and allows a cache hit without starting work', async () => {
  const f = fixture();
  const read = f.runtime.read(intent());
  await tick();
  f.pending.resolve({ durationSec: 1 });
  expect((await read).cacheHit).toBe(false);
  expect(f.cache.put).toHaveBeenCalledOnce();
  f.cache.get.mockResolvedValue({ durationSec: 1 });
  expect((await f.runtime.read(intent('2'))).cacheHit).toBe(true);
  expect(f.start).toHaveBeenCalledOnce();
});
it('projects the same opaque media revision across cached tiles and changes it for media, scope or decoder evidence', async () => {
  const f = fixture();
  f.source.metadata.durationSec = 30;
  f.cache.get.mockResolvedValue({ durationSec: 30 });
  const a = await f.runtime.read(intent('overview'));
  const b = await f.runtime.read({
    ...intent('tile'),
    kind: 'detail',
    tileIndex: 1,
  });
  expect(a.mediaRevision).toMatch(/^[a-f0-9]{64}$/);
  expect(b.mediaRevision).toBe(a.mediaRevision);
  expect(JSON.stringify(a)).not.toContain('private');
  f.source.binding = { value: 'different-content-same-duration' };
  const c = await f.runtime.read({
    ...intent('changed'),
    kind: 'detail',
    tileIndex: 2,
  });
  expect(c.mediaRevision).not.toBe(a.mediaRevision);
  f.scope();
  const d = await f.runtime.read(intent('scope'));
  expect(d.mediaRevision).not.toBe(c.mediaRevision);
  f.changeDecoder();
  expect((await f.runtime.read(intent('decoder'))).mediaRevision).not.toBe(
    d.mediaRevision,
  );
});
it('bounds active consumers, rejects another tile and blocks reads throughout clear', async () => {
  const f = fixture();
  f.source.metadata.durationSec = 60;
  const reads = Array.from({ length: 8 }, (_, i) =>
    f.runtime.read(intent(String(i))).catch((error) => error.message),
  );
  await tick();
  await expect(f.runtime.read(intent('overflow'))).rejects.toThrow('BUSY');
  await f.runtime.clear('track');
  await Promise.all(reads);
  const held = Promise.withResolvers();
  f.cache.clear.mockReturnValue(held.promise);
  const clearing = f.runtime.clear('track');
  await tick();
  await expect(f.runtime.read(intent('new'))).rejects.toThrow('BUSY');
  held.resolve();
  await clearing;
});
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
it('cancels a waveform queued behind the existing heavy owner without starting its producer', async () => {
  const f = fixture(),
    blocker = Promise.withResolvers();
  const held = f.scheduler.schedule({
    jobId: 'other-heavy',
    start: () => ({
      result: blocker.promise,
      cancel: async () => blocker.resolve(),
    }),
  });
  const read = f.runtime.read(intent()).catch((error) => error.message);
  await tick();
  await f.runtime.cancel('1');
  expect(await read).toBe('CANCELLED');
  expect(f.start).not.toHaveBeenCalled();
  blocker.resolve();
  await held;
  await f.scheduler.shutdown();
});
it('drains and holds a deleting track until its existing deletion owner releases it', async () => {
  const f = fixture();
  const read = f.runtime.read(intent()).catch((error) => error.message);
  await tick();
  const release = await f.runtime.holdTrack('track');
  expect(await read).toBe('CANCELLED');
  await expect(f.runtime.read(intent('blocked'))).rejects.toThrow('BUSY');
  release();
  f.cache.get.mockResolvedValue({ durationSec: 1 });
  expect((await f.runtime.read(intent('next'))).cacheHit).toBe(true);
});
it.each(['change', 'scope', 'gate'])(
  'rejects late results after %s and never caches',
  async (operation) => {
    const f = fixture();
    const result = f.runtime.read(intent());
    const check = expect(result).rejects.toThrow();
    await tick();
    f[operation]();
    f.pending.resolve({ peaks: {} });
    await check;
    expect(f.cache.put).not.toHaveBeenCalled();
  },
);
it('shares a key, cancels only its consumer and stops the last consumer', async () => {
  const f = fixture();
  const first = f.runtime.read(intent());
  const second = f.runtime.read(intent('2'));
  const a = expect(first).rejects.toThrow('CANCELLED');
  const b = expect(second).rejects.toThrow('CANCELLED');
  await tick();
  expect(f.start).toHaveBeenCalledTimes(1);
  await f.runtime.cancel('1');
  await a;
  expect(f.producer.cancel).not.toHaveBeenCalled();
  await f.runtime.cancel('2');
  await b;
  expect(f.producer.cancel).toHaveBeenCalledTimes(1);
  expect(f.cache.put).not.toHaveBeenCalled();
});
it('clear awaits owned producer cleanup and prevents late cache resurrection', async () => {
  const f = fixture();
  const read = f.runtime.read(intent());
  const check = expect(read).rejects.toThrow();
  await tick();
  await f.runtime.clear('track');
  await check;
  expect(f.producer.cancel).toHaveBeenCalledOnce();
  expect(f.cache.clear).toHaveBeenCalledOnce();
  expect(f.cache.put).not.toHaveBeenCalled();
});
it('checks a warm cache against fresh gate, scope and source evidence', async () => {
  const f = fixture();
  f.cache.get.mockImplementation(async () => {
    f.change();
    return { peaks: {} };
  });
  await expect(f.runtime.read(intent())).rejects.toThrow();
  expect(f.start).not.toHaveBeenCalled();
});
