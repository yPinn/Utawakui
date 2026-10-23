'use strict';

const {
  lrcTimestamps,
  normalizeLyricsNewlines,
  parseLrcTimestamp,
  stripLrcTimestampTags,
} = require('../../../shared/lrcParsing.mjs');

function parseLrcLines(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];
  return normalizeLyricsNewlines(text)
    .split('\n')
    .flatMap((line) => {
      const timestamps = lrcTimestamps(line);
      if (timestamps.length === 0) return [];
      const lyricText = stripLrcTimestampTags(line).trim();
      if (!lyricText) return [];
      return timestamps.map((start) => ({ start, text: lyricText }));
    })
    .sort((first, second) => first.start - second.start);
}

module.exports = { parseLrcLines, parseLrcTimestamp };
