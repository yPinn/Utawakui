'use strict';

const contractValues = require('../../shared/musicStructureContractValues.json');

const MUSIC_STRUCTURE_SCHEMA_VERSION = contractValues.schemaVersion;
const MUSIC_STRUCTURE_OVERRIDE_SCHEMA_VERSION =
  contractValues.overrideSchemaVersion;
const CANONICAL_SECTION_ROLES = new Set(contractValues.canonicalSectionRoles);
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

class MusicStructureValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MusicStructureValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MusicStructureValidationError(code, message);
}

function assertPlainObject(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail('INVALID_DOCUMENT', `${label} must be a plain object`);
  }
  return value;
}

function assertKeys(value, label, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail('INVALID_DOCUMENT', `${label} has an unexpected field`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      fail('INVALID_DOCUMENT', `${label} is missing field: ${key}`);
    }
  }
}

function assertDocumentSize(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail('INVALID_DOCUMENT', `${label} is not serializable`);
  }
  if (
    typeof serialized !== 'string' ||
    Buffer.byteLength(serialized, 'utf8') > contractValues.maxDocumentBytes
  ) {
    fail('INVALID_DOCUMENT', `${label} is too large`);
  }
}

function validateId(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > contractValues.maxIdLength ||
    !ID_RE.test(value)
  ) {
    fail('INVALID_DOCUMENT', `${label} is invalid`);
  }
  return value;
}

function validateSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    fail('INVALID_DOCUMENT', `${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function validateBoundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('INVALID_DOCUMENT', `${label} must be a bounded integer`);
  }
  return value;
}

function validateBpm(value, label) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < contractValues.minBpm ||
    value > contractValues.maxBpm
  ) {
    fail('INVALID_DOCUMENT', `${label} is outside the supported BPM range`);
  }
  return value;
}

function validateConfidence(value, label) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < contractValues.minConfidence ||
    value > contractValues.maxConfidence
  ) {
    fail('INVALID_DOCUMENT', `${label} must be between 0 and 1`);
  }
  return value;
}

function validateIsoDate(value, label) {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('INVALID_DOCUMENT', `${label} must be an ISO timestamp`);
  }
  return value;
}

function validateRawLabel(value, label) {
  const hasControlCharacter =
    typeof value === 'string' &&
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 0x1f || codePoint === 0x7f;
    });
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > contractValues.maxRawLabelLength ||
    hasControlCharacter
  ) {
    fail('INVALID_DOCUMENT', `${label} is invalid`);
  }
  return value;
}

function validateSource(rawSource, options) {
  const source = assertPlainObject(rawSource, 'source');
  assertKeys(source, 'source', ['sha256', 'durationMs']);
  const sha256 = validateSha256(source.sha256, 'source.sha256');
  const durationMs = validateBoundedInteger(
    source.durationMs,
    'source.durationMs',
    0,
    contractValues.maxDurationMs,
  );

  if (options.sourceSha256 !== undefined && sha256 !== options.sourceSha256) {
    fail('STALE_SOURCE', 'source fingerprint does not match current audio');
  }
  if (
    options.sourceDurationMs !== undefined &&
    durationMs !== options.sourceDurationMs
  ) {
    fail('STALE_SOURCE', 'source duration does not match current audio');
  }
  return { sha256, durationMs };
}

function validateAnalyzer(rawAnalyzer) {
  const analyzer = assertPlainObject(rawAnalyzer, 'analyzer');
  assertKeys(analyzer, 'analyzer', [
    'contractVersion',
    'id',
    'profileId',
    'environmentLock',
    'modelIds',
    'completedAt',
  ]);
  if (analyzer.contractVersion !== contractValues.analyzerContractVersion) {
    fail('UNSUPPORTED_VERSION', 'unsupported analyzer contract version');
  }
  if (
    !Array.isArray(analyzer.modelIds) ||
    analyzer.modelIds.length > contractValues.maxModelIds
  ) {
    fail('INVALID_DOCUMENT', 'analyzer.modelIds must be a bounded array');
  }
  const modelIds = analyzer.modelIds.map((modelId, index) =>
    validateId(modelId, `analyzer.modelIds[${index}]`),
  );
  if (new Set(modelIds).size !== modelIds.length) {
    fail('INVALID_DOCUMENT', 'analyzer.modelIds must be unique');
  }
  return {
    contractVersion: contractValues.analyzerContractVersion,
    id: validateId(analyzer.id, 'analyzer.id'),
    profileId: validateId(analyzer.profileId, 'analyzer.profileId'),
    environmentLock: validateSha256(
      analyzer.environmentLock,
      'analyzer.environmentLock',
    ),
    modelIds,
    completedAt: validateIsoDate(analyzer.completedAt, 'analyzer.completedAt'),
  };
}

function validateTempo(rawTempo) {
  if (rawTempo === null) return null;
  const tempo = assertPlainObject(rawTempo, 'tempo');
  assertKeys(tempo, 'tempo', ['bpm'], ['confidence']);
  return {
    bpm: validateBpm(tempo.bpm, 'tempo.bpm'),
    ...(tempo.confidence === undefined
      ? {}
      : {
          confidence: validateConfidence(tempo.confidence, 'tempo.confidence'),
        }),
  };
}

function maxCueTime(durationMs) {
  return Math.min(
    contractValues.maxDurationMs,
    durationMs + contractValues.durationToleranceMs,
  );
}

function validateBeats(rawBeats, durationMs) {
  if (!Array.isArray(rawBeats) || rawBeats.length > contractValues.maxBeats) {
    fail('INVALID_DOCUMENT', 'beats must be a bounded array');
  }
  let previousTimeMs = -1;
  return rawBeats.map((rawBeat, index) => {
    const beat = assertPlainObject(rawBeat, `beat ${index}`);
    assertKeys(
      beat,
      `beat ${index}`,
      ['timeMs'],
      ['positionInBar', 'downbeat', 'confidence'],
    );
    const timeMs = validateBoundedInteger(
      beat.timeMs,
      `beat ${index} timeMs`,
      0,
      maxCueTime(durationMs),
    );
    if (timeMs <= previousTimeMs) {
      fail('INVALID_DOCUMENT', 'beat times must be strictly monotonic');
    }
    previousTimeMs = timeMs;
    if (beat.downbeat !== undefined && typeof beat.downbeat !== 'boolean') {
      fail('INVALID_DOCUMENT', `beat ${index} downbeat must be boolean`);
    }
    return {
      timeMs,
      ...(beat.positionInBar === undefined
        ? {}
        : {
            positionInBar: validateBoundedInteger(
              beat.positionInBar,
              `beat ${index} positionInBar`,
              1,
              contractValues.maxBeatsPerBar,
            ),
          }),
      ...(beat.downbeat === undefined ? {} : { downbeat: beat.downbeat }),
      ...(beat.confidence === undefined
        ? {}
        : {
            confidence: validateConfidence(
              beat.confidence,
              `beat ${index} confidence`,
            ),
          }),
    };
  });
}

function validateSections(rawSections, durationMs, label = 'section') {
  if (
    !Array.isArray(rawSections) ||
    rawSections.length > contractValues.maxSections
  ) {
    fail('INVALID_DOCUMENT', `${label}s must be a bounded array`);
  }
  const usedIds = new Set();
  let previousEndMs = 0;
  return rawSections.map((rawSection, index) => {
    const section = assertPlainObject(rawSection, `${label} ${index}`);
    const analyzerFields =
      label === 'section' ? ['rawLabel', 'confidence'] : [];
    assertKeys(
      section,
      `${label} ${index}`,
      ['sectionId', 'startMs', 'endMs', 'role'],
      analyzerFields,
    );
    const sectionId = validateId(section.sectionId, `${label} ${index} id`);
    if (usedIds.has(sectionId)) {
      fail('INVALID_DOCUMENT', `duplicate ${label} id: ${sectionId}`);
    }
    usedIds.add(sectionId);
    const startMs = validateBoundedInteger(
      section.startMs,
      `${label} ${index} startMs`,
      0,
      maxCueTime(durationMs),
    );
    const endMs = validateBoundedInteger(
      section.endMs,
      `${label} ${index} endMs`,
      0,
      maxCueTime(durationMs),
    );
    if (endMs <= startMs) {
      fail('INVALID_DOCUMENT', `${label} ${index} must have positive duration`);
    }
    if (index > 0 && startMs < previousEndMs) {
      fail('INVALID_DOCUMENT', `${label}s cannot overlap`);
    }
    previousEndMs = endMs;
    if (!CANONICAL_SECTION_ROLES.has(section.role)) {
      fail('INVALID_DOCUMENT', `${label} ${index} role is not canonical`);
    }
    return {
      sectionId,
      startMs,
      endMs,
      role: section.role,
      ...(section.rawLabel === undefined
        ? {}
        : {
            rawLabel: validateRawLabel(
              section.rawLabel,
              `${label} ${index} rawLabel`,
            ),
          }),
      ...(section.confidence === undefined
        ? {}
        : {
            confidence: validateConfidence(
              section.confidence,
              `${label} ${index} confidence`,
            ),
          }),
    };
  });
}

function validateMusicStructureDocument(rawDocument, options = {}) {
  const document = assertPlainObject(rawDocument, 'music structure document');
  assertKeys(document, 'music structure document', [
    'schemaVersion',
    'source',
    'analyzer',
    'tempo',
    'beats',
    'sections',
  ]);
  if (document.schemaVersion !== MUSIC_STRUCTURE_SCHEMA_VERSION) {
    fail('UNSUPPORTED_VERSION', 'unsupported music structure schema version');
  }
  const source = validateSource(document.source, options);
  const validated = {
    schemaVersion: MUSIC_STRUCTURE_SCHEMA_VERSION,
    source,
    analyzer: validateAnalyzer(document.analyzer),
    tempo: validateTempo(document.tempo),
    beats: validateBeats(document.beats, source.durationMs),
    sections: validateSections(document.sections, source.durationMs),
  };
  assertDocumentSize(validated, 'music structure document');
  return validated;
}

function validateTempoOverride(rawTempoOverride, durationMs) {
  if (rawTempoOverride === null) return null;
  const tempo = assertPlainObject(rawTempoOverride, 'tempoOverride');
  assertKeys(tempo, 'tempoOverride', ['bpm', 'anchorTimeMs', 'beatsPerBar']);
  return {
    bpm: validateBpm(tempo.bpm, 'tempoOverride.bpm'),
    anchorTimeMs: validateBoundedInteger(
      tempo.anchorTimeMs,
      'tempoOverride.anchorTimeMs',
      0,
      maxCueTime(durationMs),
    ),
    beatsPerBar: validateBoundedInteger(
      tempo.beatsPerBar,
      'tempoOverride.beatsPerBar',
      1,
      contractValues.maxBeatsPerBar,
    ),
  };
}

function validateMusicStructureOverrides(rawDocument, options = {}) {
  const document = assertPlainObject(rawDocument, 'music structure overrides');
  assertKeys(document, 'music structure overrides', [
    'schemaVersion',
    'source',
    'updatedAt',
    'tempoOverride',
    'sectionOverrides',
  ]);
  if (document.schemaVersion !== MUSIC_STRUCTURE_OVERRIDE_SCHEMA_VERSION) {
    fail('UNSUPPORTED_VERSION', 'unsupported music structure override schema');
  }
  const source = validateSource(document.source, options);
  const validated = {
    schemaVersion: MUSIC_STRUCTURE_OVERRIDE_SCHEMA_VERSION,
    source,
    updatedAt: validateIsoDate(document.updatedAt, 'updatedAt'),
    tempoOverride: validateTempoOverride(
      document.tempoOverride,
      source.durationMs,
    ),
    sectionOverrides: validateSections(
      document.sectionOverrides,
      source.durationMs,
      'section override',
    ),
  };
  assertDocumentSize(validated, 'music structure overrides');
  return validated;
}

function m0Fallback(reason) {
  return { level: 'M0', reason, tempo: null, beats: [], sections: [] };
}

function evaluateM2Sections(sections, durationMs) {
  if (sections.length === 0) return 'missing';
  if (sections.some((section) => section.role === 'unknown')) return 'unknown';
  if (
    sections.some(
      (section) =>
        !Number.isFinite(section.confidence) ||
        section.confidence < contractValues.minM2SectionConfidence,
    )
  ) {
    return 'low-confidence';
  }
  if (
    sections[0].startMs !== 0 ||
    sections.some(
      (section, index) =>
        index > 0 && section.startMs !== sections[index - 1].endMs,
    ) ||
    Math.abs(sections.at(-1).endMs - durationMs) >
      contractValues.durationToleranceMs
  ) {
    return 'incomplete';
  }
  return 'current';
}

function resolveMusicStructureSignals(rawDocument, options = {}) {
  if (rawDocument === null || rawDocument === undefined) {
    return m0Fallback('missing');
  }
  if (
    typeof options.sourceSha256 !== 'string' ||
    !SHA256_RE.test(options.sourceSha256) ||
    !Number.isSafeInteger(options.sourceDurationMs) ||
    options.sourceDurationMs < 0 ||
    options.sourceDurationMs > contractValues.maxDurationMs
  ) {
    return m0Fallback('unavailable-source');
  }
  let document;
  try {
    document = validateMusicStructureDocument(rawDocument, options);
  } catch (error) {
    return m0Fallback(
      error instanceof MusicStructureValidationError &&
        error.code === 'STALE_SOURCE'
        ? 'stale'
        : 'invalid',
    );
  }
  const sectionStatus = evaluateM2Sections(
    document.sections,
    document.source.durationMs,
  );
  const sections = sectionStatus === 'current' ? document.sections : [];
  const level =
    sections.length > 0
      ? 'M2'
      : document.tempo !== null || document.beats.length > 0
        ? 'M1'
        : 'M0';
  if (level === 'M0') return m0Fallback('no-signal');
  return {
    level,
    reason: 'current',
    tempo: document.tempo,
    beats: document.beats,
    sections,
    sectionStatus,
  };
}

module.exports = {
  MUSIC_STRUCTURE_OVERRIDE_SCHEMA_VERSION,
  MUSIC_STRUCTURE_SCHEMA_VERSION,
  MusicStructureValidationError,
  evaluateM2Sections,
  resolveMusicStructureSignals,
  validateMusicStructureDocument,
  validateMusicStructureOverrides,
};
