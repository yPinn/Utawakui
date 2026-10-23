import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scoreQuality, describeNumbers, referenceOffsets } from './score.mjs';
import { lyricsDisplayBreakCandidates } from '../../../shared/presentation/lyricsPresentation.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dir = path.join(repo, 'tasks/lyrics-text-qwen-pilot-20261023');
const read = (p) =>
  JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/u, ''));
const sha = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const corpusPath = path.join(
  repo,
  'docs/research/lyrics-text-preprocessing-corpus-2026-10-23.json',
);
const corpus = read(corpusPath).cases;
const protocol = read(path.join(dir, 'frozen-protocol.json'));
if (sha(corpusPath) !== protocol.corpusSha256) throw new Error('corpus-drift');
const rowFiles = (modelDir) =>
  fs.readdirSync(modelDir).filter((p) => p.endsWith('.result.json'));
const readRows = (modelDir) =>
  rowFiles(modelDir).map((p) => read(path.join(modelDir, p)));
const languages = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'];

function performance(rows) {
  const token = (field) =>
    describeNumbers(rows.map((r) => r.raw?.usage?.[field]));
  return {
    completeRequestWallMs: describeNumbers(rows.map((r) => r.wallMs)),
    firstContentTokenMs: describeNumbers(
      rows.map((r) => r.raw?.firstContentTokenMs),
    ),
    bracketedCpuSeconds: describeNumbers(rows.map((r) => r.cpuSecondsBracket)),
    promptTokens: token('prompt_tokens'),
    completionTokens: token('completion_tokens'),
    preflightInputTokens: describeNumbers(
      rows.map((r) => r.inputTokensPreflight),
    ),
    requestEndSampledPrivateBytes: describeNumbers(
      rows.map((r) => r.telemetryAfter?.privateBytes),
    ),
    cacheTokens: describeNumbers(
      rows.map((r) => r.raw?.usage?.prompt_tokens_details?.cached_tokens),
    ),
    telemetryBracketBeforeMs: describeNumbers(
      rows.map((r) => r.telemetryBracketMs?.[0]),
    ),
    telemetryBracketAfterMs: describeNumbers(
      rows.map((r) => r.telemetryBracketMs?.[1]),
    ),
  };
}

