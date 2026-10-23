import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scoreQuality, describeNumbers } from './score.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const root = path.join(repo, 'tasks/lyrics-text-qwen-ablation-20261023');
const read = (p) =>
  JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/u, ''));
const hash = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protocol = read(path.join(root, 'protocol.json'));
const corpus = read(
  path.join(
    repo,
    'docs/research/lyrics-text-preprocessing-corpus-2026-10-23.json',
  ),
).cases;
if (!fs.existsSync(path.join(root, 'summary.json')))
  throw Error('run-not-finished');
const resultFiles = fs
  .readdirSync(root)
  .filter((p) => p.endsWith('.result.json'));
const results = resultFiles.map((p) => read(path.join(root, p)));
const samples = fs
  .readFileSync(path.join(root, 'samples.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const safeRaw = (r) => {
  try {
    return JSON.parse(r.raw.choices[0].message.content);
  } catch {
    return null;
  }
};
function taskScore(kind, cases, rows) {
  const score = scoreQuality(cases, rows);
  const keys = [
    'scheduled',
    'attempted',
    'missing',
    'accepted',
    'fallback',
    ...(kind === 'split'
      ? [
          'longCount',
          'longExact',
          'referenceBoundaryMatches',
          'selectedLongBoundaries',
          'referenceBoundaries',
          'referenceBoundaryPrecision',
          'referenceBoundaryRecall',
        ]
      : [
          'creditCount',
          'rawCreditCandidates',
          'otherPerformedCount',
          'rawOtherPerformedFalseCandidates',
          'rawOtherPerformedAbstentions',
          'rawUnclassified',
        ]),
  ];
  return Object.fromEntries(keys.map((k) => [k, score[k]]));
}
function describeArm(arm, language, kind) {
  const entries = protocol.schedule.filter(
    (p) =>
      p.arm === arm &&
      (!language || p.language === language) &&
      (!kind || p.kind === kind),
  );
  const rows = results.filter((r) =>
    entries.some((e) => e.requestId === r.requestId),
  );
  const selectedCases = entries.map((e) =>
    corpus.find((c) => c.id === e.caseId),
  );
  const coverage = protocol.candidateCoverage.filter((c) =>
    entries.some((e) => e.requestId === c.requestId),
  );
  const copying = rows.filter((r) => {
    const ids = safeRaw(r)?.breakIds,
      entry = entries.find((e) => e.requestId === r.requestId);
    return (
      ids?.length === 6 &&
      JSON.stringify(ids) ===
        JSON.stringify(
          entry.condition.input.boundaries.slice(0, 6).map((b) => b.id),
        )
    );
  }).length;
  const feasibleIds = coverage
    .filter((c) => c.completeReferenceFeasible)
    .map((c) => c.caseId);
  const copiedAllCandidates = rows.filter((r) => {
    const ids = safeRaw(r)?.breakIds,
      candidates = entries.find((e) => e.requestId === r.requestId).condition
        .input.boundaries;
    return (
      candidates.length > 0 &&
      JSON.stringify(ids) === JSON.stringify(candidates.map((b) => b.id))
    );
  }).length;
  return {
    arm,
    ...(language ? { language } : {}),
    quality: taskScore(kind, selectedCases, rows),
    coverage: {
      candidateCount: coverage.reduce((n, c) => n + c.candidateCount, 0),
      referenceCount: coverage.reduce((n, c) => n + c.referenceCount, 0),
      referenceCovered: coverage.reduce((n, c) => n + c.referenceCovered, 0),
      fullyFeasible: feasibleIds.length,
      exactOnFeasible: scoreQuality(
        selectedCases.filter((c) => feasibleIds.includes(c.id)),
        rows,
      ).longExact,
    },
    copiedPrefixSix: copying,
    copiedAllCandidates,
    cost: {
      wallMs: describeNumbers(rows.map((r) => r.wallMs)),
      firstContentTokenMs: describeNumbers(
        rows.map((r) => r.raw?.firstContentTokenMs),
      ),
      cpuSecondsBracket: describeNumbers(rows.map((r) => r.cpuSecondsBracket)),
      inputTokens: describeNumbers(
        rows.map((r) => r.raw?.usage?.prompt_tokens),
      ),
      outputTokens: describeNumbers(
        rows.map((r) => r.raw?.usage?.completion_tokens),
      ),
    },
  };
}
const subsets = [
  { kind: 'split', arms: ['A', 'B', 'C', 'D'] },
  { kind: 'classification', arms: ['A', 'E'] },
].map((spec) => ({
  kind: spec.kind,
  arms: spec.arms.map((arm) => {
    const all = protocol.schedule.filter(
      (p) => p.arm === arm && p.kind === spec.kind,
    );
    const filtered = results.filter((r) =>
      all.some((p) => p.requestId === r.requestId),
    );
    const value = describeArm(arm, undefined, spec.kind);
    return {
      ...value,
      languages: ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'].map((language) => {
        const same = all.filter((p) => p.language === language),
          rows = filtered.filter((r) => r.language === language);
        const cases = same.map((e) => corpus.find((c) => c.id === e.caseId));
        return {
          language,
          quality: taskScore(spec.kind, cases, rows),
          wallMs: describeNumbers(rows.map((r) => r.wallMs)),
          cpuSecondsBracket: describeNumbers(
            rows.map((r) => r.cpuSecondsBracket),
          ),
        };
      }),
    };
  }),
}));
const life = read(path.join(root, 'lifecycle.json'));
const data = {
  date: '2026-10-23',
  scope: protocol.scope,
  metrics: protocol.metrics,
  corpusSha256: protocol.corpusSha256,
  protocolSha256: hash(path.join(root, 'protocol.json')),
  asset: protocol.asset,
  limits: protocol.limits,
  summary: read(path.join(root, 'summary.json')),
  subsets,
  sharedProcess: {
    status: life.status,
    startupMs: life.readyAt - life.startedAt,
    serverCpuSeconds: life.lastSample?.cpuSeconds ?? null,
    samplerCpuSeconds: life.lastSample?.samplerCpuSeconds ?? null,
    peakSampledPrivateBytes: Math.max(...samples.map((s) => s.privateBytes)),
    peakWorkingSet: Math.max(...samples.map((s) => s.peakWorkingSet)),
    peakCombinedConservativeBytes: Math.max(
      ...samples.map(
        (s) =>
          Math.max(s.privateBytes, s.workingSet) +
          s.runnerRss +
          Math.max(s.samplerPrivateBytes, s.samplerWorkingSet),
      ),
    ),
    serverExited: life.serverExited,
    samplerExited: life.samplerExited,
    samples: samples.length,
    sampleGapMs: describeNumbers(
      samples.slice(1).map((s, i) => s.at - samples[i].at),
    ),
  },
  candidateCoverage: protocol.candidateCoverage,
  cases: protocol.schedule.map((e) => {
    const row = results.find((r) => r.requestId === e.requestId),
      c = corpus.find((c) => c.id === e.caseId);
    return {
      requestId: e.requestId,
      caseId: e.caseId,
      language: e.language,
      task: e.kind,
      arm: e.arm,
      text: c.text,
      referencePartitions: c.referencePartitions ?? null,
      candidates: e.condition.input.boundaries,
      payload: e.condition.payload,
      status: row?.status ?? 'missing',
      error: row?.error ?? null,
      rawDecision: row ? safeRaw(row) : null,
      rawContent: row?.raw?.choices?.[0]?.message.content ?? null,
      suggestion: row?.suggestion ?? null,
      wallMs: row?.wallMs ?? null,
      cpuSecondsBracket: row?.cpuSecondsBracket ?? null,
      inputTokens: row?.raw?.usage?.prompt_tokens ?? null,
      outputTokens: row?.raw?.usage?.completion_tokens ?? null,
    };
  }),
  receipts: {
    sourceHashes: protocol.sourceHashes,
    samplesSha256: hash(path.join(root, 'samples.ndjson')),
    resultHashes: Object.fromEntries(
      resultFiles.map((p) => [p, hash(path.join(root, p))]),
    ),
  },
};
const dest = path.join(
  repo,
  'docs/research/lyrics-text-qwen-ablation-2026-10-23.json',
);
fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n');
console.log(
  JSON.stringify(
    { subsets, sharedProcess: data.sharedProcess, summary: data.summary },
    null,
    2,
  ),
);
