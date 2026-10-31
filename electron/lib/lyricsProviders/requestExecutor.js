'use strict';
const { QueueFullError } = require('../providerRequestScheduler.js');
function createLyricsRequestExecutor({ maximum = 2 } = {}) {
  const queue = [];
  let active = 0;
  let backgroundActive = 0;
  function drain() {
    while (active < maximum && queue.length) {
      const interactive = queue.findIndex(
        (entry) => entry.priority !== 'background',
      );
      if (interactive < 0 && backgroundActive >= 1) break;
      const [entry] = queue.splice(interactive < 0 ? 0 : interactive, 1);
      entry.signal?.removeEventListener('abort', entry.cancel);
      if (entry.signal?.aborted) {
        entry.reject(entry.signal.reason);
        continue;
      }
      active += 1;
      if (entry.priority === 'background') backgroundActive += 1;
      Promise.resolve()
        .then(entry.start)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1;
          if (entry.priority === 'background') backgroundActive -= 1;
          drain();
        });
    }
  }
  function run(start, { signal, priority } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (queue.length >= 64) return Promise.reject(new QueueFullError());
    return new Promise((resolve, reject) => {
      const entry = { start, signal, priority, resolve, reject, cancel: null };
      entry.cancel = () => {
        const index = queue.indexOf(entry);
        if (index < 0) return;
        queue.splice(index, 1);
        signal.removeEventListener('abort', entry.cancel);
        reject(signal.reason);
      };
      signal?.addEventListener('abort', entry.cancel, { once: true });
      queue.push(entry);
      drain();
    });
  }
  return { run };
}
module.exports = { createLyricsRequestExecutor };
