'use strict';

const packageMetadata = require('../../package.json');

// Contact URL that MusicBrainz and LRCLIB API policies require in the agent.
const PROJECT_URL = 'https://github.com/yPinn/Utawakui';

// Shared product token for main-process HTTP clients; comment names the caller.
function appUserAgent(comment = '') {
  const product = `Utawakui/${packageMetadata.version}`;
  return comment ? `${product} (${comment})` : product;
}

module.exports = { PROJECT_URL, appUserAgent };
