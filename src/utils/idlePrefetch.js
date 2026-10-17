// Warms lazily split chunks one per idle period, so the first visit to a page
// skips its parse/compile cost. Failures stay silent: navigation retries the
// same import. No-op where requestIdleCallback is missing (tests, old hosts).
export function prefetchWhenIdle(
  loaders,
  { requestIdle = globalThis.requestIdleCallback } = {},
) {
  if (typeof requestIdle !== 'function') return;
  const queue = [...loaders];
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    Promise.resolve()
      .then(load)
      .catch(() => {})
      .finally(() => requestIdle(next));
  };
  requestIdle(next);
}
