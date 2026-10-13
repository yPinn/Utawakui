'use strict';

const { parseFile } = require('music-metadata');
const {
  MAX_ARTWORK_BYTES,
  hasValidArtworkDimensions,
  inspectArtworkImage,
} = require('../artwork/image');
const { AUDIO_CONVERSION_FORMATS, AUDIO_FORMATS } = require('./constants');

const MAX_METADATA_TEXT_LENGTH = 500;
const FORMAT_FAMILY_MATCHERS = Object.freeze({
  'adts-aac': {
    container: /^ADTS\/MPEG-(?:2|4)$/iu,
    codec: /^AAC$/iu,
  },
  flac: {
    container: /^FLAC$/iu,
    codec: /^FLAC$/iu,
  },
  'mp4-aac': {
    container: /\b(?:m4a|mp4|isom|quicktime)\b/iu,
    codec: /^(?:MPEG-4\/)?AAC(?:\s+(?:LC|HE(?:-AAC)?))?$/iu,
  },
  mp3: {
    container: /^MPEG$/iu,
    codec: /^(?:MPEG\s+\d(?:\.\d)?\s+)?Layer\s*3$|^MP3$/iu,
  },
  'ogg-audio': {
    container: /^Ogg$/iu,
    codec: /^(?:Opus|Vorbis(?:\s+I)?)$/iu,
  },
  'ogg-opus': {
    container: /^Ogg$/iu,
    codec: /^Opus$/iu,
  },
  wave: {
    container: /^WAVE$/iu,
    codec: /^(?:PCM|IEEE_FLOAT|MULAW)$/iu,
  },
  'webm-audio': {
    container: /(?:^|\/)webm(?:$|\/)/iu,
    codec: /^(?:Opus|Vorbis)$/iu,
  },
});
const CONVERSION_FAMILY_MATCHERS = Object.freeze({
  'asf-wma': {
    container: /^ASF\/audio$/iu,
    codec: /^(?:WMA|Windows Media Audio)(?:\b|\s)/iu,
  },
  aiff: {
    container: /^AIFF(?:-C)?$/iu,
    codec:
      /^(?:PCM|PCM \(byte swapped\)|not compressed\b|(?:32|64)-bit floating point\b|Float 32\b|ALaw\b|µLaw\b|CCITT G\.711\b)/iu,
  },
  'monkeys-audio': {
    container: /^Monkey's Audio$/iu,
    codec: /^Monkey's Audio$/iu,
  },
  wavpack: {
    container: /^WavPack$/iu,
    codec: /^PCM$/iu,
  },
  caf: {
    container: /^CAF$/iu,
    codec:
      /^(?:PCM|IMA4 ADPCM|ALAC|FLAC|ITU-T G\.711 (?:mu|A)-law|MPEG-1 Layer I{1,3}|AAC)$/iu,
  },
});
const ALAC_CONVERSION_MATCHER = Object.freeze({
  container: /\b(?:m4a|mp4|isom|quicktime)\b/iu,
  codec: /^ALAC$/iu,
  sourceFormat: 'alac',
});

const ERROR_MESSAGES = Object.freeze({
  'format-mismatch': 'Local audio format does not match its extension',
  'unsupported-codec': 'Local audio codec is not supported',
  'unsupported-media': 'Local media contains unsupported streams',
  'conversion-required': 'Local audio requires compatibility conversion',
  'invalid-audio': 'Local audio metadata could not be read',
});

class LocalAudioMetadataError extends Error {
  constructor(code, cause, details = {}) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES['invalid-audio']);
    this.name = 'LocalAudioMetadataError';
    this.code = code;
    this.cause = cause;
    if (typeof details.sourceFormat === 'string') {
      this.sourceFormat = details.sourceFormat;
    }
  }
}

function boundedText(value) {
  return typeof value === 'string'
    ? value.trim().slice(0, MAX_METADATA_TEXT_LENGTH)
    : '';
}

function normalizedArtist(common = {}) {
  const artist = boundedText(common.artist);
  if (artist) return artist;
  if (!Array.isArray(common.artists)) return '';
  return boundedText(
    common.artists.map(boundedText).filter(Boolean).join(', '),
  );
}

function normalizedReleaseYear(common = {}) {
  const value = Number(common.year);
  return Number.isInteger(value) && value >= 1000 && value <= 9999
    ? value
    : undefined;
}

