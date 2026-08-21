export function createLatestAsyncPublisher(send, options = {}) {
  const onError = options.onError ?? (() => {});
  let latestValue;
  let hasPendingValue = false;
  let activePromise = null;

  async function flush() {
    while (hasPendingValue) {
      const value = latestValue;
      hasPendingValue = false;
      try {
        await send(value);
      } catch (error) {
        onError(error);
      }
    }
  }

  function ensureFlush() {
    if (activePromise) return activePromise;
    activePromise = Promise.resolve()
      .then(flush)
      .finally(() => {
        activePromise = null;
        if (hasPendingValue) ensureFlush();
      });
    return activePromise;
  }

  function request(value) {
    latestValue = value;
    hasPendingValue = true;
    ensureFlush();
  }

  async function whenIdle() {
    while (activePromise) await activePromise;
  }

  return { request, whenIdle };
}
