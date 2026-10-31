'use strict';

function exhausted() {
  return Object.assign(new Error('Lyrics request budget exhausted'), {
    reason: 'request-budget-exhausted',
  });
}
function createLyricsQuerySession(options = {}) {
  const maximum = options.maxAttempts ?? 12;
  const timeoutMs = options.timeoutMs ?? 20000;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 128 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  )
    throw new TypeError('invalid query session');
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('Lyrics query deadline exceeded', 'TimeoutError'),
      ),
    timeoutMs,
  );
  timer.unref?.();
  const signal = AbortSignal.any([
    controller.signal,
    ...[options.signal, options.parent?.signal].filter(Boolean),
  ]);
  const charged = new Set();
  const session = {
    signal,
    get attempts() {
      return charged.size;
    },
    check(token) {
      signal.throwIfAborted();
      if (charged.has(token)) return;
      if (charged.size >= maximum) throw exhausted();
      options.parent?.check(token);
    },
    consume(token = {}) {
      session.check(token);
      if (charged.has(token)) return;
      options.parent?.consume(token);
      charged.add(token);
    },
    stage(stageOptions) {
      return createLyricsQuerySession({ ...stageOptions, parent: session });
    },
    cancel() {
      controller.abort();
    },
    dispose() {
      clearTimeout(timer);
    },
  };
  return session;
}
module.exports = { createLyricsQuerySession };
