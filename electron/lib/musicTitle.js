'use strict';

const {
  normalizeForCompare: normalizeLexicalKey,
  normalizeText,
} = require('./musicIdentity/text.js');

const DECORATION_WORD_PATTERN = String.raw`official|music\s+video|mv|lyrics?|audio|visualizer|official\s+audio|official\s+lyrics?`;
const COMPARE_DECORATION_WORD_PATTERN = String.raw`official|music|video|mv|lyrics?|audio|visualizer|live|session`;
const CHANNEL_ARTIST_PATTERN = [
  String.raw`\b(?:music|records?|official|channel|vevo|label|entertainment|media|studio|team|inc|llc|ltd|corp)\b`,
  String.raw`(?:\u97f3\u6a02|\u97f3\u4e50|\u5531\u7247|\u5a1b\u6a02|\u5a31\u4e50|\u5b98\u65b9)`,
  String.raw`(?:\u30c1\u30e3\u30f3\u30cd\u30eb|\u30df\u30e5\u30fc\u30b8\u30c3\u30af)`,
  String.raw`(?:\ubba4\uc9c1|\uc5d4\ud130\ud14c\uc778\uba3c\ud2b8)`,
].join('|');

const CHANNEL_ARTIST_RE = new RegExp(CHANNEL_ARTIST_PATTERN, 'iu');
// Used by importResolver.js to score candidates — kept in one place after
// two separate definitions drifted apart (only one of them matched bare
// "official video" without "music"/"mv").
const OFFICIAL_MV_TITLE_RE =
  /\b(?:official\s+)?(?:music\s+video|mv)\b|\bofficial\s+video\b/iu;
const BRACKET_PAIRS = [
  ['\\[', '\\]'],
  ['\\(', '\\)'],
  ['\\{', '\\}'],
  ['\\u3010', '\\u3011'],
  ['\\u300a', '\\u300b'],
  ['\\u3008', '\\u3009'],
  ['\\u300c', '\\u300d'],
];
const TITLE_BRACKET_PAIRS = [
  ['\\u3010', '\\u3011'],
  ['\\u300a', '\\u300b'],
  ['\\u3008', '\\u3009'],
  ['\\u300c', '\\u300d'],
];

function normalizeForCompare(value) {
  const withoutDecorations = normalizeText(value)
    .normalize('NFKC')
    .replace(
      new RegExp(String.raw`\b(${COMPARE_DECORATION_WORD_PATTERN})\b`, 'giu'),
      ' ',
    );
  return normalizeLexicalKey(withoutDecorations);
}

function stripTrackDecorations(value) {
  let title = normalizeText(value);
  for (const [open, close] of BRACKET_PAIRS) {
    title = title.replace(
      new RegExp(
        `${open}[\\s\\S]*?(?:${DECORATION_WORD_PATTERN})[\\s\\S]*?${close}`,
        'giu',
      ),
      '',
    );
  }
  return title
    .replace(
      new RegExp(String.raw`\b(?:official\s+)?music\s+video\b`, 'giu'),
      '',
    )
    .replace(new RegExp(String.raw`\bofficial\s+mv\b`, 'giu'), '')
    .replace(new RegExp(String.raw`\bmv\b`, 'giu'), '')
    .replace(new RegExp(String.raw`\bofficial\s+audio\b`, 'giu'), '')
    .replace(new RegExp(String.raw`\bofficial\s+lyrics?\b`, 'giu'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripParenthesizedDecorations(value) {
  let title = normalizeText(value);
  for (const [open, close] of BRACKET_PAIRS) {
    title = title.replace(new RegExp(`${open}[\\s\\S]*?${close}`, 'gu'), '');
  }
  return title.replace(/\s+/g, ' ').trim();
}

function looksLikeChannelArtist(value) {
  return CHANNEL_ARTIST_RE.test(normalizeText(value));
}

function addUniqueValue(values, value) {
  const normalized = normalizeText(value);
  if (!normalized) return;
  const key = normalizeForCompare(normalized);
  if (
    !key ||
    values.some((existing) => normalizeForCompare(existing) === key)
  ) {
    return;
  }
  values.push(normalized);
}

function splitArtistVariants(value) {
  const variants = [];
  const artistName = normalizeText(value);
  addUniqueValue(variants, artistName);

  const parentheticalMatches = [
    ...artistName.matchAll(/\(([^)]+)\)|\uFF08([^\uFF09]+)\uFF09/gu),
  ];
  parentheticalMatches.forEach((match) => {
    addUniqueValue(variants, match[1] || match[2]);
  });

  addUniqueValue(
    variants,
    artistName.replace(/\s*[(\uFF08][^)\uFF09]+[)\uFF09]\s*/gu, ' '),
  );
  return variants;
}

function extractBracketTitleParts(rawTitle) {
  const parts = [];
  for (const [open, close] of TITLE_BRACKET_PAIRS) {
    const pattern = new RegExp(
      `^(?<artist>.+?)\\s*${open}(?<title>[\\s\\S]+?)${close}`,
      'u',
    );
    const match = pattern.exec(rawTitle);
    if (match?.groups?.artist && match?.groups?.title) {
      parts.push({
        trackName: stripTrackDecorations(match.groups.title),
        artistNames: splitArtistVariants(match.groups.artist),
      });
    }
  }
  return parts;
}

function extractDashTitlePart(rawTitle) {
  const dashMatch = /^(.+?)\s[-\u2013\u2014]\s(.+)$/.exec(rawTitle);
  if (!dashMatch) return null;
  return {
    trackName: stripParenthesizedDecorations(
      stripTrackDecorations(dashMatch[2]),
    ),
    artistNames: splitArtistVariants(dashMatch[1]),
  };
}

function extractTitleDerivedSearchParts(title) {
  const rawTitle = stripTrackDecorations(title);
  const parts = [...extractBracketTitleParts(rawTitle)];
  const dashPart = extractDashTitlePart(rawTitle);
  if (dashPart) parts.push(dashPart);
  return parts.filter((part) => part.trackName);
}

module.exports = {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  normalizeText,
  OFFICIAL_MV_TITLE_RE,
  splitArtistVariants,
  stripParenthesizedDecorations,
  stripTrackDecorations,
};
