'use strict';

const SAFE_JOB_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/i;

function cancellationError(message = 'audio-processing job cancelled') {
  return new Error(message);
}

function createHeavyJobScheduler() {
  const entries = new Map();
  const queue = [];
  let active = null;
  let shutDown = false;

  function drain() {
    if (shutDown || active || queue.length === 0) return;
    const entry = queue.shift();
    if (!entry || entry.settled) {
      drain();
      return;
    }
    active = entry;
    let started;
    try {
      started = entry.start();
      if (!started || !started.result || typeof started.cancel !== 'function') {
        throw new Error('heavy job did not return a cancellable result');
      }
      entry.cancel = started.cancel;
    } catch (error) {
      entry.settled = true;
      entries.delete(entry.jobId);
      active = null;
      entry.reject(error);
      drain();
      return;
    }
    Promise.resolve(started.result)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        entry.settled = true;
        entries.delete(entry.jobId);
        if (active === entry) active = null;
        drain();
      });
  }

  function schedule({ jobId, start }) {
    if (shutDown) throw new Error('heavy job scheduler is shut down');
    if (
      !SAFE_JOB_ID_RE.test(jobId || '') ||
      entries.has(jobId) ||
      typeof start !== 'function'
    ) {
      throw new Error('invalid or duplicate heavy job id');
    }
    let resolve;
    let reject;
    const result = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const entry = {
      jobId,
      start,
      result,
      resolve,
      reject,
      cancel: null,
      settled: false,
    };
    entries.set(jobId, entry);
    queue.push(entry);
    drain();
    return result;
  }

  async function cancel(jobId) {
    const entry = entries.get(jobId);
    if (!entry || entry.settled) return false;
    if (entry !== active) {
      entry.settled = true;
      entries.delete(jobId);
      const index = queue.indexOf(entry);
      if (index !== -1) queue.splice(index, 1);
      entry.reject(cancellationError());
      return true;
    }
    if (!entry.cancel) return false;
    const cancellation = await entry.cancel();
    return cancellation !== false;
  }

  async function shutdown() {
    if (shutDown) return;
    shutDown = true;
    const activeEntry = active;
    const queued = queue.splice(0);
    const completion = Promise.allSettled([
      ...(activeEntry ? [activeEntry.result] : []),
      ...queued.map((entry) => entry.result),
    ]);
    for (const entry of queued) {
      if (entry === active || entry.settled) continue;
      entry.settled = true;
      entries.delete(entry.jobId);
      entry.reject(cancellationError('audio-processing scheduler shutdown'));
    }
    if (activeEntry?.cancel) await activeEntry.cancel();
    await completion;
  }

  return { schedule, cancel, shutdown };
}

module.exports = { createHeavyJobScheduler };
