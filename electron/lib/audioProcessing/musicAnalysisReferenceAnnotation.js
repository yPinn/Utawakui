'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const contractValues = require('../../../shared/musicStructureContractValues.json');
const { atomicWriteJson } = require('../atomicWrite');
const {
  loadMusicAnalysisRunConfig,
} = require('./musicAnalysisBenchmarkReview');

const MAX_WORKLIST_BYTES = 8 * 1024 * 1024;
const MAX_SESSIONS = 8;
const REFERENCE_FILENAME = 'reference-worklist.json';
const ALLOWED_ROLES = Object.freeze(
  contractValues.canonicalSectionRoles.filter((role) => role !== 'unknown'),
);
const ALLOWED_ROLE_SET = new Set(ALLOWED_ROLES);
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
}

function readBoundedJson(filePath) {
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(filePath, 'r');
    const stats = fs.fstatSync(fileDescriptor);
    if (!stats.isFile()) throw new Error('reference worklist is missing');
    if (stats.size > MAX_WORKLIST_BYTES) {
      throw new Error('reference worklist is too large');
    }
    const buffer = Buffer.allocUnsafe(MAX_WORKLIST_BYTES + 1);
    const bytesRead = fs.readSync(
      fileDescriptor,
      buffer,
      0,
      MAX_WORKLIST_BYTES + 1,
      0,
    );
    if (bytesRead > MAX_WORKLIST_BYTES) {
      throw new Error('reference worklist is too large');
    }
    return JSON.parse(buffer.toString('utf8', 0, bytesRead));
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

function validateReferenceBpm(value) {
  if (
    value !== null &&
    (!Number.isFinite(value) ||
      value < contractValues.minBpm ||
      value > contractValues.maxBpm)
  ) {
    throw new TypeError('reference BPM is invalid');
  }
  return value;
}

function validateReferenceSections(sections, durationMs) {
  if (
    !Array.isArray(sections) ||
    sections.length > contractValues.maxSections
  ) {
    throw new TypeError('reference sections are invalid');
  }
  for (const [index, section] of sections.entries()) {
    assertExactKeys(
      section,
      ['startMs', 'endMs', 'role'],
      `reference section ${index}`,
    );
    if (
      !Number.isSafeInteger(section.startMs) ||
      !Number.isSafeInteger(section.endMs) ||
      section.startMs < 0 ||
      section.endMs <= section.startMs ||
      section.endMs > durationMs ||
      (section.role !== null && !ALLOWED_ROLE_SET.has(section.role))
    ) {
      throw new TypeError(`reference section ${index} is invalid`);
    }
    if (
      (index === 0 && section.startMs !== 0) ||
      (index > 0 && section.startMs !== sections[index - 1].endMs)
    ) {
      throw new TypeError('reference sections must be contiguous');
    }
  }
  if (sections.length > 0 && sections.at(-1).endMs !== durationMs) {
    throw new TypeError('reference sections must cover the full duration');
  }
  return sections.map((section) => ({ ...section }));
}

function isComplete(referenceCase) {
  return (
    referenceCase.referenceBpm !== null &&
    referenceCase.referenceSections.length >= 2 &&
    referenceCase.referenceSections.every((section) =>
      ALLOWED_ROLE_SET.has(section.role),
    )
  );
}

function blankCase(runCase) {
  return {
    id: runCase.benchmarkCaseId,
    tags: [...runCase.tags],
    durationMs: runCase.durationMs,
    referenceBpm: null,
    referenceSections: [],
  };
}

function validateCases(cases, runConfig, label) {
  if (!Array.isArray(cases) || cases.length !== runConfig.cases.length) {
    throw new TypeError(`${label} cases do not match the run config`);
  }
  const byId = new Map(
    runConfig.cases.map((runCase) => [runCase.benchmarkCaseId, runCase]),
  );
  const seen = new Set();
  return cases.map((referenceCase, index) => {
    assertExactKeys(
      referenceCase,
      ['id', 'tags', 'durationMs', 'referenceBpm', 'referenceSections'],
      `${label} case ${index}`,
    );
    if (!COMPONENT_RE.test(referenceCase.id || '')) {
      throw new TypeError(`${label} case id is invalid`);
    }
    const runCase = byId.get(referenceCase.id);
    if (!runCase || seen.has(referenceCase.id)) {
      throw new TypeError(`${label} case is absent from run config`);
    }
    seen.add(referenceCase.id);
    if (
      referenceCase.durationMs !== runCase.durationMs ||
      JSON.stringify(referenceCase.tags) !== JSON.stringify(runCase.tags)
    ) {
      throw new TypeError(`${label} case does not match the run config`);
    }
    return {
      id: referenceCase.id,
      tags: [...runCase.tags],
      durationMs: runCase.durationMs,
      referenceBpm: validateReferenceBpm(referenceCase.referenceBpm),
      referenceSections: validateReferenceSections(
        referenceCase.referenceSections,
        runCase.durationMs,
      ),
    };
  });
}

function validateWorklist(value, runConfig) {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'benchmarkId',
      'annotationState',
      'allowedRoles',
      'cases',
    ],
    'reference worklist',
  );
  if (
    value.schemaVersion !== 1 ||
    value.benchmarkId !== runConfig.benchmarkId ||
    !['draft', 'complete'].includes(value.annotationState) ||
    JSON.stringify(value.allowedRoles) !== JSON.stringify(ALLOWED_ROLES)
  ) {
    throw new TypeError('reference worklist identity is invalid');
  }
  return validateCases(value.cases, runConfig, 'reference worklist');
}

