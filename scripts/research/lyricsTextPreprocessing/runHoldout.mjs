import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LIMITS } from './contract.mjs';
import { validateCondition } from './ablation.mjs';
import {
  buildHoldoutSchedule,
  referenceCoverage,
  validateCorpus,
} from './holdout.mjs';
import { runLocalCpu } from './localCpuRun.mjs';

const root = 'tasks/lyrics-text-holdout-20261023';
const data = 'docs/research/lyrics-text-holdout';
const previous = 'tasks/lyrics-text-qwen-pilot-20261023';
const read = (p) =>
  JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/u, ''));
const hash = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const streamHash = async (p) => {
  const h = createHash('sha256');
  for await (const b of fs.createReadStream(p)) h.update(b);
  return h.digest('hex');
};
const write = (p, v) =>
  fs.writeFileSync(`${root}/${p}`, JSON.stringify(v, null, 2) + '\n');
const assertHashes = (hashes) => {
  for (const [p, h] of Object.entries(hashes))
    if (hash(p) !== h) throw Error(`frozen-file-drift:${p}`);
};
const interfaceLock = read(`${root}/baseline-interface-lock.json`);
assertHashes(
  Object.fromEntries(
    Object.entries(interfaceLock.sourceHashes).map(([p, h]) => [
      `scripts/research/lyricsTextPreprocessing/${p}`,
      h,
    ]),
  ),
);
const authored = read(`${root}/authored-lock.json`);
assertHashes(authored.hashes);

if (process.argv.includes('--freeze')) {
  if (fs.existsSync(`${root}/protocol.json`))
    throw Error('protocol-already-frozen');
  const inputs = read(`${data}/inputs-2026-10-23.json`).cases;
  const answers = read(`${data}/answers-2026-10-23.json`).cases;
  const corpus = validateCorpus(inputs, answers);
  const old = read(
    'docs/research/lyrics-text-preprocessing-corpus-2026-10-23.json',
  ).cases;
  if (inputs.some((i) => old.some((o) => o.text === i.text)))
    throw Error('old-case-reused');
  const plan = buildHoldoutSchedule(inputs, answers);
  const coverage = plan
    .filter((e) => e.arm === 'C')
    .map((e) => ({
      requestId: e.requestId,
      caseId: e.caseId,
      cohort: e.cohort,
      ...referenceCoverage(
        answers.find((a) => a.lineId === e.lineId),
        e.condition.input,
      ),
    }));
  const sourceFiles = new Set();
  const collect = (p) => {
    p = p.replace(/\\/gu, '/');
    if (sourceFiles.has(p)) return;
    sourceFiles.add(p);
    if (!p.endsWith('.mjs')) return;
    const source = fs.readFileSync(p, 'utf8');
    for (const m of source.matchAll(
      /(?:from\s*|import\s*)['"]([.][^'"]+)['"]/gu,
    ))
      collect(path.normalize(path.join(path.dirname(p), m[1])));
  };
  for (const p of [
    'runHoldout.mjs',
    'holdout.mjs',
    'authorHoldout.mjs',
    'sample-process.ps1',
  ])
    collect(`scripts/research/lyricsTextPreprocessing/${p}`);
  const sources = [...sourceFiles];
  const snapshotMap = Object.fromEntries(
    sources.map((p, i) => [p, `${i}-${path.basename(p)}.snapshot`]),
  );
  const lock = read(`${previous}/assets.lock.json`);
  const runtimeHashes = Object.fromEntries(
    fs
      .readdirSync(`${previous}/runtime`)
      .filter((p) => /\.(exe|dll)$/iu.test(p))
      .map((p) => [p, hash(`${previous}/runtime/${p}`)]),
  );
  const protocol = {
    date: '2026-10-23',
    scope:
      'agent-authored synthetic holdout diagnosis; no native-speaker review',
    nativeReview: 'pending',
    authoredHashes: authored.hashes,
    limits: LIMITS,
    asset: lock.files.find((f) => f.kind === 'four'),
    runtime: lock.files.find((f) => f.kind === 'runtime'),
    runtimeHashes,
    sourceHashes: Object.fromEntries(sources.map((p) => [p, hash(p)])),
    snapshotMap,
    corpus,
    coverage,
    schedule: plan,
    metrics: {
      mainSplit:
        '60 scheduled; any frozen whole partition acceptable, not union; candidate infeasibility and rejected/missing retained; no native acceptance claim',
      mainClassification:
        '40 scheduled: ten credits, fifteen identifiable sung negatives, five mixed, ten unresolvable; raw classes counted despite fallback',
      joint:
        '20 source blocks, 40 total results; 20 extra requests excluded from main denominators',
      timeControls:
        '20 evaluator-only eight/32 second alternate records; reuse textual outputs, not repeat inference',
      noTuning:
        'no retries, new examples, target truncation, pruning or answer changes after freeze',
    },
  };
  write('protocol.json', protocol);
  for (const [p, snapshot] of Object.entries(snapshotMap))
    fs.copyFileSync(p, `${root}/${snapshot}`);
  write('coverage.json', coverage);
  console.log(
    JSON.stringify(
      {
        corpus,
        scheduled: plan.length,
        sources: sources.length,
        coverage: coverage
          .filter((c) => c.cohort === 'main')
          .map((c) => ({
            caseId: c.caseId,
            candidates: c.candidateCount,
            anyFeasible: c.anyFeasible,
          })),
      },
      null,
      2,
    ),
  );
} else {
  const protocol = read(`${root}/protocol.json`);
  assertHashes(protocol.sourceHashes);
  assertHashes(protocol.authoredHashes);
  for (const [p, h] of Object.entries(protocol.runtimeHashes))
    if (hash(`${previous}/runtime/${p}`) !== h)
      throw Error('runtime-binary-drift');
  const stats = fs.statfsSync(root);
  if (stats.bavail * stats.bsize < 10 * 2 ** 30) throw Error('disk-reserve');
  for (const asset of [protocol.asset, protocol.runtime]) {
    const p = `${previous}/assets/${asset.name}`;
    if (
      fs.statSync(p).size !== asset.size ||
      (await streamHash(p)) !== asset.sha256
    )
      throw Error('asset-integrity');
  }
  // The inference path never parses answers; it consumes only this fixed plan.
  const result = await runLocalCpu({
    directory: path.resolve(root),
    assetDirectory: path.resolve(`${previous}/assets`),
    runtimeDirectory: path.resolve(`${previous}/runtime`),
    modelName: protocol.asset.name,
    plan: protocol.schedule,
    validate: validateCondition,
  });
  if (result.life.status !== 'complete' || result.results.length !== 120)
    process.exitCode = 1;
}
