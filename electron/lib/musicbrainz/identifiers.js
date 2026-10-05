'use strict';

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SOURCE_PAGE_PATH_RE =
  /^\/(?:recording|release-group|release)\/[0-9a-f-]+$/iu;

// The one shape both the discovery service writes and every reader trusts.
function musicBrainzEntityUrl(entityType, entityId) {
  return `https://musicbrainz.org/${entityType}/${entityId}`;
}

function isMusicBrainzSourcePage(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'musicbrainz.org' &&
      SOURCE_PAGE_PATH_RE.test(url.pathname)
    );
  } catch {
    return false;
  }
}

module.exports = { MBID_RE, isMusicBrainzSourcePage, musicBrainzEntityUrl };
