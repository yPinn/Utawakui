/* global module, queueMicrotask */
function createGuidePreparationQueue(prepare) {
  const jobs = new Map();
  const pending = [];
  let running = false;

  async function drain() {
    if (running || pending.length === 0) return;
    running = true;
    const job = pending.shift();
    try {
      job.resolve(await prepare(job.input));
    } catch (error) {
      job.reject(error);
    } finally {
      jobs.delete(job.input.stamp);
      running = false;
      queueMicrotask(drain);
    }
  }

  function enqueue(input, priority = false) {
    const existing = jobs.get(input.stamp);
    if (existing) {
      const index = priority ? pending.indexOf(existing) : -1;
      if (index > 0) pending.unshift(...pending.splice(index, 1));
      return existing.result;
    }
    let resolve;
    let reject;
    const result = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const job = { input, result, resolve, reject };
    jobs.set(input.stamp, job);
    if (priority) pending.unshift(job);
    else pending.push(job);
    queueMicrotask(drain);
    return result;
  }

  return { enqueue, has: (stamp) => jobs.has(stamp) };
}

module.exports = { createGuidePreparationQueue };
