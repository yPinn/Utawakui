import OpenCC from 'opencc-js/cn2t';
import { detectLyricsScript } from './lyrics.js';

export const LYRICS_TEXT_VARIANTS = Object.freeze({
  ORIGINAL: 'original',
  TAIWAN_TRADITIONAL: 'traditional-tw',
});

export const DEFAULT_LYRICS_TEXT_VARIANT =
  LYRICS_TEXT_VARIANTS.TAIWAN_TRADITIONAL;

const MAX_DOCUMENT_ID_LENGTH = 200;
const TAIWAN_TRADITIONAL_DOCUMENT_SUFFIX = '~s2tw-v1';
let toTaiwanTraditional = null;

function defaultTaiwanTraditionalConverter(value) {
  toTaiwanTraditional ??= OpenCC.Converter({ from: 'cn', to: 'tw' });
  return toTaiwanTraditional(value);
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function variantDocumentId(documentId) {
  const source = String(documentId || 'lyrics');
  const identitySuffix = `${TAIWAN_TRADITIONAL_DOCUMENT_SUFFIX}-${stableHash(
    source,
  )}`;
  return `${source.slice(
    0,
    MAX_DOCUMENT_ID_LENGTH - identitySuffix.length,
  )}${identitySuffix}`;
}

function splitConvertedTextBySegments(line, convertedText, convert) {
  const segments = Array.isArray(line.segments) ? line.segments : null;
  if (!segments) return null;

  const sourceText = segments.map((segment) => segment.text).join('');
  const sourceCharacters = Array.from(sourceText);
  const convertedCharacters = Array.from(convertedText);
  if (
    sourceText === line.text &&
    sourceCharacters.length === convertedCharacters.length
  ) {
    let cursor = 0;
    return segments.map((segment) => {
      const length = Array.from(segment.text).length;
      const text = convertedCharacters.slice(cursor, cursor + length).join('');
      cursor += length;
      return text === segment.text ? segment : { ...segment, text };
    });
  }

  return segments.map((segment) => {
    const text = convert(segment.text);
    return text === segment.text ? segment : { ...segment, text };
  });
}

function convertLine(line, convert) {
  const convertedText = convert(line.text);
  const segments = splitConvertedTextBySegments(line, convertedText, convert);
  const text = segments
    ? segments.map((segment) => segment.text).join('')
    : convertedText;
  if (
    text === line.text &&
    segments?.every((item, index) => item === line.segments[index])
  ) {
    return line;
  }
  if (text === line.text && !segments) return line;
  return {
    ...line,
    text,
    ...(segments ? { segments } : {}),
  };
}

export function projectLyricsTextVariant(document, options = {}) {
  const variant = options.variant ?? DEFAULT_LYRICS_TEXT_VARIANT;
  if (
    variant !== LYRICS_TEXT_VARIANTS.TAIWAN_TRADITIONAL ||
    !Array.isArray(document?.lines)
  ) {
    return document;
  }

  const sourceText = document.lines.map((line) => line.text).join('\n');
  if (detectLyricsScript(sourceText) !== 'zh') return document;

  const convert = options.convert ?? defaultTaiwanTraditionalConverter;
  const lines = document.lines.map((line) => convertLine(line, convert));
  if (lines.every((line, index) => line === document.lines[index])) {
    return document;
  }
  return {
    ...document,
    documentId: variantDocumentId(document.documentId),
    lines,
  };
}