function normalizedArtwork(common = {}) {
  if (!Array.isArray(common.picture)) return undefined;
  for (const picture of common.picture) {
    let buffer;
    try {
      buffer = Buffer.from(picture?.data || []);
    } catch {
      continue;
    }
    if (buffer.length === 0 || buffer.length > MAX_ARTWORK_BYTES) continue;
    const image = inspectArtworkImage(buffer);
    if (!image || !hasValidArtworkDimensions(image)) continue;
    return { buffer, extension: image.extension };
  }
  return undefined;
}

function formatDescriptor(format) {
  return {
    container: boundedText(format?.container),
    codec: boundedText(format?.codec),
  };
}

function assertAudioShape(format) {
  if (format?.hasVideo === true || format?.hasAudio === false) {
    throw new LocalAudioMetadataError('unsupported-media');
  }
}

function matchesFormat(matcher, descriptor) {
  return Boolean(
    matcher?.container.test(descriptor.container) &&
    matcher.codec.test(descriptor.codec),
  );
}

function conversionMatcherFor(extension) {
  if (extension === '.m4a') return ALAC_CONVERSION_MATCHER;
  const format = AUDIO_CONVERSION_FORMATS[extension];
  if (!format) return null;
  return {
    ...CONVERSION_FAMILY_MATCHERS[format.family],
    sourceFormat: format.sourceFormat,
  };
}

function classifyFormat(format, extension) {
  assertAudioShape(format);
  const descriptor = formatDescriptor(format);
  const family = AUDIO_FORMATS[extension]?.family;
  const directMatcher = FORMAT_FAMILY_MATCHERS[family];
  if (matchesFormat(directMatcher, descriptor)) return { kind: 'direct' };

  const conversionMatcher = conversionMatcherFor(extension);
  if (matchesFormat(conversionMatcher, descriptor)) {
    return {
      kind: 'conversion',
      sourceFormat: conversionMatcher.sourceFormat,
    };
  }

  const recognizedContainer =
    directMatcher?.container.test(descriptor.container) ||
    conversionMatcher?.container.test(descriptor.container);
  if (recognizedContainer) {
    throw new LocalAudioMetadataError('unsupported-codec');
  }
  throw new LocalAudioMetadataError('format-mismatch');
}

function normalizedCommonMetadata(metadata) {
  const common = metadata.common || {};
  const title = boundedText(common.title);
  const artist = normalizedArtist(common);
  const album = boundedText(common.album);
  const releaseYear = normalizedReleaseYear(common);
  const artwork = normalizedArtwork(common);

  return {
    ...(title ? { title } : {}),
    ...(artist ? { artist } : {}),
    ...(album ? { album } : {}),
    ...(releaseYear ? { releaseYear } : {}),
    ...(artwork ? { artwork } : {}),
  };
}

function classifyParsedAudioMetadata(metadata, extension) {
  const duration = Number(metadata?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new LocalAudioMetadataError('invalid-audio');
  }
  const classification = classifyFormat(metadata.format, extension);
  return {
    ...classification,
    metadata: { duration, ...normalizedCommonMetadata(metadata) },
  };
}

function normalizeParsedAudioMetadata(metadata, extension) {
  const classified = classifyParsedAudioMetadata(metadata, extension);
  if (classified.kind === 'conversion') {
    throw new LocalAudioMetadataError('conversion-required', undefined, {
      sourceFormat: classified.sourceFormat,
    });
  }
  return classified.metadata;
}

async function parseLocalAudioMetadata(filePath, extension) {
  try {
    const metadata = await parseFile(filePath, {
      duration: true,
      skipCovers: false,
    });
    return classifyParsedAudioMetadata(metadata, extension);
  } catch (error) {
    if (error instanceof LocalAudioMetadataError) throw error;
    throw new LocalAudioMetadataError('invalid-audio', error);
  }
}

async function readLocalAudioMetadata(filePath, extension) {
  const classified = await parseLocalAudioMetadata(filePath, extension);
  if (classified.kind === 'conversion') {
    throw new LocalAudioMetadataError('conversion-required', undefined, {
      sourceFormat: classified.sourceFormat,
    });
  }
  return classified.metadata;
}

module.exports = {
  LocalAudioMetadataError,
  MAX_METADATA_TEXT_LENGTH,
  classifyParsedAudioMetadata,
  normalizeParsedAudioMetadata,
  parseLocalAudioMetadata,
  readLocalAudioMetadata,
};