const models = ['two', 'four'].map((model) => {
  const modelDir = path.join(dir, model);
  const rows = readRows(modelDir);
  const lifePath = fs.existsSync(
    path.join(modelDir, 'lifecycle.recovered.json'),
  )
    ? path.join(modelDir, 'lifecycle.recovered.json')
    : path.join(modelDir, 'lifecycle.json');
  const life = read(lifePath);
  const samples = fs
    .readFileSync(path.join(modelDir, 'samples.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x));
  const lifecycle = {
    status: life.status,
    stopReason: life.stopReason,
    startupMs: life.startupMs,
    firstValidResponseSinceLaunchMs: life.firstResponseAt
      ? life.firstResponseAt - life.launched
      : null,
    measuredDurationMs: life.finishedAt - life.launched,
    ownedServerExited: life.ownedServerExited,
    sampleCount: samples.length,
    sampleGapsMs: describeNumbers(
      samples.slice(1).map((s, i) => s.at - samples[i].at),
    ),
    peakSampledPrivateBytes: Math.max(...samples.map((s) => s.privateBytes)),
    peakWorkingSetBytes: Math.max(...samples.map((s) => s.peakWorkingSet)),
    peakCombinedConservativeBytes: Math.max(
      ...samples.map(
        (s) =>
          Math.max(s.privateBytes, s.workingSet) +
          s.runnerRss +
          Math.max(s.samplerPrivateBytes, s.samplerWorkingSet),
      ),
    ),
    serverCpuSeconds: life.totalCpuSeconds,
    samplerCpuSeconds: samples.at(-1).samplerCpuSeconds,
    peakSamplerWorkingSet: Math.max(...samples.map((s) => s.samplerWorkingSet)),
    peakRunnerRss: Math.max(...samples.map((s) => s.runnerRss)),
    runnerCpuCumulativeLast: samples.at(-1).runnerCpu,
    ready: {
      privateBytes: life.idleReadySample.privateBytes,
      workingSet: life.idleReadySample.workingSet,
    },
    lastSample: {
      privateBytes: samples.at(-1).privateBytes,
      workingSet: samples.at(-1).workingSet,
    },
  };
  return {
    model,
    quality: scoreQuality(corpus, rows),
    performance: performance(rows),
    lifecycle,
    languages: languages.map((language) => ({
      language,
      quality: scoreQuality(
        corpus.filter((c) => c.language === language),
        rows,
      ),
      performance: performance(rows.filter((r) => r.language === language)),
    })),
    cases: rows.map((r) => {
      const c = corpus.find((c) => c.id === r.caseId);
      let rawDecision = null;
      try {
        rawDecision = JSON.parse(r.raw?.choices?.[0]?.message.content);
      } catch {
        /* partial output remains separately */
      }
      return {
        caseId: r.caseId,
        language: r.language,
        group: c.group,
        text: c.text,
        referencePartitions: c.referencePartitions ?? null,
        status: r.status,
        error: r.error ?? null,
        rawDecision,
        rawContent: r.raw?.choices?.[0]?.message.content ?? null,
        output: r.suggestion,
        wallMs: r.wallMs ?? null,
        cpuSecondsBracket: r.cpuSecondsBracket ?? null,
        firstContentTokenMs: r.raw?.firstContentTokenMs ?? null,
        inputTokens: r.raw?.usage?.prompt_tokens ?? null,
        outputTokens: r.raw?.usage?.completion_tokens ?? null,
        timings: r.raw?.timings ?? null,
      };
    }),
    receipts: {
      lifecycleSha256: sha(lifePath),
      resultHashes: Object.fromEntries(
        rowFiles(modelDir).map((p) => [p, sha(path.join(modelDir, p))]),
      ),
      samplesSha256: sha(path.join(modelDir, 'samples.ndjson')),
    },
  };
});

const longCorpus = corpus.filter((c) => c.group === 'long');
const ruleRows = longCorpus.map((c) => ({
  caseId: c.id,
  status: 'accepted',
  suggestion: {
    kind: 'lyric',
    offsets: lyricsDisplayBreakCandidates(c.text)
      .filter((b) => b.priority >= 4)
      .map((b) => b.offset),
  },
}));
const diagnosticRoot = path.join(dir, 'diagnostic');
const diagnosticComplete =
  fs.existsSync(path.join(diagnosticRoot, 'run-summary.json')) &&
  read(path.join(diagnosticRoot, 'run-summary.json')).attempted === 8;
const diagnostic = diagnosticComplete
  ? ['two', 'four'].map((model) => ({
      model,
      cases: readRows(path.join(diagnosticRoot, model)).map((r) => ({
        variant: r.diagnosticVariant,
        text: r.input.text,
        opaqueLineId: r.input.lineId,
        status: r.status,
        error: r.error ?? null,
        raw: r.raw,
        output: r.suggestion,
        wallMs: r.wallMs,
      })),
    }))
  : null;
const data = {
  date: '2026-10-23',
  scope: 'Synthetic pilot, not native-speaker review or production acceptance',
  corpusSha256: protocol.corpusSha256,
  originalProtocolSha256: sha(path.join(dir, 'frozen-protocol.json')),
  primarySummary: read(path.join(dir, 'run-summary.json')),
  assets: read(path.join(dir, 'assets.lock.json')),
  runtime: {
    tag: read(path.join(dir, 'runtime.metadata.json')).tag_name,
    revision: read(path.join(dir, 'runtime.metadata.json')).target_commitish,
    uncompressedBytes: read(path.join(dir, 'runtime-files.json'))
      .uncompressedBytes,
  },
  constraints: protocol.limits,
  models,
  diagnostic,
  diagnosticStatus: diagnosticComplete
    ? 'complete'
    : fs.existsSync(diagnosticRoot)
      ? 'in-progress'
      : 'not-run',
  punctuationOnlyComparison: {
    description:
      'Long cases only. Research-only comparator selecting every punctuation/authored candidate with priority >=4. Not current product semantic accuracy.',
    quality: scoreQuality(longCorpus, ruleRows),
    languages: languages.map((language) => ({
      language,
      quality: scoreQuality(
        longCorpus.filter((c) => c.language === language),
        ruleRows,
      ),
    })),
  },
  referenceBoundaryCount: corpus
    .filter((c) => c.group === 'long')
    .reduce((n, c) => n + referenceOffsets(c.referencePartitions[0]).length, 0),
};
const destination = path.join(
  repo,
  'docs/research/lyrics-text-qwen-pilot-2026-10-23.json',
);
fs.writeFileSync(destination, JSON.stringify(data, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      destination: path.relative(repo, destination),
      models: models.map((m) => ({
        model: m.model,
        quality: m.quality,
        performance: m.performance.completeRequestWallMs,
        lifecycle: m.lifecycle,
      })),
    },
    null,
    2,
  ),
);
