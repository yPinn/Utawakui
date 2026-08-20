'use strict';

// Single source of truth for the utawakui-media:// scheme name — needed by
// main.js's protocol.registerSchemesAsPrivileged (must run before
// app.whenReady()), electron/main/mediaProtocol.js's handler, and
// electron/main/separationHandlers.js's stemsUrl construction.
const MEDIA_SCHEME = 'utawakui-media';

module.exports = { MEDIA_SCHEME };
