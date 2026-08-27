import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  NETEASE_RUNTIME_PROFILE,
  validateNeteaseWorkerRequest,
} from './lyrics-provider-netease-runtime-contract.mjs';
import {
  createNeteaseSentinelState,
  decideNeteaseSentinelOutcome,
  recordNeteaseSentinelObservation,
  validateNeteaseSentinelState,
} from './lyrics-provider-netease-sentinel.mjs';

const LANGUAGE_GROUPS = Object.freeze(['zh', 'en', 'ja', 'ko']);
const MAX_SMOKE_CASES = 16;
const MAX_SENTINEL_STATE_BYTES = 1024 * 1024;

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validAmbiguousLanguageGroups(value) {
  return (
    hasExactKeys(value, LANGUAGE_GROUPS) &&
    LANGUAGE_GROUPS.every(
      (group) => Number.isSafeInteger(value[group]) && value[group] >= 0,
    )
  );
}

export function validateNeteaseSmokeManifest(value) {
  if (
    !hasExactKeys(value, ['schemaVersion', 'profileId', 'cases']) ||
    value.schemaVersion !== 1 ||
    value.profileId !== NETEASE_RUNTIME_PROFILE.profileId ||
    !Array.isArray(value.cases) ||
    value.cases.length < LANGUAGE_GROUPS.length ||
    value.cases.length > MAX_SMOKE_CASES
  ) {
    throw new TypeError('invalid NetEase smoke manifest');
  }
  const seenIds = new Set();
  const groups = new Set();
  const cases = value.cases.map((item) => {
    if (
      !hasExactKeys(item, [
        'caseId',
        'languageGroup',
        'manualSelectionConfirmed',
        'reference',
      ]) ||
      typeof item.caseId !== 'string' ||
      !/^smoke-(?:zh|en|ja|ko)-\d{2}$/u.test(item.caseId) ||
      seenIds.has(item.caseId) ||
      !LANGUAGE_GROUPS.includes(item.languageGroup) ||
      typeof item.manualSelectionConfirmed !== 'boolean'
    ) {
      throw new TypeError('invalid NetEase smoke manifest case');
    }
    const reference = validateNeteaseWorkerRequest({
      schemaVersion: 1,
      type: 'probe',
      reference: item.reference,
    }).reference;
    seenIds.add(item.caseId);
    groups.add(item.languageGroup);
    return { ...clone(item), reference };
  });
  if (LANGUAGE_GROUPS.some((group) => !groups.has(group))) {
    throw new TypeError('NetEase smoke manifest requires all language groups');
  }
  return { schemaVersion: 1, profileId: value.profileId, cases };
}

export async function runNeteaseSmoke(manifestValue, options = {}) {
  const manifest = validateNeteaseSmokeManifest(manifestValue);
  const probe = options.probe;
  const now = options.now || (() => new Date());
  const onAmbiguousCandidate = options.onAmbiguousCandidate;
  if (
    typeof probe !== 'function' ||
    typeof now !== 'function' ||
    (onAmbiguousCandidate !== undefined &&
      typeof onAmbiguousCandidate !== 'function')
  ) {
    throw new TypeError('invalid NetEase smoke options');
  }
  const startedAt = now().toISOString();
  let aggregate = createNeteaseSentinelState({ startedAt });
  let ambiguousCandidateCount = 0;
  const ambiguousLanguageGroups = Object.fromEntries(
    LANGUAGE_GROUPS.map((group) => [group, 0]),
  );
  let selectionCorrect = true;
  for (const smokeCase of manifest.cases) {
    const probeResult = await probe(smokeCase.reference);
    const observation = probeResult?.observation || probeResult;
    const matched = observation?.catalogStatus === 'match';
    const exact = matched && observation?.matchBand === 'exact';
    const manuallyConfirmed =
      matched && smokeCase.manualSelectionConfirmed === true;
    if (!exact && !manuallyConfirmed) {
      selectionCorrect = false;
      if (matched) {
        ambiguousCandidateCount += 1;
        ambiguousLanguageGroups[smokeCase.languageGroup] += 1;
        if (onAmbiguousCandidate && probeResult?.reviewCandidate) {
          onAmbiguousCandidate({
            languageGroup: smokeCase.languageGroup,
            reference: clone(smokeCase.reference),
            candidate: clone(probeResult.reviewCandidate),
          });
        }
      }
    }
    aggregate = recordNeteaseSentinelObservation(aggregate, {
      languageGroup: smokeCase.languageGroup,
      observedAt: now().toISOString(),
      observation,
    });
  }
  return {
    schemaVersion: 1,
    profileId: NETEASE_RUNTIME_PROFILE.profileId,
    kind: 'interface-health-smoke',
    startedAt,
    finishedAt: now().toISOString(),
    caseCount: manifest.cases.length,
    selectionCorrect,
    ambiguousCandidateCount,
    ambiguousLanguageGroups,
    languageGroups: aggregate.languageGroups,
    totals: aggregate.totals,
  };
}

