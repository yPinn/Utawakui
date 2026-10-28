'use strict';
const crypto = require('node:crypto');
const digest = (value) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function createWaveformRuntime({
  getScope,
  requireGate,
  getDecoder,
  prepareSource,
  inspectSource,
  cache,
  scheduler,
  start,
}) {
  const requests = new Map();
  const clearing = new Set();
  const held = new Set();
  let active = null,
    generation = 0;
  const groupFor = (scope, trackId) => digest([scope.dir, trackId]);
  function scopeCheck(entry) {
    if (entry.cancelled) throw Error('CANCELLED');
    const now = getScope();
    if (
      entry.generation !== generation ||
      entry.scope.dir !== now.dir ||
      entry.scope.epoch !== now.epoch
    )
      throw Error('SOURCE_STALE');
    requireGate();
  }
  function sourceCheck(entry, source, decoder) {
    scopeCheck(entry);
    const now = getDecoder();
    if (
      now.stamp !== decoder.stamp ||
      now.file !== decoder.file ||
      inspectSource(entry.scope, entry.trackId) !== source.stamp
    )
      throw Error('SOURCE_STALE');
  }
  async function stop(job) {
    if (!job.stopping) job.stopping = scheduler.cancel(job.id);
    await job.stopping;
    await job.result.catch(() => {});
  }
  async function cancel(requestId) {
    const entry = requests.get(requestId);
    if (!entry) return;
    entry.cancelled = true;
    entry.controller.abort();
    entry.abort.reject(Error('CANCELLED'));
    if (entry.job) {
      if (![...entry.job.consumers].some((item) => !item.cancelled))
        await stop(entry.job);
    } else await entry.completion.catch(() => {});
  }
  async function read(intent) {
    if (requests.has(intent.requestId) || requests.size >= 8)
      throw Error('BUSY');
    const entry = {
      ...intent,
      scope: getScope(),
      generation,
      cancelled: false,
      abort: Promise.withResolvers(),
      controller: new AbortController(),
    };
    const entryGroup = groupFor(entry.scope, entry.trackId);
    if (clearing.has(entryGroup) || held.has(entryGroup)) throw Error('BUSY');
    requests.set(intent.requestId, entry);
    const work = async () => {
      scopeCheck(entry);
      const decoder = getDecoder();
      const source = await prepareSource(
        entry.scope,
        entry.trackId,
        () => {
          scopeCheck(entry);
          const now = getDecoder();
          if (now.stamp !== decoder.stamp || now.file !== decoder.file)
            throw Error('SOURCE_STALE');
        },
        entry.controller.signal,
      );
      const check = () => sourceCheck(entry, source, decoder);
      check();
      if (
        intent.kind === 'detail' &&
        intent.tileIndex * 10 >= source.metadata.durationSec
      )
        throw Error('INVALID_INTENT');
      const group = groupFor(entry.scope, entry.trackId);
      const key = digest([
        source.binding,
        source.stamp.split('/')[0],
        decoder.stamp,
        'channel-extrema-v1',
        intent.kind,
        intent.tileIndex,
      ]);
      const cached = await cache.get(group, key);
      check();
      if (cached) return { status: 'ready', cacheHit: true, summary: cached };
      if (
        active &&
        (active.key !== key || active.group !== group || active.stopping)
      )
        throw Error('BUSY');
      if (!active) {
        const job = {
          id: `waveform-${crypto.randomUUID()}`,
          key,
          group,
          consumers: new Set([entry]),
          result: null,
        };
        active = job;
        const jobCheck = () => {
          const live = [...job.consumers].find((item) => !item.cancelled);
          if (!live) throw Error('CANCELLED');
          sourceCheck(live, source, decoder);
        };
        let monitor;
        const decoded = scheduler.schedule({
          jobId: job.id,
          start: () => {
            jobCheck();
            const producer = start({
              ...source,
              inputPath: source.file,
              ffmpegPath: decoder.file,
              expectedStamp: source.stamp.split('/').at(-1),
              kind: intent.kind,
              tileIndex: intent.tileIndex,
            });
            monitor = setInterval(() => {
              try {
                jobCheck();
              } catch {
                void cancelJob();
              }
            }, 100);
            const cancelJob = () => {
              for (const consumer of job.consumers) {
                consumer.cancelled = true;
                consumer.abort.reject(Error('SOURCE_STALE'));
              }
              return producer.cancel();
            };
            return producer;
          },
        });
        job.result = decoded
          .then(async (summary) => {
            jobCheck();
            // Worker telemetry stays private; only the bounded summary is persisted/projected.
            const value = { ...summary };
            delete value.metrics;
            await cache.put(group, key, value, jobCheck);
            jobCheck();
            return value;
          })
          .finally(() => {
            clearInterval(monitor);
            if (active === job) active = null;
          });
        job.result.catch(() => {});
      }
      entry.job = active;
      active.consumers.add(entry);
      const summary = await active.result;
      check();
      return { status: 'ready', cacheHit: false, summary };
    };
    entry.completion = work();
    entry.completion
      .finally(() => requests.delete(intent.requestId))
      .catch(() => {});
    return Promise.race([entry.completion, entry.abort.promise]);
  }
  async function invalidate(trackId) {
    if (!trackId) generation++;
    const entries = [...requests.values()].filter(
      (entry) => !trackId || entry.trackId === trackId,
    );
    await Promise.all(entries.map((entry) => cancel(entry.requestId)));
  }
  async function clear(trackId) {
    const scope = getScope();
    const group = groupFor(scope, trackId);
    if (clearing.has(group) || held.has(group) || clearing.size >= 8)
      throw Error('BUSY');
    clearing.add(group);
    try {
      await invalidate(trackId);
      await cache.clear(group);
    } finally {
      clearing.delete(group);
    }
  }
  async function holdTrack(trackId) {
    const group = groupFor(getScope(), trackId);
    if (held.has(group) || held.size >= 8) throw Error('BUSY');
    held.add(group);
    try {
      await invalidate(trackId);
    } catch (error) {
      held.delete(group);
      throw error;
    }
    return () => held.delete(group);
  }
  return { read, cancel, clear, invalidate, holdTrack };
}
module.exports = { createWaveformRuntime };