function validateSavePayload(payload, runConfig) {
  assertExactKeys(payload, ['sessionId', 'cases'], 'reference save request');
  if (typeof payload.sessionId !== 'string' || !payload.sessionId) {
    throw new TypeError('reference annotation session is invalid');
  }
  if (!Array.isArray(payload.cases)) {
    throw new TypeError('reference save cases are invalid');
  }
  const hydratedCases = payload.cases.map((referenceCase) => {
    assertExactKeys(
      referenceCase,
      ['id', 'referenceBpm', 'referenceSections'],
      'reference save case',
    );
    const runCase = runConfig.cases.find(
      (item) => item.benchmarkCaseId === referenceCase.id,
    );
    if (!runCase) {
      throw new TypeError('reference save case is absent from run config');
    }
    return {
      id: referenceCase.id,
      tags: [...runCase.tags],
      durationMs: runCase.durationMs,
      referenceBpm: referenceCase.referenceBpm,
      referenceSections: referenceCase.referenceSections,
    };
  });
  return validateCases(hydratedCases, runConfig, 'reference save');
}

function createProjection(sessionId, runConfig, cases) {
  const runCases = new Map(
    runConfig.cases.map((runCase) => [runCase.benchmarkCaseId, runCase]),
  );
  const projectedCases = cases.map((referenceCase) => {
    const runCase = runCases.get(referenceCase.id);
    const referenceSections =
      referenceCase.referenceSections.length > 0
        ? referenceCase.referenceSections.map((section) => ({ ...section }))
        : [
            {
              startMs: 0,
              endMs: referenceCase.durationMs,
              role: null,
            },
          ];
    const projected = {
      id: referenceCase.id,
      trackId: runCase.trackId,
      tags: [...referenceCase.tags],
      durationMs: referenceCase.durationMs,
      referenceBpm: referenceCase.referenceBpm,
      referenceSections,
    };
    return { ...projected, complete: isComplete(projected) };
  });
  return {
    schemaVersion: 1,
    sessionId,
    benchmarkId: runConfig.benchmarkId,
    annotationState: projectedCases.every((item) => item.complete)
      ? 'complete'
      : 'draft',
    allowedRoles: [...ALLOWED_ROLES],
    cases: projectedCases,
  };
}

function createMusicAnalysisReferenceAnnotationService(options = {}) {
  const randomUUID = options.randomUUID ?? crypto.randomUUID;
  const sessions = new Map();

  function open(configPath, openOptions = {}) {
    const runConfig = loadMusicAnalysisRunConfig(configPath, openOptions);
    const worklistPath = path.join(runConfig.outputRoot, REFERENCE_FILENAME);
    const cases = fs.existsSync(worklistPath)
      ? validateWorklist(readBoundedJson(worklistPath), runConfig)
      : runConfig.cases.map(blankCase);
    const sessionId = randomUUID();
    sessions.set(sessionId, { runConfig, worklistPath });
    while (sessions.size > MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value);
    }
    return createProjection(sessionId, runConfig, cases);
  }

  function save(payload) {
    if (!isPlainObject(payload) || typeof payload.sessionId !== 'string') {
      throw new TypeError('reference annotation session is invalid');
    }
    const session = sessions.get(payload.sessionId);
    if (!session) throw new Error('reference annotation session expired');
    const cases = validateSavePayload(payload, session.runConfig);
    const projection = createProjection(
      payload.sessionId,
      session.runConfig,
      cases,
    );
    const persisted = {
      schemaVersion: 1,
      benchmarkId: session.runConfig.benchmarkId,
      annotationState: projection.annotationState,
      allowedRoles: [...ALLOWED_ROLES],
      cases,
    };
    if (Buffer.byteLength(JSON.stringify(persisted)) > MAX_WORKLIST_BYTES) {
      throw new Error('reference worklist is too large');
    }
    fs.mkdirSync(path.dirname(session.worklistPath), { recursive: true });
    atomicWriteJson(session.worklistPath, persisted);
    return projection;
  }

  return { open, save };
}

module.exports = {
  ALLOWED_ROLES,
  createMusicAnalysisReferenceAnnotationService,
};
