'use strict';
const { createHash } = require('node:crypto');
function fingerprintKugouRecord(record) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        record.id,
        record.trackName,
        record.artistName,
        record.duration,
        record.lrcLyrics,
        ...(record.identityEvidence ? [record.identityEvidence] : []),
      ]),
    )
    .digest('hex');
}
module.exports = { fingerprintKugouRecord };
