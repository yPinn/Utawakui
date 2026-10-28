import { LIMITS } from './policy.mjs';

export function createWaveformLane({ start, identity, install }) {
  let active = null;
  function request(key) {
    if (active && (active.key !== key || active.cancelled)) throw Error('BUSY');
    if (!active) {
      const job = {
        key,
        identity: identity(key),
        consumers: new Set(),
        cancelled: false,
        producer: start(key),
      };
      active = job;
      Promise.resolve(job.producer.result)
        .then((value) => {
          if (active !== job || job.cancelled || identity(key) !== job.identity)
            throw Error('STALE');
          if (
            !Number.isInteger(value.payloadBytes) ||
            value.payloadBytes > LIMITS.summaryBytes
          )
            throw Error('PAYLOAD');
          install(value);
          if (active === job) active = null;
          for (const consumer of job.consumers) consumer.resolve(value);
        })
        .catch((error) => {
          if (active === job) active = null;
          for (const consumer of job.consumers) consumer.reject(error);
        })
        .finally(() => {
          if (active === job) active = null;
        });
    }
    const job = active,
      consumer = Promise.withResolvers();
    if (job.consumers.size >= 8) throw Error('CONSUMER_BUDGET');
    job.consumers.add(consumer);
    return {
      result: consumer.promise,
      async cancel() {
        if (!job.consumers.delete(consumer)) return;
        consumer.reject(Error('CANCELLED'));
        if (!job.consumers.size && active === job) {
          job.cancelled = true;
          await job.producer.cancel();
          if (active === job) active = null;
        }
      },
    };
  }
  return {
    request,
    async invalidate() {
      if (!active) return;
      const job = active;
      job.cancelled = true;
      for (const consumer of job.consumers) consumer.reject(Error('STALE'));
      job.consumers.clear();
      await job.producer.cancel();
      if (active === job) active = null;
    },
  };
}
