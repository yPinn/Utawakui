'use strict';

function parseLrcTimestamp(value) {
  const match = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/u.exec(
    String(value || '').trim(),
  );
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] || '';
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  return minutes * 60 + seconds + millis / 1000;
}

function parseLrcLines(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];
  return text
    .split(/\r?\n/u)
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[([^\]]+)\]/gu)];
      if (matches.length === 0) return [];
      const lyricText = line.replace(/\[[^\]]+\]/gu, '').trim();
      if (!lyricText) return [];
      return matches
        .map((match) => parseLrcTimestamp(match[1]))
        .filter((start) => start !== null)
        .map((start) => ({ start, text: lyricText }));
    })
    .sort((first, second) => first.start - second.start);
}

module.exports = { parseLrcLines, parseLrcTimestamp };