export function createNeteaseEvaluationPaths(projectRoot) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) {
    throw new TypeError('invalid NetEase evaluation project root');
  }
  const root = path.join(
    path.resolve(projectRoot),
    '.benchmarks',
    'lyrics-provider',
  );
  const sentinelRoot = path.join(root, 'netease-sentinel');
  return Object.freeze({
    root,
    smokeManifestPath: path.join(root, 'netease-smoke.json'),
    smokeReportPath: path.join(root, 'netease-smoke-report.json'),
    sentinelRoot,
    sentinelStatePath: path.join(sentinelRoot, 'state.json'),
    sentinelLeasePath: path.join(sentinelRoot, 'lease.json'),
    sentinelReportPath: path.join(sentinelRoot, 'report.json'),
  });
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function boundedReadJson(filePath, label) {
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || stats.size > MAX_SENTINEL_STATE_BYTES) {
    throw new Error(`${label} exceeds the size limit`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid`, { cause: error });
  }
}

export function createNeteaseSentinelStore({ projectRoot }) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  return Object.freeze({
    paths,
    load() {
      if (!fs.existsSync(paths.sentinelStatePath)) return null;
      return validateNeteaseSentinelState(
        boundedReadJson(paths.sentinelStatePath, 'NetEase sentinel state'),
      );
    },
    save(value) {
      const state = validateNeteaseSentinelState(value);
      atomicWriteJson(paths.sentinelStatePath, state);
      return state;
    },
  });
}

export async function runNextNeteaseSentinelSlot({
  manifest: manifestValue,
  store,
  probe,
  now = () => new Date(),
}) {
  const manifest = validateNeteaseSmokeManifest(manifestValue);
  if (
    !store ||
    typeof store.load !== 'function' ||
    typeof store.save !== 'function' ||
    typeof probe !== 'function' ||
    typeof now !== 'function'
  ) {
    throw new TypeError('invalid NetEase sentinel slot options');
  }
  const observedAt = now().toISOString();
  const current =
    store.load() || createNeteaseSentinelState({ startedAt: observedAt });
  if (current.complete) return current;
  const smokeCase =
    manifest.cases[current.attemptedSlots % manifest.cases.length];
  const observation = await probe(smokeCase.reference);
  return store.save(
    recordNeteaseSentinelObservation(current, {
      languageGroup: smokeCase.languageGroup,
      observedAt,
      observation,
    }),
  );
}

export function buildNeteasePhaseReport({
  state: stateValue,
  smokeReport,
  activation,
  generatedAt,
}) {
  const state = validateNeteaseSentinelState(stateValue);
  if (
    !isPlainObject(smokeReport) ||
    smokeReport.profileId !== NETEASE_RUNTIME_PROFILE.profileId ||
    smokeReport.kind !== 'interface-health-smoke' ||
    typeof smokeReport.selectionCorrect !== 'boolean' ||
    !Number.isSafeInteger(smokeReport.ambiguousCandidateCount) ||
    smokeReport.ambiguousCandidateCount < 0 ||
    (smokeReport.ambiguousLanguageGroups !== undefined &&
      !validAmbiguousLanguageGroups(smokeReport.ambiguousLanguageGroups)) ||
    !isPlainObject(activation) ||
    activation.profileId !== NETEASE_RUNTIME_PROFILE.profileId ||
    activation.packageVersion !== NETEASE_RUNTIME_PROFILE.packageVersion ||
    !/^[a-f0-9]{64}$/u.test(activation.lockSha256) ||
    !Number.isSafeInteger(activation.installedBytes) ||
    !validTimestamp(generatedAt)
  ) {
    throw new TypeError('invalid NetEase phase report input');
  }
  const provisionalOutcome = decideNeteaseSentinelOutcome({
    complete: state.complete,
    smokeSelectionCorrect: smokeReport.selectionCorrect,
    attemptedSlots: state.attemptedSlots,
    requestSucceeded: state.totals.requestSucceeded,
    requestFailed: state.totals.requestFailed,
    hardFailureCount: state.totals.hardFailureCount,
    schemaDriftCount: state.totals.schemaDriftCount,
    validatedT2Count: state.totals.capabilities.T2,
  });
  return {
    schemaVersion: 1,
    profileId: NETEASE_RUNTIME_PROFILE.profileId,
    generatedAt,
    provisionalOutcome,
    runtime: {
      profileId: activation.profileId,
      packageVersion: activation.packageVersion,
      packageIntegrity: NETEASE_RUNTIME_PROFILE.packageIntegrity,
      lockSha256: activation.lockSha256,
      installedBytes: activation.installedBytes,
    },
    smoke: {
      kind: smokeReport.kind,
      selectionCorrect: smokeReport.selectionCorrect,
      ambiguousCandidateCount: smokeReport.ambiguousCandidateCount,
      ...(isPlainObject(smokeReport.ambiguousLanguageGroups)
        ? {
            ambiguousLanguageGroups: clone(smokeReport.ambiguousLanguageGroups),
          }
        : {}),
    },
    observation: {
      startedAt: state.startedAt,
      finishedAt: state.updatedAt,
      requiredSlots: state.requiredSlots,
      attemptedSlots: state.attemptedSlots,
      complete: state.complete,
      languageGroups: state.languageGroups,
      totals: state.totals,
      intervals: state.intervals,
    },
    claimBoundary: 'interface-health-not-corpus-coverage',
    productEligibility: 'requires-30-complete-local-days',
  };
}

export function writeNeteaseEvaluationJson(filePath, value) {
  atomicWriteJson(filePath, value);
}

export function readNeteaseEvaluationJson(filePath, label) {
  return boundedReadJson(filePath, label);
}
