import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { LIMITS } from './contract.mjs';
import { buildSchedule, validateCondition } from './ablation.mjs';
import { runLocalCpu } from './localCpuRun.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const directory = path.join(repo, 'tasks/lyrics-text-qwen-ablation-20261023');
const previous = path.join(repo, 'tasks/lyrics-text-qwen-pilot-20261023');
const read = (p) =>
  JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/u, ''));
const sha = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const streamSha = async (p) => {
  const h = createHash('sha256');
  for await (const b of fs.createReadStream(p)) h.update(b);
  return h.digest('hex');
};
const corpusPath = path.join(
  repo,
  'docs/research/lyrics-text-preprocessing-corpus-2026-10-23.json',
);
const corpus = read(corpusPath).cases,
  prior = read(path.join(previous, 'frozen-protocol.json'));
if (sha(corpusPath) !== prior.corpusSha256) throw Error('corpus-drift');
const plan = buildSchedule(corpus, prior.inputs);
const lock = read(path.join(previous, 'assets.lock.json')),
  asset = lock.files.find((f) => f.kind === 'four');
const coverage = plan
  .filter((p) => p.kind === 'split')
  .map((p) => {
    const c = corpus.find((c) => c.id === p.caseId);
    let n = 0;
    const offsets = c.referencePartitions[0]
      .slice(0, -1)
      .map((t) => (n += t.length));
    return {
      requestId: p.requestId,
      caseId: p.caseId,
      arm: p.arm,
      candidateCount: p.condition.input.boundaries.length,
      referenceCount: offsets.length,
      referenceCovered: offsets.filter((x) =>
        p.condition.input.boundaries.some((b) => b.offset === x),
      ).length,
      completeReferenceFeasible: offsets.every((x) =>
        p.condition.input.boundaries.some((b) => b.offset === x),
      ),
    };
  });
const sourceFiles = [
  'ablation.mjs',
  'runAblation.mjs',
  'localCpuRun.mjs',
  'contract.mjs',
  'processLifecycle.mjs',
  'sample-process.ps1',
];
const protocol = {
  date: '2026-10-23',
  scope: 'development diagnosis, not independent validation',
  metrics: {
    split:
      'Exact authored partition agreement over all 15 scheduled cases; feasible-reference subset secondary only. Accepted/fallback/missing, raw prefix-six copying and all-candidate copying counted separately. No native-speaker semantic accuracy claim.',
    classification:
      'Raw kind, false credit on sung roles/harmony/quotes, ambiguous abstention and all five bracketed attribution candidates; fallback never removes raw errors.',
    cost: 'Full request and TTFT p50/p95, tokens, bracketed per-request CPU. One shared process memory peak cannot be attributed causally to an arm.',
    contrasts:
      'A-B task/prompt/schema bundle; B-C only preview representation; C-D only pruned candidate set. No prompt tuning or discarded failures.',
  },
  limits: LIMITS,
  asset,
  corpusSha256: prior.corpusSha256,
  schedule: plan,
  candidateCoverage: coverage,
  sourceHashes: Object.fromEntries(
    sourceFiles.map((p) => [
      p,
      sha(fileURLToPath(new URL(p, import.meta.url))),
    ]),
  ),
};
if (process.argv.includes('--freeze')) {
  if (fs.existsSync(path.join(directory, 'protocol.json')))
    throw Error('protocol-already-frozen');
  fs.writeFileSync(
    path.join(directory, 'protocol.json'),
    JSON.stringify(protocol, null, 2) + '\n',
  );
  for (const p of sourceFiles)
    fs.copyFileSync(
      fileURLToPath(new URL(p, import.meta.url)),
      path.join(directory, p + '.snapshot'),
    );
  console.log(
    JSON.stringify({
      requests: plan.length,
      split: 60,
      classification: 40,
      coverage: coverage.filter((p) => p.arm === 'D'),
    }),
  );
} else {
  const frozen = read(path.join(directory, 'protocol.json'));
  if (JSON.stringify(frozen) !== JSON.stringify(protocol))
    throw Error('protocol-or-code-drift');
  const stats = fs.statfsSync(directory);
  if (stats.bavail * stats.bsize < 10 * 2 ** 30) throw Error('disk-reserve');
  const weights = path.join(previous, 'assets', asset.name);
  if (
    fs.statSync(weights).size !== asset.size ||
    (await streamSha(weights)) !== asset.sha256
  )
    throw Error('asset-integrity');
  const zip = lock.files.find((f) => f.kind === 'runtime');
  if ((await streamSha(path.join(previous, 'assets', zip.name))) !== zip.sha256)
    throw Error('runtime-integrity');
  await runLocalCpu({
    directory,
    assetDirectory: path.join(previous, 'assets'),
    runtimeDirectory: path.join(previous, 'runtime'),
    modelName: asset.name,
    plan: frozen.schedule,
    validate: validateCondition,
  });
}
