'use strict';

// Kick off the existing persistent Cookie store while the shell initializes.
// This is a local read, not a navigation or HTTP request. Discard cookie values.
function preparePreviewSession(session) {
  try {
    return session.cookies.get({ url: 'http://127.0.0.1' }).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    // Best effort: navigation retains its normal initialization/error handling.
    return Promise.resolve();
  }
}

module.exports = { preparePreviewSession };
